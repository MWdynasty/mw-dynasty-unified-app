// A narrowly scoped sign-in bridge for the owner's isolated Motion pilot.
// Verifies a production session, reads only the owner's schedule/profile, then
// returns a separate staging session. It never writes to production or sends mail.
import {createClient} from "npm:@supabase/supabase-js@2.79.0";
import {ALLOWED_ORIGIN,adult} from "../mw-motion-pilot/validation.mjs";

const STAGE_URL="https://uuggbmccnyswiwkjgydo.supabase.co";
const STAGE_KEY="sb_publishable_zTe0B3KiUp1bEY0u_FcRFQ_gUtxB3zw";
const PRODUCTION_URL="https://keqgunlfwhjgcsurynef.supabase.co";
const PRODUCTION_KEY="sb_publishable_JWCLQzrdWA_ZmvbpV5urVg_rcT6NECm";
// Verified against the existing founder_owner record, not user-editable metadata.
const FOUNDER_ID="73ef4c5f-41da-4108-8572-a80b6a83c990";
const RELEASE_UNTIL="2026-11-16T23:59:59Z";
const options={auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}};

Deno.serve(async(req: Request)=>{
 const origin=req.headers.get("origin");
 const headers: Record<string,string>={"Content-Type":"application/json","Cache-Control":"no-store",
  "Vary":"Origin","X-Content-Type-Options":"nosniff"};
 if(origin && ALLOWED_ORIGIN.test(origin))Object.assign(headers,{
  "Access-Control-Allow-Origin":origin,"Access-Control-Allow-Methods":"POST, OPTIONS",
  "Access-Control-Allow-Headers":"authorization, apikey, content-type, x-client-info"});
 const reply=(status:number,data:unknown)=>new Response(JSON.stringify(data),{status,headers});
 if(origin&&!ALLOWED_ORIGIN.test(origin))return reply(403,{error:"Origin not allowed"});
 if(req.method==="OPTIONS")return reply(200,{ok:true});
 if(req.method!=="POST")return reply(405,{error:"Method not allowed"});
 if(Deno.env.get("SUPABASE_URL")!==STAGE_URL||!Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"))
  return reply(503,{error:"Founder pilot unavailable"});
 if(Date.now()>=Date.parse(RELEASE_UNTIL))return reply(403,{error:"Founder pilot access has expired"});
 const token=req.headers.get("authorization")?.match(/^Bearer\s+(\S+)$/i)?.[1];
 if(!token||token.length>8192)return reply(401,{error:"Sign in with your MW Dynasty founder account"});
 let input;
 try{
  const body=await req.text();
  if(body.length>1024)return reply(413,{error:"Request too large"});
  input=JSON.parse(body);
 }catch{return reply(400,{error:"Invalid request"});}
 if(input?.consentAccepted!==true||input?.consentVersion!=="pilot-v1")
  return reply(422,{error:"Accept the private Motion pilot consent first"});
 try{
  const production=createClient(PRODUCTION_URL,PRODUCTION_KEY,{
   ...options,global:{headers:{Authorization:"Bearer "+token}}
  });
  const {data:identity,error:identityError}=await production.auth.getUser(token);
  if(identityError||!identity?.user)return reply(401,{error:"Your MW Dynasty session expired"});
  if(identity.user.id!==FOUNDER_ID||!identity.user.email_confirmed_at)
   return reply(403,{error:"This private release is available to the founder account only"});
  const {data:athlete,error:athleteError}=await production.from("athletes")
   .select("id,date_of_birth,program_start_date").eq("user_id",FOUNDER_ID).maybeSingle();
  if(athleteError||!athlete||!adult(athlete.date_of_birth))
   return reply(403,{error:"The founder athlete profile must confirm adult eligibility"});
  const {data:plans,error:planError}=await production.from("athlete_season_plans")
   .select("season_start_date").eq("athlete_id",athlete.id).eq("plan_status","active").limit(10);
  if(planError)return reply(503,{error:"Could not read your MW Velocity season"});
  const starts=[...new Set((plans||[]).map(p=>p.season_start_date))];
  if(starts.length>1||(starts.length===1&&!starts[0]))
   return reply(409,{error:"Conflicting active season starts require correction"});
  const start=starts[0]||athlete.program_start_date||null;
  const admin=createClient(STAGE_URL,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,options);
  // Opaque internal address: no password copied, no email sent, no public signup.
  const email=FOUNDER_ID+"@motion-pilot.mwdynasty.com";
  const {error:createError}=await admin.auth.admin.createUser({email,email_confirm:true,
   app_metadata:{motion_founder_production_user_id:FOUNDER_ID}});
  if(createError&&!['email_exists','user_already_exists'].includes(createError.code||''))
   return reply(503,{error:"Could not prepare founder pilot identity"});
  const {data:link,error:linkError}=await admin.auth.admin.generateLink({type:"magiclink",email});
  const stageUser=link?.user;
  if(linkError||!stageUser||stageUser.app_metadata?.motion_founder_production_user_id!==FOUNDER_ID)
   return reply(503,{error:"Founder pilot identity could not be verified"});
  const {data:approval,error:approvalReadError}=await admin.from("motion_pilot_approvals")
   .select("status,expires_at").eq("user_id",stageUser.id).maybeSingle();
  if(approvalReadError)return reply(503,{error:"Could not verify pilot authorization"});
  if(approval&&(approval.status!=="active"||Date.parse(approval.expires_at)<=Date.now()))
   return reply(403,{error:"Founder pilot authorization was revoked or expired"});
  const {error:profileError}=await admin.from("profiles").upsert({user_id:stageUser.id,
   first_name:"Mustaqeem",last_name:"Williams",role:"athlete"},{onConflict:"user_id"});
  const {error:stageAthleteError}=await admin.from("athletes").upsert({user_id:stageUser.id,
   date_of_birth:athlete.date_of_birth,program_start_date:start},{onConflict:"user_id"});
  if(profileError||stageAthleteError)return reply(503,{error:"Could not prepare founder training context"});
  if(!approval){
   const {error}=await admin.from("motion_pilot_approvals").insert({user_id:stageUser.id,
    status:"active",adult_verified_at:new Date().toISOString(),expires_at:RELEASE_UNTIL,
    approved_by:stageUser.id,consent_policy_version:"pilot-v1"});
   if(error)return reply(503,{error:"Could not activate founder pilot access"});
  }
  const {error:auditError}=await admin.from("motion_audit_events").insert({
   actor_user_id:stageUser.id,event_type:"founder_pilot_signin",
   details:{production_user_id:FOUNDER_ID,consent_version:"pilot-v1",expires_at:RELEASE_UNTIL}
  });
  if(auditError)return reply(503,{error:"Could not record pilot consent"});
  const stagePublic=createClient(STAGE_URL,STAGE_KEY,options);
  const {data:signed,error:signedError}=await stagePublic.auth.verifyOtp({
   token_hash:link.properties.hashed_token,type:"magiclink"
  });
  if(signedError||!signed.session||signed.user?.id!==stageUser.id)
   return reply(503,{error:"Could not start your private pilot session"});
  return reply(200,{access_token:signed.session.access_token,refresh_token:signed.session.refresh_token,
   expires_in:signed.session.expires_in,environment:"staging",pilotExpiresAt:RELEASE_UNTIL});
 }catch{
  return reply(503,{error:"Founder pilot sign-in is temporarily unavailable"});
 }
});
