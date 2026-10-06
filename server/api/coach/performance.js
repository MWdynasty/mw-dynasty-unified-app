const {getAccountContext,SUPABASE_URL,SUPABASE_KEY}=require('../../lib/mw-coach-auth');

async function rows(path,token){
  const r=await fetch(`${SUPABASE_URL}/rest/v1/${path}`,{headers:{apikey:SUPABASE_KEY,Authorization:`Bearer ${token}`}});
  const d=await r.json().catch(()=>[]);
  if(!r.ok)throw Object.assign(new Error(d?.message||d?.hint||d?.error||'Performance query failed'),{status:r.status});
  return Array.isArray(d)?d:[];
}
const cleanId=(v)=>String(v||'').replace(/[^a-f0-9-]/gi,'');
const inList=(values)=>`(${[...new Set(values.map(cleanId).filter(Boolean))].join(',')})`;
const clamp=(n,min=0,max=100)=>Math.max(min,Math.min(max,n));
const avg=(a)=>a.length?a.reduce((s,x)=>s+x,0)/a.length:null;
const std=(a)=>{if(a.length<2)return 0;const m=avg(a);return Math.sqrt(a.reduce((s,x)=>s+Math.pow(x-m,2),0)/a.length)};
const round=(n,d=1)=>Number.isFinite(n)?Number(n.toFixed(d)):null;

function sprintSession(group,completion){
  const reps=group.rows.filter(r=>Number(r.actual_seconds)>0&&r.result_status!=='dnf').sort((a,b)=>Number(a.rep_number)-Number(b.rep_number));
  const targeted=reps.filter(r=>Number(r.target_seconds)>0);
  const ratios=targeted.map(r=>Number(r.actual_seconds)/Number(r.target_seconds));
  const deviations=targeted.map(r=>Math.abs(Number(r.actual_seconds)-Number(r.target_seconds))/Number(r.target_seconds)*100);
  const meanDeviation=avg(deviations);
  const paceAccuracy=meanDeviation==null?null:clamp(100-meanDeviation);
  const explicitPace=targeted.filter(r=>['on_pace','outside_target'].includes(String(r.pace_status||'')));
  const explicitHits=explicitPace.filter(r=>String(r.pace_status)==='on_pace').length;
  const explicitExecution=explicitPace.length?clamp(explicitHits/explicitPace.length*100):null;
  const execution=explicitExecution==null?paceAccuracy:explicitExecution;
  // Without targets, compare actual times only for reps of one known distance.
  // Never infer target execution or compare unlike distances from raw times.
  const sameDistance=reps.length>1&&Number(reps[0].distance_m)>0&&reps.every(r=>Number(r.distance_m)===Number(reps[0].distance_m));
  const fullTargets=reps.length>1&&targeted.length===reps.length;
  const comparable=fullTargets?ratios:sameDistance?reps.map(r=>Number(r.actual_seconds)):[];
  const comparisonMean=avg(comparable);
  const consistency=comparable.length>1&&comparisonMean?clamp(100-(std(comparable)/comparisonMean*100)):null;
  const dropoff=comparable.length>1?((comparable[comparable.length-1]/comparable[0])-1)*100:null;
  const comparisonBasis=fullTargets?'target_ratios':sameDistance?'actual_times':null;
  const rpe=completion?.session_rpe==null?null:Number(completion.session_rpe);
  let flag='recorded',reason='Performance recorded';
  if(explicitExecution!=null){
    if(explicitHits===explicitPace.length){flag='ontrack';reason='All prescribed reps were on target pace'}
    else if(explicitExecution<50){flag='review';reason=`Only ${explicitHits}/${explicitPace.length} reps were on target pace`}
    else if(explicitExecution<80){flag='watch';reason=`${explicitHits}/${explicitPace.length} reps were on target pace`}
    else {flag='ontrack';reason=`${explicitHits}/${explicitPace.length} reps were on target pace`}
  }else if(paceAccuracy!=null){
    if((meanDeviation??0)>=6 || (dropoff??0)>=6){flag='review';reason=(dropoff??0)>=6?'Late-rep drop-off needs review':'Target deviation needs review'}
    else if((meanDeviation??0)>=3.5 || (dropoff??0)>=3.5 || (rpe??0)>=9){flag='watch';reason=(rpe??0)>=9?'High reported session effort':'Execution trend worth watching'}
    else {flag='ontrack';reason='Execution stayed close to target'}
  }else if((rpe??0)>=9){flag='watch';reason='High reported session effort'}
  return {
    workout_key:group.workout_key,
    program_week:group.program_week,
    program_day:group.program_day,
    recorded_at:group.latest,
    completed_at:completion?.completed_at||null,
    source:'timed_reps',
    entry_sources:[...new Set(reps.map(r=>r.entry_source||'athlete'))],
    timing_sources:[...new Set(reps.map(r=>r.timing_source||r.entry_source||'athlete'))],
    coach_session_ids:[...new Set(reps.map(r=>r.coach_session_id).filter(Boolean))],
    rep_count:reps.length,
    target_rep_count:targeted.length,
    pace_reps_hit:explicitExecution==null?null:explicitHits,
    pace_reps_total:explicitExecution==null?null:explicitPace.length,
    average_actual_seconds:round(avg(reps.map(r=>Number(r.actual_seconds))),2),
    average_target_seconds:round(avg(targeted.map(r=>Number(r.target_seconds))),2),
    mean_target_deviation_pct:round(meanDeviation,1),
    target_accuracy_pct:round(paceAccuracy,1),
    execution_score_pct:round(execution,1),
    consistency_score:round(consistency,1),
    first_to_last_dropoff_pct:round(dropoff,1),
    comparison_basis:comparisonBasis,
    session_rpe:rpe,
    flag,reason,
    reps:reps.map(r=>({rep_number:Number(r.rep_number),distance_m:r.distance_m==null?null:Number(r.distance_m),target_seconds:r.target_seconds==null?null:Number(r.target_seconds),actual_seconds:Number(r.actual_seconds),pace_status:r.pace_status||null,entry_source:r.entry_source||'athlete',timing_source:r.timing_source||r.entry_source||'athlete',result_status:r.result_status||'finished'}))
  };
}


