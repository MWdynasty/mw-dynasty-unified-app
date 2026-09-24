const {authenticate,getAthleteContext}=require('../lib/mw-auth');
const {
  normalizeLevel,normalizeState,normalizeSeasonPreference,normalizeCompetitionPath,levelGroup,
  loadTemplate,loadStateRegistry,derivePlan,upsertSeasonPlan,listOwnSeasonPlans,reconcileSeasonPlan,rest,dateOnly
}=require('../lib/mw-season-intelligence');
const {effectiveCalendar}=require('../lib/mw-season-calendar');

function bodyOf(req){return typeof req.body==='string'?JSON.parse(req.body||'{}'):(req.body||{})}
function defaultSeasonYear(){
  const d=new Date();
  return d.getUTCMonth()>=6?d.getUTCFullYear()+1:d.getUTCFullYear();
}
function yearFromDate(value,fallback){
  const d=dateOnly(value);return d?d.getUTCFullYear():fallback;
}
function cleanDates(x={}){
  return {
    startDate:String(x.startDate||'').trim()||null,
    firstMeetDate:String(x.firstMeetDate||'').trim()||null,
    primaryPeakDate:String(x.primaryPeakDate||'').trim()||null,
    secondaryPeakDate:String(x.secondaryPeakDate||'').trim()||null
  };
}
function planSummary(p){
  if(!p)return null;
  return {
    id:p.id||null,seasonYear:Number(p.season_year||p.seasonYear||0),seasonType:p.season_type||p.seasonType,
    competitionLevel:p.competition_level||p.competitionLevel,levelGroup:p.level_group||p.levelGroup,
    competitionState:p.competition_state||p.competitionState||null,competitionPath:p.competition_path||p.competitionPath,
    planStatus:p.plan_status||p.planStatus,calendarSource:p.calendar_source||p.calendarSource,
    seasonStartDate:p.season_start_date||p.seasonStartDate,firstMeetDate:p.first_meet_date||p.firstMeetDate||null,
    primaryPeakDate:p.primary_peak_date||p.primaryPeakDate,secondaryPeakDate:p.secondary_peak_date||p.secondaryPeakDate||null,
    seasonLengthWeeks:Number(p.season_length_weeks||p.seasonLengthWeeks||0),
    phasePlan:p.phase_plan||p.phasePlan||{},mappingVersion:p.mapping_version||p.mappingVersion||'mw-season-map-v1',
    continuationFromPlanId:p.continuation_from_plan_id||p.continuationFromPlanId||null
  };
}

module.exports=async function handler(req,res){
  res.setHeader('Cache-Control','no-store, private');
  try{
    const {token}=await authenticate(req);
    const c=await getAthleteContext(req);
    if(c.features?.access?.smart_entry!==true)return res.status(403).json({error:'MW Season Intelligence requires MW Smart Entry access.'});

    if(req.method==='GET'){
      await reconcileSeasonPlan(token);
      const plans=await listOwnSeasonPlans(token,c.athlete.id);
      const calendar=await effectiveCalendar(token);
      return res.status(200).json({ok:true,plans:plans.map(planSummary),calendar});
    }
    if(req.method!=='POST')return res.status(405).json({error:'GET or POST only'});

    const b=bodyOf(req);
    const competitionLevel=normalizeLevel(b.competitionLevel);
    const competitionState=normalizeState(b.competitionState);
    const seasonPreference=normalizeSeasonPreference(b.seasonPreference);
    const competitionPath=normalizeCompetitionPath(b.competitionPath,competitionLevel);
    if(!competitionLevel)return res.status(400).json({error:'Choose your competition level.'});
    if(!seasonPreference||seasonPreference==='offseason')return res.status(400).json({error:'Choose Indoor, Outdoor, or Both.'});
    if(['6','7','8','9','10','11','12'].includes(competitionLevel)&&competitionPath==='school'&&!competitionState){
      return res.status(400).json({error:'Choose the state where you compete.'});
    }

    const seasonTypes=seasonPreference==='both'?['indoor','outdoor']:[seasonPreference];
    const baseYear=Number(b.seasonYear)||defaultSeasonYear();
    const built=[];
    const estimates=[];

    for(const seasonType of seasonTypes){
      const d=cleanDates(b.dates?.[seasonType]||{});
      const seasonYear=yearFromDate(d.primaryPeakDate,baseYear);
      const group=levelGroup(competitionLevel,competitionPath);
      const template=await loadTemplate(token,{group,seasonType,competitionPath});
      const registry=await loadStateRegistry(token,{stateCode:competitionState,group,seasonType,seasonYear,competitionPath});
      const plan=derivePlan({
        seasonType,competitionLevel,competitionState,competitionPath,seasonYear,
        startDate:d.startDate,firstMeetDate:d.firstMeetDate,primaryPeakDate:d.primaryPeakDate,secondaryPeakDate:d.secondaryPeakDate,
        template,registry,continuation:seasonPreference==='both'&&seasonType==='outdoor'
      });
      if(plan.needsDates){
        estimates.push({
          seasonType,targetWeeks:plan.targetWeeks,minWeeks:plan.minWeeks,maxWeeks:plan.maxWeeks,
          stateEstimateAvailable:!!registry,
          estimatedStartDate:registry?.estimated_start_date||null,
          estimatedFirstMeetDate:registry?.estimated_first_meet_date||null,
          estimatedPeakDate:registry?.estimated_peak_date||null,
          sourceLabel:registry?.source_label||null
        });
      }else built.push(plan);
    }

    if(estimates.length){
      return res.status(422).json({
        error:'MW needs a championship/peak date (or a verified state calendar) to build this season safely.',
        needsDates:true,estimates
      });
    }

    built.sort((a,b)=>String(a.seasonStartDate).localeCompare(String(b.seasonStartDate)));
    const today=new Date().toISOString().slice(0,10);
    let activeIndex=built.findIndex(p=>p.seasonStartDate<=today&&p.primaryPeakDate>=today);
    if(activeIndex<0)activeIndex=built.findIndex(p=>p.primaryPeakDate>=today);
    if(activeIndex<0)activeIndex=built.length-1;

    const saved=[];let previousId=null;
    for(let i=0;i<built.length;i++){
      const row=await upsertSeasonPlan(token,built[i],{activate:i===activeIndex,continuationFromPlanId:i>0?previousId:null});
      previousId=row?.id||previousId;
      saved.push(row);
    }

    await rest(`athletes?id=eq.${encodeURIComponent(c.athlete.id)}`,token,{
      method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({
        competition_level:competitionLevel,
        competition_state:competitionState||null,
        season_preference:seasonPreference,
        competition_paths:[competitionPath],
        updated_at:new Date().toISOString()
      })
    });

    await reconcileSeasonPlan(token);
    const calendar=await effectiveCalendar(token);
    return res.status(200).json({ok:true,plans:saved.map(planSummary),calendar});
  }catch(e){
    return res.status(e.status||500).json({error:e.message||'MW Season Intelligence could not build the season plan.'});
  }
};
