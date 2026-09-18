const {SUPABASE_URL,SUPABASE_KEY,authenticate}=require('../lib/mw-auth');

async function rpc(token,fn,body){
  const r=await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`,{
    method:'POST',
    headers:{
      apikey:SUPABASE_KEY,
      Authorization:`Bearer ${token}`,
      'Content-Type':'application/json',
      Prefer:'return=representation'
    },
    body:JSON.stringify(body||{})
  });
  const d=await r.json().catch(()=>null);
  if(!r.ok){
    const msg=d?.message||d?.hint||d?.details||`Supabase profile update failed (${r.status})`;
    throw Object.assign(new Error(msg),{status:r.status});
  }
  return d;
}

module.exports=async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='POST') return res.status(405).json({error:'POST only'});
  try{
    const {token,user}=await authenticate(req);
    const body=typeof req.body==='string'?JSON.parse(req.body||'{}'):(req.body||{});
    const firstName=String(body.first_name||'').trim().slice(0,80);
    const trainingGoal=String(body.training_goal||'').trim().slice(0,500);
    if(!firstName) return res.status(400).json({error:'First name is required.'});

    const prs={};
    for(const event of ['60m','100m','200m','300m','400m']){
      const raw=String(body?.prs?.[event]??'').trim();
      if(!raw) continue;
      const time=Number(raw);
      if(!Number.isFinite(time)||time<=0) return res.status(400).json({error:`Enter a valid ${event.toUpperCase()} PR.`});
      prs[event]=String(time);
    }

    const goalResponse=await fetch(`${SUPABASE_URL}/rest/v1/athletes?user_id=eq.${encodeURIComponent(user.id)}`,{
      method:'PATCH',
      headers:{apikey:SUPABASE_KEY,Authorization:`Bearer ${token}`,'Content-Type':'application/json',Prefer:'return=minimal'},
      body:JSON.stringify({training_goal:trainingGoal||null,updated_at:new Date().toISOString()})
    });
    if(!goalResponse.ok){
      const d=await goalResponse.json().catch(()=>null);
      throw Object.assign(new Error(d?.message||d?.hint||'Athlete goal update failed.'),{status:goalResponse.status});
    }
    const out=await rpc(token,'mw_update_athlete_profile',{p_first_name:firstName,p_prs:prs});
    const result=out&&typeof out==='object'?out:{ok:true,profile:{first_name:firstName},prs:[]};
    result.training_goal=trainingGoal;
    return res.status(200).json(result);
  }catch(e){
    return res.status(e.status||500).json({error:e.message||'MW athlete profile update failed'});
  }
};
