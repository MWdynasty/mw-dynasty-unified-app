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
      athletes=await get(`athletes?select=id,user_id,primary_event,secondary_event,experience_level,program_start_date,created_at&id=in.${inList(ids)}&order=created_at.asc`,c.token);
    }else{
      assignments=await get('coach_assignments?select=athlete_id,assigned_at,status,coach_user_id&status=eq.active&order=assigned_at.asc',c.token);
      const ids=[...new Set(assignments.map(x=>x.athlete_id).filter(Boolean))];
      if(!ids.length)return res.status(200).json({ok:true,scope:'assigned_all',coach:{name:c.profile.first_name,role},count:0,athletes:[],pendingInvitations});
      athletes=await get(`athletes?select=id,user_id,primary_event,secondary_event,experience_level,program_start_date,created_at&id=in.${inList(ids)}&order=created_at.asc`,c.token);
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
    const [profiles,states,prs]=await Promise.all([
      userIds.length?get(`profiles?select=user_id,first_name,last_name&user_id=in.${inList(userIds)}`,c.token):Promise.resolve([]),
      get(`athlete_program_state?select=athlete_id,current_week,current_day,current_phase,program_status,last_completed_workout_at&athlete_id=in.${inList(athleteIds)}`,c.token),
      get(`athlete_prs?select=athlete_id,event,time_seconds,date_recorded,verified&athlete_id=in.${inList(athleteIds)}&order=event.asc`,c.token)
    ]);

    const pMap=new Map(profiles.map(p=>[p.user_id,p]));
    const sMap=new Map(states.map(s=>[s.athlete_id,s]));
    const prMap=new Map();
    for(const p of prs){if(!prMap.has(p.athlete_id))prMap.set(p.athlete_id,[]);prMap.get(p.athlete_id).push(p)}
    const aMap=new Map(assignments.map(a=>[a.athlete_id,a]));

    const out=athletes.map(a=>{
      const p=pMap.get(a.user_id)||{};
      const st=sMap.get(a.id)||{};
      const athletePrs=prMap.get(a.id)||[];
      return {
        id:a.id,
        name:[p.first_name,p.last_name].filter(Boolean).join(' ')||'Athlete',
        event:[a.primary_event,a.secondary_event].filter(Boolean).join(' / '),
        primary_event:a.primary_event||null,
        secondary_event:a.secondary_event||null,
        experience_level:a.experience_level||null,
        current_week:st.current_week||1,
        current_day:st.current_day||1,
        current_phase:st.current_phase||null,
        status:st.program_status||'On Track',
        last_completed_workout_at:st.last_completed_workout_at||null,
        assigned_at:aMap.get(a.id)?.assigned_at||null,
        prs:athletePrs,
        pr:athletePrs.map(x=>`${x.event} ${x.time_seconds}`).join(' · ')||'—'
      };
    });
    return res.status(200).json({ok:true,scope:role==='coach'?'assigned':'assigned_all',coach:{name:c.profile.first_name,role},count:out.length,athletes:out,pendingInvitations});
  }catch(e){return res.status(e.status||500).json({error:e.message||'Roster request failed'})}
};
