'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const pace=require('./lib/mw-pace-model'),{parseResults}=require('./server/lib/mw-trial-results');
const distances=[100,150,200,300,400,500];
const close=(a,b)=>assert(Math.abs(a-b)<1e-9,`${a} != ${b}`);
for(const d of distances){
 const input=[{event:d+'m',time_seconds:d/8,mark_type:'time_trial',timing_method:'hand'}];
 const before=JSON.stringify(input);
 for(const targetDistance of [30,50,100,150,160,200,250,300,350,400,450,500]){
  const r=pace.calculate(input,targetDistance,.8);
  assert(r&&Number.isFinite(r.target)&&r.target>0);assert.equal(r.estimated,targetDistance!==d);
  if(targetDistance===d){close(r.target,d/8/.8);assert.equal(r.method,'measured');assert(r.anchor.includes('trial'));}
  else assert.equal(r.method,'provisional');
 }
 assert.equal(JSON.stringify(input),before,'calculation cannot create or modify athlete PRs');
}
assert.equal(pace.calculate({},200,.9),null);
for(const input of [NaN,Infinity,0,-1,501])assert.equal(pace.calculate({p300:36},input,.9),null);
for(const intensity of [0,-1,Infinity,NaN,90,1.01])assert.equal(pace.calculate({p300:36},200,intensity),null);
assert.equal(pace.calculate([{event:'100m',time_seconds:-1},{event:'200m',time_seconds:Infinity}],200,.9),null);
assert.equal(pace.normalize([{event:'100m junk',time_seconds:12}]).length,0);
const marks=[{event:'100m',time_seconds:12},{event:'200m',time_seconds:24.5},{event:'400m',time_seconds:56}];
for(const distance of [30,80,120,150,180,250,300,350,450,500]){
 const exponent=distance<=200?Math.log(24.5/12)/Math.log(2):Math.log(56/24.5)/Math.log(2);
 const expected=distance<=200?12*Math.pow(distance/100,exponent):24.5*Math.pow(distance/200,exponent);
 close(pace.calculate(marks,distance,.9).target,expected/.9);
}
const added=[...marks,{event:'150m',time_seconds:17.8}];
assert.equal(pace.calculate(added,150,1).method,'measured');close(pace.calculate(added,150,1).referenceTime,17.8);
assert.notEqual(pace.calculate(added,175,.8).target,pace.calculate(marks,175,.8).target,'adding a real nearby trial refines estimated targets');
assert.equal(pace.calculate([{event:'150m',time_seconds:18},{event:'300m',time_seconds:38}],200,1).method,'interpolated');
assert.equal(pace.calculate([{event:'100m',time_seconds:20},{event:'200m',time_seconds:15}],150,1).method,'provisional');
const details={'300m':{mark_type:'time_trial',date_recorded:'2026-10-09',timing_method:'hand'}};
const rows=parseResults({'300m':'36.7'},{},details);assert.equal(rows[0].mark_type,'time_trial');assert.equal(rows[0].date_recorded,'2026-10-09');assert.equal(rows[0].timing_method,'hand');
assert.throws(()=>parseResults({'300m':36},{},{'300m':{date_recorded:'2026-02-31'}}));
assert.throws(()=>parseResults({'300m':36},{},{'300m':{mark_type:'verified'}}));
assert.deepEqual(parseResults({'100m':'','150m':null}),[]);
// Exercise the actual coach/athlete/Pace AI callers against the same model.
const html=fs.readFileSync('athlete/index.html','utf8'),coach=fs.readFileSync('coach/app-live-20261005-r1.js','utf8'),tool=fs.readFileSync('pace-ai/index.html','utf8');
const context={window:{MWPace:pace},getProfile:()=>({prs:[{event:'300m',time_seconds:36.7}]})};
vm.createContext(context);
vm.runInContext(html.slice(html.indexOf('function mwPracticeCalculatedTarget('),html.indexOf('function parsePrescription(')),context);
vm.runInContext(coach.slice(coach.indexOf('function mwCoachPracticeRecommendedTarget('),coach.indexOf('function mwCoachEventPr(')),context);
for(const distance of distances)close(context.mwPracticeCalculatedTarget(distance,.8),context.mwCoachPracticeRecommendedTarget({prs:[{event:'300m',time_seconds:36.7}]},distance,80));
vm.runInContext(tool.slice(tool.indexOf('function calc('),tool.indexOf('function parseWorkout(')),context);
context.syncedMarks=[{event:'300m',time_seconds:36.7}];context.profile=context.getProfile;
close(context.calc(200,.8).target,context.mwPracticeCalculatedTarget(200,.8));
for(const file of ['athlete/index.html','coach/index.html','pace-ai/index.html'])assert(fs.readFileSync(file,'utf8').includes('/lib/mw-pace-model.js'));
for(const source of [html,tool])for(const match of source.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi))assert.doesNotThrow(()=>new Function(match[1]));
console.log('PASS: each single PR/trial distance unlocks pacing; partial inputs, interpolation, direct marks, refinement, validation, unchanged measured PRs, and athlete/coach/Pace AI parity.');
