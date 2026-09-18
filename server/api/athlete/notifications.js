const {getAthleteContext,SUPABASE_URL,SUPABASE_KEY}=require('../../lib/mw-auth');

async function rest(path,token,{method='GET',body=null,prefer='return=representation'}={}){
  const r=await fetch(`${SUPABASE_URL}/rest/v1/${path}`,{
    method,
    headers:{apikey:SUPABASE_KEY,Authorization:`Bearer ${token}`,'Content-Type':'application/json',Prefer:prefer},
    body:body?JSON.stringify(body):undefined
  });
  const d=await r.json().catch(()=>null);
  if(!r.ok)throw Object.assign(new Error(d?.message||d?.hint||`Notification request failed (${r.status})`),{status:r.status});
  return d;
}

module.exports=async(req,res)=>{
  res.setHeader('Cache-Control','no-store, private');
  try{
    const c=await getAthleteContext(req);
    if(req.method==='GET'){
      const rows=await rest(`athlete_notifications?athlete_id=eq.${encodeURIComponent(c.athlete.id)}&select=id,notification_type,title,body,action_view,entity_type,entity_id,read_at,created_at&order=created_at.desc&limit=50`,c.token);
      const items=Array.isArray(rows)?rows:[];
      return res.status(200).json({ok:true,unread:items.filter(x=>!x.read_at).length,items});
    }
    if(req.method==='POST'){
      const b=typeof req.body==='string'?JSON.parse(req.body||'{}'):(req.body||{});
      if(b.action==='mark_all_read'){
        await rest(`athlete_notifications?athlete_id=eq.${encodeURIComponent(c.athlete.id)}&read_at=is.null`,c.token,{method:'PATCH',body:{read_at:new Date().toISOString()},prefer:'return=minimal'});
        return res.status(200).json({ok:true});
      }
      if(b.action==='mark_read'&&b.id){
        await rest(`athlete_notifications?id=eq.${encodeURIComponent(String(b.id))}&athlete_id=eq.${encodeURIComponent(c.athlete.id)}`,c.token,{method:'PATCH',body:{read_at:new Date().toISOString()},prefer:'return=minimal'});
        return res.status(200).json({ok:true});
      }
      return res.status(400).json({error:'Unsupported notification action'});
    }
    return res.status(405).json({error:'GET or POST only'});
  }catch(e){return res.status(e.status||500).json({error:e.message||'Athlete notifications unavailable.'})}
};
