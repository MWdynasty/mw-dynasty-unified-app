import {createClient} from "npm:@supabase/supabase-js@2.79.0";
import {RETENTION_DAYS,TOKEN_GRACE_MS,BATCH_LIMIT,plan} from "./maintenance.mjs";

const STAGING_URL="https://uuggbmccnyswiwkjgydo.supabase.co";
const BUCKET="motion-private";
function reply(status:number,body:unknown){
 return new Response(JSON.stringify(body),{status,headers:{
  "Content-Type":"application/json","Cache-Control":"no-store","X-Content-Type-Options":"nosniff"
 }});
}
function serviceAuthorized(header:string|null,secret:string){
 const expected="Bearer "+secret;
 if(!secret || !header || header.length!==expected.length)return false;
 let mismatch=0;
 for(let i=0;i<expected.length;i++)mismatch|=header.charCodeAt(i)^expected.charCodeAt(i);
 return mismatch===0;
}
Deno.serve(async(req:Request)=>{
 if(req.method!=="POST")return reply(405,{error:"Method not allowed"});
 const url=Deno.env.get("SUPABASE_URL")||"";
 const secret=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
 if(url!==STAGING_URL||!secret)return reply(503,{error:"Staging maintenance unavailable"});
 // Only a server-side scheduler with the service key may invoke this.
 // No browser origin, publishable key, or athlete JWT grants maintenance rights.
 if(!serviceAuthorized(req.headers.get("authorization"),secret))
  return reply(403,{error:"Maintenance access denied"});
 if(Number(req.headers.get("content-length")||0)>4096)
  return reply(413,{error:"Request too large"});
 let options:Record<string,unknown>;
 try{
  options=await req.json();
  if(!options||typeof options!=="object"||Array.isArray(options))throw new Error();
 }catch{return reply(400,{error:"Invalid maintenance request"});}
 const execute=options.execute===true && options.dryRun===false;
 const limit=typeof options.limit==="number"&&Number.isInteger(options.limit)?
  Math.max(1,Math.min(BATCH_LIMIT,options.limit)):BATCH_LIMIT;
 const now=Date.now();
 const cutoff=new Date(now-RETENTION_DAYS*86400000).toISOString();
 const expiredCutoff=new Date(now-TOKEN_GRACE_MS).toISOString();
 const admin=createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}});
 const candidates=new Map<string,any>();
 const take=(records:any[])=>{
  for(const record of records||[]){
   if(record?.id && !candidates.has(record.id))candidates.set(record.id,record);
  }
 };
 try{
  // Never enumerate other buckets, users, or unrelated athlete records.
  const {data:old,error:oldError}=await admin.from("motion_assessments")
   .select("id,created_by,created_at,status").lte("created_at",cutoff)
   .order("created_at",{ascending:true}).limit(limit);
  if(oldError)throw new Error("retention_lookup");
  take(old||[]);
  const {data:deleted,error:deletedError}=await admin.from("motion_assessments")
   .select("id,created_by,created_at,status").eq("status","deleted")
   .order("created_at",{ascending:true}).limit(limit);
  if(deletedError)throw new Error("tombstone_lookup");
  take(deleted||[]);
  const {data:expired,error:expiredError}=await admin.from("motion_upload_intents")
   .select("assessment_id").eq("status","pending").lt("expires_at",expiredCutoff)
   .order("expires_at",{ascending:true}).limit(limit);
  if(expiredError)throw new Error("expired_lookup");
  const ids=(expired||[]).map(x=>x.assessment_id).filter(x=>typeof x==="string");
  if(ids.length){
   const {data:stale,error:staleError}=await admin.from("motion_assessments")
    .select("id,created_by,created_at,status").in("id",ids);
   if(staleError)throw new Error("stale_assessment_lookup");
   take(stale||[]);
  }
  let eligible=0,removed=0,failed=0,skipped=0;
  const reasons:Record<string,number>={retention:0,deleted_tombstone:0,abandoned_upload:0};
  for(const assessment of [...candidates.values()].slice(0,limit)){
   const {data:intent,error:intentError}=await admin.from("motion_upload_intents")
    .select("storage_path,status,expires_at").eq("assessment_id",assessment.id).maybeSingle();
   const {data:assets,error:assetsError}=await admin.from("motion_assets")
    .select("storage_path").eq("assessment_id",assessment.id);
   if(intentError||assetsError){failed++;continue;}
   const job=plan(assessment,intent,assets||[],now);
   if(!job){skipped++;continue;}
   if(!job.valid){failed++;continue;}
   eligible++;reasons[job.reason]++;
   if(!execute)continue;
   try{
    // Removing private objects precedes deleting metadata. Any failed deletion is
    // retried on the next run, with ownership/path validation repeated each time.
    if(job.paths.length){
     const {error:removeError}=await admin.storage.from(BUCKET).remove(job.paths);
     if(removeError)throw new Error("storage_delete");
    }
    const query=admin.from("motion_assessments").delete()
     .eq("id",assessment.id).eq("created_by",assessment.created_by)
     .eq("status",assessment.status);
    const {data:gone,error:deleteError}=await query.select("id").maybeSingle();
    if(deleteError)throw new Error("assessment_delete");
    if(!gone){skipped++;continue;}
    removed++;
    const {error:auditError}=await admin.from("motion_audit_events").insert({
     actor_user_id:null,assessment_id:assessment.id,event_type:"maintenance_deleted",
     details:{reason:job.reason,paths:job.paths.length}
    });
    if(auditError)console.error("Motion maintenance audit failed",auditError.code);
   }catch(e){failed++;console.error("Motion maintenance item failed",
     e instanceof Error?e.message:"unknown");}
  }
  // Independent opt-in season observations expire after 330 days, even when
  // source video/assessment metadata was already removed.
  const {data:expiredSeason,error:seasonLookupError}=await admin.from("motion_season_observations")
   .select("id").lte("expires_at",new Date(now).toISOString())
   .order("expires_at",{ascending:true}).limit(limit);
  if(seasonLookupError)throw new Error("season_retention_lookup");
  const seasonEligible=(expiredSeason||[]).length;
  let seasonRemoved=0;
  if(execute && seasonEligible){
   const ids=(expiredSeason||[]).map((x:{id:string})=>x.id);
   const {data:removedRows,error:seasonDeleteError}=await admin.from("motion_season_observations")
    .delete().in("id",ids).lte("expires_at",new Date(now).toISOString()).select("id");
   if(seasonDeleteError){failed++;console.error("Motion season retention deletion failed",seasonDeleteError.code);}
   else seasonRemoved=(removedRows||[]).length;
  }
  return reply(failed?207:200,{
   dryRun:!execute,retentionDays:RETENTION_DAYS,tokenGraceMinutes:TOKEN_GRACE_MS/60000,
   candidates:candidates.size,eligible,removed,failed,skipped,reasons,
   seasonEligible,seasonRemoved
  });
 }catch(e){
  console.error("Motion maintenance failed",e instanceof Error?e.message:"unknown");
  return reply(503,{error:"Maintenance unavailable"});
 }
});
