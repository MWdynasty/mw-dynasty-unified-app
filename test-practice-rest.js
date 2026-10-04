const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

// Run the shipped browser code with a controllable clock and no network writes.
function fixture() {
  let now = 1000, serial = 0;
  const jobs = new Map(), elements = new Map(), clicks = [];
  function el(key) {
    if (!elements.has(key)) elements.set(key, {
      textContent:'', innerHTML:'', hidden:false, disabled:false, isConnected:true,
      value:'', dataset:{}, style:{}, listeners:{},
      addEventListener(event, fn) { this.listeners[event] = fn; },
      removeEventListener(event) { delete this.listeners[event]; },
      querySelector(selector) { return el(key + selector); },
      click() { if (!this.disabled) return this.listeners.click?.() ?? this.onclick?.({target:{closest:()=>null}}); }
    });
    return elements.get(key);
  }
  const document = {
    body:{style:{}}, getElementById:el,
    addEventListener:(event,fn)=>{if(event==='click')clicks.push(fn)},
    querySelector:()=>null, querySelectorAll:()=>[]
  };
  const ctx = vm.createContext({
    document, console, Date:class extends Date { static now(){return now} },
    performance:{now:()=>now},
    setInterval:(fn,ms)=>{const id=++serial;jobs.set(id,{fn,ms,repeat:true,at:now+ms});return id},
    clearInterval:id=>jobs.delete(id),
    setTimeout:(fn,ms)=>{const id=++serial;jobs.set(id,{fn,ms,at:now+ms});return id},
    clearTimeout:id=>jobs.delete(id), requestAnimationFrame:()=>++serial,cancelAnimationFrame:()=>{},
    speechSynthesis:{cancel(){},speak(){}},SpeechSynthesisUtterance:function(){},
    addEventListener:()=>{},removeEventListener:()=>{},
    alert:msg=>{throw Error(msg)}
  });
  ctx.window=ctx;
  vm.runInContext(fs.readFileSync('assets/mw-practice-rest.js','utf8'),ctx);
  return {ctx,el,document,jobs,
    advance(ms){now+=ms;for(const [id,job] of [...jobs])if(job.at<=now&&jobs.has(id)){if(job.repeat)job.at=now+job.ms;else jobs.delete(id);job.fn()}},
    click(id){if(el(id).disabled)return;for(const fn of clicks)fn({target:{closest:s=>s==='#'+id?el(id):null}})},
    flush:async()=>{for(let i=0;i<15;i++)await Promise.resolve()}
  };
}
async function run() {
  const f=fixture(), panel=f.el('rest'), timer=f.ctx.MWPracticeRestTimer.mount(panel);
  const display=()=>f.el('rest[data-rest-clock]').textContent;
  timer.start();f.advance(65000);assert.equal(display(),'01:05','background gaps count in full');
  timer.pause();f.advance(10000);assert.equal(display(),'01:05','paused time stays frozen');
  timer.start();timer.start();f.advance(2000);assert.equal(display(),'01:07','resume excludes paused time');
  assert.equal(f.jobs.size,1,'double start cannot create duplicate intervals');
  timer.reset();assert.equal(display(),'00:00');assert.equal(f.jobs.size,0);
  timer.restart();f.advance(3000);timer.setDisabled(true);f.advance(5000);
  assert.equal(display(),'00:03','starting a rep freezes recovery');
  assert.equal(f.el('rest[data-rest-toggle]').disabled,true);
  timer.setDisabled(false);timer.restart();f.advance(2000);assert.equal(display(),'00:02','new recovery starts from zero');
  panel.isConnected=false;f.advance(1000);assert.equal(f.jobs.size,0,'leaving coach page cleans up timer');

  const a=fixture(), saved=[];
  Object.assign(a.ctx,{
    getProfile:()=>({trainingTier:'performance',p100:10.50,p200:21.40,p400:48.00}), completionAthleteId:()=> 'test-athlete',
    MWWorkoutIdentity:require('./lib/mw-workout-identity'),workoutIdentity:()=>require('./lib/mw-workout-identity').create({athleteId:'11111111-1111-1111-1111-111111111111',week:1,day:1}),
    workoutKey:()=> 'test-workout', completionHeaders:()=>({}),MW_SB_URL:'https://fixture.invalid',
    activeSeasonPlanId:()=>null,activeWorkoutCycleId:()=>null,sourceWeekForSeasonWeek:w=>w,
    fetch:async(url,opts)=>{if(opts?.method==='POST')saved.push(JSON.parse(opts.body));return {ok:true,json:async()=>[]}},
    setWorkoutStatus:async()=>{},workoutStatus:()=>({completion_status:'in_progress'}),
    loadMWProgramWeek:async()=>({track:{sessions:[{day:1,work:'2 x 100 m'}]}}),
    renderCompletion:async()=>{},renderProgressUI:()=>{},markWorkoutComplete:async()=>{},mwPracticeProgressCache:[]
  });
  const athleteRaw=fs.readFileSync('athlete/index.html','utf8').match(/<script id="mw-practice-runtime-v3">([\s\S]*?)<\/script>/)[1];
  // parsePrescription intentionally lives inside the browser runtime IIFE.
  // Expose only that helper inside this VM fixture so the test can validate pace math
  // without changing the shipped browser scope.
  const athlete=athleteRaw.replace(
    'function schedulePace(p){',
    'window.parsePrescription=parsePrescription;\nfunction schedulePace(p){'
  );
  vm.runInContext(athlete,a.ctx);
  const parsedTarget=vm.runInContext("parsePrescription({prescribedWork:'2 x 160m @ 80% · 90 sec rest'})",a.ctx);
  assert.equal(parsedTarget.dist,160);
  assert.ok(parsedTarget.target>15&&parsedTarget.target<40,'Practice target is calculated from PR + intensity, not 90-second recovery');
  assert.notEqual(parsedTarget.target,90);
  await a.ctx.mwOpenPracticeFor(1,1);
  a.click('mwPracticeStart');await a.flush();a.advance(3000);a.advance(12000);
  a.click('mwPracticePause');a.advance(5000);a.click('mwPracticeNext');await a.flush();
  assert.equal(saved[0].time_seconds,12,'finishing a paused rep excludes paused time');
  assert.equal(a.el('mwPracticeRest').dataset.restState,'running','finished rep starts rest');
  a.advance(45000);assert.equal(a.el('mwPracticeRest[data-rest-clock]').textContent,'00:45');
  a.click('mwPracticeRetry');assert.match(a.el('mwPracticeRep').textContent,/RETRY REP 1/);
  a.click('mwPracticeStart');await a.flush();a.advance(1000);a.click('mwPracticeReset');a.advance(4000);
  assert.equal(a.el('mwPracticeClock').textContent,'00:00.0','reset cancels the countdown');assert.equal(saved.length,1);
  a.click('mwPracticeStart');await a.flush();a.advance(3000);a.advance(11000);a.click('mwPracticeNext');await a.flush();
  assert.equal(saved[1].rep_number,1);assert.equal(saved[1].time_seconds,11,'retry replaces the same rep');
  assert.equal((a.el('mwPracticeRepLog').innerHTML.match(/mwPracticeRepRow/g)||[]).length,1,'retry does not add a rep');
  a.advance(45000);a.click('mwPracticeStart');await a.flush();a.advance(3000);a.advance(5000);a.click('mwPracticeReset');
  assert.equal(saved.length,2,'resetting an active rep does not save a result');
  a.click('mwPracticeStart');await a.flush();a.advance(3000);a.advance(15000);
  assert.equal(a.el('mwPracticeRest[data-rest-clock]').textContent,'00:45','next rep freezes rest display');
  a.click('mwPracticeNext');await a.flush();
  assert.equal(saved[2].time_seconds,15);assert.equal(saved[2].rep_number,2);assert.equal(a.el('mwPracticeSave').hidden,false);
  assert.notEqual(a.el('mwPracticeRest').dataset.restState,'running','final rep does not start another recovery');
  a.click('mwPracticeRetry');assert.match(a.el('mwPracticeRep').textContent,/RETRY REP 2/,'last rep can be retried before saving');
  a.click('mwPracticeStart');await a.flush();a.advance(3000);a.advance(14000);a.click('mwPracticeNext');await a.flush();
  assert.equal(saved[3].rep_number,2);assert.equal(saved[3].time_seconds,14);
  assert.equal((a.el('mwPracticeRepLog').innerHTML.match(/mwPracticeRepRow/g)||[]).length,2);
  a.click('mwPracticeSave');await a.flush();assert.equal(a.ctx.mwPracticeProgressCache.length,2,'completion contains only the corrected reps');
  assert.deepEqual(a.ctx.mwPracticeProgressCache.map(r=>r.rep_number),[1,2],'athlete completion history keeps one canonical result per prescribed rep');
  assert.equal(a.el('mwPracticeRetry').hidden,true,'completed workouts stay protected');
  a.click('mwPracticeExit');await a.flush();assert.equal(a.jobs.size,0,'exiting stops both clocks');

  const athleteA='11111111-1111-1111-1111-111111111111',athleteB='22222222-2222-2222-2222-222222222222';
  const c=fixture(), finishes=[athleteA,athleteB].map(id=>{const b=c.el('finish-'+id);b.dataset.finishAthlete=id;return b});
  c.document.querySelectorAll=s=>s==='[data-finish-athlete]'?finishes:[];
  const coachSaves=[];let rosterReads=0,rosterDay=2,rosterCycle=null;
  Object.assign(c.ctx,{
    MWWorkoutIdentity:require('./lib/mw-workout-identity'),
    pageBase:()=>{},hydrateCoachTodayPractice:()=>{},openPage:()=>{},experience:'performance',
    escapeHtml:x=>String(x),toast:()=>{},mwSessionToken:()=>'',mwClientTimeZone:()=> 'America/Chicago',mwLocalIsoDate:()=> '2026-09-29',prompt:()=> '12.34',
    fetchCoachRoster:async()=>{rosterReads++;return {athletes:[{id:athleteA,name:'Runner A',current_week:1,current_day:rosterDay,workout_cycle_id:rosterCycle},{id:athleteB,name:'Runner B',current_week:1,current_day:rosterDay,workout_cycle_id:rosterCycle}]}},
    coachProgramData:async()=>({track:{sessions:[{day:2,title:'Technical speed',prescribedWork:'3 x 100m @ 80%'}]}}),
    mwCoachEventPr:()=>({time_seconds:12}),
    fetch:async(url,opts)=>{coachSaves.push(JSON.parse(opts.body));return {ok:true,json:async()=>({count:2})}}
  });
  c.el('practiceEventGroup').value='All Sprinters';
  const coachApp=fs.readFileSync('coach/app.js','utf8');
  vm.runInContext(coachApp.slice(coachApp.indexOf('function coachSessionDayNumber('),coachApp.indexOf('function coachTrainingDayLabel(')),c.ctx);
  vm.runInContext(coachApp.slice(coachApp.indexOf('function coachPracticeTier('),coachApp.indexOf('function coachTodaySessionHTML(')),c.ctx);
  vm.runInContext(coachApp.slice(coachApp.indexOf('function mwCoachPracticePrescription('),coachApp.indexOf('function mwCoachPracticeRecommendedTarget(')),c.ctx);
  // An explicit PR-derived target keeps this timer test independent of target-model changes.
  c.ctx.mwCoachPracticeRecommendedTarget=()=>15;
  const coachHelpers=coachApp.split('function coachPracticeWorkoutComplete(a){')[1].split('async function practiceModePage(){')[0];
  const coach=coachApp.split('async function practiceModePage(){')[1].split('\nfunction coreDashboard')[0];
  vm.runInContext('function coachPracticeWorkoutComplete(a){'+coachHelpers+'async function practiceModePage(){'+coach,c.ctx);
  await c.ctx.practiceModePage();
  c.el('practiceTimerStart').click();c.advance(4000);c.el('practiceTimerStart').click();c.advance(5000);
  c.el('practiceTimerStart').click();c.advance(6000);finishes[0].click();
  assert.notEqual(c.el('practiceRest').dataset.restState,'running','rest waits for whole selected group');
  c.advance(2000);finishes[1].click();assert.equal(c.el('practiceRest').dataset.restState,'running');
  c.advance(20000);c.el('practiceNextRep').click();c.advance(10000);
  assert.equal(c.el('practiceRest[data-rest-clock]').textContent,'00:30','Next Rep keeps current recovery running');
  c.el('practiceTimerStart').click();c.advance(5000);
  assert.equal(c.el('practiceRest[data-rest-clock]').textContent,'00:30');
  c.el('practiceTimerReset').click();
  assert.equal(c.el('practiceRest[data-rest-clock]').textContent,'00:00');
  assert.equal(c.el('practiceTimerStart').disabled,false,'Reset Rep re-enables Start Rep even after earlier reps are stored');
  c.el('practiceRetryRep').click();assert.equal(c.el('practiceRepLabel').textContent,'RETRY REP 1');
  c.el('practiceTimerStart').click();c.advance(9000);finishes[0].click();c.advance(2000);finishes[1].click();
  await c.el('practiceFinishSession').click();
  assert.equal(coachSaves[0].results.length,2,'coach retry replaces earlier results without duplicates');
  assert.ok(coachSaves[0].results.every(r=>r.workoutKey===c.ctx.MWWorkoutIdentity.create({athleteId:r.athleteId,week:1,day:2}).workoutKey&&r.programWeek===1&&r.programDay===2),'coach save carries the prescribed canonical workout identity for athlete history sync');
  assert.deepEqual(coachSaves[0].results.map(r=>r.timeSeconds),[9,11],'coach pause/resume preserves finish times');
  assert.deepEqual(coachSaves[0].results.map(r=>r.mwInterpretation),['above_target','above_target'],'technical/speed reps faster than target are recorded as quality speed, not TOO FAST');
  assert.deepEqual(coachSaves[0].results.map(r=>r.paceStatus),['on_pace','on_pace'],'quality-speed reps remain positive pace outcomes');
  assert.ok(coachSaves[0].results.every(r=>r.mwIntent==='technical'),'coach save preserves workout intent for downstream Coach MW interpretation');
  c.el('practiceTimerStart').click();c.advance(3000);c.el('practiceDNF').click();
  assert.equal(c.el('practiceNextRep').disabled,true,'Next Rep stays locked until the full selected group is accounted for');
  assert.equal(c.el('practiceFinishSession').disabled,false,'DNF enables session save');
  c.el('practiceManualTime').click();
  assert.equal(c.el('practiceNextRep').disabled,false,'Final manual result completes the group rep and unlocks Next Rep');
  c.el('practiceNextRep').click();
  c.advance(35000);
  c.el('practiceManualTime').click();
  c.el('practiceManualTime').click();
  await c.el('practiceFinishSession').click();
  assert.deepEqual(coachSaves[1].results.map(r=>r.resultStatus),['dnf','manual','manual','manual'],'DNF and manual statuses persist in save payload');
  assert.equal(coachSaves[1].results[1].timingSource,'manual','manual time keeps manual provenance');
  assert.equal(coachSaves[1].results[1].mwIntent,'technical');
  assert.equal(coachSaves[1].results[1].mwInterpretation,'above_target','manual technical reps retain the same positive interpretation as timed reps');
  assert.ok(coachSaves[1].results.filter(r=>r.repNumber===2).every(r=>r.actualRestSeconds===35),'manual-only reps capture the recovery interval before the manual result');
  c.el('practiceNextRep').click();
  c.advance(60000);
  c.el('practiceManualTime').click();
  c.el('practiceManualTime').click();
  await c.el('practiceFinishSession').click();
  assert.ok(coachSaves[1].results.filter(r=>r.repNumber===3).every(r=>r.actualRestSeconds===60),'consecutive manual-only reps refresh their own recovery interval');
  assert.notEqual(coachSaves[0].sessionId,coachSaves[1].sessionId,'each new practice save gets a fresh session identity');

  // Background refresh must not attach timed reps to a newly assigned cycle.
  c.el('practiceTimerStart').click();c.advance(10000);finishes[0].click();finishes[1].click();
  const readsBefore=rosterReads;
  rosterCycle='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  await c.ctx.__mwCoachPracticeFocus();
  assert.equal(rosterReads,readsBefore,'finished but unsaved results keep the roster snapshot');
  c.advance(60000);c.el('practiceNextRep').click();c.el('practiceTimerStart').click();
  c.advance(10000);finishes[0].click();finishes[1].click();c.advance(3000);
  await c.el('practiceFinishSession').click();
  assert.ok(coachSaves[2].results.every(r=>r.workoutCycleId===null),'pending reps retain their original cycle');
  assert.ok(coachSaves[2].results.filter(r=>r.repNumber===2).every(r=>r.actualRestSeconds===60),'recovery records the interval before the rep, not the new rest after it');

  // Weekend identities stay on the weekend rather than borrowing Friday's plan.
  rosterDay=6;await c.ctx.practiceModePage();
  c.el('practiceTimerStart').click();c.advance(10000);finishes[0].click();finishes[1].click();
  let releaseSave;
  c.ctx.fetch=async(url,opts)=>{coachSaves.push(JSON.parse(opts.body));await new Promise(resolve=>{releaseSave=resolve});throw new Error('Connection interrupted')};
  const pendingSave=c.el('practiceFinishSession').click();
  await c.flush();c.el('practiceFalseStart').click();c.el('practiceManualTime').click();
  c.el('practiceFinishSession').click();
  assert.equal(coachSaves.length,4,'double save and editing controls cannot mutate an in-flight save');
  releaseSave();await pendingSave;
  assert.equal(c.el('practiceFinishSession').textContent,'RETRY SAVE');
  c.ctx.fetch=async(url,opts)=>{coachSaves.push(JSON.parse(opts.body));return {ok:true,json:async()=>({count:2,replayed:true})}};
  await c.el('practiceFinishSession').click();
  assert.deepEqual(coachSaves[4],coachSaves[3],'retry sends the same session and unmodified timing evidence');
  assert.ok(coachSaves[4].results.every(r=>r.programDay===6&&r.workoutKey.includes(':d6:')&&r.distanceM===null),'Saturday does not inherit Friday prescription or identity');
  console.log('PASS: Rest timer controls, background elapsed time, athlete rep transitions, coach group recovery, pause/resume timing, current-rep reset, previous-rep replacement and cleanup.');
}
run().catch(e=>{console.error(e);process.exitCode=1});