function coachPracticeSession(rows){
  const reps=(rows||[]).filter(r=>Number(r.time_seconds)>0).sort((a,b)=>Number(a.rep_number)-Number(b.rep_number));
  if(!reps.length)return null;
  const targeted=reps.filter(r=>Number(r.target_min_seconds)>0&&Number(r.target_max_seconds)>0);
  const onTarget=targeted.filter(r=>Number(r.time_seconds)>=Number(r.target_min_seconds)&&Number(r.time_seconds)<=Number(r.target_max_seconds));
  const tooFast=targeted.filter(r=>Number(r.time_seconds)<Number(r.target_min_seconds));
  const tooSlow=targeted.filter(r=>Number(r.time_seconds)>Number(r.target_max_seconds));
  const execution=targeted.length?onTarget.length/targeted.length*100:null;
  const actuals=reps.map(r=>Number(r.time_seconds));
  const mean=avg(actuals),consistency=mean&&actuals.length>1?clamp(100-(std(actuals)/mean*100)):actuals.length===1?100:null;
  const third=Math.max(1,Math.ceil(reps.length/3));
  const early=avg(reps.slice(0,third).map(r=>Number(r.time_seconds)));
  const late=avg(reps.slice(-third).map(r=>Number(r.time_seconds)));
  const lateDropoff=early&&late?(late/early-1)*100:null;
  const recovery=reps.map(r=>Number(r.actual_rest_seconds)).filter(x=>Number.isFinite(x)&&x>=0);
  return {
    source:'coach_practice',
    session_id:reps[0].session_id||null,
    session_date:reps[0].session_date||null,
    division:reps[0].division||null,
    group_name:reps[0].group_name||null,
    rep_count:reps.length,
    target_rep_count:targeted.length,
    pace_reps_hit:onTarget.length,
    too_fast_count:tooFast.length,
    too_slow_count:tooSlow.length,
    execution_score_pct:round(execution,1),
    consistency_score:round(consistency,1),
    late_session_dropoff_pct:round(lateDropoff,1),
    average_actual_recovery_seconds:round(avg(recovery),1),
    timing_sources:[...new Set(reps.map(r=>r.timing_source||'coach'))],
    reps:reps.map(r=>({rep_number:Number(r.rep_number),lane_number:r.lane_number==null?null:Number(r.lane_number),actual_seconds:Number(r.time_seconds),target_min_seconds:r.target_min_seconds==null?null:Number(r.target_min_seconds),target_max_seconds:r.target_max_seconds==null?null:Number(r.target_max_seconds),pace_status:r.pace_status||null,actual_rest_seconds:r.actual_rest_seconds==null?null:Number(r.actual_rest_seconds)}))
  };
}

