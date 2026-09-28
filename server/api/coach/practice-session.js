const {getAccountContext,SUPABASE_URL,SUPABASE_KEY}=require('../../lib/mw-coach-auth');

async function rest(path,token,options={}){
  const r=await fetch(`${SUPABASE_URL}/rest/v1/${path}`,{...options,headers:{apikey:SUPABASE_KEY,Authorization:`Bearer ${token}`,'Content-Type':'application/json',Prefer:'return=representation',...(options.headers||{})}});
  const d=await r.json().catch(()=>[]);
  if(!r.ok)throw Object.assign(new Error(d?.message||d?.hint||'Practice session request failed'),{status:r.status});
  return d;
}
module.exports=async(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  try{
    const c=await getAccountContext(req),role=String(c.profile.role||'');
    if(!['founder_owner','admin','coach'].includes(role))return res.status(403).json({error:'Coach access required'});
    if(req.method==='POST'){
      const b=req.body||{},scope=['boys','girls','all'].includes(b.rosterScope)?b.rosterScope:'all',lanes=Math.min(9,Math.max(1,Number(b.laneCapacity)||8));
      const timing=['coach','athlete','sensor','manual'].includes(b.timingAuthority)?b.timingAuthority:'coach';
      const rows=await rest('coach_practice_sessions',c.token,{method:'POST',body:JSON.stringify([{coach_user_id:c.user.id,workout_id:b.workoutId||null,roster_scope:scope,lane_capacity:lanes,timing_authority:timing,prescription_snapshot:b.prescriptionSnapshot||{}}])});
      return res.status(201).json({ok:true,session:rows[0]||null});
    }
    if(req.method==='PATCH'){
      const b=req.body||{},id=String(b.sessionId||'').trim(),status=String(b.status||'');
      if(!id||!['active','completed','finalized'].includes(status))return res.status(400).json({error:'Valid sessionId and status required'});
      const patch={status,updated_at:new Date().toISOString()};
      if(status==='completed')patch.completed_at=new Date().toISOString();
      if(status==='finalized')patch.finalized_at=new Date().toISOString();
      const rows=await rest(`coach_practice_sessions?id=eq.${encodeURIComponent(id)}&coach_user_id=eq.${encodeURIComponent(c.user.id)}`,c.token,{method:'PATCH',body:JSON.stringify(patch)});
      return res.status(200).json({ok:true,session:rows[0]||null});
    }
    if(req.method==='GET'){
      const id=String(req.query?.sessionId||'').trim();
      const filter=id?`&id=eq.${encodeURIComponent(id)}`:'';
      const rows=await rest(`coach_practice_sessions?select=*&coach_user_id=eq.${encodeURIComponent(c.user.id)}${filter}&order=created_at.desc&limit=50`,c.token);
      return res.status(200).json({ok:true,sessions:rows});
    }
    return res.status(405).json({error:'GET, POST, or PATCH only'});
  }catch(e){return res.status(e.status||500).json({error:e.message||'Practice session request failed'})}
};