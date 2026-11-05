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
console.log('Motion tracking tests passed: posture timeline, per-leg trajectories, low-evidence rejection, no invented ground contact.');