function quickSprintSession(completion){
  const total=Number(completion?.pace_reps_total||0),hit=Number(completion?.pace_reps_hit||0);
  if(!(total>0))return null;
  const pct=clamp(hit/total*100);
  let flag='ontrack',reason=`${hit}/${total} reps on target pace`;
  if(hit===total){flag='ontrack';reason='All prescribed reps were on target pace'}
  else if(pct<50){flag='review';reason=`Only ${hit}/${total} reps were on target pace`}
  else if(pct<80){flag='watch';reason=`${hit}/${total} reps were on target pace`}
  return {
    workout_key:completion.workout_key,program_week:completion.program_week,program_day:completion.program_day,
    recorded_at:completion.performance_checked_at||completion.completed_at,completed_at:completion.completed_at||null,source:'quick_checkin',
    rep_count:total,target_rep_count:total,average_actual_seconds:null,average_target_seconds:null,mean_target_deviation_pct:null,
    target_accuracy_pct:null,execution_score_pct:round(pct,1),consistency_score:null,first_to_last_dropoff_pct:null,session_rpe:completion.session_rpe==null?null:Number(completion.session_rpe),
    pace_reps_hit:hit,pace_reps_total:total,flag,reason,reps:[]
  };
}

function summarizeAthlete(athleteId,paceRows,completionRows,strengthRows,strengthCheckins,practiceRows=[],strengthMaxHistory=[]){
  const completionMap=new Map(completionRows.filter(x=>x.athlete_id===athleteId).map(x=>[x.workout_key,x]));
  const groups=new Map();
  for(const r of paceRows.filter(x=>x.athlete_id===athleteId)){
    const key=r.workout_key||`w${r.program_week}-d${r.program_day}`;
    if(!groups.has(key))groups.set(key,{workout_key:key,program_week:r.program_week,program_day:r.program_day,latest:r.recorded_at,rows:[]});
    const g=groups.get(key);g.rows.push(r);if(new Date(r.recorded_at)>new Date(g.latest))g.latest=r.recorded_at;
  }
  const detailed=[...groups.values()].map(g=>sprintSession(g,completionMap.get(g.workout_key)));
  const detailedKeys=new Set(detailed.map(x=>x.workout_key));
  const quick=completionRows.filter(x=>x.athlete_id===athleteId&&Number(x.pace_reps_total)>0&&!detailedKeys.has(x.workout_key)).map(quickSprintSession).filter(Boolean);
  const sprintSessions=[...detailed,...quick].sort((a,b)=>new Date(b.recorded_at||0)-new Date(a.recorded_at||0));
  const scored=sprintSessions.filter(s=>s.execution_score_pct!=null);
  const recent=scored.slice(0,3),prior=scored.slice(3,6);
  const recentAccuracy=avg(recent.map(x=>x.execution_score_pct)),priorAccuracy=avg(prior.map(x=>x.execution_score_pct));
  let trend='insufficient_data';
  if(recent.length>=2&&prior.length>=2){const delta=recentAccuracy-priorAccuracy;trend=delta>1?'improving':delta<-1?'declining':'stable'}

  const strength=strengthRows.filter(x=>x.athlete_id===athleteId).sort((a,b)=>new Date(b.recorded_at)-new Date(a.recorded_at));
  const strengthGroups=new Map();
  for(const r of strength){
    const date=String(r.recorded_at||'').slice(0,10),key=`${r.program_week}|${r.program_day||0}|${r.session_label||''}|${date}`;
    if(!strengthGroups.has(key))strengthGroups.set(key,{program_week:r.program_week,program_day:r.program_day,session_label:r.session_label||'Strength Session',recorded_at:r.recorded_at,sets:[],actual_volume:0,target_volume:0});
    const g=strengthGroups.get(key);g.sets.push(r);
    if(Number(r.actual_load)>=0&&Number(r.reps_completed)>=0)g.actual_volume+=Number(r.actual_load||0)*Number(r.reps_completed||0);
    if(Number(r.target_load)>=0&&Number(r.reps_completed)>=0)g.target_volume+=Number(r.target_load||0)*Number(r.reps_completed||0);
  }
  const strengthSessions=[...strengthGroups.values()].sort((a,b)=>new Date(b.recorded_at)-new Date(a.recorded_at)).map(g=>({
    program_week:g.program_week,program_day:g.program_day,session_label:g.session_label,recorded_at:g.recorded_at,set_count:g.sets.length,
    actual_volume:round(g.actual_volume,1),target_volume:g.target_volume?round(g.target_volume,1):null,
    exercises:[...new Set(g.sets.map(x=>x.exercise_name))],
    sets:g.sets.slice(0,40).map(x=>({exercise_name:x.exercise_name,set_number:x.set_number,reps_completed:x.reps_completed,target_load:x.target_load,actual_load:x.actual_load,weight_unit:x.weight_unit,set_rpe:x.set_rpe}))
  }));
  const quickStrength=(strengthCheckins||[]).filter(x=>x.athlete_id===athleteId).sort((a,b)=>new Date(b.completed_at||b.recorded_at)-new Date(a.completed_at||a.recorded_at));
  const completedStrength=quickStrength.filter(x=>String(x.lifecycle_status||'completed')==='completed');
  const asWrittenStrength=completedStrength.filter(x=>String(x.status||'')==='as_prescribed');
  const responseStrength=completedStrength.filter(x=>['strong','normal','heavy'].includes(String(x.session_feel||''))).slice(0,6);
  let strengthResponseTrend='insufficient_data';
  if(responseStrength.length>=2){
    const recentFeel=responseStrength.slice(0,2).map(x=>String(x.session_feel||''));
    strengthResponseTrend=recentFeel.every(x=>x==='strong'||x==='normal')?'stable':recentFeel.every(x=>x==='heavy')?'review':'watch';
  }
  const asWrittenPct=completedStrength.length?round(asWrittenStrength.length/completedStrength.length*100,1):null;
  const maxHistory=(strengthMaxHistory||[]).filter(x=>x.athlete_id===athleteId).sort((a,b)=>new Date(a.recorded_at||0)-new Date(b.recorded_at||0));
  const maxBaseline=maxHistory[0]||null,maxLatest=maxHistory[maxHistory.length-1]||null;
  const maxProgression={baseline_at:maxBaseline?.recorded_at||null,latest_at:maxLatest?.recorded_at||null,weight_unit:maxLatest?.weight_unit||maxBaseline?.weight_unit||null,changes:{}};
  for(const [key,col] of [['power_clean','power_clean_max'],['front_squat','front_squat_max'],['back_squat','back_squat_max'],['deadlift','deadlift_max']]){
    const base=Number(maxBaseline?.[col]),current=Number(maxLatest?.[col]),sameUnit=maxBaseline&&maxLatest&&String(maxBaseline.weight_unit||'')===String(maxLatest.weight_unit||'');
    maxProgression.changes[key]={baseline:Number.isFinite(base)?base:null,current:Number.isFinite(current)?current:null,delta:sameUnit&&Number.isFinite(base)&&Number.isFinite(current)?round(current-base,1):null};
  }

  const practiceGroups=new Map();
  for(const r of practiceRows.filter(x=>x.athlete_id===athleteId)){const key=r.session_id||`${r.session_date}|${r.group_name||''}`;if(!practiceGroups.has(key))practiceGroups.set(key,[]);practiceGroups.get(key).push(r)}
  const coachPracticeSessions=[...practiceGroups.values()].map(coachPracticeSession).filter(Boolean).sort((a,b)=>String(b.session_date||'').localeCompare(String(a.session_date||'')));
  const latest=sprintSessions[0]||null;
  const latestSprintExecution=latest?.execution_score_pct==null?null:Number(latest.execution_score_pct);
  let combinedStrengthSprintSignal='insufficient_shared_data';
  if(completedStrength.length>=2&&Number.isFinite(latestSprintExecution)){
    if(strengthResponseTrend==='review'&&latestSprintExecution<70)combinedStrengthSprintSignal='coach_review';
    else if(strengthResponseTrend==='review')combinedStrengthSprintSignal='strength_response_watch';
    else if(strengthResponseTrend==='stable'&&latestSprintExecution>=70)combinedStrengthSprintSignal='synchronized_on_track';
    else if(latestSprintExecution<70)combinedStrengthSprintSignal='sprint_execution_watch';
    else combinedStrengthSprintSignal='monitor';
  }
  const flags=[];
  if(latest&&latest.flag==='review')flags.push({level:'attention',type:'sprint_execution',message:latest.reason,workout_key:latest.workout_key});
  else if(latest&&latest.flag==='watch')flags.push({level:'watch',type:'sprint_execution',message:latest.reason,workout_key:latest.workout_key});
  if(trend==='declining')flags.push({level:'watch',type:'trend',message:'Recent target accuracy is trending down across recorded sessions.'});
  if(combinedStrengthSprintSignal==='coach_review')flags.push({level:'attention',type:'combined_load_response',message:'Repeated HEAVY strength response is occurring alongside lower sprint target execution. Review total training stress before progressing load.'});
  else if(strengthResponseTrend==='review')flags.push({level:'watch',type:'strength_response',message:'The athlete reported HEAVY on two consecutive completed strength sessions. Review recovery and the next programmed load before progressing.'});
  else if(strengthResponseTrend==='watch')flags.push({level:'watch',type:'strength_response',message:'Recent strength-session responses are mixed. Continue monitoring before changing the programmed progression.'});
  return {
    athlete_id:athleteId,
    sprint:{latest,trend,recent_average_execution_pct:round(recentAccuracy,1),session_count:sprintSessions.length,sessions:sprintSessions.slice(0,8),coach_practice_latest:coachPracticeSessions[0]||null,coach_practice_sessions:coachPracticeSessions.slice(0,8)},
    strength:{session_count:completedStrength.length,detailed_session_count:strengthSessions.length,latest:strengthSessions[0]||null,sessions:strengthSessions.slice(0,6),quick_checkins:quickStrength.slice(0,12),latest_checkin:quickStrength[0]||null,as_prescribed_pct:asWrittenPct,response_trend:strengthResponseTrend,latest_response:responseStrength[0]?.session_feel||null,response_history:responseStrength.map(x=>({program_week:x.program_week,strength_day:x.strength_day,day_label:x.day_label,session_feel:x.session_feel,status:x.status,completed_at:x.completed_at||x.recorded_at})),combined_signal:combinedStrengthSprintSignal,max_progression:maxProgression},
    flags
  };
}

