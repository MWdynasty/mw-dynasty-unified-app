import { createClient } from "npm:@supabase/supabase-js@2.79.0";
import {MAX_BYTES,MAX_PER_DAY,MIME_EXT,ALLOWED_ORIGIN,validId,adult,pathOwned,validPrepare} from "./validation.mjs";

const STAGING_REF = "uuggbmccnyswiwkjgydo";
const BUCKET = "motion-private";
function json(status: number, body: unknown, origin: string | null = null): Response {
  const headers: Record<string,string> = {
    "Content-Type": "application/json", "Cache-Control": "no-store",
    "Vary": "Origin", "X-Content-Type-Options": "nosniff"
  };
  if (origin && ALLOWED_ORIGIN.test(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Access-Control-Allow-Methods"] = "POST, OPTIONS";
    headers["Access-Control-Allow-Headers"] = "authorization, apikey, content-type, x-client-info";
  }
  return new Response(JSON.stringify(body), { status, headers });
}
function bad(status: number, message: string, origin: string | null): Response {
  return json(status, {error:message}, origin);
}
function safeError(e: unknown): string {
  return e instanceof Error ? e.message.slice(0,120) : "unknown";
}
Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin");
  if (origin && !ALLOWED_ORIGIN.test(origin)) return bad(403,"Origin not allowed",null);
  if (req.method === "OPTIONS") return json(200,{ok:true},origin);
  if (req.method !== "POST") return bad(405,"Method not allowed",origin);
  if (Number(req.headers.get("content-length")||0) > 16384) return bad(413,"Request too large",origin);
  const url = Deno.env.get("SUPABASE_URL")||"";
  const secret = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
  if (!url.startsWith("https://"+STAGING_REF+".supabase.co") || !secret) {
    return bad(503,"Motion recording pilot unavailable",origin);
  }
  const auth = req.headers.get("authorization")||"";
  const token = auth.match(/^Bearer\s+([^\s]+)$/i)?.[1];
  if (!token) return bad(401,"Sign in required",origin);
  const admin = createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:identity,error:identityError} = await admin.auth.getUser(token);
  const user = identity?.user;
  if (identityError || !user || !validId(user.id)) return bad(401,"Session invalid",origin);
  let input: Record<string,unknown>;
  try {
    const parsed = await req.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
    input = parsed;
  } catch { return bad(400,"Invalid request body",origin); }
  const action = input.action;
  const audit = async (assessmentId: string|null,event: string, details: Record<string,unknown>={}) => {
    const {error} = await admin.from("motion_audit_events").insert({
      actor_user_id:user.id, assessment_id:assessmentId,event_type:event,details
    });
    if(error) console.error("motion audit insert failed",event,error.code);
  };
  const own = async (id: unknown) => {
    if(!validId(id)) return null;
    const {data,error} = await admin.from("motion_assessments")
      .select("id,created_by,status").eq("id",id).eq("created_by",user.id).maybeSingle();
    return error ? null : data;
  };
  try {
    if (action === "prepare") {
      const {data:athlete,error:athleteError} = await admin.from("athletes")
        .select("id,date_of_birth").eq("user_id",user.id).maybeSingle();
      if (athleteError || !athlete || !adult(athlete.date_of_birth)) {
        return bad(403,"Adult athlete pilot access required",origin);
      }
      const validationError = validPrepare(input);
      if (validationError) return bad(422,validationError,origin);
      const mime = input.mimeType as string;
      const bytes = input.bytes as number;
      const week = input.weekNumber as number | undefined;
      const {count,error:countError} = await admin.from("motion_assessments")
        .select("id",{count:"exact",head:true}).eq("created_by",user.id)
        .gte("created_at",new Date(Date.now()-86400000).toISOString());
      if (countError) return bad(503,"Upload limit unavailable",origin);
      if ((count||0)>=MAX_PER_DAY) return bad(429,"Daily pilot limit reached",origin);
      const {data:assessment,error:assessmentError} = await admin.from("motion_assessments").insert({
        athlete_id:athlete.id,created_by:user.id,movement_type:input.movementType,
        camera_view:input.cameraView,week_number:week??null,status:"draft",
        consent_recorded_at:new Date().toISOString()
      }).select("id").single();
      if (assessmentError || !assessment) return bad(503,"Could not create assessment",origin);
      const assessmentId = assessment.id as string;
      const path = user.id+"/"+assessmentId+"/"+crypto.randomUUID()+"."+MIME_EXT[mime as string];
      const {error:intentError} = await admin.from("motion_upload_intents").insert({
        assessment_id:assessmentId,owner_user_id:user.id,storage_path:path,
        declared_mime:mime,declared_bytes:bytes
      });
      if(intentError) {
        await admin.from("motion_assessments").delete().eq("id",assessmentId);
        return bad(503,"Could not prepare upload",origin);
      }
      const {data:signed,error:signError} = await admin.storage.from(BUCKET).createSignedUploadUrl(path,{upsert:false});
      if(signError || !signed?.token) {
        await admin.from("motion_assessments").delete().eq("id",assessmentId);
        return bad(503,"Secure upload could not be authorized",origin);
      }
      await audit(assessmentId,"upload_prepared",{movementType:input.movementType,cameraView:input.cameraView});
      return json(200,{assessmentId,path,token:signed.token,maxBytes:MAX_BYTES,expiresInSeconds:7200},origin);
    }
    if (action === "finalize") {
      const record = await own(input.assessmentId);
      if(!record) return bad(404,"Assessment not found",origin);
      const {data:intent,error:intentError} = await admin.from("motion_upload_intents")
        .select("*").eq("assessment_id",record.id).eq("owner_user_id",user.id).maybeSingle();
      if(intentError || !intent) return bad(404,"Upload intent not found",origin);
      if(intent.status==="finalized") return json(200,{assessmentId:record.id,status:"uploaded",durationVerified:false},origin);
      if(intent.status!=="pending" || new Date(intent.expires_at).getTime()<Date.now()) {
        return bad(409,"Upload authorization expired",origin);
      }
      if(!pathOwned(intent.storage_path,user.id,record.id)) return bad(403,"Invalid upload path",origin);
      const parts=intent.storage_path.split("/");
      const {data:objects,error:listError} = await admin.storage.from(BUCKET)
        .list(parts.slice(0,2).join("/"),{search:parts[2],limit:10});
      const object = objects?.find((o:{name:string})=>o.name===parts[2]);
      if(listError || !object) return bad(409,"Recording not yet uploaded",origin);
      const actualBytes=Number(object.metadata?.size);
      const actualMime=String(object.metadata?.mimetype||"").toLowerCase();
      if(!Number.isFinite(actualBytes) || actualBytes<1 || actualBytes>MAX_BYTES ||
         actualBytes!==Number(intent.declared_bytes) || actualMime!==intent.declared_mime) {
        await audit(record.id,"upload_validation_failed",{reason:"metadata_mismatch"});
        return bad(422,"Uploaded recording did not match expected file metadata",origin);
      }
      const {error:assetError} = await admin.from("motion_assets").upsert({
        assessment_id:record.id,storage_path:intent.storage_path,
        mime_type:actualMime,bytes:actualBytes,duration_ms:null
      },{onConflict:"storage_path",ignoreDuplicates:true});
      if(assetError) return bad(503,"Could not save recording metadata",origin);
      const {error:stateError} = await admin.from("motion_assessments").update({status:"uploaded",updated_at:new Date().toISOString()}).eq("id",record.id).eq("created_by",user.id);
      if(stateError) return bad(503,"Could not finalize recording",origin);
      await admin.from("motion_upload_intents").update({status:"finalized",finalized_at:new Date().toISOString()}).eq("id",intent.id);
      await audit(record.id,"upload_finalized",{bytes:actualBytes,mime:actualMime,durationVerified:false});
      return json(200,{assessmentId:record.id,status:"uploaded",durationVerified:false,analysisAvailable:false},origin);
    }
    if(action==="list") {
      const {data,error} = await admin.from("motion_assessments")
        .select("id,movement_type,camera_view,training_date,week_number,status,created_at,motion_assets(id,mime_type,bytes)")
        .eq("created_by",user.id).order("created_at",{ascending:false}).limit(30);
      if(error) return bad(503,"Recording history unavailable",origin);
      return json(200,{assessments:data||[]},origin);
    }
    if(action==="playback") {
      const record=await own(input.assessmentId);
      if(!record || record.status==="deleted") return bad(404,"Recording not found",origin);
      if(!validId(input.assetId)) return bad(422,"Invalid recording",origin);
      const {data:asset,error} = await admin.from("motion_assets")
        .select("storage_path").eq("id",input.assetId).eq("assessment_id",record.id).maybeSingle();
      if(error || !asset || !pathOwned(asset.storage_path,user.id,record.id)) return bad(404,"Recording not found",origin);
      const {data:signed,error:signError} = await admin.storage.from(BUCKET).createSignedUrl(asset.storage_path,60);
      if(signError || !signed?.signedUrl) return bad(503,"Private playback unavailable",origin);
      await audit(record.id,"playback_requested");
      return json(200,{url:signed.signedUrl,expiresInSeconds:60},origin);
    }
    if(action==="delete") {
      const record=await own(input.assessmentId);
      if(!record) return bad(404,"Assessment not found",origin);
      const {data:assets,error:assetError} = await admin.from("motion_assets")
        .select("storage_path").eq("assessment_id",record.id);
      const {data:intent,error:intentError} = await admin.from("motion_upload_intents")
        .select("storage_path").eq("assessment_id",record.id).maybeSingle();
      if(assetError || intentError) return bad(503,"Could not locate recording files",origin);
      const paths=[...new Set([...(assets||[]).map(a=>a.storage_path),...(intent?[intent.storage_path]:[])])];
      if(paths.length){
        const {error:removeError}=await admin.storage.from(BUCKET).remove(paths);
        if(removeError) return bad(503,"Private recording deletion failed",origin);
      }
      const {error:deleteError}=await admin.from("motion_assessments").delete().eq("id",record.id).eq("created_by",user.id);
      if(deleteError) return bad(503,"Assessment deletion failed",origin);
      await audit(record.id,"assessment_deleted");
      return json(200,{deleted:true},origin);
    }
    return bad(400,"Unsupported action",origin);
  } catch(e) {
    console.error("Motion pilot request error",String(action),safeError(e));
    return bad(503,"Motion recording is temporarily unavailable",origin);
  }
});
