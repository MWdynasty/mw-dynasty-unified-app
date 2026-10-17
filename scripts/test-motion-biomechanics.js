const assert=require('node:assert/strict');
const b=require('../lib/mw-motion-biomechanics.js');
const pt=(x,y,visibility=.95)=>({x,y,visibility});
assert.equal(Math.round(b.angle2d(pt(0,1),pt(0,0),pt(1,0))),90);
assert.equal(Math.round(b.angle2d(pt(0,0),pt(.5,.5),pt(1,1))),180);
assert.equal(b.angle2d(pt(0,0),pt(0,0),pt(1,1)),null);
function frame(i,visibility=.95){
 const landmarks=Array(33).fill(null);
 landmarks[11]=pt(.3,.3,visibility);
 landmarks[23]=pt(.4,.5,visibility);
 landmarks[25]=pt(.5,.7,visibility);
 landmarks[27]=pt(.6,.9,visibility);
 return {timeMs:i*33,width:1920,height:1080,landmarks};
}
const frames=Array.from({length:8},(_,i)=>frame(i));
const good=b.analyze({movementType:'acceleration_30m',cameraView:'side',frames});
assert.equal(good.status,'estimated_2d');
assert.equal(good.metrics.length,2);
assert.ok(good.metrics.every(m=>m.method==='estimated_2d_clip_median'));
assert.ok(good.metrics.every(m=>m.sampleCount===8));
assert.equal(b.analyze({movementType:'wickets',cameraView:'front',frames}).status,'insufficient_evidence');
assert.equal(b.measureFrame({timeMs:0,landmarks:frames[0].landmarks}),null,'Unknown aspect ratio must abstain');
const narrow=b.measureFrame({...frames[0],width:1080,height:1920});
const wide=b.measureFrame({...frames[0],width:1920,height:1080});
assert.ok(Math.abs(narrow.trunk_tilt_2d-wide.trunk_tilt_2d)>10,'Angles must account for pixel aspect ratio');
assert.equal(b.analyze({movementType:'wickets',cameraView:'side',frames:frames.slice(0,3)}).status,'insufficient_evidence');
assert.equal(b.analyze({movementType:'block_start',cameraView:'side',frames:Array.from({length:8},(_,i)=>frame(i,.4))}).status,'insufficient_evidence');
assert.throws(()=>b.analyze({movementType:'unknown',cameraView:'side',frames}),/Unsupported/);
console.log('Confidence-gated 2D biomechanics calculation checks passed.');
