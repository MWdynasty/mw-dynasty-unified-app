const {SUPABASE_URL,SUPABASE_KEY,authenticate,getAccountContext}=require('../lib/mw-auth');
const {programWeek}=require('../lib/mw-program-service');
const {reconcileSeasonPlan,positionForPlan}=require('../lib/mw-season-intelligence');
const {resolveAuthoritativeState,applyAuthoritativeState}=require('../lib/mw-authoritative-state');
const {loadPerformanceContext,evaluatePerformance}=require('../lib/mw-performance-intelligence');

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
function planMap(plan){
  if(!plan)return {};
  try{return typeof plan.source_week_map==='string'?JSON.parse(plan.source_week_map||'{}'):(plan.source_week_map||{})}catch{return {}}
}
function buildStrengthSchedule(state,plan=null){
  const starting=Math.max(1,Math.min(41,Number(state?.starting_week||state?.current_week||1)));
  const current=Math.max(starting,Math.min(41,Number(state?.current_week||starting)));
  const map=planMap(plan),out=[];
  for(let week=starting;week<=current;week++){
    const sourceWeek=plan?.id?Math.max(1,Math.min(41,Number(map[String(week)]?.sourceWeek||week))):week;
    const strength=programWeek(sourceWeek,'foundation','foundation')?.strength;
    const days=new Map();
    for(const section of (strength?.sections||[])){
      const day=strengthDayFromTitle(section?.title);
      if(!day)continue;
      const optional=/\bOPTIONAL\b/i.test(String(section?.title||''));
      const existing=days.get(day);
      if(!existing){
        days.set(day,{week,day,label:String(section?.title||`Day ${day}`).slice(0,80),optional,sourceWeek});
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
    const plan=await reconcileSeasonPlan(token);
    const refreshRpc=plan?.id?'mw_refresh_own_season_program_state':'mw_refresh_own_program_state';
    const stateRes=await fetch(`${SUPABASE_URL}/rest/v1/rpc/${refreshRpc}`,{method:'POST',headers,body:'{}'});
    const state=await stateRes.json().catch(()=>null);
    if(!stateRes.ok||!state)return;

    const schedule=buildStrengthSchedule(state,plan);
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
  try{
    await refresh(req);
    const c=await getAccountContext(req);
    if(c.athlete&&c.token){
      const authority=await resolveAuthoritativeState(c);
      const storedProgramState=c.programState?{...c.programState}:null;
      c.programState=applyAuthoritativeState(c.programState,authority);
      c.authoritativeProgram={
        authority:authority.authority,
        week:authority.week,
        day:authority.day,
        phase:authority.phase,
        sourceWeek:authority.sourceWeek,
        phaseCode:authority.phaseCode,
        seasonLengthWeeks:authority.seasonLengthWeeks,
        programStatus:authority.programStatus,
        diverged:authority.diverged,
        storedWeek:authority.storedWeek
      };
      c.seasonCalendar=authority.calendar||null;
      if(authority.diverged)c.programState.week_reconciled_from=storedProgramState?.current_week||null;

      const plan=await reconcileSeasonPlan(c.token);
      if(plan?.id)c.seasonPlan={...plan,position:positionForPlan(plan)};

      const access=c.features?.access||{};
      if(access.mw_training_system===true||access.ai_intelligence===true){
        const perfContext=await loadPerformanceContext(c);
        const coachManaged=/^coach_/i.test(String(access.access_mode||''));
        c.performanceIntelligence=evaluatePerformance(perfContext,{
          coachManaged,
          officialWeek:authority.week,
          officialDay:authority.day
        });
      }
    }
    return res.status(200).json(c)
  }catch(e){return res.status(e.status||500).json({error:e.message||'MW athlete lookup failed'})}
};
