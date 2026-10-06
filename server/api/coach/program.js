const {getAccountContext}=require('../../lib/mw-coach-auth');
const {programWeek,normalizeTier,normalizeEventGroup,PROGRAM_VERSION}=require('../../lib/mw-program-service');
const {effectiveCalendar}=require('../../lib/mw-season-calendar');
function clampWeek(v){const n=Number(v);return Number.isFinite(n)?Math.max(1,Math.min(41,Math.trunc(n))):1}
module.exports=async function(req,res){res.setHeader('Cache-Control','no-store, private');if(req.method!=='GET')return res.status(405).json({error:'GET only'});try{const c=await getAccountContext(req);const role=String(c.profile?.role||'');if(!['founder_owner','admin','coach'].includes(role))return res.status(403).json({error:'Coach access required'});if(role==='coach'){const r=await fetch(`${process.env.SUPABASE_URL||'https://keqgunlfwhjgcsurynef.supabase.co'}/rest/v1/rpc/mw_coach_access_tier`,{method:'POST',headers:{apikey:process.env.SUPABASE_PUBLISHABLE_KEY||'sb_publishable_JWCLQzrdWA_ZmvbpV5urVg_rcT6NECm',Authorization:`Bearer ${c.token}`,'Content-Type':'application/json'},body:'{}'});const tier=await r.json().catch(()=>null);if(!r.ok||tier!=='mw_sprint_performance')return res.status(403).json({error:'MW Sprint Performance access required'});}const week=clampWeek(req.query?.week);
if(role==='coach'){
  const timeZone=String(req.headers['x-mw-time-zone']||'').slice(0,80)||null;
  const calendar=await effectiveCalendar(c.token,{timeZone});
  const current=Math.max(1,Math.min(41,Number(calendar?.week)||1));
  const status=String(calendar?.status||'active');
  if(status==='preseason'&&week>1)return res.status(423).json({error:'This MW week is locked until your training calendar begins.',access:'upcoming',currentWeek:1});
  if(status==='active'){
    if(week>current)return res.status(423).json({error:`Week ${week} is locked until it becomes your current training week.`,access:'upcoming',currentWeek:current});
    if(week<current-1)return res.status(423).json({error:`Week ${week} is archived. Historical results remain available in athlete progression.`,access:'archived',currentWeek:current});
    if(week===current-1){
      const start=calendar?.startDate?new Date(String(calendar.startDate)+'T00:00:00Z'):null;
      if(start&&!Number.isNaN(start.getTime())){
        const currentStart=new Date(start.getTime()+(current-1)*7*86400000);
        const reviewEnds=new Date(currentStart.getTime()+7*86400000);
        if(Date.now()>=reviewEnds.getTime())return res.status(423).json({error:`Week ${week} is archived. The 7-day review window has closed.`,access:'archived',currentWeek:current});
      }
    }
  }
}
const trackTier=normalizeTier(req.query?.trackTier||'performance');const strengthTier=normalizeTier(req.query?.strengthTier||'performance');const eventGroup=normalizeEventGroup(req.query?.eventGroup||'100_200');const {track,strength}=programWeek(week,trackTier,strengthTier,eventGroup);return res.status(200).json({week,trackTier,strengthTier,eventGroup,eventLabel:eventGroup==='400'?'400m':'100m / 200m',programVersion:PROGRAM_VERSION,track,strength});}catch(e){return res.status(e.status||500).json({error:e.message||'MW program lookup failed'})}};
