// Pure policy checks for the private, adult-only Motion Intelligence staging pilot.
export const RETENTION_DAYS=14;
export const TOKEN_GRACE_MS=60*60*1000;
export const BATCH_LIMIT=20;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function ownedPath(path,userId,assessmentId){
 if(typeof path!=='string'||!UUID.test(userId||'')||!UUID.test(assessmentId||''))return false;
 const prefix=userId+'/'+assessmentId+'/';
 return path.startsWith(prefix)&&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(mp4|mov|webm)$/i.test(path.slice(prefix.length));
}
function epoch(value){const t=Date.parse(value||'');return Number.isFinite(t)?t:NaN;}
export function cleanupReason(assessment,intent,now=Date.now()){
 if(!assessment||!UUID.test(assessment.id||'')||!UUID.test(assessment.created_by||'')||
 !Number.isFinite(now))return null;
 const created=epoch(assessment.created_at);
 if(Number.isFinite(created)&&created<=now-RETENTION_DAYS*86400000)return 'retention';
 // Deleted recordings retain their tombstone until a signed upload token has expired.
 if(assessment.status==='deleted' &&
 (!intent || (Number.isFinite(epoch(intent.expires_at)) &&
 epoch(intent.expires_at)+TOKEN_GRACE_MS<now)))return 'deleted_tombstone';
 if(assessment.status==='draft'&&intent?.status==='pending'&&
 Number.isFinite(epoch(intent.expires_at))&&
 epoch(intent.expires_at)+TOKEN_GRACE_MS<now)return 'abandoned_upload';
 return null;
}
export function plan(assessment,intent,assets,now=Date.now()){
 const reason=cleanupReason(assessment,intent,now);
 if(!reason)return null;
 const paths=[...(assets||[]).map(x=>x.storage_path),...(intent?[intent.storage_path]:[])];
 if(paths.some(p=>!ownedPath(p,assessment.created_by,assessment.id)))
  return {reason,valid:false,paths:[]};
 return {reason,valid:true,paths:[...new Set(paths)]};
}
