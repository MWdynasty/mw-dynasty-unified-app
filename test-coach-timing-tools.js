'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {Session}=require('./lib/mw-practice-heats');
const {Stopwatch,format,prescribedRestSeconds,createNarrator}=require('./coach/timing-tools');
assert.equal(prescribedRestSeconds('8 x 300m. Rest 75–90 sec between reps and 5 min between sets.'),90);
assert.equal(prescribedRestSeconds('5 x 200m @ 80%. Rest 3-4 min.'),240);
assert.equal(prescribedRestSeconds('6 x 30m @ 100%'),null,'rep distances are never mistaken for recovery');

// A paused rep excludes pause time; Stop freezes finishes without inventing athlete results.
let now=0;
const session=new Session({coachId:'coach',date:'2026-10-10',clock:()=>now});
const athletes=[{id:'a'},{id:'b'}],groups=[{id:'g',name:'Sprint group',athleteIds:['a','b']},{id:'other',name:'Second group',athleteIds:['a']}];
const plans={a:{workoutKey:'a:1',reps:2},b:{workoutKey:'b:1',reps:2}};
session.reconcile(groups,athletes,plans);session.setRestSeconds(5);session.start(['a','b']);
now=1250;session.finish('a',{});session.pause();now=20000;
assert.equal(session.elapsed(),1250);assert.throws(()=>session.select('other:0'),/running rep/);
assert.throws(()=>session.toSave(),/running/);assert.equal(session.finish('b',{}),false);
const paused=new Session({coachId:'coach',date:'2026-10-10',clock:()=>now,draft:JSON.parse(JSON.stringify(session.snapshot()))});
assert.equal(paused.elapsed(),1250);paused.start(['b']);now+=750;paused.stop();now+=5000;
assert.equal(paused.elapsed(),2000);assert.throws(()=>paused.next(2),/Finish/);
paused.finish('b',{});assert.equal(paused.heats[paused.active].repResults[1].ms,2000);
assert.equal(paused.restRemaining(),5000);now+=2000;paused.toggleRest();now+=20000;
assert.equal(paused.restRemaining(),3000);paused.toggleRest();now+=4000;
assert.equal(paused.restRemaining(),0);assert.equal(paused.restComplete(),true);
assert.equal(paused.rest(),6000,'elapsed recovery remains accurate after countdown reaches zero');
paused.next(2);paused.start(['a','b']);assert.equal(paused.heats[paused.active].repRestSeconds,6);
paused.reset();assert.equal(paused.heats[paused.active].results.length,2);assert.equal(paused.restRemaining(),5000);
assert.throws(()=>paused.setRestSeconds(0),/1 second/);assert.throws(()=>paused.setRestSeconds(NaN),/1 second/);

// A regular stopwatch handles a zero-valued start timestamp, pauses, laps, Stop and Reset.
now=0;const watch=new Stopwatch(()=>now);watch.start();now=1234;watch.lap();watch.pause();now=10000;
assert.equal(watch.milliseconds(),1234);watch.start();now+=1000;watch.lap();watch.stop();now+=9000;
assert.equal(watch.milliseconds(),2234);assert.deepEqual(watch.laps.map(l=>l.split),[1234,1000]);
assert.equal(format(62345),'01:02.34');watch.reset();assert.equal(watch.milliseconds(),0);assert.equal(watch.laps.length,0);

// Speech timing is driven by actual utterance starts, with cancellation and failure guards.
let timerId=0;const timers=new Map(),spoken=[];
const schedule=(fn,delay)=>{const id=++timerId;timers.set(id,{fn,delay});return id;},unschedule=id=>timers.delete(id);
class Utterance{constructor(text){this.text=text;}}
const speech={speak:u=>spoken.push(u),cancel(){},getVoices:()=>[]};
const voice=createNarrator({speech,Utterance,schedule,unschedule});let starts=0,errors=0;
const runGap=()=>{const entry=[...timers.entries()].find(([,x])=>x.delay<2000);assert.ok(entry);timers.delete(entry[0]);entry[1].fn();};
voice.start({onGo:()=>starts++,onError:()=>errors++});assert.equal(starts,0);
spoken.at(-1).onstart();spoken.at(-1).onend();runGap();assert.equal(spoken.at(-1).text,'Set');
spoken.at(-1).onstart();spoken.at(-1).onend();runGap();assert.equal(spoken.at(-1).text,'Go');assert.equal(starts,0);
spoken.at(-1).onstart();spoken.at(-1).onstart();assert.equal(starts,1);spoken.at(-1).onend();assert.equal(voice.isActive(),false);
voice.start({onGo:()=>starts++});const cancelled=spoken.at(-1).onend;voice.cancel();cancelled();assert.equal(timers.size,0);assert.equal(starts,1);
voice.start({onGo:()=>starts++,onError:()=>errors++});[...timers.values()][0].fn();assert.equal(errors,1);assert.equal(starts,1);
createNarrator({speech:null,Utterance:null,schedule,unschedule}).start({onError:()=>errors++});assert.equal(errors,2);

