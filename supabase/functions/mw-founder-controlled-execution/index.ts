import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const CORS={
  "access-control-allow-origin":"*",
  "access-control-allow-headers":"authorization, content-type",
  "access-control-allow-methods":"POST, OPTIONS",
};
const J=(body:unknown,status=200)=>new Response(JSON.stringify(body),{
  status,
  headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store",...CORS}
});

function keyFromSet(envName:string){
  const raw=Deno.env.get(envName)||"";
  if(!raw)return "";
  try{const parsed=JSON.parse(raw);if(parsed?.default)return String(parsed.default)}catch{}
  return "";
}
function secretKey(){
  return keyFromSet("SUPABASE_SECRET_KEYS")||Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
}
function elevatedHeaders(key:string,extra:Record<string,string>={}){
  const headers:Record<string,string>={apikey:key,...extra};
  if(!key.startsWith("sb_secret_"))headers.authorization=`Bearer ${key}`;
  return headers;
}
function b64urlBytes(value:string){
  const s=value.replace(/-/g,"+").replace(/_/g,"/");
  const padded=s+"=".repeat((4-s.length%4)%4);
  const raw=atob(padded);
  return Uint8Array.from(raw,c=>c.charCodeAt(0));
}
function b64urlJson(value:string){
  return JSON.parse(new TextDecoder().decode(b64urlBytes(value)));
}
async function verifyGithubOidc(token:string){
  const parts=String(token||"").split(".");
  if(parts.length!==3)throw new Error("Invalid GitHub OIDC token.");
  const header=b64urlJson(parts[0]),claims=b64urlJson(parts[1]);
  if(header?.alg!=="RS256"||!header?.kid)throw new Error("Unsupported GitHub OIDC token.");
  const jwksRes=await fetch("https://token.actions.githubusercontent.com/.well-known/jwks",{
    headers:{"accept":"application/json"}
  });
  if(!jwksRes.ok)throw new Error("GitHub OIDC key service unavailable.");
  const jwks=await jwksRes.json();
  const jwk=(jwks?.keys||[]).find((k:any)=>k.kid===header.kid);
  if(!jwk)throw new Error("GitHub OIDC signing key not found.");
  const key=await crypto.subtle.importKey(
    "jwk",jwk,
    {name:"RSASSA-PKCS1-v1_5",hash:"SHA-256"},
    false,["verify"]
  );
  const ok=await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",key,b64urlBytes(parts[2]),
    new TextEncoder().encode(parts[0]+"."+parts[1])
  );
  if(!ok)throw new Error("GitHub OIDC signature verification failed.");

  const now=Math.floor(Date.now()/1000);
  if(String(claims?.iss||"")!=="https://token.actions.githubusercontent.com")throw new Error("Untrusted OIDC issuer.");
  const aud=Array.isArray(claims?.aud)?claims.aud:[claims?.aud];
  if(!aud.includes("mw-dynasty-stage2"))throw new Error("Invalid OIDC audience.");
  if(Number(claims?.exp||0)<now-30||Number(claims?.nbf||0)>now+30)throw new Error("Expired or premature OIDC token.");
  if(String(claims?.repository||"")!=="MWdynasty/mw-dynasty-unified-app")throw new Error("Untrusted repository.");
  if(String(claims?.ref||"")!=="refs/heads/main")throw new Error("Controlled execution must originate from main.");
  const event=String(claims?.event_name||"");
  if(!["push","schedule","workflow_dispatch"].includes(event))throw new Error("Unsupported workflow trigger.");
  const workflowRef=String(claims?.workflow_ref||claims?.job_workflow_ref||"");
  if(!workflowRef.includes(".github/workflows/mw-ai-controlled-execution.yml@refs/heads/main")){
    throw new Error("Untrusted workflow identity.");
  }
  return {repository:claims.repository,ref:claims.ref,event_name:event,run_id:claims.run_id||null,actor:claims.actor||null};
}

Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS")return J({ok:true});
  if(req.method!=="POST")return J({ok:false,error:"POST only"},405);

  const url=Deno.env.get("SUPABASE_URL")||"";
  const secret=secretKey();
  if(!url||!secret)return J({ok:false,error:"Controlled execution service is not configured."},503);

  const auth=req.headers.get("authorization")||"";
  const token=auth.toLowerCase().startsWith("bearer ")?auth.slice(7).trim():"";
  let identity;
  try{identity=await verifyGithubOidc(token)}
  catch(e){return J({ok:false,error:e instanceof Error?e.message:"OIDC verification failed."},401)}

  const rpc=async(name:string,args:Record<string,unknown>={})=>{
    const r=await fetch(`${url}/rest/v1/rpc/${name}`,{
      method:"POST",
      headers:elevatedHeaders(secret,{"content-type":"application/json"}),
      body:JSON.stringify(args)
    });
    const d=await r.json().catch(()=>null);
    if(!r.ok)throw new Error((d as any)?.message||(d as any)?.hint||`${name} failed (${r.status})`);
    return d;
  };

  try{
    const body=await req.json().catch(()=>({}));
    const action=String(body?.action||"");

    if(action==="resume"){
      const resumed=await rpc("mw_execution_resume_next",{});
      return J({ok:true,identity:{event_name:identity.event_name,run_id:identity.run_id},...resumed});
    }

    if(action==="claim"){
      const claimed=await rpc("mw_execution_claim_next",{});
      return J({ok:true,identity:{event_name:identity.event_name,run_id:identity.run_id},...claimed});
    }

    if(action==="generate_patch"){
      const jobId=String(body?.job_id||"");
      if(!jobId)return J({ok:false,error:"Execution job id required."},400);
      const context=Array.isArray(body?.context)?body.context.slice(0,18).map((x:any)=>({
        path:String(x?.path||"").slice(0,500),
        content:String(x?.content||"").slice(0,18000)
      })).filter((x:any)=>x.path&&x.content):[];
      if(!context.length)return J({ok:false,error:"Repository context required."},400);

      const jobContext=await rpc("mw_execution_job_context",{p_job_id:jobId});
      const workerSecret=String(await rpc("mw_autonomy_worker_secret",{})||"");
      const r=await fetch("https://app.mwdynasty.com/api/founder/engineering-task",{
        method:"POST",
        headers:{
          "content-type":"application/json",
          "authorization":`Bearer ${workerSecret}`,
          "x-mw-execution-job":jobId
        },
        body:JSON.stringify({
          job:jobContext?.job||{},
          task:jobContext?.task||{},
          context
        })
      });
      const d=await r.json().catch(()=>({}));
      if(!r.ok)throw new Error(d?.error||`Engineering worker failed (${r.status})`);

      if(d?.disposition==="patch_ready"){
        await rpc("mw_execution_update_job",{
          p_job_id:jobId,p_state:"patch_ready",
          p_evidence:{
            summary:String(d?.summary||"").slice(0,4000),
            changed_files:Array.isArray(d?.changed_paths)?d.changed_paths.slice(0,10):[],
            expected_behavior:Array.isArray(d?.expected_behavior)?d.expected_behavior.slice(0,12):[],
            risk_notes:Array.isArray(d?.risk_notes)?d.risk_notes.slice(0,12):[],
            suggested_tests:Array.isArray(d?.suggested_tests)?d.suggested_tests.slice(0,12):[],
            github_run_id:identity.run_id
          }
        });
      }else{
        await rpc("mw_execution_update_job",{
          p_job_id:jobId,p_state:"blocked",
          p_evidence:{
            summary:String(d?.summary||"Insufficient repository evidence for a safe patch.").slice(0,4000),
            error:"Engineering worker returned blocked_evidence.",
            github_run_id:identity.run_id
          }
        });
      }
      return J({ok:true,...d});
    }

    if(action==="evidence"){
      const jobId=String(body?.job_id||""),state=String(body?.state||"");
      if(!jobId||!state)return J({ok:false,error:"Execution job id and state required."},400);
      const allowed=new Set(["committed","testing","preview_ready","qa_passed","blocked","failed","cancelled"]);
      if(!allowed.has(state))return J({ok:false,error:"Unsupported execution evidence state."},400);
      const evidence=body?.evidence&&typeof body.evidence==="object"?body.evidence:{};
      const saved=await rpc("mw_execution_update_job",{
        p_job_id:jobId,p_state:state,
        p_evidence:{...evidence,github_run_id:identity.run_id,github_event:identity.event_name}
      });
      return J({ok:true,saved});
    }

    return J({ok:false,error:"Unsupported controlled execution action."},400);
  }catch(e){
    console.error("MW controlled execution error",e);
    return J({ok:false,error:e instanceof Error?e.message:"Controlled execution failed."},500);
  }
});
