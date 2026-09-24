const {getAccountContext,SUPABASE_URL,SUPABASE_KEY}=require('../../lib/mw-coach-auth');
const {coachSeasonMode}=require('../../lib/mw-season-entitlements');
const {adaptationRecommendation}=require('../../lib/mw-season-adaptation');
const {developmentalLoadProfile}=require('../../lib/mw-developmental-load');

async function request(path,token,{method='GET',body=null,prefer=null}={}){
  const headers={apikey:SUPABASE_KEY,Authorization:`Bearer ${token}`};
  if(body!=null){headers['Content-Type']='application/json';headers.Prefer=prefer||'return=representation'}
  const r=await fetch(`${SUPABASE_URL}/rest/v1/${path}`,{
    method,headers,body:body==null?undefined:JSON.stringify(body)
  });
  const d=await r.json().catch(()=>null);
  if(!r.ok)throw Object.assign(new Error(d?.message||d?.hint||d?.error||`Season Intelligence request failed (${r.status})`),{status:r.status});
  return d;
}
async function rpc(name,token,body={}){
  return request(`rpc/${name}`,token,{method:'POST',body});
}
function cleanId(v){return String(v||'').replace(/[^a-f0-9-]/gi,'')}
function cleanText(v,max=500){return String(v??'').trim().slice(0,max)}
function isoDate(v){return /^\d{4}-\d{2}-\d{2}$/.test(String(v||''))?String(v):null}
function daysUntil(value){
  const iso=isoDate(String(value||'').slice(0,10));if(!iso)return null;
  const target=new Date(iso+'T00:00:00Z'),today=new Date();
  const day=new Date(Date.UTC(today.getUTCFullYear(),today.getUTCMonth(),today.getUTCDate()));
  return Math.ceil((target-day)/86400000);
}
function modeForTier(tier,role){return coachSeasonMode(tier,role)}
async function coachTier(c){
  if(['founder_owner','admin'].includes(String(c.profile.role||'')))return 'mw_sprint_performance';
  const rows=await request(`coach_access_entitlements?select=access_tier,status&coach_user_id=eq.${encodeURIComponent(c.user.id)}&status=eq.active&limit=1`,c.token);
  return Array.isArray(rows)?String(rows[0]?.access_tier||''):String(rows?.access_tier||'');
}
function summarizeContext(x){
  if(!x)return null;
  return {
    id:x.id,groupId:x.group_id||null,seasonYear:Number(x.season_year||0),seasonType:x.season_type,
    levelGroup:x.competition_level_group,competitionState:x.competition_state||null,
    competitionPath:x.competition_path,firstPracticeDate:x.first_practice_date||null,
    firstMeetDate:x.first_meet_date||null,primaryPeakDate:x.primary_peak_date,
    secondaryPeakDate:x.secondary_peak_date||null,goal:x.goal||'',status:x.status,
    daysToPrimaryPeak:daysUntil(x.primary_peak_date)
  };
}
function eventSummary(x){
  return {
    id:x.id,title:x.title,eventType:x.event_type,startsAt:x.starts_at,endsAt:x.ends_at||null,
    location:x.location||null,trainingImpact:x.training_impact,
    meetPriority:x.meet_priority||null,isPrimaryTarget:!!x.is_primary_target,
    qualificationStage:x.qualification_stage||null,parentEventId:x.parent_event_id||null
  };
}
module.exports=async function handler(req,res){
  res.setHeader('Cache-Control','no-store, private');
  try{
    const c=await getAccountContext(req),role=String(c.profile.role||'');
    if(!['coach','founder_owner','admin'].includes(role))return res.status(403).json({error:'Coach access required'});
    const tier=await coachTier(c),mode=modeForTier(tier,role);
    if(mode==='none')return res.status(403).json({
      error:'Season Intelligence is available with Coach Intelligence or MW Sprint Performance.',
      mode:'none',upgradeRequired:true
    });

    if(req.method==='POST'){
      const b=typeof req.body==='string'?JSON.parse(req.body||'{}'):(req.body||{});
      const action=String(b.action||'');
      if(action==='upsert_context'){
        const seasonYear=Math.trunc(Number(b.seasonYear));
        const seasonType=['indoor','outdoor'].includes(String(b.seasonType))?String(b.seasonType):'';
        const level=['middle_school','high_school','collegiate','professional','youth_club'].includes(String(b.levelGroup))?String(b.levelGroup):'';
        const path=['school','aau','usatf','ncaa','professional_open'].includes(String(b.competitionPath))?String(b.competitionPath):'';
        const state=String(b.competitionState||'').trim().toUpperCase();
        const peak=isoDate(b.primaryPeakDate),secondary=isoDate(b.secondaryPeakDate);
        if(!seasonYear||!seasonType||!level||!path||!peak)return res.status(400).json({error:'Season year, season type, competition level, path, and primary championship date are required.'});
        if(state&&!/^[A-Z]{2}$/.test(state))return res.status(400).json({error:'Competition state must use a two-letter state code.'});
        const groupId=cleanId(b.groupId)||null;
        const payload={
          coach_user_id:c.user.id,group_id:groupId,season_year:seasonYear,season_type:seasonType,
          competition_level_group:level,competition_state:state||null,competition_path:path,
          first_practice_date:isoDate(b.firstPracticeDate),first_meet_date:isoDate(b.firstMeetDate),
          primary_peak_date:peak,secondary_peak_date:secondary,goal:cleanText(b.goal,1000)||null,
          status:['planned','active','completed','cancelled'].includes(String(b.status))?String(b.status):'active',
          updated_at:new Date().toISOString()
        };
        if(payload.status==='active'){
          const groupFilter=groupId?`group_id=eq.${encodeURIComponent(groupId)}`:'group_id=is.null';
          await request(`coach_season_contexts?coach_user_id=eq.${encodeURIComponent(c.user.id)}&${groupFilter}&status=eq.active`,c.token,{method:'PATCH',body:{status:'planned',updated_at:new Date().toISOString()},prefer:'return=minimal'});
        }
        const groupFilter=groupId?`group_id=eq.${encodeURIComponent(groupId)}`:'group_id=is.null';
        const existing=await request(`coach_season_contexts?select=id&coach_user_id=eq.${encodeURIComponent(c.user.id)}&${groupFilter}&season_year=eq.${seasonYear}&season_type=eq.${encodeURIComponent(seasonType)}&competition_path=eq.${encodeURIComponent(path)}&limit=1`,c.token);
        const existingId=Array.isArray(existing)?existing[0]?.id:null;
        const rows=existingId
          ?await request(`coach_season_contexts?id=eq.${encodeURIComponent(existingId)}`,c.token,{method:'PATCH',body:payload})
          :await request('coach_season_contexts',c.token,{method:'POST',body:payload});
        return res.status(200).json({ok:true,mode,context:summarizeContext(Array.isArray(rows)?rows[0]:rows)});
      }

      if(action==='set_meet_priority'){
        const eventId=cleanId(b.eventId),priority=['A','B','C'].includes(String(b.meetPriority))?String(b.meetPriority):null;
        const stage=['regular','conference','district','sectional','regional','state','national','junior_olympics','ncaa_championship','professional_championship','other'].includes(String(b.qualificationStage))?String(b.qualificationStage):null;
        if(!eventId)return res.status(400).json({error:'Meet event is required.'});
        const existing=await request(`coach_calendar_events?select=id,event_type,coach_user_id&id=eq.${encodeURIComponent(eventId)}&limit=1`,c.token);
        const row=Array.isArray(existing)?existing[0]:null;
        if(!row||row.event_type!=='meet'||(role==='coach'&&row.coach_user_id!==c.user.id))return res.status(404).json({error:'Coach meet not found.'});
        if(b.isPrimaryTarget===true){
          await request(`coach_calendar_events?coach_user_id=eq.${encodeURIComponent(row.coach_user_id)}&event_type=eq.meet&is_primary_target=eq.true`,c.token,{method:'PATCH',body:{is_primary_target:false},prefer:'return=minimal'});
        }
        const rows=await request(`coach_calendar_events?id=eq.${encodeURIComponent(eventId)}`,c.token,{method:'PATCH',body:{
          meet_priority:priority,is_primary_target:b.isPrimaryTarget===true,qualification_stage:stage,updated_at:new Date().toISOString()
        }});
        return res.status(200).json({ok:true,mode,event:eventSummary(Array.isArray(rows)?rows[0]:rows)});
      }
      return res.status(400).json({error:'Unknown Season Intelligence action.'});
    }

    if(req.method!=='GET')return res.status(405).json({error:'GET or POST only'});

    const coachId=role==='coach'?c.user.id:String(req.query?.coachId||c.user.id);
    if(role==='coach'&&coachId!==c.user.id)return res.status(403).json({error:'Coach scope mismatch.'});
    const nowIso=new Date().toISOString();
    const [contexts,events,assignments]=await Promise.all([
      request(`coach_season_contexts?select=*&coach_user_id=eq.${encodeURIComponent(coachId)}&order=primary_peak_date.asc`,c.token),
      request(`coach_calendar_events?select=id,title,event_type,starts_at,ends_at,location,training_impact,meet_priority,is_primary_target,qualification_stage,parent_event_id&coach_user_id=eq.${encodeURIComponent(coachId)}&starts_at=gte.${encodeURIComponent(nowIso)}&order=starts_at.asc&limit=80`,c.token),
      request(`coach_assignments?select=athlete_id,status&coach_user_id=eq.${encodeURIComponent(coachId)}&status=eq.active&limit=500`,c.token)
    ]);

    const ctx=(Array.isArray(contexts)?contexts:[]).map(summarizeContext);
    const ev=(Array.isArray(events)?events:[]).map(eventSummary);
    const athleteIds=[...new Set((Array.isArray(assignments)?assignments:[]).map(x=>x.athlete_id).filter(Boolean))];
    const primaryMeet=ev.find(x=>x.eventType==='meet'&&x.isPrimaryTarget)||ev.find(x=>x.eventType==='meet'&&x.meetPriority==='A')||null;
    const nextMeet=ev.find(x=>x.eventType==='meet')||null;
    const teamConstraints=ev.filter(x=>['school_break','exam_week','holiday','facility_closure','travel'].includes(x.eventType));
    const activeContext=ctx.find(x=>x.status==='active')||ctx.find(x=>(x.daysToPrimaryPeak??-1)>=0)||null;
    const daysToTarget=activeContext?.daysToPrimaryPeak??(primaryMeet?Math.ceil((new Date(primaryMeet.startsAt)-new Date())/86400000):null);

    let availability=[],athletes=[],engine=null;
    if(athleteIds.length){
      const filter=`(${athleteIds.map(cleanId).filter(Boolean).join(',')})`;
      const [athleteRows,constraintRows]=await Promise.all([
        request(`athletes?select=id,date_of_birth,track_training_years,selected_events,experience_level,competition_level,competition_state,season_preference&id=in.${filter}`,c.token),
        request(`athlete_schedule_constraints?select=athlete_id,constraint_type,title,starts_on,ends_on,training_impact,review_status&athlete_id=in.${filter}&ends_on=gte.${new Date().toISOString().slice(0,10)}&order=starts_on.asc&limit=500`,c.token)
      ]);
      availability=(Array.isArray(constraintRows)?constraintRows:[]).map(x=>({
        athleteId:x.athlete_id,type:x.constraint_type,title:x.title,startsOn:x.starts_on,endsOn:x.ends_on,
        impact:x.training_impact,reviewStatus:x.review_status
      }));
      athletes=(Array.isArray(athleteRows)?athleteRows:[]).map(x=>({
        id:x.id,events:x.selected_events||[],experienceLevel:x.experience_level||null,
        competitionLevel:x.competition_level||null,competitionState:x.competition_state||null,seasonPreference:x.season_preference||null
      }));

      if(mode==='engine'){
        const sevenDaysAgo=new Date(Date.now()-7*86400000).toISOString().slice(0,10);
        const [states,completions,plans]=await Promise.all([
          request(`athlete_program_state?select=athlete_id,current_week,current_phase,program_status,season_plan_id,season_length_weeks,source_program_week,season_phase_code,track_tier,strength_tier,program_version&athlete_id=in.${filter}`,c.token),
          request(`workout_completions?select=athlete_id,completion_status,scheduled_date,program_week,program_day&athlete_id=in.${filter}&scheduled_date=gte.${sevenDaysAgo}&order=scheduled_date.desc&limit=2000`,c.token),
          request(`athlete_season_plans?select=id,athlete_id,primary_peak_date,secondary_peak_date,season_start_date,season_length_weeks,season_type,competition_path,plan_status&athlete_id=in.${filter}&plan_status=eq.active`,c.token)
        ]);
        const rawAthleteMap=new Map((Array.isArray(athleteRows)?athleteRows:[]).map(x=>[x.id,x]));
        const planMap=new Map((Array.isArray(plans)?plans:[]).map(x=>[x.athlete_id,x]));
        const completionRows=Array.isArray(completions)?completions:[];
        engine={
          athletes:(Array.isArray(states)?states:[]).map(x=>{
            const raw=rawAthleteMap.get(x.athlete_id)||{},plan=planMap.get(x.athlete_id)||null;
            const recent=completionRows.filter(r=>r.athlete_id===x.athlete_id);
            const missed=recent.filter(r=>r.completion_status==='absent').length;
            const incomplete=recent.filter(r=>r.completion_status==='incomplete').length;
            const load=developmentalLoadProfile({
              dateOfBirth:raw.date_of_birth,
              trainingYears:raw.track_training_years,
              trackTier:x.track_tier,
              strengthTier:x.strength_tier
            });
            const peakDate=plan?.primary_peak_date||activeContext?.primaryPeakDate||null;
            const athleteDaysToPeak=peakDate?daysUntil(peakDate):daysToTarget;
            const adaptation=adaptationRecommendation({
              phaseCode:x.season_phase_code||'foundation',
              daysToPrimaryPeak:athleteDaysToPeak,
              nextMeetPriority:nextMeet?.meetPriority||null,
              nextMeetIsPrimary:!!nextMeet?.isPrimaryTarget,
              missedSessions7d:missed,
              incompleteSessions7d:incomplete,
              ageBand:load.ageBand,
              trainingTier:x.track_tier
            });
            return {
              athleteId:x.athlete_id,seasonWeek:Number(x.current_week||1),seasonLengthWeeks:Number(x.season_length_weeks||0),
              phaseCode:x.season_phase_code||null,sourceProgramWeek:Number(x.source_program_week||x.current_week||1),
              programStatus:x.program_status,trackTier:x.track_tier,strengthTier:x.strength_tier,programVersion:x.program_version,
              seasonPlanId:x.season_plan_id||null,primaryPeakDate:peakDate,daysToPrimaryPeak:athleteDaysToPeak,
              developmentalLoad:load,adaptation
            };
          })
        };
      }
    }

    return res.status(200).json({
      ok:true,tier,mode,
      capability:mode==='engine'
        ?'Full MW Season Intelligence Engine'
        :'Season Intelligence Insights — coach-authored program remains coach-controlled',
      activeContext,
      contexts:ctx,
      nextMeet,
      primaryTarget:primaryMeet,
      daysToTarget,
      upcomingMeets:ev.filter(x=>x.eventType==='meet'),
      teamConstraints,
      athleteAvailability:availability,
      athletes,
      engine
    });
  }catch(e){
    return res.status(e.status||500).json({error:e.message||'Season Intelligence is temporarily unavailable.'});
  }
};
