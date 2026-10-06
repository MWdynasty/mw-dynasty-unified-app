const {authenticate,SUPABASE_URL,SUPABASE_KEY}=require('../lib/mw-auth');
const {VERSION,permissions}=require('../lib/mw-ai-consent');
module.exports=async(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  try{
    const {token,user}=await authenticate(req);
    if(req.method==='GET'){
      const [p,r]=await Promise.all([permissions(token,user.id),fetch(`${SUPABASE_URL}/rest/v1/profiles?select=role&user_id=eq.${encodeURIComponent(user.id)}&limit=1`,{headers:{apikey:SUPABASE_KEY,Authorization:`Bearer ${token}`}})]);
      if(!r.ok)throw Object.assign(new Error('Account role unavailable.'),{status:503});
      const rows=await r.json();return res.status(200).json({...p,role:rows?.[0]?.role||'athlete',policyVersion:VERSION,provider:'OpenAI'});
    }
    if(req.method!=='POST')return res.status(405).json({error:'GET or POST only'});
    const b=typeof req.body==='string'?JSON.parse(req.body):(req.body||{});
    if(b.policyVersion!==VERSION||typeof b.ownAI!=='boolean'||typeof b.coachAI!=='boolean')return res.status(400).json({error:'Review the current AI sharing choices before saving.'});
    const r=await fetch(`${SUPABASE_URL}/rest/v1/ai_sharing_permissions?on_conflict=user_id`,{method:'POST',headers:{apikey:SUPABASE_KEY,Authorization:`Bearer ${token}`,'Content-Type':'application/json',Prefer:'resolution=merge-duplicates,return=minimal'},body:JSON.stringify({user_id:user.id,own_ai:b.ownAI,coach_ai:b.coachAI,policy_version:VERSION,updated_at:new Date().toISOString()})});
    if(!r.ok)throw Object.assign(new Error('Sharing choices could not be saved.'),{status:503});
    return res.status(200).json({ok:true,...await permissions(token,user.id),policyVersion:VERSION});
  }catch(e){return res.status(e.status||500).json({error:e.message||'AI sharing request failed.'})}
};
