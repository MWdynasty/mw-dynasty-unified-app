import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store"}});
function envKey(modern:string,legacy:string){const raw=Deno.env.get(modern)||"";if(raw){try{const p=JSON.parse(raw);if(p?.default)return String(p.default)}catch{}}return Deno.env.get(legacy)||""}
function adminHeaders(key:string,extra:Record<string,string>={}){const h:Record<string,string>={apikey:key,...extra};if(!key.startsWith("sb_secret_"))h.authorization=`Bearer ${key}`;return h}

Deno.serve(async(req:Request)=>{
  if(req.method!=="POST")return json({ok:false,error:"POST only"},405);
  try{
    const auth=req.headers.get("authorization")||"";const token=auth.toLowerCase().startsWith("bearer ")?auth.slice(7).trim():"";
    if(!token)return json({ok:false,error:"Authentication required"},401);
    const url=Deno.env.get("SUPABASE_URL")||"";
    const secret=envKey("SUPABASE_SECRET_KEYS","SUPABASE_SERVICE_ROLE_KEY");
    const publishable=envKey("SUPABASE_PUBLISHABLE_KEYS","SUPABASE_ANON_KEY")||secret;
    if(!url||!secret||!publishable)return json({ok:false,error:"Administration service is not configured"},503);
    const ur=await fetch(`${url}/auth/v1/user`,{headers:{apikey:publishable,authorization:`Bearer ${token}`}});const caller=await ur.json().catch(()=>null);
    if(!ur.ok||!caller?.id)return json({ok:false,error:"Your session is invalid or expired"},401);
    const base=adminHeaders(secret,{"content-type":"application/json"});
    const cp=await fetch(`${url}/rest/v1/profiles?user_id=eq.${encodeURIComponent(caller.id)}&select=role,account_status&limit=1`,{headers:base});const cr=await cp.json().catch(()=>[]);const callerProfile=Array.isArray(cr)?cr[0]:null;
    if(!callerProfile||callerProfile.account_status!=="active"||!["founder_owner","admin"].includes(callerProfile.role))return json({ok:false,error:"Founder/Admin access required"},403);
    const body=await req.json().catch(()=>({}));const requestId=String(body?.request_id||"").trim();const confirm=String(body?.confirm||"");
    if(!requestId||confirm!=="DELETE")return json({ok:false,error:"A valid deletion request and confirmation are required"},400);
    const rr=await fetch(`${url}/rest/v1/account_deletion_requests?id=eq.${encodeURIComponent(requestId)}&select=id,user_id,status,requested_at&limit=1`,{headers:base});const rqRows=await rr.json().catch(()=>[]);const request=Array.isArray(rqRows)?rqRows[0]:null;
    if(!request)return json({ok:false,error:"Deletion request not found"},404);if(!["requested","processing"].includes(request.status))return json({ok:false,error:"This deletion request is no longer actionable"},409);if(request.user_id===caller.id)return json({ok:false,error:"You cannot remove your own Founder/Admin account through this workflow"},403);
    const tp=await fetch(`${url}/rest/v1/profiles?user_id=eq.${encodeURIComponent(request.user_id)}&select=role,account_status&limit=1`,{headers:base});const tr=await tp.json().catch(()=>[]);const targetProfile=Array.isArray(tr)?tr[0]:null;
    if(!targetProfile)return json({ok:false,error:"Target profile not found"},404);if(["founder_owner","admin"].includes(targetProfile.role))return json({ok:false,error:"Founder/Admin accounts cannot be deleted through this workflow"},403);
    await fetch(`${url}/rest/v1/account_deletion_requests?id=eq.${encodeURIComponent(requestId)}`,{method:"PATCH",headers:{...base,Prefer:"return=minimal"},body:JSON.stringify({status:"processing"})});
    const dr=await fetch(`${url}/auth/v1/admin/users/${encodeURIComponent(request.user_id)}`,{method:"DELETE",headers:base});const out=await dr.json().catch(()=>null);
    if(!dr.ok){await fetch(`${url}/rest/v1/account_deletion_requests?id=eq.${encodeURIComponent(requestId)}`,{method:"PATCH",headers:{...base,Prefer:"return=minimal"},body:JSON.stringify({status:"requested"})});return json({ok:false,error:out?.msg||out?.message||"Account deletion failed"},500)}
    return json({ok:true,deleted:true,role:targetProfile.role});
  }catch(e){console.error("MW admin account deletion error",e);return json({ok:false,error:"MW admin account deletion failed"},500)}
});
