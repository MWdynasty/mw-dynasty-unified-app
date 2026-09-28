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
    getProfile:()=>({trainingTier:'performance'}), completionAthleteId:()=> 'test-athlete',
    workoutKey:()=> 'test-workout', completionHeaders:()=>({}),MW_SB_URL:'https://fixture.invalid',
    activeSeasonPlanId:()=>null,sourceWeekForSeasonWeek:w=>w,
    fetch:async(url,opts)=>{if(opts?.method==='POST')saved.push(JSON.parse(opts.body));return {ok:true,json:async()=>[]}},
    setWorkoutStatus:async()=>{},workoutStatus:()=>({completion_status:'in_progress'}),
    loadMWProgramWeek:async()=>({track:{sessions:[{day:1,work:'2 x 100 m'}]}}),
    renderCompletion:async()=>{},renderProgressUI:()=>{},markWorkoutComplete:async()=>{},mwPracticeProgressCache:[]
  });
  const athlete=fs.readFileSync('athlete/index.html','utf8').match(/<script id="mw-practice-runtime-v3">([\s\S]*?)<\/script>/)[1];
  vm.runInContext(athlete,a.ctx);
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
  assert.equal(a.el('mwPracticeRetry').hidden,true,'completed workouts stay protected');
  a.click('mwPracticeExit');await a.flush();assert.equal(a.jobs.size,0,'exiting stops both clocks');

  const c=fixture(), finishes=['a','b'].map(id=>{const b=c.el('finish-'+id);b.dataset.finishAthlete=id;return b});
  c.document.querySelectorAll=s=>s==='[data-finish-athlete]'?finishes:[];
  const coachSaves=[];
  Object.assign(c.ctx,{
    pageBase:()=>{},hydrateCoachTodayPractice:()=>{},openPage:()=>{},experience:'performance',
    escapeHtml:x=>String(x),toast:()=>{},mwSessionToken:()=>'',
    fetchCoachRoster:async()=>({athletes:[{id:'a',name:'Runner A'},{id:'b',name:'Runner B'}]}),
    fetch:async(url,opts)=>{coachSaves.push(JSON.parse(opts.body));return {ok:true,json:async()=>({count:2})}}
  });
  c.el('practiceEventGroup').value='All Sprinters';
  const coach=fs.readFileSync('coach/app.js','utf8').split('async function practiceModePage(){')[1].split('\nfunction coreDashboard')[0];
  vm.runInContext('async function practiceModePage(){'+coach,c.ctx);
  await c.ctx.practiceModePage();
  c.el('practiceTimerStart').click();c.advance(4000);c.el('practiceTimerStart').click();c.advance(5000);
  c.el('practiceTimerStart').click();c.advance(6000);finishes[0].click();
  assert.notEqual(c.el('practiceRest').dataset.restState,'running','rest waits for whole selected group');
  c.advance(2000);finishes[1].click();assert.equal(c.el('practiceRest').dataset.restState,'running');
  c.advance(20000);c.el('practiceNextRep').click();c.advance(10000);
  assert.equal(c.el('practiceRest[data-rest-clock]').textContent,'00:30','Next Rep keeps current recovery running');
  c.el('practiceTimerStart').click();c.advance(5000);
  assert.equal(c.el('practiceRest[data-rest-clock]').textContent,'00:30');
  c.el('practiceTimerReset').click();assert.equal(c.el('practiceRest[data-rest-clock]').textContent,'00:00');
  c.el('practiceRetryRep').click();assert.equal(c.el('practiceRepLabel').textContent,'RETRY REP 1');
  c.el('practiceTimerStart').click();c.advance(9000);finishes[0].click();c.advance(2000);finishes[1].click();
  await c.el('practiceFinishSession').click();
  assert.equal(coachSaves[0].results.length,2,'coach retry replaces earlier results without duplicates');
  assert.deepEqual(coachSaves[0].results.map(r=>r.timeSeconds),[9,11],'coach pause/resume preserves finish times');
  console.log('PASS: Rest timer controls, background elapsed time, athlete rep transitions, coach group recovery, pause/resume timing, current-rep reset, previous-rep replacement and cleanup.');
}
run().catch(e=>{console.error(e);process.exitCode=1});
