const {getAccountContext}=require('../lib/mw-auth');
const {programWeek,PROGRAM_VERSION,normalizeTier}=require('../lib/mw-program-service');

function clampWeek(v){const n=Number(v);return Number.isFinite(n)?Math.max(1,Math.min(41,Math.trunc(n))):1}
module.exports=async function handler(req,res){
  res.setHeader('Cache-Control','no-store, private');
  if(req.method!=='GET')return res.status(405).json({error:'GET only'});
  try{
    const c=await getAccountContext(req);
    const week=clampWeek(req.query?.week);
    const role=String(c.profile?.role||'athlete');
    const privileged=['founder_owner','admin','coach'].includes(role);
    const access=c.features?.access||{};
    if(!privileged && access.mw_training_system!==true){
      return res.status(403).json({
        error:'The complete MW Sprint Performance training system is not included with this sponsored-athlete access level. Open Training to view your coach-assigned program.',
        feature:'mw_training_system',
        accessMode:access.access_mode||'limited',
        upgradeRequired:true
      });
    }
    if(!privileged&&!c.programState?.onboarding_assessment_completed_at)return res.status(403).json({error:'Complete your Athlete Profile Assessment to receive your MW training assignment.',assessmentRequired:true});
    const official=clampWeek(c.programState?.current_week||1);
    if(!privileged && week>official)return res.status(403).json({error:`Week ${week} is locked. Your official MW week is ${official}.`,locked:true,officialWeek:official});
    const trackTier=normalizeTier(c.programState?.track_tier||c.athlete?.experience_level);
    const strengthTier=normalizeTier(c.programState?.strength_tier||c.athlete?.experience_level);
    const {track,strength}=programWeek(week,trackTier,strengthTier);
    return res.status(200).json({week,officialWeek:official,officialDay:Number(c.programState?.current_day||1),trackTier,strengthTier,programVersion:c.programState?.program_version||PROGRAM_VERSION,track,strength});
  }catch(e){return res.status(e.status||500).json({error:e.message||'MW program lookup failed'})}
};
