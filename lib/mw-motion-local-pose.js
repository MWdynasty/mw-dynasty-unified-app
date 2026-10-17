/* MW Motion Intelligence — optional on-device Pose Landmarker pilot.
 * User video frames are processed in this browser, not sent to the Edge API.
 * MediaPipe library/model downloads are external and may send SDK usage metrics.
 * No results are persisted or fed to Coach MW / Season Intelligence.
 */
(function(root,factory){
 const api=factory(root);
 if(typeof module==='object'&&module.exports)module.exports=api;
 else root.MWMotionLocalPose=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(root){
'use strict';
const VERSION='0.10.35';
const WASM='https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@'+VERSION+'/wasm';
const BUNDLE='https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@'+VERSION+'/vision_bundle.mjs';
const MODEL='https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';
const MAX_FRAMES=36,MAX_SECONDS=30;
function timeline(durationSec,cap=MAX_FRAMES){
 if(!Number.isFinite(durationSec)||durationSec<=0||durationSec>MAX_SECONDS||
 !Number.isInteger(cap)||cap<5||cap>MAX_FRAMES)throw new Error('Recording must be 30 seconds or shorter.');
 const count=Math.min(cap,Math.max(5,Math.ceil(durationSec*2)));
 const start=Math.min(0.06,durationSec/4);
 const end=Math.max(start,durationSec-Math.min(0.07,durationSec/4));
 return Array.from({length:count},(_,i)=>start+(end-start)*(i/(count-1)));
}
function isAbort(signal){if(signal?.aborted)throw new Error('Local analysis cancelled.');}
function pause(){return new Promise(resolve=>setTimeout(resolve,0));}
function waitForVideo(video,event,timeoutMs=12000){
 return new Promise((resolve,reject)=>{
  let done=false;
  const timer=setTimeout(()=>finish(new Error('Video decoding timed out.')),timeoutMs);
  function finish(error){
   if(done)return;done=true;clearTimeout(timer);
   video.removeEventListener(event,ready);video.removeEventListener('error',failed);
   if(error)reject(error);else resolve();
  }
  function ready(){finish();}
  function failed(){finish(new Error('This video cannot be decoded on this device.'));}
  video.addEventListener(event,ready,{once:true});
  video.addEventListener('error',failed,{once:true});
 });
}
async function seek(video,timeSec,signal){
 isAbort(signal);
 const seekTime=Math.min(Math.max(0,timeSec),Math.max(0,video.duration-.001));
 if(Math.abs(video.currentTime-seekTime)>0.015 || video.readyState<2){
  const waiting=waitForVideo(video,'seeked',9000);
  video.currentTime=seekTime;
  await waiting;
 }
 if(video.readyState<2)await waitForVideo(video,'loadeddata',9000);
 isAbort(signal);
}
async function createDetector(){
 const visionModule=await import(BUNDLE);
 const vision=await visionModule.FilesetResolver.forVisionTasks(WASM);
 return await visionModule.PoseLandmarker.createFromOptions(vision,{
  baseOptions:{modelAssetPath:MODEL,delegate:'CPU'},
  runningMode:'VIDEO',numPoses:1,
  minPoseDetectionConfidence:0.65,minPosePresenceConfidence:0.65,minTrackingConfidence:0.65,
  outputSegmentationMasks:false
 });
}
function drawOverlay(canvas,landmarks){
 if(!landmarks||landmarks.length<29)return;
 const ctx=canvas.getContext('2d');
 if(!ctx)return;
 const connections=[[11,23],[23,25],[25,27],[12,24],[24,26],[26,28]];
 ctx.save();ctx.strokeStyle='#f2c765';ctx.fillStyle='#f2c765';ctx.lineWidth=3;
 for(const [a,b] of connections){
  const p=landmarks[a],q=landmarks[b];
  if(!p||!q||p.visibility<.8||q.visibility<.8)continue;
  ctx.beginPath();ctx.moveTo(p.x*canvas.width,p.y*canvas.height);
  ctx.lineTo(q.x*canvas.width,q.y*canvas.height);ctx.stroke();
 }
 for(const id of [11,12,23,24,25,26,27,28]){
  const p=landmarks[id];
  if(!p||p.visibility<.8)continue;
  ctx.beginPath();ctx.arc(p.x*canvas.width,p.y*canvas.height,4,0,Math.PI*2);ctx.fill();
 }
 ctx.restore();
}
async function run({file,movementType,cameraView,onProgress=()=>{},signal,detectorFactory=createDetector}={}){
 if(!root.document||!root.URL||!root.MWMotionBiomechanics||!root.MWMotionUpload)
  throw new Error('Local pose analysis is not supported in this browser.');
 root.MWMotionUpload.assertUpload(file);
 isAbort(signal);
 let url=null,video=null,detector=null;
 try{
  url=root.URL.createObjectURL(file);
  video=root.document.createElement('video');
  video.muted=true;video.playsInline=true;video.preload='auto';
  const loaded=waitForVideo(video,'loadedmetadata');
  video.src=url;video.load();
  await loaded;
  const duration=video.duration;
  const times=timeline(duration);
  if(!video.videoWidth||!video.videoHeight)throw new Error('Video dimensions unavailable.');
  const scale=Math.min(1,720/Math.max(video.videoWidth,video.videoHeight));
  const canvas=root.document.createElement('canvas');
  canvas.width=Math.max(1,Math.round(video.videoWidth*scale));
  canvas.height=Math.max(1,Math.round(video.videoHeight*scale));
  const ctx=canvas.getContext('2d',{willReadFrequently:false});
  if(!ctx)throw new Error('Canvas video decoding is unavailable.');
  onProgress({stage:'model',done:0,total:times.length});
  isAbort(signal);
  detector=await detectorFactory();
  const frames=[];
  let preview=null;
  for(let i=0;i<times.length;i++){
   isAbort(signal);
   const t=times[i];
   await seek(video,t,signal);
   ctx.drawImage(video,0,0,canvas.width,canvas.height);
   const timestampMs=Math.round(t*1000)+1;
   const result=detector.detectForVideo(canvas,timestampMs);
   const landmarks=result?.landmarks?.[0];
   if(Array.isArray(landmarks)&&landmarks.length>=29){
    frames.push({timeMs:timestampMs,width:canvas.width,height:canvas.height,landmarks});
    if(i===Math.floor(times.length/2)){
     preview=root.document.createElement('canvas');
     preview.width=canvas.width;preview.height=canvas.height;
     preview.getContext('2d').drawImage(canvas,0,0);
     drawOverlay(preview,landmarks);
    }
   }
   onProgress({stage:'frames',done:i+1,total:times.length});
   await pause();
  }
  const analysis=root.MWMotionBiomechanics.analyze({movementType,cameraView,frames});
  return {analysis,attemptedFrames:times.length,poseFrames:frames.length,preview};
 }finally{
  try{detector?.close?.()}catch{}
  if(video){video.pause();video.removeAttribute('src');video.load();}
  if(url)root.URL.revokeObjectURL(url);
 }
}
return Object.freeze({VERSION,MAX_FRAMES,MAX_SECONDS,timeline,run,drawOverlay});
});
