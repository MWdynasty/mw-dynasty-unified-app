'use strict';
const assert=require('node:assert/strict');
const engine=require('./assets/mw-motion-tracking.js');
const pose=(lean)=>{
 const p=Array.from({length:33},()=>({x:.5,y:.5,visibility:1}));
 const x=.52+Math.sin(lean*Math.PI/180)*.3;
 p[11]={x,y:.28,visibility:1};p[12]={x:x+.04,y:.28,visibility:1};
 p[23]={x:.49,y:.53,visibility:1};p[24]={x:.53,y:.53,visibility:1};
 for(const [hip,knee,ankle] of [[23,25,27],[24,26,28]]){p[knee]={x:p[hip].x,y:.7,visibility:1};p[ankle]={x:p[hip].x,y:.87,visibility:1};}
 return p;
};
const progressive=Array.from({length:36},(_,i)=>engine.frame(pose(40-i*.8),i/12));
const report=engine.summarize(progressive,{sampledFrames:36});
assert.equal(report.quality.usableFrames,36);
assert.equal(report.quality.adequateForPosture,true);
assert.equal(report.phases.length,2);
assert.equal(report.quality.adequateForContactTiming,false);
assert.equal(report.groundContact.contactMilliseconds,null);
assert.equal(report.heels.length,2);
const sparse=engine.summarize(progressive.slice(0,4),{sampledFrames:36});
assert.equal(sparse.quality.adequateForPosture,false);
assert.equal(sparse.phases.length,0);
assert.equal(engine.frame([],0),null);

assert.equal(report.coaching.faultDetected,false);
assert.ok(Array.isArray(report.coaching.actions));
assert.equal(report.groundContact.candidateEvents.length,0);
assert.match(report.groundContact.reason,/side.view/i);
assert.equal(report.heels[0].assessment, 'not_verified');
// High nominal capture fps alone cannot unlock an exact ground-contact measurement.
const highRate=Array.from({length:60},(_,i)=>engine.frame(pose(31-i*.12),i/120));
const side=engine.summarize(highRate,{sampledFrames:60,cameraView:'side',nominalFps:120});
assert.equal(side.groundContact.status,'not_verified');
assert.equal(side.groundContact.candidateEvents.length,0,'Static foot pose must not create repeated contact candidates');
assert.equal(side.groundContact.contactMilliseconds,null);
assert.equal(side.quality.adequateForContactTiming,false);
assert.equal(side.coaching.faultDetected,false);
assert.equal(engine.detectFootEvents([], {cameraView:'side'}).candidateEvents.length,0);
// Quality gating must avoid declaring phases from discontinuous footage.
const discontinuous=progressive.filter((_,index)=>index<6||index>29);
const interrupted=engine.summarize(discontinuous,{sampledFrames:36});
assert.equal(interrupted.quality.adequateForPosture,false);
assert.equal(interrupted.phases.length,0);
assert.ok(interrupted.quality.largestGapSeconds>1);
assert.equal(interrupted.quality.longestContinuousRun,6);
// Source fps alone must not be misrepresented as inferred ground-contact fps.
assert.equal(side.quality.adequateForContactTiming,false);
assert.equal(side.groundContact.status,'not_verified');
assert.equal(side.groundContact.touchdown,null);
assert.equal(side.groundContact.toeOff,null);
assert.equal(side.coaching.faultDetected,false);
// An absent/occluded torso must not produce fabricated body geometry.
const missing=pose(25);
missing[11].visibility=0.1;
assert.equal(engine.frame(missing,0),null);

// High-speed synthetic toe trajectory: detect TWO proximity episodes, not repeated
// contact frames, and NEVER convert their duration to ground-contact milliseconds.
const highSpeedToe=Array.from({length:96},(_,i)=>{
  const phase=i%48;
  const y=phase<12?0.74+phase*0.01:phase<29?0.86:phase<42?0.86-(phase-29)*0.011:0.715;
  return {time:i/120,trunk:30,legs:[
    {side:'left',valid:true,toeY:y,heelHeight:-1},
    {side:'right',valid:true,toeY:0.72,heelHeight:-1}
  ]};
});
const exploratory=engine.detectFootEvents(highSpeedToe,{cameraView:'side'});
assert.equal(exploratory.candidateEvents.length,2);
assert.ok(exploratory.candidateEvents.every(e=>e.kind==='unverified_ground_proximity_window'));
assert.equal(exploratory.contactMilliseconds,null);
assert.equal(exploratory.status,'not_verified');
assert.equal(engine.detectFootEvents(highSpeedToe,{cameraView:'front'}).candidateEvents.length,0);
// Neither high capture rate nor a changing heel trajectory can produce a fault verdict.
const progression=engine.summarize(highSpeedToe,{cameraView:'side',sampledFrames:96});
assert.equal(progression.coaching.faultDetected,false);

// Phase-contextual heel observations must remain descriptive, not technique grades.
const risingHeels=Array.from({length:36},(_,i)=>{
  const tracked=engine.frame(pose(40-i*.8),i/12);
  for(const leg of tracked.legs)leg.heelHeight=-1+i*.012;
  return tracked;
});
const heelTransition=engine.summarize(risingHeels,{sampledFrames:36});
assert.ok(heelTransition.coaching.positives.some(x=>/heel trajectories rose/.test(x.evidence)));
assert.equal(heelTransition.coaching.faultDetected,false);
assert.equal(heelTransition.groundContact.contactMilliseconds,null);
const occludedHeels=risingHeels.map((f,i)=>({
  ...f,legs:f.legs.map(l=>({...l,heelHeight:i<9||i>=27?l.heelHeight:null}))
}));
const incompleteHeel=engine.summarize(occludedHeels,{sampledFrames:36});
assert.equal(incompleteHeel.heels[0].trackingAdequate,false);
assert.ok(!incompleteHeel.coaching.positives.some(x=>/heel trajectories rose/.test(x.evidence)));
console.log('Motion tracking tests passed: posture timeline, per-leg trajectories, low-evidence rejection, no invented ground contact.');
