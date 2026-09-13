const {getAccountContext,SUPABASE_URL,SUPABASE_KEY}=require('../../lib/mw-coach-auth');
async function reqj(path,token,opts={}){
  const r=await fetch(`${SUPABASE_URL}/rest/v1/${path}`,{...opts,headers:{apikey:SUPABASE_KEY,Authorization:`Bearer ${token}`,...(opts.headers||{})}});
  const d=await r.json().catch(()=>[]);
  if(!r.ok)throw Object.assign(new Error(d?.message||'Attendance request failed'),{status:r.status});
  return d;
}
module.exports=async(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  try{
    const c=await getAccountContext(req);
    if(!['founder_owner','admin','coach'].includes(c.profile.role))return res.status(403).json({error:'Coach access required'});
    if(req.method==='GET'){
      const date=String(req.query?.date||new Date().toISOString().slice(0,10));
      const records=await reqj(`attendance_records?select=id,athlete_id,team_id,attendance_date,session_name,status,coach_note,recorded_by&attendance_date=eq.${encodeURIComponent(date)}&order=created_at.asc`,c.token);
      return res.status(200).json({date,records});
    }
    if(req.method==='POST'){
      const b=typeof req.body==='string'?JSON.parse(req.body):req.body||{};
      if(!b.athleteId)return res.status(400).json({error:'athleteId required'});
      const allowed=['present','absent','excused','injured','late'];
      const status=String(b.status||'present').toLowerCase();
      if(!allowed.includes(status))return res.status(400).json({error:'Invalid attendance status'});
      const row={athlete_id:b.athleteId,team_id:b.teamId||null,attendance_date:b.sessionDate||new Date().toISOString().slice(0,10),session_name:b.sessionType||'training',status,coach_note:b.note||null,recorded_by:c.user.id,updated_at:new Date().toISOString()};
      const data=await reqj('attendance_records?on_conflict=athlete_id,attendance_date,session_name',c.token,{method:'POST',headers:{'Content-Type':'application/json','Prefer':'resolution=merge-duplicates,return=representation'},body:JSON.stringify(row)});
      return res.status(200).json({ok:true,row:data[0]||null});
    }
    return res.status(405).json({error:'GET or POST only'});
  }catch(e){return res.status(e.status||500).json({error:e.message})}
};
