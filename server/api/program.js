const {getAccountContext}=require('../lib/mw-auth');
const {programWeek,PROGRAM_VERSION,normalizeTier}=require('../lib/mw-program-service');
const {reconcileSeasonPlan,positionForPlan,uiPhaseForCode}=require('../lib/mw-season-intelligence');
const {developmentalLoadProfile}=require('../lib/mw-developmental-load');

function clampWeek(v){const n=Number(v);return Number.isFinite(n)?Math.max(1,Math.min(41,Math.trunc(n))):1}
function planMap(plan){
  if(!plan)return {};
  try{return typeof plan.source_week_map==='string'?JSON.parse(plan.source_week_map||'{}'):(plan.source_week_map||{})}catch{return {}}
}
function phaseLabel(code){return code==='foundation'?'Foundation':code==='pre_competition'?'Pre-Competition':code==='competition'?'Competition':'Peak / Championship'}
function presentMappedProgram(item,{seasonWeek,sourceWeek,phaseCode}){
  if(!item)return item;
  return {
    ...item,
    masterSourceWeek:sourceWeek,
    masterPhase:item.phase,
    masterPhaseName:item.phaseName,
    week:seasonWeek,
    phase:uiPhaseForCode(phaseCode),
    phaseName:phaseLabel(phaseCode),
    seasonPhaseCode:phaseCode
  };
}
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

    let plan=null,position=null,sourceWeek=week,phaseCode=null;
    if(c.athlete&&c.token){
      plan=await reconcileSeasonPlan(c.token);
      if(plan?.id){
        position=positionForPlan(plan);
        const map=planMap(plan),mapped=map[String(week)]||{};
        sourceWeek=clampWeek(mapped.sourceWeek||week);
        phaseCode=String(mapped.phase||position?.phaseCode||'foundation');
      }
    }

    const official=plan?.id?clampWeek(position?.week||1):clampWeek(c.programState?.current_week||1);
    if(!privileged && week>official)return res.status(403).json({error:`Week ${week} is locked. Your official MW week is ${official}.`,locked:true,officialWeek:official});

    const trackTier=normalizeTier(c.programState?.track_tier||c.athlete?.experience_level);
    const strengthTier=normalizeTier(c.programState?.strength_tier||c.athlete?.experience_level);
    let {track,strength}=programWeek(sourceWeek,trackTier,strengthTier);
    const developmentalLoad=developmentalLoadProfile({
      dateOfBirth:c.athlete?.date_of_birth,
      trainingYears:c.athlete?.track_training_years,
      trackTier,
      strengthTier
    });
    if(track)track={...track,developmentalLoad};
    if(strength)strength={...strength,developmentalLoad};

    if(plan?.id){
      track=presentMappedProgram(track,{seasonWeek:week,sourceWeek,phaseCode});
      strength=presentMappedProgram(strength,{seasonWeek:week,sourceWeek,phaseCode});
    }

    return res.status(200).json({
      week,officialWeek:official,officialDay:Number(c.programState?.current_day||1),
      trackTier,strengthTier,programVersion:plan?.id?'mw-season-intelligence-v1':(c.programState?.program_version||PROGRAM_VERSION),
      developmentalLoad,
      seasonPlan:plan?.id?{
        id:plan.id,seasonType:plan.season_type,seasonLengthWeeks:Number(plan.season_length_weeks||0),
        phaseCode,peakDate:plan.primary_peak_date,sourceProgramWeek:sourceWeek
      }:null,
      track,strength
    });
  }catch(e){return res.status(e.status||500).json({error:e.message||'MW program lookup failed'})}
};
