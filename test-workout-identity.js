'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const Identity=require('./lib/mw-workout-identity');
const A='11111111-1111-1111-1111-111111111111',B='22222222-2222-2222-2222-222222222222';
const P='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',OLD='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const current=Identity.create({athleteId:A,seasonPlanId:P,week:3,day:2});
function athleteReader(plan=P,cycle=null){
  const source=fs.readFileSync('athlete/index.html','utf8');
  const context={MWWorkoutIdentity:Identity,completionAthleteId:()=>A,activeSeasonPlanId:()=>plan,activeWorkoutCycleId:()=>cycle,mwPaceCheckCache:{},mwWorkoutStatusCache:{},mwSessionRpeCache:{}};
  vm.createContext(context);
  vm.runInContext(source.slice(source.indexOf('function workoutIdentity('),source.indexOf('function workoutStatus(')),context);
  vm.runInContext(source.slice(source.indexOf('function rowsToCompletion('),source.indexOf('async function loadWorkoutCompletions(')),context);
  return context;
}
function coachReader(){
  const source=fs.readFileSync('coach/app.js','utf8'),context={MWWorkoutIdentity:Identity};vm.createContext(context);
  vm.runInContext(source.slice(source.indexOf('function coachPracticeWorkoutComplete('),source.indexOf('async function practiceModePage(')),context);
  return context;
}
function notificationReader(){
  const source=fs.readFileSync('athlete/index.html','utf8'),context={};vm.createContext(context);
  vm.runInContext(source.slice(source.indexOf('function mwNotificationWorkoutPosition('),source.indexOf('function render()',source.indexOf('function mwNotificationWorkoutPosition('))),context);
  return context;
}
function completion(identity,key=identity.workoutKey){return {athlete_id:identity.athleteId,season_plan_id:identity.seasonPlanId,workout_cycle_id:identity.workoutCycleId,program_week:identity.week,program_day:identity.day,workout_key:key,completion_status:'completed'}}
async function run(){
  const athlete=athleteReader(),coach=coachReader(),notifications=notificationReader();
  assert.deepEqual({...notifications.mwNotificationWorkoutPosition(current.workoutKey)},{week:3,day:2},'canonical notification opens its workout');
  assert.deepEqual({...notifications.mwNotificationWorkoutPosition(`mw-season-${P}-w3-d2`)},{week:3,day:2},'season legacy notification still opens');
  assert.deepEqual({...notifications.mwNotificationWorkoutPosition('mw-track-w3-d2')},{week:3,day:2},'bare legacy notification still opens');
  assert.equal(notifications.mwNotificationWorkoutPosition(current.workoutKey.replace(':track',':track-extra')),null,'non-track workout notifications do not misroute');
  const roster={id:A,season_plan_id:P,current_week:3,current_day:2};
  assert.equal(athlete.workoutKey(3,2),coach.coachPracticeIdentity(roster).workoutKey,'coach and athlete share the actual shipped helper');
  assert.notEqual(current.workoutKey,Identity.create({athleteId:B,seasonPlanId:P,week:3,day:2}).workoutKey,'athlete participates in identity');
  assert.notEqual(current.workoutKey,Identity.create({athleteId:A,seasonPlanId:OLD,week:3,day:2}).workoutKey,'new season reuses week/day safely');
  assert.notEqual(current.workoutKey,Identity.create({athleteId:A,seasonPlanId:P,week:3,day:2,sessionId:'track-extra'}).workoutKey,'workout slot participates in identity');
  assert.equal(athlete.rowsToCompletion([completion(current)])['3'].s2,true);
  const seasonal=completion(current,`mw-season-${P}-w3-d2`),bridged=completion(current,'mw-track-w3-d2');
  assert.equal(athlete.rowsToCompletion([seasonal])['3'].s2,true,'seasonal legacy history remains readable');
  assert.equal(athlete.rowsToCompletion([bridged])['3'].s2,true,'legacy coach key with explicit plan remains readable');
  const old=completion(Identity.create({athleteId:A,seasonPlanId:OLD,week:3,day:2}));
  const unscoped={...bridged,season_plan_id:null};
  assert.equal(Object.keys(athlete.rowsToCompletion([old,unscoped])).length,0,'old/unscoped history does not complete new season');
  const standard=athleteReader(null);
  assert.equal(standard.rowsToCompletion([unscoped])['3'].s2,true,'unscoped history stays in the legacy cycle');
  assert.equal(coach.coachPracticeWorkoutComplete({...roster,latest_workout:old}),false,'old season cannot lock browser Practice Mode');
  assert.equal(coach.coachPracticeWorkoutComplete({...roster,latest_workout:unscoped}),false);
  assert.equal(coach.coachPracticeWorkoutComplete({...roster,latest_workout:bridged}),true);
  const cycle=Identity.create({athleteId:A,workoutCycleId:P,week:3,day:2});
  const oldCycle=Identity.create({athleteId:A,workoutCycleId:OLD,week:3,day:2});
  const cycleRoster={id:A,workout_cycle_id:P,current_week:3,current_day:2};
  assert.equal(athleteReader(null,P).workoutKey(3,2),coach.coachPracticeIdentity(cycleRoster).workoutKey);
  assert.notEqual(cycle.workoutKey,oldCycle.workoutKey,'unplanned training cycles are isolated too');
  assert.equal(coach.coachPracticeWorkoutComplete({...cycleRoster,latest_workout:completion(oldCycle)}),false);
  assert.equal(Object.keys(athleteReader(null,P).rowsToCompletion([unscoped,completion(oldCycle)])).length,0);
  assert.equal(athleteReader(null,P).rowsToCompletion([completion(cycle)])['3'].s2,true);
  assert.equal(Identity.matches({...completion(current),athlete_id:B},current),false,'forged athlete/key disagreement rejected');
  assert.equal(Identity.matches({...completion(current),season_plan_id:OLD},current),false,'forged plan/key disagreement rejected');
  const reps=Identity.preferRows([{...seasonal,rep_number:1,time_seconds:12},{...completion(current),rep_number:1,time_seconds:11},{...old,rep_number:2,time_seconds:13}],current);
  assert.equal(reps.length,1);assert.equal(reps[0].time_seconds,11,'canonical reps take precedence over legacy aliases');
  // Execute the real API handler with a bounded REST fixture, never a live service.
  const calls=[],rows=[];
  let completions=[old,unscoped],state={athlete_id:A,current_week:3,current_day:2,season_plan_id:P};
  const context={require:name=>name==='../../lib/mw-coach-auth'?{SUPABASE_URL:'https://fixture.invalid',SUPABASE_KEY:'fixture',getAccountContext:async()=>({token:'fixture',user:{id:B},profile:{role:'coach'}})}:require(name.replace('../../../','./')),module:{exports:{}},console,fetch:async(url,opts={})=>{
    calls.push({url,opts});let data=[];
    if(url.includes('/athlete_program_state?'))data=[state];
    else if(url.includes('/workout_completions?'))data=completions;
    else if(url.includes('/coach_practice_timing_results?')&&opts.method==='POST'){rows.push(...JSON.parse(opts.body));data=rows}
    else if(url.endsWith('/rpc/mw_coach_sync_practice_session_to_athlete')){
      const p=JSON.parse(opts.body);assert.equal(p.p_workout_key,current.workoutKey);assert.equal(p.p_season_plan_id,P);
      data={ok:true,workout_key:p.p_workout_key};completions=[...completions,completion(current,p.p_workout_key)];
    }
    return {ok:true,json:async()=>data};
  }};
  vm.createContext(context);vm.runInContext(fs.readFileSync('server/api/coach/practice-timing.js','utf8'),context);
  async function save(overrides={}){
    const result={};const res={setHeader(){},status(code){result.status=code;return this},json(body){result.body=body;return this}};
    await context.module.exports({method:'POST',body:{sessionId:'cccccccc-cccc-cccc-cccc-cccccccccccc',results:[{athleteId:A,programWeek:3,programDay:2,sourceProgramWeek:12,seasonPlanId:P,workoutKey:'mw-track-w3-d2',repNumber:1,prescribedReps:2,timeSeconds:12,...overrides}]}},res);return result;
  }
  let result=await save();assert.equal(result.status,200,'old season does not lock current API save');
  assert.equal(rows[0].workout_key,current.workoutKey,'server persists canonical identity for an old client');
  assert.equal(athlete.rowsToCompletion(completions)['3'].s2,true,'coach save is recognized by actual athlete completion reader');
  result=await save();assert.equal(result.status,409,'same-cycle completion still locks duplicates');
  completions=[];const writes=calls.filter(c=>c.opts.method==='POST').length;
  result=await save({seasonPlanId:OLD});assert.equal(result.status,409,'stale season rejected before writes');
  result=await save({workoutKey:old.workout_key});assert.equal(result.status,400,'foreign season key rejected');
  result=await save({programDay:1});assert.equal(result.status,409,'stale day rejected');
  assert.equal(calls.filter(c=>c.opts.method==='POST').length,writes);
  result=await save({workoutKey:current.workoutKey});assert.equal(result.status,200,'canonical clients accepted');
  console.log('PASS: canonical athlete/coach identity, completion recognition, athlete/session/season isolation, legacy history, and cycle-aware API/browser locks.');
}
run().catch(e=>{console.error(e);process.exitCode=1});
