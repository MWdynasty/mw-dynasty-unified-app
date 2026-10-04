'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs');
const {fixture,role,scalar}=require('./test-workout-identity-db');
const Identity=require('./lib/mw-workout-identity');
const A='11111111-1111-1111-1111-111111111111',AU='33333333-3333-3333-3333-333333333333';
const C='22222222-2222-2222-2222-222222222222',OTHER='44444444-4444-4444-4444-444444444444';
const P='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',S='cccccccc-cccc-cccc-cccc-cccccccccccc';
const read=name=>fs.readFileSync('supabase/migrations/'+name,'utf8');
async function run(){
 const db=await fixture();
 try{
  for(const name of [
   '20261002030901_canonical_workout_identity.sql',
   '20261003004000_atomic_practice_commit.sql',
   '20261003024000_lock_completed_practice_workouts.sql',
   '20261003025500_serialize_workout_completion_writes.sql',
   '20261003031000_local_program_day_and_completion_authority.sql',
   '20261003032000_refresh_coach_practice_program_position.sql'
  ])await db.exec(read(name));
  const security=()=>scalar(db,`select jsonb_agg(jsonb_build_object('name',p.oid::regprocedure::text,'acl',p.proacl,'owner',p.proowner,'security',p.prosecdef,'config',p.proconfig) order by p.oid::regprocedure::text) as functions from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','private')`);
  const before=await security();
  await db.exec(read('20261003155114_stabilize_legacy_program_refresh.sql'));
  await db.exec(read('20261003155417_preserve_atomic_practice_intent.sql'));
  await db.exec(read('20261003190541_immutable_completed_practice_retries.sql'));
  assert.deepEqual(await security(),before,'function ownership, permissions and security configuration stay unchanged');

  await db.exec(read('20261003191637_protect_completed_practice_table_evidence.sql'));
  await db.exec(read('20261003192608_validate_coach_evidence_session_links.sql'));
  assert.equal((await scalar(db,"select has_function_privilege('authenticated','private.mw_protect_completed_practice_evidence()','execute') as allowed")).allowed,false);
  // Match production coach DELETE grants/policy in this disposable fixture.
  await db.exec("grant delete on public.coach_practice_timing_results to authenticated; create policy test_coach_delete on public.coach_practice_timing_results for delete to authenticated using(coach_user_id=auth.uid());");
  await db.exec(`update public.athlete_program_state set season_plan_id=null,start_date=current_date-7,starting_week=null,current_week=2,current_day=1,program_status='active';`);
  await role(db,AU);
  for(let i=0;i<3;i++){
   const row=await scalar(db,'select public.mw_refresh_own_program_state() as result');
   assert.equal(row.result.current_week,2,'reopening the athlete app must not add elapsed weeks again');
  }
  const historyBefore=await scalar(db,'select count(*)::int as n from public.workout_completions');
  await db.query('select public.mw_refresh_own_program_state()');
  assert.deepEqual(await scalar(db,'select count(*)::int as n from public.workout_completions'),historyBefore,'repeated refresh creates no duplicate history');
  await db.exec('reset role');
  await db.exec("update public.athlete_program_state set starting_week=4,start_date=current_date-14,current_week=8;");
  await role(db,AU);
  assert.equal((await scalar(db,'select public.mw_refresh_own_program_state() as result')).result.current_week,6,'explicit starting weeks remain authoritative');

  for(const tz of ['Pacific/Kiritimati','Pacific/Honolulu']){
   await db.exec('reset role');
   await db.query("select set_config('request.headers',$1,false)",[JSON.stringify({'x-mw-time-zone':tz})]);
   const date=await scalar(db,"select ((now() at time zone $1)::date)::text as today,extract(isodow from (now() at time zone $1)::date)::int as day",[tz]);
   await db.exec('update public.athlete_program_state set start_date=null,current_day=1,current_week=4;');
   await role(db,AU);
   let row=(await scalar(db,'select public.mw_refresh_own_program_state() as result')).result;
   assert.equal(row.current_week,4);assert.equal(row.current_day,date.day,'no-start athletes use request-local day');
   await db.exec('reset role');
   await db.query("update public.athlete_program_state set start_date=$1::date+7,starting_week=3,program_status='not_started'",[date.today]);
   await role(db,AU);
   row=(await scalar(db,'select public.mw_refresh_own_program_state() as result')).result;
   assert.equal(row.current_week,3);assert.equal(row.current_day,date.day,'preseason athletes use the same local day as the roster');
  }
  await role(db,OTHER);
  await assert.rejects(db.query("select public.mw_coach_refresh_assigned_athlete_program_position($1,(now() at time zone 'Pacific/Honolulu')::date)",[A]),/not assigned/);
  await db.exec('reset role');
  await db.query("select set_config('request.headers',$1,false)",[JSON.stringify({'x-mw-time-zone':'UTC'})]);
  const {today,day}=await scalar(db,'select current_date::text as today,extract(isodow from current_date)::int as day');
  await db.query("update public.athlete_program_state set season_plan_id=$1,start_date=current_date-14,starting_week=1,current_week=3,current_day=$2,program_status='active'",[P,day]);
  const key=Identity.create({athleteId:A,seasonPlanId:P,week:3,day}).workoutKey;
  const result={athlete_id:A,session_date:today,program_week:3,program_day:day,source_program_week:12,workout_key:key,season_plan_id:P,distance_m:100,rep_number:1,time_seconds:9.876,target_seconds:15,pace_status:'on_pace',mw_intent:'technical',mw_interpretation:'above_target'};
  await role(db,C);
  const commit=rows=>db.query('select public.mw_coach_commit_practice_session($1,$2::jsonb) as result',[S,JSON.stringify(rows)]);
  const rawBefore=await scalar(db,'select count(*)::int as n from public.coach_practice_timing_results');
  await assert.rejects(commit([result,{...result,athlete_id:OTHER,workout_key:Identity.create({athleteId:OTHER,seasonPlanId:P,week:3,day}).workoutKey}]),/assigned|athlete|Athlete/);
  assert.deepEqual(await scalar(db,'select count(*)::int as n from public.coach_practice_timing_results'),rawBefore,'one invalid athlete rolls back the whole session');
  await commit([result]);
  await role(db,AU);
  const rep=await scalar(db,'select mw_intent,mw_interpretation,pace_status,coach_session_id,recorded_at from public.athlete_practice_rep_results where workout_key=$1',[key]);
  assert.equal(rep.mw_intent,'technical');assert.equal(rep.mw_interpretation,'above_target');assert.equal(rep.pace_status,'on_pace');assert.equal(rep.coach_session_id,S);
  const completed=await scalar(db,'select completion_status,pace_reps_total,pace_reps_hit,completed_at from public.workout_completions where workout_key=$1',[key]);
  assert.equal(completed.completion_status,'completed');assert.equal(completed.pace_reps_total,1);assert.equal(completed.pace_reps_hit,1);
  await assert.rejects(db.query('update public.athlete_practice_rep_results set time_seconds=8.5 where workout_key=$1',[key]),/immutable/);
  await assert.rejects(db.query("update public.athlete_practice_rep_results set mw_intent='recovery',coach_session_id=null where workout_key=$1",[key]),/immutable/);
  await assert.rejects(db.query('insert into public.athlete_practice_rep_results(athlete_id,workout_key,program_week,program_day,rep_number,time_seconds,season_plan_id) values($1,$2,3,$3,2,8.5,$4)',[A,key,day,P]),/immutable/);
  const draftKey=Identity.create({athleteId:A,seasonPlanId:P,week:4,day}).workoutKey;
  await db.query('insert into public.athlete_practice_rep_results(athlete_id,workout_key,program_week,program_day,rep_number,time_seconds,season_plan_id) values($1,$2,4,$3,1,12,$4)',[A,draftKey,day,P]);
  await db.query('update public.athlete_practice_rep_results set time_seconds=11 where workout_key=$1',[draftKey]);
  assert.equal(Number((await scalar(db,'select time_seconds from public.athlete_practice_rep_results where workout_key=$1',[draftKey])).time_seconds),11,'unfinished athlete reps remain correctable');
  await assert.rejects(db.query('update public.athlete_practice_rep_results set coach_session_id=$1,coach_user_id=$2 where workout_key=$3',[S,C,draftKey]),/linkage/);
  await assert.rejects(db.query('insert into public.athlete_practice_rep_results(athlete_id,workout_key,program_week,program_day,rep_number,time_seconds,season_plan_id,coach_session_id,coach_user_id) values($1,$2,4,$3,2,12,$4,$5,$6)',[A,draftKey,day,P,S,C]),/linkage/);
  await role(db,C);
  await assert.rejects(db.query('update public.coach_practice_timing_results set time_seconds=8.5 where session_id=$1',[S]),/immutable/);
  await assert.rejects(db.query('delete from public.coach_practice_timing_results where session_id=$1',[S]),/immutable/);
  await db.query('select public.mw_coach_sync_practice_intelligence($1,$2,$3)',[S,A,key]);
  assert.equal((await db.query('select public.mw_coach_sync_practice_session_to_athlete($1,$2,3,$3,12,$4,100,$5,null) as result',[S,A,day,key,P])).rows[0].result.replayed,true,'millisecond evidence replays at athlete numeric precision');
  const receipt=(await commit([result])).rows[0].result;assert.equal(receipt.replayed,true);
  for(const patch of [{time_seconds:8.5},{mw_intent:'recovery'},{mw_interpretation:'below_target'},{pace_status:'slow'},{source_program_week:13},{distance_m:200},{session_date:'2020-01-01'}])await assert.rejects(commit([{...result,...patch}]),/immutable/);
  await assert.rejects(commit([result,{...result,rep_number:2}]),/immutable/);
  await assert.rejects(commit([result,result]),/immutable/);
  await assert.rejects(db.query('select public.mw_coach_sync_practice_session_to_athlete($1,$2,3,$3,12,$4,200,$5,null)',[S,A,day,key,P]),/immutable/,'direct sync cannot mutate completed distance');
  await db.exec('reset role');await db.exec('update public.athlete_program_state set current_week=4,current_day=1');await role(db,C);
  assert.equal((await commit([result])).rows[0].result.replayed,true,'receipt survives live program advancement');
  await role(db,AU);
  assert.deepEqual(await scalar(db,'select mw_intent,mw_interpretation,pace_status,coach_session_id,recorded_at from public.athlete_practice_rep_results where workout_key=$1',[key]),rep,'same-session retry preserves one canonical rep and timestamp');
  assert.equal((await scalar(db,'select count(*)::int as n from public.athlete_practice_rep_results where workout_key=$1',[key])).n,1);
  await db.query("update public.workout_completions set completion_status='completed',pace_reps_total=0,pace_reps_hit=0,completed_at=now()+interval '1 day' where workout_key=$1",[key]);
  assert.deepEqual(await scalar(db,'select completion_status,pace_reps_total,pace_reps_hit,completed_at from public.workout_completions where workout_key=$1',[key]),completed,'athlete completion cannot erase coach evidence');
  console.log('PASS: production Practice migration chain, stable legacy refresh, local-day parity, unchanged grants, atomic rollback, classification durability without enrichment, idempotent coach reps, and completion evidence protection.');
 }finally{await db.close()}
}
run().catch(e=>{console.error(e);process.exitCode=1});
