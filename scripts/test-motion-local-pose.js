const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const biomechanics=require('../lib/mw-motion-biomechanics.js');
const events=[];
const landmarks=Array.from({length:33},()=>({x:.5,y:.5,visibility:.95}));
for(const [index,x,y] of [[11,.3,.2],[23,.4,.4],[25,.5,.6],[27,.6,.8],
[12,.7,.2],[24,.6,.4],[26,.5,.6],[28,.4,.8]])landmarks[index]={x,y,visibility:.95};
const fakeCtx={drawImage(){},save(){},restore(){},beginPath(){},moveTo(){},lineTo(){},stroke(){},arc(){},fill(){}};
function fakeVideo(){
 const listeners={};
 let time=0,source='';
 const v={
  duration:1.5,videoWidth:1920,videoHeight:1080,readyState:2,
  muted:false,playsInline:false,preload:'',
  addEventListener(name,fn){(listeners[name]??=[]).push(fn);},
  removeEventListener(name,fn){listeners[name]=(listeners[name]||[]).filter(x=>x!==fn);},
  get currentTime(){return time;},
  set currentTime(next){time=next;queueMicrotask(()=>{for(const fn of listeners.seeked||[])fn();});},
  get src(){return source;},set src(next){source=next;},
  load(){if(source)queueMicrotask(()=>{for(const fn of listeners.loadedmetadata||[])fn();});},
  pause(){events.push('pause');},
  removeAttribute(){source='';}
 };
 return v;
}
const sandbox={
 module:{exports:{}},setTimeout,clearTimeout,console,
 URL:{createObjectURL(){events.push('create');return 'blob:synthetic';},
  revokeObjectURL(){events.push('revoke');}},
 document:{createElement(type){return type==='video'?fakeVideo():{
  width:0,height:0,style:{},getContext(){return fakeCtx;}};}},
 MWMotionUpload:{assertUpload(file){assert.equal(file.type,'video/mp4');}},
 MWMotionBiomechanics:biomechanics
};
vm.runInNewContext(fs.readFileSync('lib/mw-motion-local-pose.js','utf8'),sandbox);
const local=sandbox.module.exports;
assert.equal(local.VERSION,'0.10.35');
assert.equal(local.timeline(30).length,36);
assert.equal(local.timeline(.5).length,5);
assert.throws(()=>local.timeline(30.01),/30 seconds/);
assert.throws(()=>local.timeline(0),/30 seconds/);
const times=local.timeline(15);
assert.ok(times.every((v,i)=>i===0||v>times[i-1]));
(async()=>{
 let closed=false,seen=0;
 const detector={detectForVideo(_canvas,timestamp){
  assert.ok(timestamp>seen,'Timestamps must increase');
  seen=timestamp;return {landmarks:[landmarks]};
 },close(){closed=true;}};
 const result=await local.run({file:{type:'video/mp4',size:1000},
  movementType:'acceleration_30m',cameraView:'side',
  detectorFactory:async()=>detector});
 assert.equal(result.analysis.status,'estimated_2d');
 assert.equal(result.attemptedFrames,5);
 assert.equal(result.poseFrames,5);
 assert.ok(result.preview);
 assert.ok(closed,'Model resources must close');
 assert.ok(events.includes('revoke'),'Object URL must be revoked');
 const ctrl=new AbortController();ctrl.abort();
 await assert.rejects(local.run({file:{type:'video/mp4',size:1000},
  movementType:'wickets',cameraView:'side',signal:ctrl.signal,
  detectorFactory:async()=>detector}),/cancelled/);
 const html=fs.readFileSync('athlete/motion.html','utf8');
 assert.ok(html.includes('window.MWMotionLocalPose.run('));
 assert.ok(html.includes('mw-motion-pilot-staging-session'),'Pilot must have independent staging auth');
 assert.ok(html.includes('signInWithPassword('));
 assert.ok(!html.includes('MWAccountStorage.local.getItem'),'Production athlete tokens must not be reused');
 assert.ok(html.includes('MediaPipe may send usage/performance metrics'),'MediaPipe disclosure required');
 console.log('Local video sampling, resource cleanup, privacy boundaries, and synthetic pose inference checks passed.');
})().catch(e=>{console.error(e);process.exitCode=1;});
