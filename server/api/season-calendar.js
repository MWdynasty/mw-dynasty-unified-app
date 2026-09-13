const {authenticate}=require('../lib/mw-auth');
const {SUPABASE_URL,SUPABASE_KEY}=require('../lib/mw-auth');
const {effectiveCalendar}=require('../lib/mw-season-calendar');

async function rest(path,token,opts={}){
  const r=await fetch(`${SUPABASE_URL}/rest/v1/${path}`,{...opts,headers:{apikey:SUPABASE_KEY,Authorization:`Bearer ${token}`,'Content-Type':'application/json',...(opts.headers||{})}});
  const d=await r.json().catch(()=>null);
  if(!r.ok)throw Object.assign(new Error(d?.message||d?.hint||`Supabase request failed (${r.status})`),{status:r.status});
  return d;
}
module.exports=async function handler(req,res){
  res.setHeader('Cache-Control','no-store, private');
  try{
    const {token,user}=await authenticate(req);
    if(req.method==='GET'){
      const calendar=await effectiveCalendar(token);
      return res.status(200).json({ok:true,calendar});
    }
    if(req.method!=='POST')return res.status(405).json({error:'GET or POST only'});
    const profileRows=await rest(`profiles?select=role,account_status&user_id=eq.${encodeURIComponent(user.id)}&limit=1`,token,{method:'GET'});
    const p=Array.isArray(profileRows)?profileRows[0]:null;
    if(!p||p.account_status!=='active'||!['coach','admin','founder_owner'].includes(String(p.role)))return res.status(403).json({error:'Coach access required'});
    const b=typeof req.body==='string'?JSON.parse(req.body||'{}'):(req.body||{});
    const mode=b.mode==='custom'?'custom':'standard';
    const startDate=mode==='custom'?String(b.startDate||''):null;
    if(mode==='custom'&&!/^\d{4}-\d{2}-\d{2}$/.test(startDate))return res.status(400).json({error:'Choose a valid custom season start date'});
    const payload={coach_user_id:user.id,calendar_mode:mode,season_start_date:startDate,updated_at:new Date().toISOString()};
    await rest('coach_season_settings?on_conflict=coach_user_id',token,{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=minimal'},body:JSON.stringify(payload)});
    const calendar=await effectiveCalendar(token);
    return res.status(200).json({ok:true,calendar});
  }catch(e){return res.status(e.status||500).json({error:e.message||'Season calendar could not be saved'})}
};
