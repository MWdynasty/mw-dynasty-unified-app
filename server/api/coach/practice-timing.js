const WorkoutIdentity=require('../../../lib/mw-workout-identity');
const {getAccountContext,SUPABASE_URL,SUPABASE_KEY}=require('../../lib/mw-coach-auth');
const {localCalendarDate}=require('../../lib/mw-season-calendar');
const {programPosition}=require('../../lib/mw-training-position');

async function rest(path,token,options={}){
  const r=await fetch(`${SUPABASE_URL}/rest/v1/${path}`,{...options,headers:{apikey:SUPABASE_KEY,Authorization:`Bearer ${token}`,'Content-Type':'application/json',Prefer:'return=representation',...(options.headers||{})}});
  const d=await r.json().catch(()=>[]);
  if(!r.ok)throw Object.assign(new Error(d?.message||d?.hint||'Practice timing request failed'),{status:r.status});
  return d;
}
function safeTimeZone(value){
  const tz=String(value||'').trim().slice(0,80);
  if(!tz)return 'UTC';
  try{new Intl.DateTimeFormat('en-US',{timeZone:tz}).format(new Date());return tz}catch{return 'UTC'}
}
function localDateInTimeZone(timeZone,now=new Date()){
  const parts=new Intl.DateTimeFormat('en-US',{timeZone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);
  const map=Object.fromEntries(parts.filter(x=>x.type!=='literal').map(x=>[x.type,x.value]));
  return `${map.year}-${map.month}-${map.day}`;
}
function isoDayFromDate(date){
  const d=new Date(String(date)+'T12:00:00Z').getUTCDay();
  return d===0?7:d;
}
const cleanId=(v)=>String(v||'').toLowerCase().replace(/[^a-f0-9-]/g,'');
const inList=(values)=>`(${[...new Set(values.map(cleanId).filter(Boolean))].join(',')})`;
async function completedCurrentWorkouts(identities,token){
  // Scope the query itself: old seasons cannot consume a global limit or lock a new one.
  const matches=await Promise.all(identities.map(async identity=>{
    const keys=WorkoutIdentity.readKeys(identity);
    const completed=await rest(`workout_completions?select=athlete_id,program_week,program_day,season_plan_id,workout_cycle_id,workout_key,completion_status,completed_at&athlete_id=eq.${identity.athleteId}&program_week=eq.${identity.week}&program_day=eq.${identity.day}&workout_key=in.${encodeURIComponent('('+keys.join(',')+')')}&completion_status=eq.completed`,token);
    return completed.find(row=>WorkoutIdentity.matches(row,identity))||null;
  }));
  return matches.filter(Boolean);
}
module.exports=async(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  try{
    const c=await getAccountContext(req),role=String(c.profile.role||'');
    if(!['founder_owner','admin','coach'].includes(role))return res.status(403).json({error:'Coach access required'});
    if(req.method==='DELETE'){
      const sessionId=String(req.query?.sessionId||'').trim();
      if(!sessionId)return res.status(400).json({error:'sessionId is required'});
      const rows=await rest(`coach_practice_timing_results?session_id=eq.${encodeURIComponent(sessionId)}&coach_user_id=eq.${encodeURIComponent(c.user.id)}`,c.token,{method:'DELETE'});
      return res.status(200).json({ok:true,deleted:Array.isArray(rows)?rows.length:0});
    }
    if(req.method==='POST'){
      const b=req.body||{},results=Array.isArray(b.results)?b.results:[];
      const clientTimeZone=safeTimeZone(b.clientTimeZone||req.headers['x-mw-time-zone']);
      const localSessionDate=localDateInTimeZone(clientTimeZone);
      const localProgramDay=isoDayFromDate(localSessionDate);
      const sessionId=cleanId(b.sessionId);
      if(!sessionId)return res.status(400).json({error:'Practice session id is required'});
      if(!results.length)return res.status(400).json({error:'No timing results supplied'});
      if(results.length>200)return res.status(400).json({error:'Too many timing results in one save'});
      const invalidRep=results.find(x=>{const rep=Number(x.repNumber),limit=Number(x.prescribedReps);return !Number.isInteger(rep)||rep<1||(Number.isFinite(limit)&&limit>0&&rep>limit)});
      if(invalidRep)return res.status(400).json({error:'Timing result exceeds the prescribed rep count.',code:'rep_limit_exceeded'});
      const rows=results.map(x=>({
        coach_user_id:c.user.id,
        athlete_id:cleanId(x.athleteId),
        session_date:localSessionDate,
        group_name:String(x.groupName||'All').slice(0,80),
        group_id:x.groupId||null,
        session_id:sessionId,
        division:['boys','girls','open'].includes(x.division)?x.division:null,
        lane_number:Number.isInteger(Number(x.laneNumber))&&Number(x.laneNumber)>=1&&Number(x.laneNumber)<=9?Number(x.laneNumber):null,
        timing_source:['coach','athlete','sensor','manual'].includes(x.timingSource)?x.timingSource:'coach',
        result_status:['finished','dnf','manual'].includes(x.resultStatus)?x.resultStatus:'finished',
        rep_number:Math.max(1,Number(x.repNumber)||1),
        time_seconds:Number(Number(x.timeSeconds).toFixed(3)),
        target_seconds:Number(x.targetSeconds)>0?Number(Number(x.targetSeconds).toFixed(3)):null,
        target_min_seconds:Number(x.targetMinSeconds)>0?Number(Number(x.targetMinSeconds).toFixed(3)):null,
        target_max_seconds:Number(x.targetMaxSeconds)>0?Number(Number(x.targetMaxSeconds).toFixed(3)):null,
        prescribed_rest_seconds:Number(x.prescribedRestSeconds)>=0?Number(Number(x.prescribedRestSeconds).toFixed(2)):null,
        actual_rest_seconds:Number(x.actualRestSeconds)>=0?Number(Number(x.actualRestSeconds).toFixed(2)):null,
        pace_status:['fast','on_pace','slow'].includes(x.paceStatus)?x.paceStatus:null,
        mw_intent:['technical','speed','pace','recovery'].includes(x.mwIntent)?x.mwIntent:'pace',
        mw_interpretation:['above_target','on_target','pace_violation','below_target'].includes(x.mwInterpretation)?x.mwInterpretation:null
      }));
      if(rows.some(x=>!x.athlete_id||!Number.isFinite(x.time_seconds)||x.time_seconds<=0))return res.status(400).json({error:'Invalid timing result'});
      if(rows.some(x=>(x.target_min_seconds==null)!==(x.target_max_seconds==null)||((x.target_min_seconds!=null)&&x.target_min_seconds>x.target_max_seconds)))return res.status(400).json({error:'Invalid target pace range'});
      for(const athleteId of [...new Set(rows.map(x=>x.athlete_id))]) await rest('rpc/mw_coach_refresh_assigned_athlete_program_position',c.token,{method:'POST',body:JSON.stringify({p_athlete_id:athleteId,p_session_date:localSessionDate})});
      const states=await rest(`athlete_program_state?select=athlete_id,current_week,current_day,current_phase,program_status,start_date,starting_week,source_program_week,season_plan_id,workout_cycle_id&athlete_id=in.${inList(results.map(x=>x.athleteId))}`,c.token);
      const stateMap=new Map(states.map(state=>[state.athlete_id,state]));
      const planIds=[...new Set(states.map(x=>x.season_plan_id).filter(Boolean))];
      const plans=planIds.length?await rest(`athlete_season_plans?select=id,athlete_id,source_week_map,phase_plan,plan_status,season_type,season_length_weeks,season_start_date,primary_peak_date&id=in.${inList(planIds)}`,c.token):[];
      const planMap=new Map(plans.map(plan=>[plan.id,plan]));
      const localCalendar=localCalendarDate(new Date(),clientTimeZone);
      const athleteMeta=new Map();
      for(const x of results){
        const athleteId=cleanId(x.athleteId),programWeek=Number(x.programWeek),programDay=Number(x.programDay),sourceProgramWeek=Number(x.sourceProgramWeek||programWeek),distanceM=x.distanceM==null?null:Number(x.distanceM),workoutKey=String(x.workoutKey||''),seasonPlanId=cleanId(x.seasonPlanId);
        if(!athleteId||!Number.isInteger(programWeek)||programWeek<1||programWeek>41||!Number.isInteger(programDay)||programDay<1||programDay>7||!workoutKey)return res.status(400).json({error:'Practice workout identity is missing or invalid'});
        const state=stateMap.get(athleteId);
        if(!state)return res.status(404).json({error:'Athlete program state not found'});
        const currentPlan=state.season_plan_id||null,currentCycle=currentPlan?null:(state.workout_cycle_id||null);
        if(x.workoutCycleId&&cleanId(x.workoutCycleId)!==currentCycle)return res.status(409).json({error:'Practice training cycle changed. Reload the roster.',code:'workout_scope_changed'});
        // Old clients may omit plan metadata. A supplied plan must still match the database.
        if(seasonPlanId&&seasonPlanId!==currentPlan)return res.status(409).json({error:'Practice season changed. Reload the roster.',code:'workout_scope_changed'});
        const livePosition=programPosition(state,currentPlan?planMap.get(currentPlan)||null:null,localCalendar);
        if(role==='coach'&&Number(livePosition.week)!==programWeek)return res.status(409).json({error:'Practice session no longer matches the athlete current week',code:'workout_scope_changed'});
        if(role==='coach'&&programDay!==Number(livePosition.day||localProgramDay))return res.status(409).json({error:'Practice session no longer matches today in the coach local timezone',code:'workout_day_changed'});
        let identity;
        try{identity=WorkoutIdentity.create({athleteId,seasonPlanId:currentPlan,workoutCycleId:currentCycle,week:programWeek,day:programDay})}catch(e){return res.status(400).json({error:e.message})}
        if(!WorkoutIdentity.acceptsInput(workoutKey,identity))return res.status(400).json({error:'Practice workout identity does not match the athlete current season/workout'});
        if(distanceM!=null&&(!(distanceM>0)||!Number.isFinite(distanceM)))return res.status(400).json({error:'Invalid practice distance'});
        const meta={athleteId,programWeek,programDay,sourceProgramWeek,workoutKey:identity.workoutKey,distanceM,seasonPlanId:identity.seasonPlanId,workoutCycleId:identity.workoutCycleId};
        const prior=athleteMeta.get(athleteId);
        if(prior&&JSON.stringify(prior)!==JSON.stringify(meta))return res.status(400).json({error:'Mixed workout identity for one athlete in the same practice save'});
        athleteMeta.set(athleteId,meta);
      }
      const locked=await completedCurrentWorkouts([...athleteMeta.values()].map(meta=>WorkoutIdentity.create({athleteId:meta.athleteId,seasonPlanId:meta.seasonPlanId,workoutCycleId:meta.workoutCycleId,week:meta.programWeek,day:meta.programDay})),c.token);
      if(locked.length)return res.status(409).json({
        error:'One or more athletes already completed their current MW workout. Practice Mode will not create duplicate timing results.',
        code:'workout_already_completed',
        athletes:locked.map(x=>({athleteId:x.athlete_id,programWeek:Number(x.program_week),programDay:Number(x.program_day),workoutKey:x.workout_key||null,completedAt:x.completed_at||null}))
      });
      for(const row of rows){
        const meta=athleteMeta.get(row.athlete_id);
        Object.assign(row,{
          workout_key:meta.workoutKey,
          season_plan_id:meta.seasonPlanId,
          workout_cycle_id:meta.workoutCycleId,
          program_week:meta.programWeek,
          program_day:meta.programDay,
          source_program_week:meta.sourceProgramWeek,
          distance_m:meta.distanceM
        });
      }
      // One database RPC owns raw timing + athlete reps + workout completion.
      // Any failure rolls the entire session back instead of leaving a partial save.
      const committed=await rest('rpc/mw_coach_commit_practice_session',c.token,{method:'POST',headers:{'X-MW-Time-Zone':clientTimeZone},body:JSON.stringify({
        p_session_id:sessionId,
        p_results:rows
      })});
      // Intelligence is enrichment, not part of the durability boundary. A failure here
      // must never make the coach think the already-committed practice failed to save.
      const intelligenceWarnings=[];
      for(const meta of athleteMeta.values()){
        try{
          await rest('rpc/mw_coach_sync_practice_intelligence',c.token,{method:'POST',body:JSON.stringify({
            p_session_id:sessionId,
            p_athlete_id:meta.athleteId,
            p_workout_key:meta.workoutKey
          })});
        }catch(e){
          intelligenceWarnings.push({athleteId:meta.athleteId,error:e.message||'Practice intelligence sync failed'});
        }
      }
      return res.status(200).json({
        ok:true,
        count:Number(committed?.count)||rows.length,
        sessionId,
        synced:Array.isArray(committed?.synced)?committed.synced:[],
        intelligenceWarnings
      });
    }
    if(req.method==='GET'){
      const rows=await rest(`coach_practice_timing_results?select=id,session_id,athlete_id,workout_key,season_plan_id,workout_cycle_id,program_week,program_day,session_date,division,group_name,group_id,lane_number,rep_number,time_seconds,target_seconds,target_min_seconds,target_max_seconds,prescribed_rest_seconds,actual_rest_seconds,timing_source,result_status,pace_status,mw_intent,mw_interpretation,created_at&coach_user_id=eq.${encodeURIComponent(c.user.id)}&order=created_at.desc&limit=200`,c.token);
      return res.status(200).json({ok:true,results:rows});
    }
    return res.status(405).json({error:'GET, POST, or DELETE only'});
  }catch(e){return res.status(e.status||500).json({error:e.message||'Practice timing request failed'})}
};