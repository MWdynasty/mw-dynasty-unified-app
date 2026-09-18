const {getAccountContext,SUPABASE_URL,SUPABASE_KEY}=require('../../lib/mw-coach-auth');

async function rest(path,token,options={}){
  const r=await fetch(`${SUPABASE_URL}/rest/v1/${path}`,{...options,headers:{apikey:SUPABASE_KEY,Authorization:`Bearer ${token}`,'Content-Type':'application/json',Prefer:'return=representation',...(options.headers||{})}});
  const d=await r.json().catch(()=>[]);
  if(!r.ok)throw Object.assign(new Error(d?.message||d?.hint||'Practice timing request failed'),{status:r.status});
  return d;
}
module.exports=async(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  try{
    const c=await getAccountContext(req),role=String(c.profile.role||'');
    if(!['founder_owner','admin','coach'].includes(role))return res.status(403).json({error:'Coach access required'});
    if(req.method==='POST'){
      const b=req.body||{},results=Array.isArray(b.results)?b.results:[];
      if(!results.length)return res.status(400).json({error:'No timing results supplied'});
      if(results.length>200)return res.status(400).json({error:'Too many timing results in one save'});
      const rows=results.map(x=>({
        coach_user_id:c.user.id,
        athlete_id:String(x.athleteId||''),
        session_date:String(x.sessionDate||new Date().toISOString().slice(0,10)),
        group_name:String(x.groupName||'All').slice(0,80),
        rep_number:Math.max(1,Number(x.repNumber)||1),
        time_seconds:Number(Number(x.timeSeconds).toFixed(3)),
        target_seconds:Number(x.targetSeconds)>0?Number(Number(x.targetSeconds).toFixed(3)):null,
        pace_status:['fast','on_pace','slow'].includes(x.paceStatus)?x.paceStatus:null
      }));
      if(rows.some(x=>!x.athlete_id||!Number.isFinite(x.time_seconds)||x.time_seconds<=0))return res.status(400).json({error:'Invalid timing result'});
      const saved=await rest('coach_practice_timing_results',c.token,{method:'POST',body:JSON.stringify(rows)});
      return res.status(200).json({ok:true,count:Array.isArray(saved)?saved.length:rows.length});
    }
    if(req.method==='GET'){
      const rows=await rest(`coach_practice_timing_results?select=id,athlete_id,session_date,group_name,rep_number,time_seconds,target_seconds,pace_status,created_at&coach_user_id=eq.${encodeURIComponent(c.user.id)}&order=created_at.desc&limit=200`,c.token);
      return res.status(200).json({ok:true,results:rows});
    }
    return res.status(405).json({error:'GET or POST only'});
  }catch(e){return res.status(e.status||500).json({error:e.message||'Practice timing request failed'})}
};