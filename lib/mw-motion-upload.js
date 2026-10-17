/* MW Motion Intelligence: browser-side file validation only.
 * Uploads and playback are exclusively authorized by mw-motion-pilot Edge API.
 * This module does not issue tokens, write metadata, or authorize storage access.
 */
(function(root,factory){
 const api=factory();
 if(typeof module==='object'&&module.exports) module.exports=api;
 else root.MWMotionUpload=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const MIME=Object.freeze({'video/mp4':'mp4','video/quicktime':'mov'});
 const MAX_BYTES=100*1024*1024;
 const MAX_DURATION_SECONDS=30;
 function assertDuration(seconds){
  if(typeof seconds!=='number'||!Number.isFinite(seconds)||seconds<=0)
   throw new Error('Recording duration could not be verified.');
  if(seconds>MAX_DURATION_SECONDS)
   throw new Error('Recordings must be 30 seconds or shorter.');
  return true;
 }
 function assertUpload(file){
  if(!file||!Object.prototype.hasOwnProperty.call(MIME,file.type))
   throw new Error('Unsupported recording format');
  if(!Number.isFinite(file.size)||file.size<=0||file.size>MAX_BYTES)
   throw new Error('Video must be 1–100MB');
  return true;
 }
 return Object.freeze({MIME,MAX_BYTES,MAX_DURATION_SECONDS,assertUpload,assertDuration});
});
