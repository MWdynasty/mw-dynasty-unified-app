import { createClient } from "npm:@supabase/supabase-js@2.79.0";
import {MAX_BYTES,MAX_PER_DAY,MIME_EXT,ALLOWED_ORIGIN,validId,adult,pathOwned,validPrepare} from "./validation.mjs";
import {sanitizedReview,validateReview} from "./review-validation.mjs";
import {canonicalWeek} from "./season-week.mjs";
import {verifyIsoVideo,signedRangeReader} from "./media-validation.mjs";

const STAGING_REF = "uuggbmccnyswiwkjgydo";
const BUCKET = "motion-private";
// Defense in depth: block expired recordings even if the cleanup scheduler is delayed.
const RETENTION_MS = 14 * 24 * 60 * 60 * 1000;
function withinRetention(createdAt: unknown): boolean {
  if(typeof createdAt !== "string") return false;
  const time = new Date(createdAt).getTime();
  return Number.isFinite(time) && time <= Date.now() && time > Date.now() - RETENTION_MS;
}
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
      .select("id,created_by,status,created_at").eq("id",id).eq("created_by",user.id).maybeSingle();
    return error ? null : data;
  };
  // Approval is server-controlled. Revocation must take effect on finalize and playback,
  // not only when a signed upload token is first issued.
  const pilotApproved = async () => {
    const {data:athlete,error:athleteError} = await admin.from("athletes")
      .select("id,date_of_birth").eq("user_id",user.id).maybeSingle();
    if(athleteError || !athlete || !adult(athlete.date_of_birth)) return null;
    const {data:approval,error:approvalError} = await admin.from("motion_pilot_approvals")
      .select("status,expires_at,adult_verified_at,consent_policy_version")
      .eq("user_id",user.id).maybeSingle();
    if(approvalError || !approval || approval.status!=="active" ||
       !approval.adult_verified_at || approval.consent_policy_version!=="pilot-v1" ||
       !Number.isFinite(new Date(approval.expires_at).getTime()) ||
       new Date(approval.expires_at).getTime()<=Date.now()) return null;
    return athlete;
  };
  try {
    if (action === "eligibility") {
      return json(200,{approved:!!await pilotApproved(),adultPilotOnly:true},origin);
    }
    if (action === "season_context") {
      const athlete=await pilotApproved();
      if(!athlete)return bad(403,"Adult staging pilot approval required",origin);
      const {data:profile,error:profileError}=await admin.from("athletes")
        .select("program_start_date").eq("id",athlete.id).eq("user_id",user.id).maybeSingle();
      if(profileError||!profile)return bad(503,"Season context unavailable",origin);
      const week=canonicalWeek(profile.program_start_date);
      return json(200,{
        weekNumber:week,weekSource:week===null?"unassigned":"athlete_program_start",
        programStartDate:profile.program_start_date||null,
        continuousWeeks:41,
        indoorOutdoorReset:false
      },origin);
    }
    if (action === "prepare") {
      const athlete=await pilotApproved();
      if(!athlete) return bad(403,"Adult staging pilot approval required",origin);
      const validationError = validPrepare(input);
      if (validationError) return bad(422,validationError,origin);
      const mime = input.mimeType as string;
      const bytes = input.bytes as number;
      const {data:profile,error:profileError}=await admin.from("athletes")
        .select("program_start_date").eq("id",athlete.id).eq("user_id",user.id).maybeSingle();
      if(profileError||!profile)return bad(503,"Season context unavailable",origin);
      const canonical=canonicalWeek(profile.program_start_date);
      if(canonical!==null && input.weekNumber!==undefined && input.weekNumber!==canonical)
        return bad(422,"Training week differs from your MW Velocity program",origin);
      const week=canonical??input.weekNumber;
      const {count,error:countError} = await admin.from("motion_assessments")
        .select("id",{count:"exact",head:true}).eq("created_by",user.id)
        .gte("created_at",new Date(Date.now()-86400000).toISOString());
      if (countError) return bad(503,"Upload limit unavailable",origin);
      if ((count||0)>=MAX_PER_DAY) return bad(429,"Daily pilot limit reached",origin);
      const {data:assessment,error:assessmentError} = await admin.from("motion_assessments").insert({
        athlete_id:athlete.id,created_by:user.id,movement_type:input.movementType,
        camera_view:input.cameraView,week_number:week??null,
        week_source:canonical!==null?"athlete_program_start":week===undefined?"unassigned":"manual",status:"draft",
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
      if(!await pilotApproved()) return bad(403,"Adult staging pilot approval required",origin);
      const record = await own(input.assessmentId);
      if(!record || record.status==="deleted") return bad(404,"Assessment not found",origin);
      const {data:intent,error:intentError} = await admin.from("motion_upload_intents")
        .select("*").eq("assessment_id",record.id).eq("owner_user_id",user.id).maybeSingle();
      if(intentError || !intent) return bad(404,"Upload intent not found",origin);
      if(intent.status==="finalized" && record.status==="uploaded")
        return json(200,{assessmentId:record.id,status:"uploaded",durationVerified:false},origin);
      if(record.status!=="draft" || intent.status!=="pending" ||
         new Date(intent.expires_at).getTime()<Date.now()) {
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
      // Metadata MIME and byte counts are insufficient: inspect the actual
      // private object, ISO BMFF signature, video track and server-derived duration.
      // Reject unsupported or uninspectable recordings without finalizing them.
      const {data:validationUrl,error:validationUrlError}=await admin.storage
        .from(BUCKET).createSignedUrl(intent.storage_path,60);
      if(validationUrlError||!validationUrl?.signedUrl)
        return bad(503,"Private recording verification unavailable",origin);
      let verified;
      try {
        const reader=signedRangeReader({
          url:validationUrl.signedUrl,bytes:actualBytes,
          expectedOrigin:"https://"+STAGING_REF+".supabase.co"
        });
        verified=await verifyIsoVideo({bytes:actualBytes,mime:actualMime,readRange:reader});
      } catch(e) {
        await audit(record.id,"upload_validation_failed",{reason:"media_container_or_duration"});
        return bad(422,"Recording format or 30-second duration could not be verified",origin);
      }
      const {error:assetError} = await admin.from("motion_assets").upsert({
        assessment_id:record.id,storage_path:intent.storage_path,
        mime_type:actualMime,bytes:actualBytes,duration_ms:verified.durationMs
      },{onConflict:"storage_path",ignoreDuplicates:true});
      if(assetError) return bad(503,"Could not save recording metadata",origin);
      const {data:updated,error:stateError} = await admin.from("motion_assessments")
        .update({status:"uploaded",updated_at:new Date().toISOString()})
        .eq("id",record.id).eq("created_by",user.id).eq("status","draft")
        .select("id").maybeSingle();
      if(stateError) return bad(503,"Could not finalize recording",origin);
      if(!updated) return bad(409,"Recording was deleted or changed before finalization",origin);
      await admin.from("motion_upload_intents").update({status:"finalized",finalized_at:new Date().toISOString()}).eq("id",intent.id);
      await audit(record.id,"upload_finalized",{bytes:actualBytes,mime:actualMime,durationVerified:true,method:verified.method});
      return json(200,{assessmentId:record.id,status:"uploaded",durationVerified:true,durationMs:verified.durationMs,analysisAvailable:true},origin);
    }
    if(action==="list") {
      const {data,error} = await admin.from("motion_assessments")
        .select("id,movement_type,camera_view,training_date,week_number,status,created_at,motion_assets(id,mime_type,bytes)")
        .eq("created_by",user.id).neq("status","deleted")
        .gte("created_at",new Date(Date.now()-RETENTION_MS).toISOString())
        .order("created_at",{ascending:false}).limit(30);
      if(error) return bad(503,"Recording history unavailable",origin);
      return json(200,{assessments:data||[]},origin);
    }
    if(action==="save_review") {
      if(!await pilotApproved()) return bad(403,"Adult staging pilot approval required",origin);
      if(input.consentToStoreMeasurements!==true || input.consentVersion!=="motion-review-v1")
        return bad(422,"Private measurement storage consent required",origin);
      const record=await own(input.assessmentId);
      if(!record || record.status!=="uploaded" || !withinRetention(record.created_at))
        return bad(404,"Recording not found",origin);
      const validation=validateReview(input.review);
      if(validation)return bad(422,validation,origin);
      const {data:meta,error:metaError}=await admin.from("motion_assessments")
        .select("movement_type,week_number").eq("id",record.id).eq("created_by",user.id).maybeSingle();
      if(metaError || !meta)return bad(404,"Recording not found",origin);
      const cleaned=sanitizedReview(input.review);
      const {error:saveError}=await admin.from("motion_reviews").upsert({
        assessment_id:record.id,owner_user_id:user.id,
        movement_type:meta.movement_type,week_number:meta.week_number,
        ...cleaned,updated_at:new Date().toISOString()
      },{onConflict:"assessment_id"});
      if(saveError)return bad(503,"Private review could not be saved",origin);
      await audit(record.id,"private_review_saved",{method:cleaned.method,metricCount:cleaned.metrics.length});
      return json(200,{saved:true,assessmentId:record.id,provenance:cleaned.provenance},origin);
    }
    if(action==="reviews") {
      if(!await pilotApproved()) return bad(403,"Adult staging pilot approval required",origin);
      const cutoff=new Date(Date.now()-RETENTION_MS).toISOString();
      const {data:records,error:recordError}=await admin.from("motion_assessments")
        .select("id").eq("created_by",user.id).eq("status","uploaded")
        .gte("created_at",cutoff).limit(30);
      if(recordError)return bad(503,"Review history unavailable",origin);
      const ids=new Set((records||[]).map((r:{id:string})=>r.id));
      if(!ids.size)return json(200,{reviews:[]},origin);
      const {data:reviews,error:reviewError}=await admin.from("motion_reviews")
        .select("assessment_id,movement_type,week_number,sampled_frames,pose_frames,metrics,method,provenance,created_at")
        .eq("owner_user_id",user.id).gte("created_at",cutoff).limit(30);
      if(reviewError)return bad(503,"Review history unavailable",origin);
      return json(200,{reviews:(reviews||[]).filter((r:{assessment_id:string})=>ids.has(r.assessment_id))},origin);
    }
    // 41-week progression keeps only opt-in angle summaries, not video frames.
    if(action==="save_season") {
      const athlete=await pilotApproved();
      if(!athlete)return bad(403,"Adult staging pilot approval required",origin);
      if(input.consentToSeasonHistory!==true || input.consentVersion!=="motion-season-v1")
        return bad(422,"Separate season history consent required",origin);
      const record=await own(input.assessmentId);
      if(!record || record.status!=="uploaded" || !withinRetention(record.created_at))
        return bad(404,"Recording not found",origin);
      const {data:meta,error:metaError}=await admin.from("motion_assessments")
        .select("movement_type,week_number").eq("id",record.id).eq("created_by",user.id).maybeSingle();
      if(metaError||!meta||!Number.isInteger(meta.week_number)||meta.week_number<1||meta.week_number>41)
        return bad(422,"Assign a valid MW training week before saving season history",origin);
      const validation=validateReview(input.review);
      if(validation)return bad(422,validation,origin);
      const cleaned=sanitizedReview(input.review);
      // Never let a repeat save silently extend the consent-based expiry.
      const {data:existing,error:existingError}=await admin.from("motion_season_observations")
        .select("id").eq("assessment_id",record.id).eq("owner_user_id",user.id).maybeSingle();
      if(existingError)return bad(503,"Season history unavailable",origin);
      if(existing)return json(200,{saved:true,alreadySaved:true,assessmentId:record.id},origin);
      const {error:saveError}=await admin.from("motion_season_observations").insert({
        assessment_id:record.id,athlete_id:athlete.id,owner_user_id:user.id,
        movement_type:meta.movement_type,week_number:meta.week_number,
        ...cleaned,consent_version:"motion-season-v1",
        share_with_assigned_coach:false
      });
      if(saveError)return bad(503,"Season observation could not be saved",origin);
      await audit(record.id,"season_observation_saved",{week:meta.week_number,shared:false});
      return json(200,{saved:true,assessmentId:record.id,retentionDays:330,coachShared:false},origin);
    }
    if(action==="season") {
      // Data access/deletion remains available after pilot approval is revoked.
      const {data,error}=await admin.from("motion_season_observations")
        .select("id,assessment_id,movement_type,week_number,metrics,provenance,observed_at,created_at,expires_at,share_with_assigned_coach")
        .eq("owner_user_id",user.id).gt("expires_at",new Date().toISOString())
        .order("created_at",{ascending:false}).limit(250);
      if(error)return bad(503,"Season history unavailable",origin);
      return json(200,{observations:data||[],experimental:true},origin);
    }
    if(action==="share_season") {
      // Revocation always allowed. New sharing still requires current approval.
      if(input.share===true && !await pilotApproved())
        return bad(403,"Adult staging pilot approval required",origin);
      if(!validId(input.observationId)||typeof input.share!=="boolean")
        return bad(422,"Invalid sharing request",origin);
      const {data:record,error:readError}=await admin.from("motion_season_observations")
        .select("id,assessment_id").eq("id",input.observationId)
        .eq("owner_user_id",user.id).gt("expires_at",new Date().toISOString()).maybeSingle();
      if(readError||!record)return bad(404,"Observation not found",origin);
      const {error}=await admin.from("motion_season_observations")
        .update({share_with_assigned_coach:input.share,updated_at:new Date().toISOString()})
        .eq("id",record.id).eq("owner_user_id",user.id);
      if(error)return bad(503,"Sharing change could not be saved",origin);
      await audit(record.assessment_id,"season_sharing_changed",{shared:input.share});
      return json(200,{updated:true,shared:input.share},origin);
    }
    if(action==="delete_season") {
      // Privacy deletion is never conditional on continued pilot enrollment.
      if(!validId(input.observationId))return bad(422,"Invalid observation",origin);
      const {data:record,error:readError}=await admin.from("motion_season_observations")
        .select("id,assessment_id").eq("id",input.observationId)
        .eq("owner_user_id",user.id).maybeSingle();
      if(readError||!record)return bad(404,"Observation not found",origin);
      const {error}=await admin.from("motion_season_observations")
        .delete().eq("id",record.id).eq("owner_user_id",user.id);
      if(error)return bad(503,"Could not delete season observation",origin);
      await audit(record.assessment_id,"season_observation_deleted");
      return json(200,{deleted:true},origin);
    }
    if(action==="coach_season") {
      // Assignment must be active. Sharing is per-observation and off by default.
      const {data:assignments,error:assignmentError}=await admin.from("coach_assignments")
        .select("athlete_id").eq("coach_user_id",user.id).eq("status","active").limit(100);
      if(assignmentError)return bad(503,"Coach assignments unavailable",origin);
      const athleteIds=(assignments||[]).map((a:{athlete_id:string})=>a.athlete_id);
      if(!athleteIds.length)return json(200,{observations:[]},origin);
      const {data:records,error:recordError}=await admin.from("motion_season_observations")
        .select("id,athlete_id,movement_type,week_number,metrics,provenance,observed_at,created_at")
        .in("athlete_id",athleteIds).eq("share_with_assigned_coach",true)
        .gt("expires_at",new Date().toISOString()).order("created_at",{ascending:false}).limit(250);
      if(recordError)return bad(503,"Shared observations unavailable",origin);
      const {data:adults,error:adultError}=await admin.from("athletes")
        .select("id,date_of_birth").in("id",athleteIds);
      if(adultError)return bad(503,"Athlete eligibility unavailable",origin);
      const adultIds=new Set((adults||[]).filter((a:{date_of_birth:string})=>adult(a.date_of_birth)).map((a:{id:string})=>a.id));
      return json(200,{observations:(records||[]).filter((r:{athlete_id:string})=>adultIds.has(r.athlete_id)),experimental:true},origin);
    }
    if(action==="playback") {
      if(!await pilotApproved()) return bad(403,"Adult staging pilot approval required",origin);
      const record=await own(input.assessmentId);
      if(!record || record.status!=="uploaded" || !withinRetention(record.created_at))
        return bad(404,"Recording not found",origin);
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
      // Tombstone first: this blocks playback and finalization even if object deletion fails.
      const {error:tombstoneError}=await admin.from("motion_assessments")
        .update({status:"deleted",updated_at:new Date().toISOString()})
        .eq("id",record.id).eq("created_by",user.id);
      if(tombstoneError) return bad(503,"Could not protect deleted recording",origin);
      const {data:assets,error:assetError} = await admin.from("motion_assets")
        .select("storage_path").eq("assessment_id",record.id);
      const {data:intent,error:intentError} = await admin.from("motion_upload_intents")
        .select("storage_path").eq("assessment_id",record.id).maybeSingle();
      if(assetError || intentError) return bad(503,"Could not locate recording files",origin);
      const paths=[...new Set([...(assets||[]).map(a=>a.storage_path),...(intent?[intent.storage_path]:[])])];
      // Never allow a corrupted metadata row to delete another athlete's file.
      if(paths.some(path=>!pathOwned(path,user.id,record.id))){
        await audit(record.id,"delete_path_rejected");
        return bad(409,"Recording ownership verification failed",origin);
      }
      if(paths.length){
        const {error:removeError}=await admin.storage.from(BUCKET).remove(paths);
        if(removeError) return bad(503,"Private recording deletion failed",origin);
      }
      // Keep the tombstone and upload intent until signed upload tokens have expired.
      // Maintenance will remove a late orphan upload and then delete the assessment.
      const {error:assetDeleteError}=await admin.from("motion_assets")
        .delete().eq("assessment_id",record.id);
      if(assetDeleteError) return bad(503,"Recording metadata cleanup failed",origin);
      await audit(record.id,"assessment_deleted",{retainedTombstone:true});
      return json(200,{deleted:true,pendingTokenExpiry:true},origin);
    }
    return bad(400,"Unsupported action",origin);
  } catch(e) {
    console.error("Motion pilot request error",String(action),safeError(e));
    return bad(503,"Motion recording is temporarily unavailable",origin);
  }
});
