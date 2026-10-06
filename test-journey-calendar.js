'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {effectiveCalendar}=require('./server/lib/mw-season-calendar');
const realSeasonIntelligence=require('./server/lib/mw-season-intelligence');

const athleteId='11111111-1111-1111-1111-111111111111';
const userId='22222222-2222-2222-2222-222222222222';
const timeZone='America/Chicago';
let now=new Date('2026-10-05T01:00:00Z'); // Sunday evening locally, Monday in UTC.
let audience='coach';
let seasonStart='2026-09-07';
const context=()=>({token:'fixture',user:{id:userId},profile:{role:audience},athlete:{id:athleteId},features:{access:{smart_entry:true}}});
function handler(file){
  const scope={module:{exports:{}},console,process,fetch:global.fetch,require(name){
    if(name.endsWith('/mw-auth')||name.endsWith('/mw-coach-auth'))return {
      SUPABASE_URL:'https://fixture.invalid',SUPABASE_KEY:'fixture',
      authenticate:async()=>({token:'fixture',user:{id:userId}}),
      getAccountContext:async()=>context(),getAthleteContext:async()=>context()
    };
    if(name.endsWith('/mw-season-calendar'))return {...require('./server/lib/mw-season-calendar'),effectiveCalendar:(token,options={})=>effectiveCalendar(token,{...options,now})};
    if(name.endsWith('/mw-season-intelligence'))return {...realSeasonIntelligence,reconcileSeasonPlan:async()=>null,listOwnSeasonPlans:async()=>[]};
    return require(require('node:path').resolve(require('node:path').dirname(file),name));
  }};
  vm.createContext(scope);vm.runInContext(fs.readFileSync(file,'utf8'),scope);
  return scope.module.exports;
}
async function request(run,{method='GET',query={},body={}}={}){
  const result={},res={setHeader(){},status(code){result.status=code;return this},json(data){result.body=data;return this}};
  await run({method,query,body,headers:{'x-mw-time-zone':timeZone}},res);
  return result;
}
async function checkClients(file){
  const source=fs.readFileSync(file,'utf8'),calls=[];
  const scope={URLSearchParams,mwSessionToken:()=> 'fixture',mwClientTimeZone:()=>timeZone,
    fetch:async(url,options)=>{calls.push({url,options});return {ok:true,json:async()=>({calendar:{week:4},track:{sessions:[]}})}} ,
    escapeHtml:x=>String(x||''),renderTrackSession:()=>'',mwModal(){},toast:message=>{throw new Error(message)},
    document:{querySelectorAll:()=>[]}
  };
  vm.createContext(scope);
  vm.runInContext(source.slice(source.indexOf('async function coachCurrentCalendar('),source.indexOf('function coachPracticeTier(')),scope);
  vm.runInContext(source.slice(source.indexOf('async function mwProgramWeek('),source.indexOf('async function mwTrackPage(')),scope);
  await scope.coachCurrentCalendar();await scope.coachProgramData(4);await scope.mwProgramWeek(4);
  for(const call of calls)assert.equal(call.options.headers['X-MW-Time-Zone'],timeZone,`${file}: ${call.url} must use the same local calendar as the roster`);
}
function checkTutorials(){
  const items=new Map(),elements=new Map();
  const storage={getItem:key=>items.get(key)||null,setItem:(key,value)=>items.set(key,String(value))};
  const element=id=>{
    if(!elements.has(id)){
      const classes=new Set();
      elements.set(id,{classList:{add:value=>classes.add(value),remove:value=>classes.delete(value),contains:value=>classes.has(value)}});
    }
    return elements.get(id);
  };
  const athlete=fs.readFileSync('athlete/index.html','utf8'),views=[];
  const scope={localStorage:storage,mwOnboardingUserKey:'test-athlete',window:{mwAssessmentComplete:true,mwGetRemoteProfile:()=>({assessmentCompletedAt:'2026-09-26T10:42:16Z'})},
    $:selector=>element(selector),QS_STEPS:[],qsIndex:0,buildQuickStartSteps:()=>[{},{},{}],renderQuickStart(){},openView:view=>views.push(view),loadSeasonCalendar(){}};
  vm.createContext(scope);
  vm.runInContext(athlete.slice(athlete.indexOf('function qsStorageKey('),athlete.indexOf('function renderQuickStart(')),scope);
  vm.runInContext(athlete.slice(athlete.indexOf('function finishQuickStart('),athlete.indexOf('const DEFAULT_PREFS=')),scope);
  scope.startQuickStart();assert(element('#mwQuickStart').classList.contains('show'));
  element('#qsNext').onclick();element('#qsNext').onclick();element('#qsNext').onclick();
  assert.equal(storage.getItem(scope.qsStorageKey()),'1','athlete Finish persists completion for this account and assessment');
  assert.equal(views.at(-1),'home');assert(!element('#mwQuickStart').classList.contains('show'));
  scope.startQuickStart();assert(!element('#mwQuickStart').classList.contains('show'),'completed athlete tutorial stays closed when the app reopens');
  element('#replayTour').onclick();assert(element('#mwQuickStart').classList.contains('show'),'explicit replay remains available');
  element('#qsSkip').onclick();assert(!element('#mwQuickStart').classList.contains('show'));

  const coach=fs.readFileSync('coach/app-live-20261005-r1.js','utf8');
  let starts=0,root=null;
  const coachScope={localStorage:storage,authSession:{user:{id:'test-coach'}},readStoredSession:()=>null,experience:'performance',accountAccess:{isFounder:false},
    COACH_TOUR_RANK:{core:1,intelligence:2,performance:3},COACH_UPGRADE_TOURS:{},coachTourState:null,
    document:{getElementById:()=>root},window:{removeEventListener(){}},coachTourReposition(){},coachTourCloseNav(){},toast(){},
    startCoachTour(){starts++;root={remove(){root=null}};coachScope.coachTourState={root}}
  };
  vm.createContext(coachScope);
  vm.runInContext(coach.slice(coach.indexOf('function coachTourUserKey('),coach.indexOf('function coachTourEnsureDashboard(')),coachScope);
  vm.runInContext(coach.slice(coach.indexOf('function finishCoachTour('),coach.indexOf('function renderLogin(')),coachScope);
  coachScope.maybeStartCoachTour();assert.equal(starts,1);
  coachScope.finishCoachTour();assert.equal(storage.getItem(coachScope.coachTourCompleteKey()),'1');assert.equal(root,null);
  coachScope.maybeStartCoachTour();assert.equal(starts,1,'completed coach tutorial stays closed for this account and tier');
}
async function main(){
  const originalFetch=global.fetch;
  global.fetch=async(url,options={})=>{
    const path=String(url);
    let data={};
    if(path.endsWith('/rpc/mw_coach_access_tier'))data='mw_sprint_performance';
    else if(path.endsWith('/rpc/mw_effective_season_calendar'))data=[{calendar_mode:'custom',season_start_date:seasonStart,source:audience==='coach'?'coach_setting':'assigned_coach',coach_user_id:userId}];
    else if(path.endsWith('/rpc/mw_reconcile_own_season_plan'))data=null;
    else if(path.endsWith('/rpc/mw_submit_smart_entry_v3'))data={assignedWeek:JSON.parse(options.body).p_season_week};
    return {ok:true,status:200,json:async()=>data};
  };
  try{
    const coach=handler('server/api/coach/program.js');
    let result=await request(coach,{query:{week:'5'}});
    assert.equal(result.status,423,'Sunday evening must keep next Monday’s coach workout locked');
    assert.equal(result.body.currentWeek,4);
    result=await request(coach,{query:{week:'4'}});assert.equal(result.status,200,'the current local week remains available');
    now=new Date('2026-10-05T05:00:00Z');
    result=await request(coach,{query:{week:'5'}});assert.equal(result.status,200,'coach week unlocks at local Monday midnight');
    now=new Date('2026-10-05T01:00:00Z');audience='athlete';
    const seasons=handler('server/api/season-plan.js');
    result=await request(seasons);assert.equal(result.status,200);assert.equal(result.body.calendar.week,4,'athlete season setup follows the same local calendar');
    const assessment=handler('server/api/smart-entry.js');
    result=await request(assessment,{method:'POST',body:{firstName:'Test',lastName:'Athlete',dateOfBirth:'2000-01-01',events:['100m'],trainingAge:1,continuity:3,speedExposure:3,recentRace:3,lifting:3,health:'healthy'}});
    assert.equal(result.status,200);assert.equal(result.body.calendar.week,4,'assessment placement must not advance a day before Today');
    assert.equal(result.body.assignedWeek,4);
    // Match the identified account's saved team start, without changing its data.
    seasonStart='2026-11-02';now=new Date('2026-10-06T03:00:00Z');
    result=await request(seasons);assert.equal(result.body.calendar.status,'preseason');assert.equal(result.body.calendar.week,1);
    now=new Date('2026-11-02T06:00:00Z');result=await request(seasons);assert.equal(result.body.calendar.status,'active');assert.equal(result.body.calendar.week,1);
    now=new Date('2026-11-09T05:59:00Z');result=await request(seasons);assert.equal(result.body.calendar.week,1);
    audience='coach';result=await request(coach,{query:{week:'2'}});assert.equal(result.status,423);
    now=new Date('2026-11-09T06:00:00Z');result=await request(coach,{query:{week:'2'}});assert.equal(result.status,200);
    audience='athlete';result=await request(seasons);assert.equal(result.body.calendar.week,2,'the assigned athlete rolls over with the coach at local Monday midnight');
  }finally{global.fetch=originalFetch}
  await checkClients('coach/app.js');
  const live=fs.readFileSync('coach/index.html','utf8').match(/src="\/(coach\/app-live-[^"?]+)(?:\?[^" ]*)?"/);
  assert(live,'production coach page references a live bundle');await checkClients(live[1]);
  await checkHistoricalRoster();
  await checkAthleteHistory();
  for(const file of ['coach/app.js',live[1]])checkCoachDateLabels(file);
  checkTutorials();
  console.log('PASS: coach/athlete local week rollover, protected preseason, assessment placement, both live coach request paths, and tutorial Finish/reopen/replay callbacks.');
}
async function checkHistoricalRoster(){
  const originalFetch=global.fetch;
  global.fetch=async(url)=>{
    const path=String(url);let data=[];
    if(path.includes('/coach_assignments?'))data=[{athlete_id:athleteId,status:'active'}];
    else if(path.includes('/athletes?'))data=[{id:athleteId,user_id:userId,primary_event:'100m'}];
    else if(path.includes('/membership_entitlements?'))data=[{user_id:userId,status:'active'}];
    else if(path.includes('/athlete_program_state?'))data=[{athlete_id:athleteId,current_week:1,current_day:2,workout_cycle_id:'33333333-3333-3333-3333-333333333333'}];
    else if(path.includes('/workout_completions?'))data=[{athlete_id:athleteId,program_week:1,program_day:5,workout_key:`mw-workout-v1:${athleteId}:mw-41:w1:d5:track`,completion_status:'completed',completed_at:'2026-10-04T02:19:43.968Z',workout_cycle_id:null,season_plan_id:null}];
    return {ok:true,json:async()=>data};
  };
  try{
    audience='coach';const result=await request(handler('server/api/coach/roster.js'));
    assert.equal(result.status,200);assert.equal(result.body.athletes[0].last_completed_workout_at,'2026-10-04T02:19:43.968Z','historical activity remains visible after a new cycle starts');
    assert.equal(result.body.athletes[0].latest_workout,null,'historical completion cannot lock or complete the current-cycle workout');
  }finally{global.fetch=originalFetch}
}
async function checkAthleteHistory(){
  const Identity=require('./lib/mw-workout-identity'),cycle='33333333-3333-3333-3333-333333333333';
  const old=Identity.create({athleteId,week:1,day:2}),current=Identity.create({athleteId,workoutCycleId:cycle,week:1,day:2});
  const row=(identity,source,target)=>({athlete_id:athleteId,workout_key:identity.workoutKey,workout_cycle_id:identity.workoutCycleId,season_plan_id:null,program_week:1,program_day:2,rep_number:1,time_seconds:3,target_seconds:target,entry_source:source,pace_status:'on_pace'});
  const oldRow=row(old,'coach',3.62),newRow=row(current,'athlete',4),box={innerHTML:''},calls=[];
  const scope={MWWorkoutIdentity:Identity,workoutIdentity:(week,day)=>Identity.create({athleteId,workoutCycleId:cycle,week,day}),completionAthleteId:()=>athleteId,document:{getElementById:()=>box},MW_SB_URL:'https://fixture.invalid',completionHeaders:()=>({}),fetch:async url=>{calls.push(url);return {ok:true,json:async()=>[oldRow,newRow]}},loadMWProgramWeek:async()=>({track:{sessions:[{day:2,title:'TECH',focus:'technical'}]}}),parsePrescription:()=>({target:4}),renderWeightRoomProgressUI(){}};
  const source=fs.readFileSync('athlete/index.html','utf8');vm.createContext(scope);
  vm.runInContext(source.slice(source.indexOf('let mwPracticeProgressCache=[];'),source.indexOf('function rowsToCompletion(')),scope);
  await scope.loadPracticeProgress();
  assert(calls[0].includes('athlete_id=eq.'+athleteId),'history remains scoped to the signed-in athlete');
  assert(calls[0].includes('select=athlete_id,'),'canonical identity retains the athlete id');
  assert.match(box.innerHTML,/PREVIOUS TRAINING/);assert.match(box.innerHTML,/COACH TIMED/);assert.match(box.innerHTML,/ATHLETE TIMED/);assert.match(box.innerHTML,/3\.62s/,'previous target remains unchanged');
  assert.equal(vm.runInContext('mwPracticeProgressCache.length',scope),1,'only current-cycle reps feed active performance signals');
  assert.equal(vm.runInContext('mwPracticeHistoryCache.length',scope),1);
  assert.equal(oldRow.target_seconds,3.62,'history is never rewritten by a current prescription');
}
function checkCoachDateLabels(file){
  const source=fs.readFileSync(file,'utf8'),priorTZ=process.env.TZ;
  process.env.TZ='America/Chicago';
  try{
    class TuesdayDate extends Date{constructor(...args){super(...(args.length?args:['2026-10-06T12:00:00Z']))}}
    const scope={Date:TuesdayDate};vm.createContext(scope);
    vm.runInContext(source.slice(source.indexOf('function coachTrainingDayFromCalendar('),source.indexOf('function coachSessionDayNumber(')),scope);
    vm.runInContext(source.slice(source.indexOf('function fmtDate('),source.indexOf('async function athleteDetail(')),scope);
    assert.equal(scope.coachTrainingDayFromCalendar({status:'preseason',startDate:'2026-11-02'}),2,'preseason Today banner matches Tuesday athlete prescription');
    assert.equal(scope.fmtDate('2026-11-02'),'11/2/2026','date-only season start must not shift back one day in Chicago');
    assert.equal(scope.fmtDate('2026-10-04T02:19:43.968Z'),'10/3/2026','saved timestamps still display in local time');
  }finally{if(priorTZ===undefined)delete process.env.TZ;else process.env.TZ=priorTZ}
}
main().catch(error=>{console.error(error);process.exitCode=1});
