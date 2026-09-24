const {SUPABASE_URL,SUPABASE_KEY,authenticate,getAccountContext}=require('../lib/mw-auth');
const {programWeek}=require('../lib/mw-program-service');

function strengthDayFromTitle(title=''){
  const x=String(title).trim().toUpperCase();
  if(x.startsWith('MON')||x.startsWith('EARLY WEEK'))return 1;
  if(x.startsWith('TUE'))return 2;
  if(x.startsWith('WED'))return 3;
  if(x.startsWith('THU'))return 4;
  if(x.startsWith('FRI')||x.startsWith('LATE WEEK'))return 5;
  if(x.startsWith('SAT'))return 6;
  if(x.startsWith('SUN'))return 7;
  return null;
}
function buildStrengthSchedule(state){
  const starting=Math.max(1,Math.min(41,Number(state?.starting_week||state?.current_week||1)));
  const current=Math.max(starting,Math.min(41,Number(state?.current_week||starting)));
  const out=[];
  for(let week=starting;week<=current;week++){
    const strength=programWeek(week,'foundation','foundation')?.strength;
    const days=new Map();
    for(const section of (strength?.sections||[])){
      const day=strengthDayFromTitle(section?.title);
      if(!day)continue;
      const optional=/\bOPTIONAL\b/i.test(String(section?.title||''));
      const existing=days.get(day);
      if(!existing){
        days.set(day,{week,day,label:String(section?.title||`Day ${day}`).slice(0,80),optional});
      }else{
        existing.optional=existing.optional&&optional;
        if(existing.optional&&!optional)existing.label=String(section?.title||existing.label).slice(0,80);
      }
    }
    out.push(...days.values());
  }
  return out;
}
async function refresh(req){
  try{
    const {token}=await authenticate(req);
    const headers={apikey:SUPABASE_KEY,Authorization:`Bearer ${token}`,'Content-Type':'application/json'};
    const stateRes=await fetch(`${SUPABASE_URL}/rest/v1/rpc/mw_refresh_own_program_state`,{method:'POST',headers,body:'{}'});
    const state=await stateRes.json().catch(()=>null);
    if(!stateRes.ok||!state)return;
    const schedule=buildStrengthSchedule(state);
    if(schedule.length){
      await fetch(`${SUPABASE_URL}/rest/v1/rpc/mw_refresh_own_strength_schedule`,{
        method:'POST',headers,body:JSON.stringify({p_schedule:schedule})
      });
    }
  }catch{}
}
module.exports=async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='GET')return res.status(405).json({error:'GET only'});
  try{await refresh(req);const c=await getAccountContext(req);return res.status(200).json(c)}catch(e){return res.status(e.status||500).json({error:e.message||'MW athlete lookup failed'})}
};
