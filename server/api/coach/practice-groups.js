const {getAccountContext,SUPABASE_URL,SUPABASE_KEY}=require('../../lib/mw-coach-auth');
async function rest(path,token,options={}){
 const r=await fetch(`${SUPABASE_URL}/rest/v1/${path}`,{...options,headers:{apikey:SUPABASE_KEY,Authorization:`Bearer ${token}`,'Content-Type':'application/json',Prefer:'return=representation',...(options.headers||{})}});
 const d=await r.json().catch(()=>[]); if(!r.ok)throw Object.assign(new Error(d?.message||d?.hint||'Practice group request failed'),{status:r.status}); return d;
}
module.exports=async(req,res)=>{
 res.setHeader('Cache-Control','no-store');
 try{
  const c=await getAccountContext(req),role=String(c.profile.role||'');
  if(!['founder_owner','admin','coach'].includes(role))return res.status(403).json({error:'Coach access required'});
  if(req.method==='POST'){
   const b=req.body||{},sessionId=String(b.sessionId||''),division=['boys','girls','open'].includes(b.division)?b.division:'open',label=String(b.groupLabel||'A').slice(0,20),cap=Math.min(9,Math.max(1,Number(b.laneCapacity)||8));
   if(!sessionId)return res.status(400).json({error:'sessionId required'});
   const own=await rest(`coach_practice_sessions?select=id&id=eq.${encodeURIComponent(sessionId)}&coach_user_id=eq.${encodeURIComponent(c.user.id)}`,c.token); if(!own.length)return res.status(404).json({error:'Session not found'});
   const groups=await rest('coach_practice_groups',c.token,{method:'POST',body:JSON.stringify([{session_id:sessionId,division,group_label:label,lane_capacity:cap}])});
   const group=groups[0],assignments=Array.isArray(b.assignments)?b.assignments:[];
   if(assignments.length){
    if(assignments.some(x=>!x.athleteId||!(Number(x.laneNumber)>=1&&Number(x.laneNumber)<=cap)))return res.status(400).json({error:'Invalid lane assignment'});
    await rest('coach_practice_lane_assignments',c.token,{method:'POST',body:JSON.stringify(assignments.map(x=>({group_id:group.id,athlete_id:String(x.athleteId),lane_number:Number(x.laneNumber),active:true})))});
   }
   return res.status(201).json({ok:true,group});
  }
  if(req.method==='PATCH'){
   const b=req.body||{},groupId=String(b.groupId||''),assignments=Array.isArray(b.assignments)?b.assignments:[];
   if(!groupId||!assignments.length)return res.status(400).json({error:'groupId and assignments required'});
   await rest(`coach_practice_lane_assignments?group_id=eq.${encodeURIComponent(groupId)}&active=eq.true`,c.token,{method:'PATCH',body:JSON.stringify({active:false,updated_at:new Date().toISOString()})});
   const rows=await rest('coach_practice_lane_assignments',c.token,{method:'POST',body:JSON.stringify(assignments.map(x=>({group_id:groupId,athlete_id:String(x.athleteId),lane_number:Number(x.laneNumber),active:true})))});
   return res.status(200).json({ok:true,assignments:rows});
  }
  if(req.method==='GET'){
   const sessionId=String(req.query?.sessionId||''); if(!sessionId)return res.status(400).json({error:'sessionId required'});
   const groups=await rest(`coach_practice_groups?select=*,coach_practice_lane_assignments(*)&session_id=eq.${encodeURIComponent(sessionId)}&order=division,group_label`,c.token);
   return res.status(200).json({ok:true,groups});
  }
  return res.status(405).json({error:'GET, POST, or PATCH only'});
 }catch(e){return res.status(e.status||500).json({error:e.message||'Practice group request failed'})}
};