module.exports=async(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='GET')return res.status(405).json({error:'GET only'});
  try{
    const c=await getAccountContext(req);const role=String(c.profile.role||'');
    if(!['founder_owner','admin','coach'].includes(role))return res.status(403).json({error:'Coach access required'});
    let coachTier=['founder_owner','admin'].includes(role)?'mw_sprint_performance':null;
    if(role==='coach'){
      const tr=await fetch(`${SUPABASE_URL}/rest/v1/rpc/mw_coach_access_tier`,{method:'POST',headers:{apikey:SUPABASE_KEY,Authorization:`Bearer ${c.token}`,'Content-Type':'application/json'},body:'{}'});
      coachTier=await tr.json().catch(()=>null);
      if(!tr.ok||!['intelligence','mw_sprint_performance'].includes(coachTier))return res.status(403).json({error:'Coach Intelligence or MW Sprint Performance access required'});
    }
    const repTrackingEnabled=coachTier==='mw_sprint_performance';
    const requested=cleanId(req.query?.athleteId);
    let athleteIds=[];
    if(role==='coach'){
      const assignments=await rows(`coach_assignments?select=athlete_id&coach_user_id=eq.${encodeURIComponent(c.user.id)}&status=eq.active&limit=500`,c.token);
      athleteIds=assignments.map(x=>x.athlete_id).filter(Boolean);
      if(requested&&!athleteIds.includes(requested))return res.status(403).json({error:'This athlete is not assigned to your coach account.'});
    }else if(requested){athleteIds=[requested]}
    else {const all=await rows('athletes?select=id&limit=500',c.token);athleteIds=all.map(x=>x.id)}
    if(requested)athleteIds=[requested];
    if(!athleteIds.length)return res.status(200).json({ok:true,rep_tracking_enabled:repTrackingEnabled,athletes:[],summary:{athletes_with_sprint_data:0,athletes_with_strength_data:0,review_flags:0,average_latest_execution_pct:null}});
    const filter=`athlete_id=in.${inList(athleteIds)}`;
    const [pace,athletePractice,completions,strength,strengthCheckins,practiceTiming,strengthMaxHistory]=await Promise.all([
      repTrackingEnabled?rows(`athlete_pace_logs?select=athlete_id,program_week,program_day,workout_key,rep_number,distance_m,target_seconds,actual_seconds,intensity_percent,recorded_at&${filter}&actual_seconds=not.is.null&order=recorded_at.desc&limit=1500`,c.token):Promise.resolve([]),
      repTrackingEnabled?rows(`athlete_practice_rep_results?select=athlete_id,program_week,program_day,workout_key,rep_number,distance_m,time_seconds,target_seconds,pace_status,recorded_at,entry_source,timing_source,result_status,coach_session_id&${filter}&time_seconds=not.is.null&order=recorded_at.desc&limit=1500`,c.token):Promise.resolve([]),
      repTrackingEnabled?rows(`workout_completions?select=athlete_id,program_week,program_day,workout_key,completion_status,session_rpe,pace_check_status,pace_reps_total,pace_reps_hit,performance_checked_at,completed_at&${filter}&completion_status=eq.completed&order=completed_at.desc&limit=1000`,c.token):Promise.resolve([]),
      rows(`athlete_strength_session_logs?select=athlete_id,program_week,program_day,session_label,exercise_name,set_number,reps_completed,target_load,actual_load,weight_unit,set_rpe,recorded_at&${filter}&order=recorded_at.desc&limit=1500`,c.token),
      rows(`athlete_strength_checkins?select=athlete_id,program_week,strength_day,day_label,status,note,session_feel,lifecycle_status,completed_at,recorded_at&${filter}&order=recorded_at.desc&limit=1000`,c.token),
      rows(`coach_practice_timing_results?select=session_id,athlete_id,session_date,division,group_name,lane_number,rep_number,time_seconds,target_min_seconds,target_max_seconds,actual_rest_seconds,timing_source,pace_status,created_at&${filter}&order=created_at.desc&limit=2000`,c.token).catch(()=>[]),
      rows(`athlete_strength_max_history?select=athlete_id,power_clean_max,front_squat_max,back_squat_max,deadlift_max,deadlift_type,weight_unit,last_max_test,recorded_at,change_source&${filter}&order=recorded_at.asc&limit=1500`,c.token).catch(()=>[])
    ]);
    const paceMap=new Map();
    for(const row of pace||[])paceMap.set(`${row.athlete_id}|${row.workout_key}|${row.rep_number}`,row);
    for(const row of athletePractice||[]){
      paceMap.set(`${row.athlete_id}|${row.workout_key}|${row.rep_number}`,{
        athlete_id:row.athlete_id,program_week:row.program_week,program_day:row.program_day,workout_key:row.workout_key,
        rep_number:row.rep_number,distance_m:row.distance_m,target_seconds:row.target_seconds,
        actual_seconds:row.time_seconds,pace_status:row.pace_status,recorded_at:row.recorded_at,
        entry_source:row.entry_source||'athlete',timing_source:row.timing_source||row.entry_source||'athlete',
        result_status:row.result_status||'finished',coach_session_id:row.coach_session_id||null
      });
    }
    const combinedPace=[...paceMap.values()];
    const athletes=athleteIds.map(id=>summarizeAthlete(id,combinedPace,completions,strength,strengthCheckins,practiceTiming,strengthMaxHistory));
    const latestExec=athletes.map(a=>a.sprint.latest?.execution_score_pct).filter(Number.isFinite);
    const summary={
      athletes_with_sprint_data:athletes.filter(a=>a.sprint.session_count>0).length,
      athletes_with_strength_data:athletes.filter(a=>a.strength.session_count>0||a.strength.quick_checkins.length>0).length,
      review_flags:athletes.reduce((n,a)=>n+a.flags.filter(f=>f.level==='attention').length,0),
      watch_flags:athletes.reduce((n,a)=>n+a.flags.filter(f=>f.level==='watch').length,0),
      average_latest_execution_pct:round(avg(latestExec),1)
    };
    return res.status(200).json({ok:true,rep_tracking_enabled:repTrackingEnabled,athletes,summary,athlete:requested?athletes[0]||null:undefined});
  }catch(e){return res.status(e.status||500).json({error:e.message||'Performance intelligence request failed'})}
};
