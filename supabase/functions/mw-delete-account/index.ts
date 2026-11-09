import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders={"access-control-allow-origin":"*","access-control-allow-headers":"authorization, apikey, content-type, x-client-info, x-retry-count, traceparent, tracestate, baggage","access-control-allow-methods":"POST, OPTIONS"};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...corsHeaders,"content-type":"application/json; charset=utf-8","cache-control":"no-store"}});
function envKey(modern:string,legacy:string){const raw=Deno.env.get(modern)||"";if(raw){try{const p=JSON.parse(raw);if(p?.default)return String(p.default)}catch{}}return Deno.env.get(legacy)||""}
function adminHeaders(key:string,extra:Record<string,string>={}){const h:Record<string,string>={apikey:key,...extra};if(!key.startsWith("sb_secret_"))h.authorization=`Bearer ${key}`;return h}


async function stopWebsiteRenewals(token:string,userId:string){
  const endpoint="https://app.mwdynasty.com/api/cancellation";
  const call=async(method:string,body?:unknown)=>{
    const r=await fetch(endpoint,{method,redirect:"error",signal:AbortSignal.timeout(20000),
      headers:{authorization:`Bearer ${token}`,"content-type":"application/json"},
      ...(body?{body:JSON.stringify(body)}:{})});
    const d=await r.json().catch(()=>null);
    if(!r.ok||d?.ok!==true||d?.userId!==userId||!Array.isArray(d?.subscriptions))
      throw new Error("We could not confirm that website renewal payments are stopped. Your account has not been deleted. Please try again.");
    return d.subscriptions;
  };
  const before=await call("GET");
  for(const item of before){
    if(item.provider!=="stripe"||["scheduled","ended"].includes(item.status))continue;
    if(!item.subscriptionId||!["membership","sponsorship"].includes(item.scope))
      throw new Error("Your subscription could not be verified. Your account has not been deleted.");
    const cancelled=await call("POST",{scope:item.scope,confirm:true,expectedSubscriptionId:item.subscriptionId});
    if(!cancelled.some((s:any)=>s.subscriptionId===item.subscriptionId&&["scheduled","ended"].includes(s.status)))
      throw new Error("Website cancellation was not confirmed. Your account has not been deleted.");
  }
  const after=await call("GET");
  if(after.some((s:any)=>s.provider==="stripe"&&!["scheduled","ended"].includes(s.status)))
    throw new Error("A website subscription is still renewing. Your account has not been deleted.");
  return {websiteRenewalStopped:true,appleCancellationRequired:after.some((s:any)=>s.provider==="apple"&&s.status!=="ended")};
}

Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS")return new Response(null,{status:204,headers:corsHeaders});
  if(req.method!=="POST")return json({ok:false,error:"POST only"},405);
  try{
    const auth=req.headers.get("authorization")||"";
    const token=auth.toLowerCase().startsWith("bearer ")?auth.slice(7).trim():"";
    if(!token)return json({ok:false,error:"Authentication required"},401);
    const url=Deno.env.get("SUPABASE_URL")||"";
    const secret=envKey("SUPABASE_SECRET_KEYS","SUPABASE_SERVICE_ROLE_KEY");
    const publishable=envKey("SUPABASE_PUBLISHABLE_KEYS","SUPABASE_ANON_KEY")||secret;
    if(!url||!secret||!publishable)return json({ok:false,error:"Account deletion service is not configured"},503);

    const ur=await fetch(`${url}/auth/v1/user`,{headers:{apikey:publishable,authorization:`Bearer ${token}`}});
    const user=await ur.json().catch(()=>null);
    if(!ur.ok||!user?.id)return json({ok:false,error:"Your session is invalid or expired"},401);

    const live=await fetch(`${url}/rest/v1/rpc/mw_current_session_active`,{method:"POST",headers:{apikey:publishable,authorization:`Bearer ${token}`,"content-type":"application/json"},body:"{}"});
    if(!live.ok||await live.json().catch(()=>false)!==true)return json({ok:false,error:"Your session is invalid or expired"},401);
    const userHeaders={apikey:publishable,authorization:`Bearer ${token}`,"content-type":"application/json"};
    const base=adminHeaders(secret,{"content-type":"application/json"});
    const pr=await fetch(`${url}/rest/v1/profiles?user_id=eq.${encodeURIComponent(user.id)}&select=role&limit=1`,{headers:userHeaders});
    if(!pr.ok)return json({ok:false,error:"Your account type could not be verified. Try again shortly."},503);
    const rows=await pr.json().catch(()=>null);
    if(!Array.isArray(rows)||(rows.length>0&&(typeof rows[0]?.role!=="string"||!rows[0].role.trim())))return json({ok:false,error:"Your account type could not be verified. Try again shortly."},503);
    const role=rows[0]?.role;
    if(role==="founder_owner"||role==="admin")return json({ok:false,error:"Founder and administrator accounts must be transferred or removed through MW administration."},403);

    if(!role||role==="athlete"){
      // Only require the website cancellation bridge when MW's canonical billing
      // table shows a Stripe subscription that can still renew. Free/dummy athletes
      // should not be blocked by an unavailable legacy billing endpoint.
      const billingCheck=await fetch(`${url}/rest/v1/billing_subscriptions?or=(beneficiary_user_id.eq.${encodeURIComponent(user.id)},payer_user_id.eq.${encodeURIComponent(user.id)})&provider=eq.stripe&status=in.(trialing,active,past_due,cancel_at_period_end)&select=id,status`,{headers:base});
      if(!billingCheck.ok)return json({ok:false,error:"Your subscription status could not be verified. Try again shortly; your account has not been deleted."},503);
      const billingRows=await billingCheck.json().catch(()=>null);
      if(!Array.isArray(billingRows))return json({ok:false,error:"Your subscription status could not be verified. Try again shortly; your account has not been deleted."},503);
      let billing={websiteRenewalStopped:true,appleCancellationRequired:false};
      if(billingRows.length){
        try{billing=await stopWebsiteRenewals(token,user.id)}catch(e){return json({ok:false,error:(e as Error).message||"Payment cancellation could not be confirmed. Your account has not been deleted."},503)}
      }
      const dr=await fetch(`${url}/auth/v1/admin/users/${encodeURIComponent(user.id)}`,{method:"DELETE",headers:base});
      const out=await dr.json().catch(()=>null);
      if(!dr.ok)return json({ok:false,error:out?.msg||out?.message||"Account deletion failed"},500);
      return json({ok:true,deleted:true,role:"athlete",billing});
    }

    if(role==="coach"){
      const existingRes=await fetch(`${url}/rest/v1/account_deletion_requests?user_id=eq.${encodeURIComponent(user.id)}&status=eq.requested&select=id,requested_at&limit=1`,{headers:userHeaders});
      if(!existingRes.ok)return json({ok:false,error:"Your existing deletion requests could not be checked. Try again shortly."},503);
      const existing=await existingRes.json().catch(()=>null);
      if(!Array.isArray(existing)||(existing.length>0&&!existing[0]?.id))return json({ok:false,error:"Your existing deletion requests could not be checked. Try again shortly."},503);
      let billing;try{billing=await stopWebsiteRenewals(token,user.id)}catch(e){return json({ok:false,error:(e as Error).message||"Payment cancellation could not be confirmed. Your account has not been deleted."},503)}
      if(Array.isArray(existing)&&existing[0])return json({ok:true,requested:true,role:"coach",billing,request_id:existing[0].id,requested_at:existing[0].requested_at});
      const rr=await fetch(`${url}/rest/v1/account_deletion_requests`,{method:"POST",headers:{...userHeaders,Prefer:"return=representation"},body:JSON.stringify({user_id:user.id,athlete_id:null,status:"requested"})});
      const requestRows=await rr.json().catch(()=>[]);
      if(!rr.ok)return json({ok:false,error:"Coach account deletion request could not be created."},500);
      return json({ok:true,requested:true,role:"coach",billing,request_id:Array.isArray(requestRows)?requestRows[0]?.id:null,requested_at:Array.isArray(requestRows)?requestRows[0]?.requested_at:null});
    }
    return json({ok:false,error:"This account type cannot be deleted from the app."},403);
  }catch(e){console.error("MW account deletion error",e);return json({ok:false,error:"MW account deletion failed"},500)}
});
