const assert=require('node:assert/strict');
const m=require('../lib/mw-motion-upload.js');
assert.equal(m.assertUpload({type:'video/mp4',size:5000}),true);
assert.equal(m.assertUpload({type:'video/quicktime',size:1000}),true);
assert.throws(()=>m.assertUpload({type:'video/webm',size:1000}),/Unsupported/);
assert.throws(()=>m.assertUpload({type:'image/png',size:100}),/Unsupported/);
assert.throws(()=>m.assertUpload({type:'video/mp4',size:0}),/1–100MB/);
assert.throws(()=>m.assertUpload({type:'video/mp4',size:100*1024*1024+1}),/1–100MB/);
assert.equal(m.MAX_DURATION_SECONDS,30);
assert.equal(m.assertDuration(30),true);
assert.equal(m.assertDuration(0.1),true);
for(const seconds of [30.0001,31,1000]){
 assert.throws(()=>m.assertDuration(seconds),/30 seconds/);
}
for(const seconds of [0,-1,NaN,Infinity,-Infinity,'20',null,undefined]){
 assert.throws(()=>m.assertDuration(seconds),/duration could not be verified/);
}
assert.equal('createController' in m,false,'Direct storage controller must not be exposed');
console.log('Browser file validation checks passed.');
