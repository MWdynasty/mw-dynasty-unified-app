const {getAccountContext,SUPABASE_URL,SUPABASE_KEY}=require('../../lib/mw-coach-auth');
async function rest(path,token,{method='GET',body=null,prefer='return=representation'}={}){
  const r=await fetch(`${SUPABASE_URL}/rest/v1/${path}`,{method,headers:{apikey:SUPABASE_KEY,Authorization:`Bearer ${token}`,'Content-Type':'application/json',Prefer:prefer},body:body?JSON.stringify(body):undefined});
  const d=await r.json().catch(()=>null);if(!r.ok)throw Object.assign(new Error(d?.message||d?.hint||`Notification request failed (${r.status})`),{status:r.status});return d;
}
module.exports=async(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  try{
    const c=await getAccountContext(req);const role=String(c.profile.role||'');
    if(!['coach','admin','founder_owner'].includes(role))return res.status(403).json({error:'Coach access required'});
    if(req.method==='GET'){
      const rows=await rest(`coach_notifications?select=id,notification_type,title,body,action_page,entity_type,entity_id,read_at,created_at&coach_user_id=eq.${encodeURIComponent(c.user.id)}&order=created_at.desc&limit=50`,c.token);
      const items=Array.isArray(rows)?rows:[];return res.status(200).json({ok:true,unread:items.filter(x=>!x.read_at).length,items});
    }
    if(req.method==='POST'){
      const body=typeof req.body==='string'?JSON.parse(req.body||'{}'):(req.body||{});
      if(body.action==='mark_all_read'){
        await rest(`coach_notifications?coach_user_id=eq.${encodeURIComponent(c.user.id)}&read_at=is.null`,c.token,{method:'PATCH',body:{read_at:new Date().toISOString()},prefer:'return=minimal'});
        return res.status(200).json({ok:true});
      }
      if(body.action==='mark_read'&&body.id){
        await rest(`coach_notifications?id=eq.${encodeURIComponent(body.id)}&coach_user_id=eq.${encodeURIComponent(c.user.id)}`,c.token,{method:'PATCH',body:{read_at:new Date().toISOString()},prefer:'return=minimal'});
        return res.status(200).json({ok:true});
      }
      return res.status(400).json({error:'Unsupported notification action'});
    }
    return res.status(405).json({error:'GET or POST only'});
  }catch(e){return res.status(e.status||500).json({error:e.message||'Notifications unavailable.'})}
};
