const {authenticate,getAthleteContext}=require('../lib/mw-auth');
const {
  normalizeLevel,normalizeState,normalizeSeasonPreference,normalizeCompetitionPath,levelGroup,
  loadTemplate,loadStateRegistry,derivePlan,upsertSeasonPlan,listOwnSeasonPlans,reconcileSeasonPlan,rest,rpc,dateOnly
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
function jsonEqual(a,b){try{return JSON.stringify(a||{})===JSON.stringify(b||{})}catch{return false}}
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

    if(b.deferSeasonDates===true){
      await rest(`athletes?id=eq.${encodeURIComponent(c.athlete.id)}`,token,{
        method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({
          competition_level:competitionLevel,
          competition_state:competitionState||null,
          season_preference:seasonPreference,
          competition_paths:[competitionPath],
          updated_at:new Date().toISOString()
        })
      });
      const calendar=await effectiveCalendar(token);
      return res.status(200).json({
        ok:true,deferred:true,calendar,
        message:'Season dates were deferred. MW will use the standard/current training calendar until the athlete confirms a competition calendar.'
      });
    }

    const seasonTypes=seasonPreference==='both'?['indoor','outdoor']:[seasonPreference];
    const baseYear=Number(b.seasonYear)||defaultSeasonYear();
    const built=[];
    const estimates=[];
    const confirmations=[];

    for(const seasonType of seasonTypes){
      const d=cleanDates(b.dates?.[seasonType]||{});
      const hasUserDates=Object.values(d).some(Boolean);
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
          sourceLabel:registry?.source_label||null,
          sourceUrl:registry?.source_url||null,
          sourceConfidence:registry?.source_confidence||'estimated'
        });
      }else if(!hasUserDates&&plan.calendarSource==='state_registry'&&b.confirmEstimatedDates!==true){
        confirmations.push({
          seasonType,
          estimatedStartDate:plan.seasonStartDate,
          estimatedFirstMeetDate:plan.firstMeetDate,
          estimatedPeakDate:plan.primaryPeakDate,
          estimatedSecondPeakDate:plan.secondaryPeakDate,
          sourceLabel:registry?.source_label||'Verified state calendar',
          sourceUrl:registry?.source_url||null,
          sourceConfidence:registry?.source_confidence||'official'
        });
      }else built.push(plan);
    }

    if(estimates.length){
      return res.status(422).json({
        error:'MW needs a championship/peak date (or a verified state calendar) to build this season safely.',
        needsDates:true,estimates,confirmations
      });
    }
    if(confirmations.length){
      return res.status(409).json({
        error:'MW found a verified calendar. Confirm or edit the proposed dates before the season plan is created.',
        confirmationRequired:true,
        estimates:confirmations
      });
    }

    built.sort((a,b)=>String(a.seasonStartDate).localeCompare(String(b.seasonStartDate)));
    const today=new Date().toISOString().slice(0,10);
    let activeIndex=built.findIndex(p=>p.seasonStartDate<=today&&p.primaryPeakDate>=today);
    if(activeIndex<0)activeIndex=built.findIndex(p=>p.primaryPeakDate>=today);
    if(activeIndex<0)activeIndex=built.length-1;

    const existingPlans=await listOwnSeasonPlans(token,c.athlete.id);
    const saved=[];let previousId=null;
    for(let i=0;i<built.length;i++){
      const plan=built[i];
      const existing=(existingPlans||[]).find(x=>
        Number(x.season_year)===Number(plan.seasonYear)
        &&String(x.season_type)===String(plan.seasonType)
        &&String(x.competition_path)===String(plan.competitionPath)
      );
      const changed=existing&&(
        String(existing.season_start_date)!==String(plan.seasonStartDate)
        ||String(existing.primary_peak_date)!==String(plan.primaryPeakDate)
        ||Number(existing.season_length_weeks)!==Number(plan.seasonLengthWeeks)
        ||!jsonEqual(existing.phase_plan,plan.phasePlan)
        ||!jsonEqual(existing.source_week_map,plan.sourceWeekMap)
      );
      if(changed){
        await rpc('mw_record_season_plan_revision',token,{
          p_plan_id:existing.id,
          p_reason:String(b.changeReason||`Athlete updated ${plan.seasonType} season dates`).slice(0,1000),
          p_new_start:plan.seasonStartDate,
          p_new_peak:plan.primaryPeakDate,
          p_new_length:plan.seasonLengthWeeks,
          p_new_phase_plan:plan.phasePlan,
          p_new_source_map:plan.sourceWeekMap
        });
      }
      const row=await upsertSeasonPlan(token,plan,{activate:i===activeIndex,continuationFromPlanId:i>0?previousId:null});
      previousId=row?.id||previousId;
      saved.push(row);

      const planId=row?.id||existing?.id;
      if(planId){
        const source=plan.calendarSource==='state_registry'?'state_registry':'athlete';
        const primaryRows=await rest(`athlete_season_targets?season_plan_id=eq.${encodeURIComponent(planId)}&is_primary=eq.true&select=id&limit=1`,token,{method:'GET'});
        const primaryId=Array.isArray(primaryRows)?primaryRows[0]?.id:null;
        const primaryPayload={
          season_plan_id:planId,athlete_id:c.athlete.id,name:'Primary Championship / Peak',
          target_date:plan.primaryPeakDate,target_type:'championship',meet_priority:'A',
          is_primary:true,peak_rank:1,status:'planned',source,updated_at:new Date().toISOString()
        };
        if(primaryId)await rest(`athlete_season_targets?id=eq.${encodeURIComponent(primaryId)}`,token,{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify(primaryPayload)});
        else await rest('athlete_season_targets',token,{method:'POST',headers:{Prefer:'return=minimal'},body:JSON.stringify(primaryPayload)});

        if(plan.secondaryPeakDate){
          const secondaryRows=await rest(`athlete_season_targets?season_plan_id=eq.${encodeURIComponent(planId)}&peak_rank=eq.2&select=id&limit=1`,token,{method:'GET'});
          const secondaryId=Array.isArray(secondaryRows)?secondaryRows[0]?.id:null;
          const secondaryPayload={
            season_plan_id:planId,athlete_id:c.athlete.id,name:'Secondary Championship / Peak',
            target_date:plan.secondaryPeakDate,target_type:'championship',meet_priority:'A',
            is_primary:false,peak_rank:2,status:'planned',source,updated_at:new Date().toISOString()
          };
          if(secondaryId)await rest(`athlete_season_targets?id=eq.${encodeURIComponent(secondaryId)}`,token,{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify(secondaryPayload)});
          else await rest('athlete_season_targets',token,{method:'POST',headers:{Prefer:'return=minimal'},body:JSON.stringify(secondaryPayload)});
        }
      }
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
