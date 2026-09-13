const {getAccountContext,SUPABASE_URL,SUPABASE_KEY}=require('../../lib/mw-coach-auth');

async function request(path,token,options={}){
  const r=await fetch(`${SUPABASE_URL}/rest/v1/${path}`,{...options,headers:{apikey:SUPABASE_KEY,Authorization:`Bearer ${token}`,'Content-Type':'application/json',...(options.headers||{})}});
  const d=await r.json().catch(()=>null);
  if(!r.ok)throw Object.assign(new Error(d?.message||d?.hint||d?.error||`Athlete request failed (${r.status})`),{status:r.status});
  return d;
}
async function rows(path,token){const d=await request(path,token);return Array.isArray(d)?d:[]}
async function canAccess(c,athleteId){
  const role=String(c.profile.role||'');
  if(role==='founder_owner'||role==='admin')return true;
  if(role!=='coach')return false;
  const a=await rows(`coach_assignments?select=id&coach_user_id=eq.${encodeURIComponent(c.user.id)}&athlete_id=eq.${encodeURIComponent(athleteId)}&status=eq.active&limit=1`,c.token);
  return Boolean(a[0]);
}

module.exports=async(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  try{
    const c=await getAccountContext(req);
    const role=String(c.profile.role||'');
    if(!['founder_owner','admin','coach'].includes(role))return res.status(403).json({error:'Coach access required'});

    if(req.method==='GET'){
      const athleteId=String(req.query?.id||'').trim();
      if(!athleteId)return res.status(400).json({error:'Athlete id required'});
      if(!(await canAccess(c,athleteId)))return res.status(403).json({error:'This athlete is not assigned to your coach account.'});

      const [athlete]=await rows(`athletes?select=id,user_id,date_of_birth,primary_event,secondary_event,selected_events,track_training_years,experience_level,program_start_date,created_at&id=eq.${encodeURIComponent(athleteId)}&limit=1`,c.token);
      if(!athlete)return res.status(404).json({error:'Athlete not found'});
      const [profiles,states,prs,notes,strengthMaxes]=await Promise.all([
        rows(`profiles?select=user_id,first_name,last_name&user_id=eq.${encodeURIComponent(athlete.user_id)}&limit=1`,c.token),
        rows(`athlete_program_state?select=athlete_id,current_week,current_day,current_phase,program_status,start_date,last_completed_workout_at,starting_week,track_tier,strength_tier,program_version,assignment_updated_at,onboarding_assessment_completed_at&athlete_id=eq.${encodeURIComponent(athleteId)}&limit=1`,c.token),
        rows(`athlete_prs?select=id,event,time_seconds,date_recorded,verified,timing_method&athlete_id=eq.${encodeURIComponent(athleteId)}&order=event.asc`,c.token),
        rows(`coach_notes?select=id,note,visibility,created_at,updated_at,coach_user_id&athlete_id=eq.${encodeURIComponent(athleteId)}&order=created_at.desc&limit=20`,c.token)
        ,rows(`athlete_strength_maxes?select=power_clean_max,front_squat_max,back_squat_max,deadlift_max,deadlift_type,weight_unit,updated_at&athlete_id=eq.${encodeURIComponent(athleteId)}&limit=1`,c.token)
      ]);
      const p=profiles[0]||{}, st=states[0]||{};
      return res.status(200).json({ok:true,athlete:{id:athlete.id,name:[p.first_name,p.last_name].filter(Boolean).join(' ')||'Athlete',date_of_birth:athlete.date_of_birth||null,primary_event:athlete.primary_event||null,secondary_event:athlete.secondary_event||null,selected_events:athlete.selected_events||[athlete.primary_event,athlete.secondary_event].filter(Boolean),event:(athlete.selected_events||[athlete.primary_event,athlete.secondary_event]).filter(Boolean).join(' / '),track_training_years:athlete.track_training_years,experience_level:athlete.experience_level||null,program_start_date:athlete.program_start_date||st.start_date||null,current_week:st.current_week||1,current_day:st.current_day||1,current_phase:st.current_phase||null,starting_week:st.starting_week||1,program_status:st.program_status||'On Track',track_tier:st.track_tier||'foundation',strength_tier:st.strength_tier||'foundation',program_version:st.program_version||'mw-41-tiered-v2.9',assessment_completed_at:st.onboarding_assessment_completed_at||null,assignment_updated_at:st.assignment_updated_at||null,last_completed_workout_at:st.last_completed_workout_at||null,strength_maxes:strengthMaxes[0]||null,prs,notes}});
    }

    if(req.method==='POST'){
      const b=typeof req.body==='string'?JSON.parse(req.body||'{}'):(req.body||{});
      const athleteId=String(b.athleteId||'').trim();
      if(b.action==='update_assignment'){
        if(!athleteId)return res.status(400).json({error:'Athlete is required'});
        if(!(await canAccess(c,athleteId)))return res.status(403).json({error:'This athlete is not assigned to your coach account.'});
        const allowed=['foundation','development','performance'];
        const trackTier=String(b.trackTier||'').toLowerCase(),strengthTier=String(b.strengthTier||'').toLowerCase();
        const week=Math.max(1,Math.min(41,Math.trunc(Number(b.week)||1)));
        if(!allowed.includes(trackTier)||!allowed.includes(strengthTier))return res.status(400).json({error:'A valid track and strength tier are required.'});
        const reason=String(b.reason||'Coach-approved tier assignment').trim().slice(0,1000);
        const updated=await request(`athlete_program_state?athlete_id=eq.${encodeURIComponent(athleteId)}`,c.token,{method:'PATCH',headers:{Prefer:'return=representation'},body:JSON.stringify({track_tier:trackTier,strength_tier:strengthTier,current_week:week,program_version:'mw-41-tiered-v2.9',assignment_updated_at:new Date().toISOString(),assignment_updated_by:c.user.id})});
        await request('athlete_program_assignment_history',c.token,{method:'POST',headers:{Prefer:'return=minimal'},body:JSON.stringify({athlete_id:athleteId,track_tier:trackTier,strength_tier:strengthTier,week,reason,changed_by:c.user.id})});
        return res.status(200).json({ok:true,assignment:Array.isArray(updated)?updated[0]:updated});
      }
      const note=String(b.note||'').trim().slice(0,5000);
      if(!athleteId||!note)return res.status(400).json({error:'Athlete and note are required'});
      if(!(await canAccess(c,athleteId)))return res.status(403).json({error:'This athlete is not assigned to your coach account.'});
      const d=await request('coach_notes',c.token,{method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify({athlete_id:athleteId,coach_user_id:c.user.id,note,visibility:'private_staff'})});
      const saved=Array.isArray(d)?d[0]:d;
      return res.status(201).json({ok:true,note:saved});
    }

    return res.status(405).json({error:'GET or POST only'});
  }catch(e){return res.status(e.status||500).json({error:e.message||'Athlete request failed'})}
};
