'use strict';
// PostgreSQL integration test, completely in-memory. Install the pinned test engine
// outside the repo and set MW_IDENTITY_PGLITE_PATH (see docs/workout-identity-phase1.md).
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {PGlite}=require(process.env.MW_IDENTITY_PGLITE_PATH||'@electric-sql/pglite');
const Identity=require('./lib/mw-workout-identity');
const A='11111111-1111-1111-1111-111111111111',AU='33333333-3333-3333-3333-333333333333';
const C='22222222-2222-2222-2222-222222222222',OTHER='44444444-4444-4444-4444-444444444444';
const P='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',OLD='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const S='cccccccc-cccc-cccc-cccc-cccccccccccc',S2='dddddddd-dddd-dddd-dddd-dddddddddddd';
const migration=fs.readFileSync('supabase/migrations/20261002030901_canonical_workout_identity.sql','utf8');
const current=Identity.create({athleteId:A,seasonPlanId:P,week:3,day:2});
async function fixture(){
 const db=new PGlite();await db.exec(fs.readFileSync('test-fixtures/workout-identity.sql','utf8'));
 const lifecycle=fs.readFileSync('supabase/migrations/20260924_athlete_calendar_sync_and_rep_persistence.sql','utf8');
 await db.exec(lifecycle.slice(0,lifecycle.indexOf('create or replace function public.mw_mark_own_workout_status')));
 await db.exec(fs.readFileSync('supabase/migrations/20260924_athlete_practice_rep_results.sql','utf8'));
 await db.exec(`alter table public.athlete_practice_rep_results add column season_plan_id uuid,add column source_program_week integer;`);
 await db.exec(fs.readFileSync('supabase/migrations/20260919_build10_practice_timing.sql','utf8'));
 await db.exec(`alter table public.coach_practice_timing_results add column session_id uuid,add column division text,add column group_id uuid,add column lane_number integer,add column timing_source text,add column result_status text,add column target_min_seconds numeric,add column target_max_seconds numeric,add column actual_rest_seconds numeric,add column prescribed_rest_seconds numeric;grant select,insert,update on public.coach_practice_timing_results to authenticated;`);
 await db.exec(fs.readFileSync('supabase/migrations/20260929_unify_coach_athlete_practice_history.sql','utf8'));
 await db.exec(fs.readFileSync('supabase/migrations/20260929_persist_practice_workout_intelligence.sql','utf8'));
 await db.exec(fs.readFileSync('supabase/migrations/20260928_sync_completed_workout_to_coach.sql','utf8'));
 await db.exec(`create function private.mw_phase_for_week(integer) returns integer language sql as $$ select 1 $$;`);
 await db.exec(`insert into auth.users values ('${AU}'),('${C}'),('${OTHER}');
 insert into public.profiles values ('${AU}','athlete','active'),('${C}','coach','active'),('${OTHER}','coach','active');
 insert into public.athletes values ('${A}','${AU}');
 insert into public.coach_assignments values ('${C}','${A}','active');
 insert into public.athlete_season_plans values ('${P}','${A}',current_date-14,current_date+100,20,'{"3":{"sourceWeek":12}}'),('${OLD}','${A}',current_date-400,current_date-200,20,'{}');
 insert into public.athlete_program_state(athlete_id,current_week,current_day,current_phase,starting_week,season_plan_id,season_length_weeks,start_date)
 values ('${A}',3,2,1,1,'${P}',20,current_date-14);`);
 return db;
}
async function role(db,user){await db.exec(`reset role;set request.jwt.claim.sub='${user}';set role authenticated;`)}
async function scalar(db,sql,params=[]){return (await db.query(sql,params)).rows[0]}
function readCompletion(rows,plan=P,cycle=null){
 const html=fs.readFileSync('athlete/index.html','utf8');
 const context={MWWorkoutIdentity:Identity,completionAthleteId:()=>A,activeSeasonPlanId:()=>plan,activeWorkoutCycleId:()=>cycle,mwPaceCheckCache:{},mwWorkoutStatusCache:{},mwSessionRpeCache:{}};
 vm.createContext(context);
 vm.runInContext(html.slice(html.indexOf('function workoutIdentity('),html.indexOf('function workoutStatus(')),context);
 vm.runInContext(html.slice(html.indexOf('function rowsToCompletion('),html.indexOf('async function loadWorkoutCompletions(')),context);
 return context.rowsToCompletion(rows);
}
async function sync(db,session,key=current.workoutKey,plan=P){return scalar(db,'select public.mw_coach_sync_practice_session_to_athlete($1,$2,3,2,12,$3,160,$4) as result',[session,A,key,plan])}
async function apiSave(db,identity){
 // Real Node handler + real PostgreSQL writes/RPCs. Only transport/auth are fixtures.
 const context={module:{exports:{}},console,require:name=>name==='../../lib/mw-coach-auth'
  ?{SUPABASE_URL:'https://fixture.invalid',SUPABASE_KEY:'fixture',getAccountContext:async()=>({token:'fixture',user:{id:C},profile:{role:'coach'}})}
  :name==='../../lib/mw-season-calendar'?{localCalendarDate:()=> '2026-09-29'}
  :name==='../../lib/mw-training-position'?{programPosition:(state)=>({week:Number(state.current_week)||1,day:Number(state.current_day)||1,phase:Number(state.current_phase)||1,sourceWeek:Number(state.source_program_week||state.current_week)||1,status:state.program_status||'active'})}
  :require(name.replace('../../../','./')),fetch:async(url,options={})=>{
   assert.ok(url.startsWith('https://fixture.invalid/rest/v1/'));
   const target=new URL(url),path=target.pathname.split('/').pop();let data;
   if(path==='athlete_program_state'){
    data=(await db.query('select * from public.athlete_program_state where athlete_id=$1',[identity.athleteId])).rows;
   }else if(path==='athlete_season_plans'){
    data=identity.seasonPlanId?(await db.query('select * from public.athlete_season_plans where id=$1',[identity.seasonPlanId])).rows:[];
   }else if(path==='workout_completions'){
    data=(await db.query("select * from public.workout_completions where athlete_id=$1 and program_week=$2 and program_day=$3 and workout_key=any($4::text[]) and completion_status='completed'",[identity.athleteId,identity.week,identity.day,Identity.readKeys(identity)])).rows;
   }else if(path==='mw_coach_refresh_assigned_athlete_program_position'){
    data={ok:true};
   }else if(path==='mw_coach_commit_practice_session'){
    const p=JSON.parse(options.body),saved=Array.isArray(p.p_results)?p.p_results:[],synced=[];
    for(const row of saved){
     const columns=Object.keys(row);assert.ok(columns.every(c=>/^[a-z_]+$/.test(c)));
     const update=columns.map(c=>c+'=excluded.'+c).join(',');
     const placeholders=columns.map((_,i)=>'$'+(i+1)).join(',');
     const query='insert into public.coach_practice_timing_results('+columns.join(',')+') values ('+placeholders+') on conflict(session_id,athlete_id,rep_number) do update set '+update+' returning *';
     await db.query(query,Object.values(row));
    }
    for(const row of saved){
     if(synced.some(x=>x.athlete_id===row.athlete_id))continue;
     const out=(await scalar(db,'select public.mw_coach_sync_practice_session_to_athlete($1,$2,$3,$4,$5,$6,$7,$8,$9) as result',[p.p_session_id,row.athlete_id,row.program_week,row.program_day,row.source_program_week,row.workout_key,row.distance_m,row.season_plan_id,row.workout_cycle_id])).result;
     synced.push({athlete_id:row.athlete_id,...out});
    }
    data={ok:true,count:saved.length,synced};
   }else if(path==='mw_coach_sync_practice_intelligence'){
    const p=JSON.parse(options.body);data=(await scalar(db,'select public.mw_coach_sync_practice_intelligence($1,$2,$3) as result',[p.p_session_id,p.p_athlete_id,p.p_workout_key])).result;
   }else throw new Error('Unexpected fixture request '+path);
   return {ok:true,json:async()=>data};
  }};
 vm.createContext(context);vm.runInContext(fs.readFileSync('server/api/coach/practice-timing.js','utf8'),context);
 const result={},res={setHeader(){},status(status){result.status=status;return this},json(body){result.body=body;return this}};
 await context.module.exports({method:'POST',headers:{},body:{sessionId:'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',results:[{
  athleteId:identity.athleteId,seasonPlanId:identity.seasonPlanId,workoutCycleId:identity.workoutCycleId,programWeek:identity.week,programDay:identity.day,sourceProgramWeek:12,workoutKey:identity.workoutKey,distanceM:160,repNumber:1,prescribedReps:2,timeSeconds:12,paceStatus:'on_pace',mwIntent:'speed',mwInterpretation:'on_target'
 }]}},res);
 return result;
}
async function run(){
 const db=await fixture();
 try{
  await db.exec(`insert into public.workout_completions(athlete_id,program_week,program_day,workout_key,completion_status,season_plan_id,completed_at)
   values ('${A}',3,2,'mw-track-w3-d2','completed','${OLD}',now()),('${A}',1,1,'mw-track-w1-d1','completed',null,now());
   insert into public.athlete_practice_rep_results(athlete_id,program_week,program_day,workout_key,rep_number,time_seconds,season_plan_id)
   values ('${A}',1,2,'mw-season-${OLD}-w1-d2',1,12,null);
   insert into public.athlete_notifications(athlete_id,entity_type,entity_id) values ('${A}','workout_completion','mw-track-w3-d2');`);
  const before=(await scalar(db,'select last_activity_at from public.workout_completions where season_plan_id=$1',[OLD])).last_activity_at;
  await db.exec(migration);
  assert.equal(String((await scalar(db,'select last_activity_at from public.workout_completions where season_plan_id=$1',[OLD])).last_activity_at),String(before),'backfill preserves activity timestamps');
  const oldKey=Identity.create({athleteId:A,seasonPlanId:OLD,week:3,day:2}).workoutKey;
  assert.equal((await scalar(db,"select workout_key from public.workout_completions where season_plan_id=$1",[OLD])).workout_key,oldKey,'legacy coach history retains its own season');
  assert.equal((await scalar(db,'select entity_id from public.athlete_notifications')).entity_id,oldKey,'notification links follow migrated identity');
  assert.equal((await scalar(db,'select season_plan_id from public.athlete_practice_rep_results')).season_plan_id,OLD,'encoded legacy season is recovered without using current state');
  for(const plan of [null,P,OLD])for(const session of ['track','track-extra']){
   const identity=Identity.create({athleteId:A,seasonPlanId:plan,week:3,day:2,sessionId:session});
   assert.equal((await scalar(db,'select public.mw_workout_identity_key($1,$2,3,2,$3) as key',[A,plan,session])).key,identity.workoutKey,'SQL/JS identity parity');
  }
  await role(db,C);
  await db.query(`insert into public.coach_practice_timing_results(coach_user_id,athlete_id,session_id,rep_number,time_seconds,pace_status,workout_key,season_plan_id,program_week,program_day)
   values ($1,$2,$3,1,12,'on_pace',$4,$5,3,2)`,[C,A,S,current.workoutKey,P]);
  const saved=await sync(db,S);assert.equal(saved.result.workout_key,current.workoutKey);
  await role(db,AU);
  let rows=(await db.query('select * from public.workout_completions')).rows;
  assert.equal(readCompletion(rows)['3'].s2,true,'real coach RPC result completes actual athlete reader');
  assert.equal((await scalar(db,'select count(*)::int as n from public.workout_completions where program_week=3 and program_day=2')).n,2,'same week/day survives in two seasons');
  // Old athlete REST clients upsert an alias; BEFORE INSERT normalization hits canonical uniqueness.
  await db.query(`insert into public.workout_completions(athlete_id,program_week,program_day,workout_key,completion_status,season_plan_id)
   values ($1,3,2,$2,'completed',$3) on conflict(athlete_id,workout_key) do update set completion_status=excluded.completion_status`,[A,`mw-season-${P}-w3-d2`,P]);
  assert.equal((await scalar(db,'select count(*)::int as n from public.workout_completions where season_plan_id=$1',[P])).n,1);
  await db.query(`insert into public.athlete_practice_rep_results(athlete_id,program_week,program_day,workout_key,rep_number,time_seconds,season_plan_id)
   values ($1,3,2,$2,1,12,$3) on conflict(athlete_id,workout_key,rep_number) do update set time_seconds=excluded.time_seconds`,[A,`mw-season-${P}-w3-d2`,P]);
  assert.equal((await scalar(db,'select count(*)::int as n from public.athlete_practice_rep_results where season_plan_id=$1',[P])).n,1);
  const status=await scalar(db,"select public.mw_mark_own_workout_status(3,2,'in_progress') as result");
  assert.equal(status.result.workout_key,current.workoutKey);assert.equal(status.result.completion_status,'completed');
  const friday=await scalar(db,"select public.mw_mark_own_workout_status(3,5,'in_progress') as result");
  assert.equal(friday.result.workout_key,Identity.create({athleteId:A,seasonPlanId:P,week:3,day:5}).workoutKey,'Friday status identity');
  await db.query('select public.mw_refresh_own_season_program_state()');
  assert.equal((await scalar(db,'select count(*)::int as n from public.workout_completions where workout_key=$1',[current.workoutKey])).n,1,'schedule refresh does not create alias duplicates');
  await assert.rejects(db.query('update public.workout_completions set season_plan_id=$1 where workout_key=$2',[OLD,current.workoutKey]),/mismatch|reassigned/);
  await db.exec('reset role');await db.exec(`update public.athlete_program_state set current_week=3,current_day=2;`);
  await role(db,OTHER);await assert.rejects(sync(db,S),/not assigned/);
  await role(db,C);await assert.rejects(sync(db,S,current.workoutKey,OLD),/season/);
  await db.exec('reset role');await db.exec(`update public.athlete_program_state set current_week=3,current_day=2,season_plan_id='${P}';`);
  await role(db,C);
  await db.query(`insert into public.coach_practice_timing_results(coach_user_id,athlete_id,session_id,rep_number,time_seconds,pace_status)
   values ($1,$2,$3,1,12,'on_pace')`,[C,A,S2]);
  const legacySync=await sync(db,S2,'mw-track-w3-d2',P);assert.equal(legacySync.result.workout_key,current.workoutKey,'legacy RPC input resolves current explicit plan');
  await assert.rejects(db.query('update public.coach_practice_timing_results set workout_key=$1,season_plan_id=$2 where session_id=$3',[oldKey,OLD,S]),/reassigned/);
  await db.exec('reset role');await db.exec(`update public.athlete_program_state set season_plan_id=null,start_date=null,program_status='not_started';`);
  const cycle1=(await scalar(db,'select workout_cycle_id from public.athlete_program_state')).workout_cycle_id;
  assert.ok(cycle1,'leaving a season plan creates an explicit unplanned cycle');
  await db.exec(`update public.athlete_program_state set current_week=3,current_day=2;`);
  const cycleKey1=Identity.create({athleteId:A,workoutCycleId:cycle1,week:3,day:2}).workoutKey;
  await role(db,AU);await db.query("select public.mw_mark_own_workout_status(3,2,'in_progress')");
  await db.query(`insert into public.workout_completions(athlete_id,program_week,program_day,workout_key,completion_status,workout_cycle_id)
    values ($1,3,2,$2,'completed',$3) on conflict(athlete_id,workout_key) do update set completion_status=excluded.completion_status`,[A,cycleKey1,cycle1]);
  await db.exec('reset role');await db.exec("update public.athlete_program_state set start_date=current_date;");
  const cycle2=(await scalar(db,'select workout_cycle_id from public.athlete_program_state')).workout_cycle_id;
  assert.notEqual(cycle1,cycle2,'standard program restart rotates cycle identity');
  const cycleKey2=Identity.create({athleteId:A,workoutCycleId:cycle2,week:3,day:2}).workoutKey;
  assert.equal((await scalar(db,"select count(*)::int as n from public.workout_completions where workout_key=$1 and completion_status='completed'",[cycleKey2])).n,0,'old unplanned completion cannot lock restarted program');
  await role(db,AU);await db.query("select public.mw_mark_own_workout_status(3,2,'in_progress')");
  assert.equal((await scalar(db,'select count(*)::int as n from public.workout_completions where workout_key in ($1,$2)',[cycleKey1,cycleKey2])).n,2,'both unplanned cycles retain their history');
  await db.query('select public.mw_refresh_own_program_state()');
  await db.exec('reset role');await db.exec('update public.athlete_program_state set current_week=3,current_day=2;');
  await role(db,C);
  const endToEnd=await apiSave(db,Identity.create({athleteId:A,workoutCycleId:cycle2,week:3,day:2}));
  assert.equal(endToEnd.status,200,'real API saves through actual database bridge');
  const repeat=await apiSave(db,Identity.create({athleteId:A,workoutCycleId:cycle2,week:3,day:2}));
  assert.equal(repeat.status,409,'database-backed API only locks the completed current cycle');
  await role(db,AU);
  rows=(await db.query('select * from public.workout_completions')).rows;
  assert.equal(readCompletion(rows,null,cycle2)['3'].s2,true,'API -> real raw rows/RPC -> athlete reader end-to-end');
  console.log('PASS: real PostgreSQL migration/RPC, SQL/JS parity, athlete completion recognition, season isolation, legacy upserts, status/schedule writers, assignment checks, and immutable saved identity.');
 }finally{await db.close()}
 // Ambiguous duplicates must abort and preserve the original rows, never discard evidence.
 const duplicate=await fixture();
 try{
  await duplicate.exec(`insert into public.workout_completions(athlete_id,program_week,program_day,workout_key,completion_status,season_plan_id)
   values ('${A}',3,2,'mw-track-w3-d2','completed','${P}'),('${A}',3,2,'mw-season-${P}-w3-d2','scheduled','${P}');`);
  await assert.rejects(duplicate.exec(migration),/identity collision/);await duplicate.exec('rollback');
  assert.equal((await scalar(duplicate,'select count(*)::int as n from public.workout_completions')).n,2);
  assert.equal((await scalar(duplicate,"select count(*)::int as n from public.workout_completions where workout_key like 'mw-workout-v1:%'")).n,0);
  console.log('PASS: duplicate legacy aliases abort migration atomically and preserve all original evidence.');
 }finally{await duplicate.close()}
}
run().catch(e=>{console.error(e);process.exitCode=1});
