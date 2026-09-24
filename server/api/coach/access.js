const {coachSeasonCapabilities}=require('../../lib/mw-season-entitlements');
const {getAccountContext,SUPABASE_URL,SUPABASE_KEY}=require('../../lib/mw-coach-auth');
async function request(path,token,{method='GET',body=null}={}){const r=await fetch(`${SUPABASE_URL}/rest/v1/${path}`,{method,headers:{apikey:SUPABASE_KEY,Authorization:`Bearer ${token}`,...(body?{'Content-Type':'application/json',Prefer:'return=representation'}:{})},body:body?JSON.stringify(body):undefined});const d=await r.json().catch(()=>method==='PATCH'?[]:[]);if(!r.ok)throw new Error(d.message||'Access query failed');return d}
function clean(value,max){return String(value??'').trim().slice(0,max)}
module.exports=async(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  if(!['GET','PATCH'].includes(req.method))return res.status(405).json({error:'GET or PATCH only'});
  try{
    const c=await getAccountContext(req),role=String(c.profile.role||'');
    if(!['coach','founder_owner','admin'].includes(role))return res.status(403).json({error:'Coach access required'});
    if(req.method==='PATCH'){
      const b=req.body||{},firstName=clean(b.firstName,80),lastName=clean(b.lastName,80),organization=clean(b.organization,160),coachTitle=clean(b.coachTitle,120);
      if(!firstName||!lastName)return res.status(400).json({error:'First and last name are required.'});
      const result=await request('rpc/mw_update_coach_profile',c.token,{method:'POST',body:{p_first_name:firstName,p_last_name:lastName,p_organization:organization||null,p_coach_title:coachTitle||null}});
      return res.status(200).json({ok:true,firstName:result?.firstName||firstName,lastName:result?.lastName||lastName,organization:result?.organization||'',coachTitle:result?.coachTitle||'',email:c.user.email||''});
    }
    let tier='mw_sprint_performance',isFounder=role==='founder_owner';
    if(role==='coach'){const rows=await request(`coach_access_entitlements?select=access_tier,status&coach_user_id=eq.${encodeURIComponent(c.user.id)}&status=eq.active&limit=1`,c.token);const e=Array.isArray(rows)?rows[0]:null;if(!e)return res.status(403).json({error:'This coach account does not have an active MW Coach entitlement.'});tier=e.access_tier}
    return res.status(200).json({
      ok:true,role,tier,isFounder,firstName:c.profile.first_name||'',lastName:c.profile.last_name||'',
      organization:c.profile.coach_organization||'',coachTitle:c.profile.coach_title||'',email:c.user.email||'',
      features:coachSeasonCapabilities(tier,role)
    });
  }catch(e){return res.status(e.status||500).json({error:e.message})}
};
