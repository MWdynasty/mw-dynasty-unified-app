const WorkoutIdentity=require('../../../lib/mw-workout-identity');
const {getAccountContext,SUPABASE_URL,SUPABASE_KEY}=require('../../lib/mw-coach-auth');

async function get(path,token){
  const r=await fetch(`${SUPABASE_URL}/rest/v1/${path}`,{headers:{apikey:SUPABASE_KEY,Authorization:`Bearer ${token}`}});
  const d=await r.json().catch(()=>[]);
  if(!r.ok)throw Object.assign(new Error(d?.message||d?.hint||'Roster query failed'),{status:r.status});
  return Array.isArray(d)?d:[];
}
const inList=(values)=>`(${values.map(v=>String(v).replace(/[^a-f0-9-]/gi,'')).filter(Boolean).join(',')})`;

module.exports=async(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='GET')return res.status(405).json({error:'GET only'});
  try{
    const c=await getAccountContext(req);
    const role=String(c.profile.role||'');
    if(!['founder_owner','admin','coach'].includes(role))return res.status(403).json({error:'Coach access required'});

    let assignments=[];
    let pendingInvitations=[];
    let athletes=[];
    if(role==='coach'){
      [assignments,pendingInvitations]=await Promise.all([
        get(`coach_assignments?select=athlete_id,assigned_at,status&coach_user_id=eq.${encodeURIComponent(c.user.id)}&status=eq.active&order=assigned_at.asc`,c.token),
        get(`coach_invitations?select=id,athlete_email,invite_type,status,created_at,expires_at,billing_type,sponsorship_ends_at&coach_user_id=eq.${encodeURIComponent(c.user.id)}&status=eq.pending&order=created_at.desc`,c.token)
      ]);
      const ids=[...new Set(assignments.map(x=>x.athlete_id).filter(Boolean))];
      if(!ids.length)return res.status(200).json({ok:true,scope:'assigned',coach:{name:c.profile.first_name,role},count:0,athletes:[],pendingInvitations});
      athletes=await get(`athletes?select=id,user_id,primary_event,secondary_event,experience_level,program_start_date,competition_division,created_at&id=in.${inList(ids)}&order=created_at.asc`,c.token);
    }else{
      assignments=await get('coach_assignments?select=athlete_id,assigned_at,status,coach_user_id&status=eq.active&order=assigned_at.asc',c.token);
      const ids=[...new Set(assignments.map(x=>x.athlete_id).filter(Boolean))];
      if(!ids.length)return res.status(200).json({ok:true,scope:'assigned_all',coach:{name:c.profile.first_name,role},count:0,athletes:[],pendingInvitations});
      athletes=await get(`athletes?select=id,user_id,primary_event,secondary_event,experience_level,program_start_date,competition_division,created_at&id=in.${inList(ids)}&order=created_at.asc`,c.token);
    }

    if(!athletes.length)return res.status(200).json({ok:true,scope:role==='coach'?'assigned':'assigned_all',coach:{name:c.profile.first_name,role},count:0,athletes:[],pendingInvitations});

    const initialUserIds=athletes.map(a=>a.user_id).filter(Boolean);
    const entitlements=initialUserIds.length
      ? await get(`membership_entitlements?select=user_id,status,access_starts_at,access_ends_at&user_id=in.${inList(initialUserIds)}&status=eq.active`,c.token)
      : [];
    const now=Date.now();
    const activeUsers=new Set(entitlements.filter(e=>{
      const starts=e.access_starts_at?new Date(e.access_starts_at).getTime():0;
      const ends=e.access_ends_at?new Date(e.access_ends_at).getTime():Infinity;
      return (!Number.isFinite(starts)||starts<=now)&&(!Number.isFinite(ends)||ends>now);
    }).map(e=>e.user_id));
    athletes=athletes.filter(a=>a.user_id&&activeUsers.has(a.user_id));

    if(!athletes.length)return res.status(200).json({ok:true,scope:role==='coach'?'assigned':'assigned_all',coach:{name:c.profile.first_name,role},count:0,athletes:[],pendingInvitations});

    const athleteIds=athletes.map(a=>a.id);
    const userIds=athletes.map(a=>a.user_id).filter(Boolean);
    const [profiles,states,prs,seasonPlans,completedWorkouts]=await Promise.all([
      userIds.length?get(`profiles?select=user_id,first_name,last_name&user_id=in.${inList(userIds)}`,c.token):Promise.resolve([]),
      get(`athlete_program_state?select=athlete_id,current_week,current_day,current_phase,program_status,last_completed_workout_at,track_tier,strength_tier,starting_week,program_version,season_plan_id,workout_cycle_id&athlete_id=in.${inList(athleteIds)}`,c.token),
      get(`athlete_prs?select=athlete_id,event,time_seconds,date_recorded,verified&athlete_id=in.${inList(athleteIds)}&order=event.asc`,c.token),
      get(`athlete_season_plans?select=id,athlete_id,source_week_map,plan_status,season_type,season_length_weeks&athlete_id=in.${inList(athleteIds)}&plan_status=eq.active`,c.token).catch(()=>[]),
      get(`workout_completions?select=athlete_id,program_week,program_day,season_plan_id,workout_cycle_id,workout_key,completion_status,pace_check_status,pace_reps_total,pace_reps_hit,performance_checked_at,completed_at&athlete_id=in.${inList(athleteIds)}&completion_status=eq.completed&order=completed_at.desc&limit=1000`,c.token).catch(()=>[])
    ]);

    const pMap=new Map(profiles.map(p=>[p.user_id,p]));
    const sMap=new Map(states.map(s=>[s.athlete_id,s]));
    const planMap=new Map((seasonPlans||[]).map(p=>[p.athlete_id,p]));
    const prMap=new Map();
    for(const p of prs){if(!prMap.has(p.athlete_id))prMap.set(p.athlete_id,[]);prMap.get(p.athlete_id).push(p)}
    const aMap=new Map(assignments.map(a=>[a.athlete_id,a]));
    const latestCompletionMap=new Map();
    for(const row of (completedWorkouts||[])){
      const resolved=WorkoutIdentity.fromRow(row),state=sMap.get(row.athlete_id);
      if(!resolved||!state||resolved.seasonPlanId!==(state.season_plan_id||null)||resolved.workoutCycleId!==(state.season_plan_id?null:(state.workout_cycle_id||null)))continue;
      if(!latestCompletionMap.has(row.athlete_id))latestCompletionMap.set(row.athlete_id,row);
    }

    const out=athletes.map(a=>{
      const p=pMap.get(a.user_id)||{};
      const st=sMap.get(a.id)||{},plan=planMap.get(a.id)||null,latestCompletion=latestCompletionMap.get(a.id)||null;
      const athletePrs=prMap.get(a.id)||[];
      let sourceWeek=Number(st.current_week||1);
      if(plan?.source_week_map){
        try{
          const map=typeof plan.source_week_map==='string'?JSON.parse(plan.source_week_map):plan.source_week_map;
          sourceWeek=Number(map?.[String(st.current_week||1)]?.sourceWeek||sourceWeek);
        }catch{}
      }
      sourceWeek=Math.max(1,Math.min(41,Number(sourceWeek)||1));
      return {
        id:a.id,
        name:[p.first_name,p.last_name].filter(Boolean).join(' ')||'Athlete',
        event:[a.primary_event,a.secondary_event].filter(Boolean).join(' / '),
        primary_event:a.primary_event||null,
        secondary_event:a.secondary_event||null,
        experience_level:a.experience_level||null,
        competition_division:a.competition_division||null,
        current_week:st.current_week||1,
        source_week:sourceWeek,
        season_plan_id:st.season_plan_id||null,
        workout_cycle_id:st.season_plan_id?null:(st.workout_cycle_id||null),
        season_type:plan?.season_type||null,
        season_length_weeks:plan?.season_length_weeks||null,
        current_day:st.current_day||1,
        current_phase:st.current_phase||null,
        track_tier:st.track_tier||null,
        strength_tier:st.strength_tier||null,
        starting_week:st.starting_week||1,
        program_version:st.program_version||null,
        status:st.program_status||'On Track',
        last_completed_workout_at:latestCompletion?.completed_at||st.last_completed_workout_at||null,
        latest_workout:latestCompletion?{
          program_week:Number(latestCompletion.program_week)||null,
          program_day:Number(latestCompletion.program_day)||null,
          workout_key:latestCompletion.workout_key||null,
          season_plan_id:latestCompletion.season_plan_id||null,
          workout_cycle_id:latestCompletion.workout_cycle_id||null,
          completion_status:latestCompletion.completion_status||null,
          pace_check_status:latestCompletion.pace_check_status||null,
          pace_reps_total:latestCompletion.pace_reps_total==null?null:Number(latestCompletion.pace_reps_total),
          pace_reps_hit:latestCompletion.pace_reps_hit==null?null:Number(latestCompletion.pace_reps_hit),
          performance_checked_at:latestCompletion.performance_checked_at||null,
          completed_at:latestCompletion.completed_at||null
        }:null,
        assigned_at:aMap.get(a.id)?.assigned_at||null,
        prs:athletePrs,
        pr:athletePrs.map(x=>`${x.event} ${x.time_seconds}`).join(' · ')||'—'
      };
    });
    return res.status(200).json({ok:true,scope:role==='coach'?'assigned':'assigned_all',coach:{name:c.profile.first_name,role},count:out.length,athletes:out,pendingInvitations});
  }catch(e){return res.status(e.status||500).json({error:e.message||'Roster request failed'})}
};
