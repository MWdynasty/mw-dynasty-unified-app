/* Stage 3: authenticated upload/download controller. Never supply service-role keys here.
 * Requires a configured Supabase client, authenticated user and pilot-enabled backend policies.
 * Intentional fail-closed behavior until storage RLS and consent gates are approved.
 */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports) module.exports=api;else root.MWMotionUpload=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const BUCKET='motion-private';
const MIME=Object.freeze({'video/mp4':'mp4','video/quicktime':'mov','video/webm':'webm'});
const MAX_BYTES=100*1024*1024;
function isUuid(value){return typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);}
function assertUpload(file){if(!file||!Object.prototype.hasOwnProperty.call(MIME,file.type))throw new Error('Unsupported recording format');if(!Number.isFinite(file.size)||file.size<=0||file.size>MAX_BYTES)throw new Error('Video must be 1–100MB');}
async function currentUser(client){if(!client||!client.auth||typeof client.auth.getUser!=='function')throw new Error('Authentication unavailable');const {data,error}=await client.auth.getUser();if(error||!data||!data.user||!isUuid(data.user.id))throw new Error('Athlete sign-in required');return data.user;}
async function loadOwnedAssessment(client,assessmentId,userId){if(!isUuid(assessmentId))throw new Error('Invalid assessment');const {data,error}=await client.from('motion_assessments').select('id,created_by,status,consent_recorded_at').eq('id',assessmentId).eq('created_by',userId).single();if(error||!data||data.created_by!==userId)throw new Error('Assessment not accessible');return data;}
function createController(client,{enabled=false}={}){
  if(!enabled)return Object.freeze({upload:async()=>{throw new Error('Motion recording pilot is not enabled');},signedPlayback:async()=>{throw new Error('Motion recording pilot is not enabled');}});
  return Object.freeze({
    async upload({assessmentId,file}){
      assertUpload(file);
      const user=await currentUser(client);
      const assessment=await loadOwnedAssessment(client,assessmentId,user.id);
      if(assessment.status!=='draft'||!assessment.consent_recorded_at)throw new Error('Assessment not ready for recording');
      if(!globalThis.crypto||typeof globalThis.crypto.randomUUID!=='function')throw new Error('Secure random IDs unavailable');
      const path=user.id+'/'+assessmentId+'/'+globalThis.crypto.randomUUID()+'.'+MIME[file.type];
      const {data,error}=await client.storage.from(BUCKET).upload(path,file,{upsert:false,contentType:file.type,cacheControl:'0'});
      if(error)throw new Error('Secure recording upload failed');
      return {path:data&&data.path||path,assessmentId,processing:'not_configured'};
    },
    async signedPlayback({assessmentId,path}){
      const user=await currentUser(client);
      await loadOwnedAssessment(client,assessmentId,user.id);
      if(typeof path!=='string'||!path.startsWith(user.id+'/'+assessmentId+'/')||!/^[-0-9a-f]{36}\.(mp4|mov|webm)$/i.test(path.slice((user.id+'/'+assessmentId+'/').length)))throw new Error('Recording path not authorized');
      const {data,error}=await client.storage.from(BUCKET).createSignedUrl(path,60);
      if(error||!data||!data.signedUrl)throw new Error('Secure playback unavailable');
      return data.signedUrl;
    }
  });
}
return Object.freeze({BUCKET,MIME,MAX_BYTES,isUuid,assertUpload,createController});
});
