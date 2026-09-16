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
  const reps=group.rows.filter(r=>Number(r.actual_seconds)>0).sort((a,b)=>Number(a.rep_number)-Number(b.rep_number));
  const targeted=reps.filter(r=>Number(r.target_seconds)>0);
  const ratios=targeted.map(r=>Number(r.actual_seconds)/Number(r.target_seconds));
  const deviations=targeted.map(r=>Math.abs(Number(r.actual_seconds)-Number(r.target_seconds))/Number(r.target_seconds)*100);
  const meanDeviation=avg(deviations);
  const paceAccuracy=meanDeviation==null?null:clamp(100-meanDeviation);
  const ratioMean=avg(ratios);
  const consistency=ratios.length&&ratioMean?clamp(100-(std(ratios)/ratioMean*100)):null;
  const dropoff=ratios.length>1?((ratios[ratios.length-1]/ratios[0])-1)*100:null;
  const rpe=completion?.session_rpe==null?null:Number(completion.session_rpe);
  let flag='recorded',reason='Performance recorded';
  if(paceAccuracy!=null){
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
    rep_count:reps.length,
    target_rep_count:targeted.length,
    average_actual_seconds:round(avg(reps.map(r=>Number(r.actual_seconds))),2),
    average_target_seconds:round(avg(targeted.map(r=>Number(r.target_seconds))),2),
    mean_target_deviation_pct:round(meanDeviation,1),
    target_accuracy_pct:round(paceAccuracy,1),
    execution_score_pct:round(paceAccuracy,1),
    consistency_score:round(consistency,1),
    first_to_last_dropoff_pct:round(dropoff,1),
    session_rpe:rpe,
    flag,reason,
    reps:reps.map(r=>({rep_number:Number(r.rep_number),distance_m:r.distance_m==null?null:Number(r.distance_m),target_seconds:r.target_seconds==null?null:Number(r.target_seconds),actual_seconds:Number(r.actual_seconds)}))
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

function summarizeAthlete(athleteId,paceRows,completionRows,strengthRows,strengthCheckins){
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
  const quickStrength=(strengthCheckins||[]).filter(x=>x.athlete_id===athleteId).sort((a,b)=>new Date(b.recorded_at)-new Date(a.recorded_at));

  const latest=sprintSessions[0]||null;
  const flags=[];
  if(latest&&latest.flag==='review')flags.push({level:'attention',type:'sprint_execution',message:latest.reason,workout_key:latest.workout_key});
  else if(latest&&latest.flag==='watch')flags.push({level:'watch',type:'sprint_execution',message:latest.reason,workout_key:latest.workout_key});
  if(trend==='declining')flags.push({level:'watch',type:'trend',message:'Recent target accuracy is trending down across recorded sessions.'});
  return {
    athlete_id:athleteId,
    sprint:{latest,trend,recent_average_execution_pct:round(recentAccuracy,1),session_count:sprintSessions.length,sessions:sprintSessions.slice(0,8)},
    strength:{session_count:strengthSessions.length+quickStrength.length,detailed_session_count:strengthSessions.length,latest:strengthSessions[0]||null,sessions:strengthSessions.slice(0,6),quick_checkins:quickStrength.slice(0,12),latest_checkin:quickStrength[0]||null},
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
    const [pace,completions,strength,strengthCheckins]=await Promise.all([
      repTrackingEnabled?rows(`athlete_pace_logs?select=athlete_id,program_week,program_day,workout_key,rep_number,distance_m,target_seconds,actual_seconds,intensity_percent,recorded_at&${filter}&actual_seconds=not.is.null&order=recorded_at.desc&limit=1500`,c.token):Promise.resolve([]),
      repTrackingEnabled?rows(`workout_completions?select=athlete_id,program_week,program_day,workout_key,completion_status,session_rpe,pace_check_status,pace_reps_total,pace_reps_hit,performance_checked_at,completed_at&${filter}&order=completed_at.desc&limit=1000`,c.token):Promise.resolve([]),
      rows(`athlete_strength_session_logs?select=athlete_id,program_week,program_day,session_label,exercise_name,set_number,reps_completed,target_load,actual_load,weight_unit,set_rpe,recorded_at&${filter}&order=recorded_at.desc&limit=1500`,c.token),
      rows(`athlete_strength_checkins?select=athlete_id,program_week,strength_day,day_label,status,note,recorded_at&${filter}&order=recorded_at.desc&limit=1000`,c.token)
    ]);
    const athletes=athleteIds.map(id=>summarizeAthlete(id,pace,completions,strength,strengthCheckins));
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