// Exercise the served practice UI against disposable roster/storage/transports.
class Element{
  constructor(id=''){this.id=id;this.value='';this.textContent='';this.disabled=false;this.hidden=false;this.isConnected=true;this.dataset={};this.attributes={};this.children=[];this.classList={toggle(){}};}
  set innerHTML(html){this.html=html;this.children=[...String(html).matchAll(/data-heat-athlete="([^"]+)"/g)].map(m=>{const n=new Element();n.dataset.heatAthlete=m[1];return n;});}
  get innerHTML(){return this.html||'';}
  setAttribute(name,value){this.attributes[name]=value;}
  getAttribute(name){return this.attributes[name];}
  querySelectorAll(){return this.children;}
  closest(){return {classList:{toggle(){}}};}
  focus(){}
  remove(){this.isConnected=false;}
}
async function runUi(){
  now=1000;const elements=new Map(),storage=new Map(),intervals=new Map(),timeouts=new Map(),spoken=[],requests=[];
  let id=0,alerts=0,whistles=0;
  const document={visibilityState:'visible',getElementById:key=>elements.get(key),addEventListener(){},removeEventListener(){}};
  const context={console,document,Date:class extends Date{static now(){return now;}},crypto:{randomUUID:()=> 'session-'+(++id)},localStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value)},setInterval:fn=>{const key=++id;intervals.set(key,fn);return key;},clearInterval:key=>intervals.delete(key),setTimeout:(fn,delay)=>{const key=++id;timeouts.set(key,{fn,delay});return key;},clearTimeout:key=>timeouts.delete(key),addEventListener(){},removeEventListener(){},confirm:()=>true,SpeechSynthesisUtterance:Utterance,speechSynthesis:{speak:u=>spoken.push(u),cancel(){},getVoices:()=>[]},fetch:async(url,options)=>{requests.push(JSON.parse(options.body));return {ok:true,json:async()=>({ok:true,count:JSON.parse(options.body).results.length})};}};
  context.window=context;vm.createContext(context);
  for(const file of ['lib/mw-practice-heats.js','coach/timing-tools.js','coach/practice-heats.js'])vm.runInContext(fs.readFileSync(file,'utf8'),context);
  context.MWCoachTimingTools.audio={unlock:async()=>true,alert:async()=>{alerts++;return true;},whistle:async()=>{whistles++;return true;}};
  const roster=Array.from({length:16},(_,i)=>({id:'athlete-'+i,name:'Athlete '+i,current_week:1,current_day:1,competition_division:i<8?'boys':'girls'}));
  const savedGroups=Array.from({length:4},(_,i)=>({id:'group-'+i,name:'Group '+i,coach_group_members:roster.slice(i*4,i*4+4).map(a=>({athlete_id:a.id}))}));
  const dependencies={escapeHtml:s=>String(s??''),pageBase:(title,subtitle,html)=>{elements.clear();for(const m of html.matchAll(/id="([^"]+)"/g))elements.set(m[1],new Element(m[1]));},hydrateCoachTodayPractice(){},mwLocalIsoDate:()=> '2026-10-10',mwCurrentUser:async()=>({id:'coach'}),project:'fixture',coachPracticeWorkoutComplete:()=>false,coachPracticeTier:()=>1,coachPracticeStrengthTier:()=>1,coachPracticeEventGroup:()=> 'sprint',coachProgramData:async()=>({track:{sessions:[{day:1,title:'Acceleration',prescribedWork:'2 x 30m'}]}}),coachSessionDayNumber:day=>day,mwCoachPracticePrescription:()=>({reps:2,distance:30,raw:'2 x 30m'}),mwCoachPracticeRecommendedTarget:()=>null,coachPracticeIdentity:a=>({workoutKey:a.id+':w1:d1'}),sbRest:async()=>savedGroups,mwModal(){},mwClientTimeZone:()=> 'America/Chicago',mwSessionToken:()=> 'disposable',fetchCoachRoster:async()=>({athletes:roster}),openPage(){}};
  const {model}=await context.MWCoachPractice.mount(dependencies),find=id=>elements.get(id),paint=()=>{for(const fn of [...intervals.values()])fn();};
  assert.equal(find('heatNarratorToggle').textContent,'OFF');find('heatModeTab').onclick();assert.equal(find('heatModePanel').hidden,false);
  find('heatRestMinutes').value='0';find('heatRestSeconds').value='3';find('heatRestApply').onclick();assert.equal(model.restRemaining(),3000);
  find('heatNarratorToggle').onclick();assert.equal(find('heatNarratorToggle').textContent,'ON');find('heatPracticeTab').onclick();find('heatStart').onclick();
  assert.equal(model.heats[model.active].runningAt,null);assert.equal(find('heatStart').textContent,'CANCEL START');
  find('heatStart').onclick();assert.equal(timeouts.size,0);assert.equal(model.heats[model.active].runningAt,null);
  find('heatStart').onclick();
  for(let i=0;i<2;i++){spoken.at(-1).onstart();spoken.at(-1).onend();const next=[...timeouts.entries()].find(([,x])=>x.delay<2000);timeouts.delete(next[0]);next[1].fn();}
  now+=2000;spoken.at(-1).onstart();spoken.at(-1).onend();assert.equal(model.heats[model.active].runningAt,now);
  now+=1500;find('heatStart').onclick();assert.equal(find('heatStart').textContent,'RESUME REP');now+=9000;assert.equal(model.elapsed(),1500);
  find('heatStart').onclick();assert.equal(model.heats[model.active].runningAt,now);now+=500;find('heatStop').onclick();assert.equal(model.elapsed(),2000);
  for(const button of [...find('heatLanes').children])button.onclick();assert.equal(model.heats[model.active].repResults.length,4);
  assert.equal(find('heatRestClock').textContent,'00:03');now+=4000;paint();assert.equal(find('heatRestClock').textContent,'00:00');assert.equal(find('heatRestState').textContent,'REST COMPLETE');assert.equal(alerts,1);paint();assert.equal(alerts,1,'only one rest alert per heat');
  find('heatNext').onclick();assert.equal(model.heats[model.active].rep,2);
  find('heatGroup').value='group-1';find('heatGroup').onchange();assert.equal(find('heatRestClock').textContent,'01:30','each group keeps its own countdown');
  find('heatGroup').value='group-0';find('heatGroup').onchange();assert.equal(find('heatRestClock').textContent,'00:00');
  await find('heatSave').onclick();assert.equal(requests.length,1);assert.equal(requests[0].results.length,4);assert.deepEqual(requests[0].results.map(x=>x.athleteId).sort(),roster.slice(0,4).map(a=>a.id));assert.ok(requests[0].results.every(x=>x.timeSeconds===2));
  await find('heatWhistle').onclick();assert.equal(whistles,1);
  const draft=JSON.parse([...storage.entries()].find(([key])=>key.includes('heats'))[1]);assert.equal(draft.heats['group-0:0'].saved,true);
  // The standalone stopwatch controls are operational without athlete PRs or API responses.
  const selectors=['clock','status','start','stop','lap','reset','laps'],nodes=new Map(selectors.map(s=>['[data-stopwatch-'+s+']',new Element(s)]));
  const watchPanel={isConnected:true,querySelector:selector=>nodes.get(selector)};
  const ui=context.MWCoachTimingTools.mountStopwatch(watchPanel);
  nodes.get('[data-stopwatch-start]').onclick();now+=1250;nodes.get('[data-stopwatch-lap]').onclick();nodes.get('[data-stopwatch-start]').onclick();now+=5000;
  assert.equal(ui.stopwatch.milliseconds(),1250);assert.equal(nodes.get('[data-stopwatch-start]').textContent,'RESUME');
  nodes.get('[data-stopwatch-start]').onclick();now+=250;nodes.get('[data-stopwatch-stop]').onclick();assert.equal(nodes.get('[data-stopwatch-clock]').textContent,'00:01.50');
  nodes.get('[data-stopwatch-reset]').onclick();assert.equal(nodes.get('[data-stopwatch-clock]').textContent,'00:00.00');ui.destroy();
  context.__mwCoachPracticeDispose();assert.equal(intervals.size,0);assert.equal(timeouts.size,0);
}
runUi().then(()=>console.log('PASS: coach voice timing/cancellation, pause/resume/stop, independent countdowns and alerts, 16-athlete UI fixture, correct save payloads, whistle wiring, and standalone stopwatch controls.')).catch(err=>{console.error(err);process.exitCode=1;});
