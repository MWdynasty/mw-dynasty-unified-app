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
  try{
    const parsed=JSON.parse(raw);
    if(parsed?.default)return String(parsed.default);
  }catch{}
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
async function sha256(v:string){
  const bytes=new TextEncoder().encode(v);
  const digest=await crypto.subtle.digest("SHA-256",bytes);
  return Array.from(new Uint8Array(digest)).map(b=>b.toString(16).padStart(2,"0")).join("");
}
async function sameSecret(a:string,b:string){
  if(!a||!b)return false;
  const [x,y]=await Promise.all([sha256(a),sha256(b)]);
  return x===y;
}

Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS")return J({ok:true});
  if(req.method!=="POST")return J({ok:false,error:"POST only"},405);

  const url=Deno.env.get("SUPABASE_URL")||"";
  const secret=secretKey();
  if(!url||!secret)return J({ok:false,error:"Autonomy service is not configured."},503);

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
    const workerSecret=String(await rpc("mw_autonomy_worker_secret",{})||"");
    const auth=req.headers.get("authorization")||"";
    const incoming=auth.toLowerCase().startsWith("bearer ")?auth.slice(7).trim():"";
    if(!await sameSecret(incoming,workerSecret))return J({ok:false,error:"Autonomy scheduler authorization failed."},401);

    const cycle=await rpc("mw_autonomy_begin_cycle",{p_limit:null});
    const cycleId=String(cycle?.cycle_id||"");
    const tasks=Array.isArray(cycle?.tasks)?cycle.tasks:[];
    if(!cycle?.enabled)return J({ok:true,status:"paused",cycle_id:cycleId,claimed:0});
    if(!tasks.length)return J({ok:true,status:"idle",cycle_id:cycleId,claimed:0,signals_created:Number(cycle?.signals_created||0)});

    const workerUrl="https://app.mwdynasty.com/api/founder/autonomous-task";
    const runOne=async(item:any)=>{
      const task=item?.task||{};
      const ctl=new AbortController();
      const timer=setTimeout(()=>ctl.abort(),55000);
      try{
        const r=await fetch(workerUrl,{
          method:"POST",
          signal:ctl.signal,
          headers:{
            "content-type":"application/json",
            "authorization":`Bearer ${workerSecret}`,
            "x-mw-autonomy-cycle":cycleId
          },
          body:JSON.stringify({
            task,
            agent:item?.agent||{},
            prior_work:Array.isArray(item?.prior_work)?item.prior_work:[]
          })
        });
        const d=await r.json().catch(()=>({}));
        if(!r.ok)throw new Error(d?.error||`Worker failed (${r.status})`);
        await rpc("mw_autonomy_complete_task",{
          p_task_id:String(task.id),
          p_cycle_id:cycleId,
          p_output:String(d?.answer||""),
          p_model:String(d?.model||"gpt-5.6-sol"),
          p_review:d?.review||null
        });
        return {task_id:task.id,status:"completed"};
      }catch(e){
        const message=e instanceof Error?e.message:"Autonomous task failed";
        await rpc("mw_autonomy_fail_task",{
          p_task_id:String(task.id),
          p_cycle_id:cycleId,
          p_error:message.slice(0,1500)
        }).catch(()=>null);
        return {task_id:task.id,status:"failed",error:message};
      }finally{clearTimeout(timer)}
    };

    const results=await Promise.all(tasks.map(runOne));
    const completed=results.filter(x=>x.status==="completed").length;
    const failed=results.length-completed;
    return J({ok:failed===0,status:failed?"partial":"completed",cycle_id:cycleId,claimed:tasks.length,completed,failed,results});
  }catch(e){
    console.error("MW Founder autonomy loop error",e);
    return J({ok:false,error:e instanceof Error?e.message:"Autonomy loop failed."},500);
  }
});
