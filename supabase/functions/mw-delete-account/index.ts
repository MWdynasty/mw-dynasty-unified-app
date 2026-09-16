import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store"}});
function envKey(modern:string,legacy:string){const raw=Deno.env.get(modern)||"";if(raw){try{const p=JSON.parse(raw);if(p?.default)return String(p.default)}catch{}}return Deno.env.get(legacy)||""}
function adminHeaders(key:string,extra:Record<string,string>={}){const h:Record<string,string>={apikey:key,...extra};if(!key.startsWith("sb_secret_"))h.authorization=`Bearer ${key}`;return h}

Deno.serve(async(req:Request)=>{
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

    const base=adminHeaders(secret,{"content-type":"application/json"});
    const pr=await fetch(`${url}/rest/v1/profiles?user_id=eq.${encodeURIComponent(user.id)}&select=role&limit=1`,{headers:base});
    const rows=await pr.json().catch(()=>[]);const role=Array.isArray(rows)?rows[0]?.role:null;
    if(role==="founder_owner"||role==="admin")return json({ok:false,error:"Founder and administrator accounts must be transferred or removed through MW administration."},403);

    if(!role||role==="athlete"){
      const dr=await fetch(`${url}/auth/v1/admin/users/${encodeURIComponent(user.id)}`,{method:"DELETE",headers:base});
      const out=await dr.json().catch(()=>null);
      if(!dr.ok)return json({ok:false,error:out?.msg||out?.message||"Account deletion failed"},500);
      return json({ok:true,deleted:true,role:"athlete"});
    }

    if(role==="coach"){
      const existingRes=await fetch(`${url}/rest/v1/account_deletion_requests?user_id=eq.${encodeURIComponent(user.id)}&status=eq.requested&select=id,requested_at&limit=1`,{headers:base});
      const existing=await existingRes.json().catch(()=>[]);
      if(Array.isArray(existing)&&existing[0])return json({ok:true,requested:true,role:"coach",request_id:existing[0].id,requested_at:existing[0].requested_at});
      const rr=await fetch(`${url}/rest/v1/account_deletion_requests`,{method:"POST",headers:{...base,Prefer:"return=representation"},body:JSON.stringify({user_id:user.id,athlete_id:null,status:"requested"})});
      const requestRows=await rr.json().catch(()=>[]);
      if(!rr.ok)return json({ok:false,error:"Coach account deletion request could not be created."},500);
      return json({ok:true,requested:true,role:"coach",request_id:Array.isArray(requestRows)?requestRows[0]?.id:null,requested_at:Array.isArray(requestRows)?requestRows[0]?.requested_at:null});
    }
    return json({ok:false,error:"This account type cannot be deleted from the app."},403);
  }catch(e){console.error("MW account deletion error",e);return json({ok:false,error:"MW account deletion failed"},500)}
});
