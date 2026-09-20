const SUPABASE_URL = process.env.SUPABASE_URL || 'https://keqgunlfwhjgcsurynef.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_JWCLQzrdWA_ZmvbpV5urVg_rcT6NECm';

function bearer(req){
  const h=String(req.headers?.authorization||'');
  return h.toLowerCase().startsWith('bearer ')?h.slice(7).trim():'';
}
async function sj(url, token){
  const r=await fetch(url,{headers:{apikey:SUPABASE_KEY,Authorization:`Bearer ${token}`,'Content-Type':'application/json'}});
  const d=await r.json().catch(()=>null);
  if(!r.ok) throw new Error(d?.message||d?.msg||d?.error_description||`Supabase request failed (${r.status})`);
  return d;
}
async function authenticate(req){
  const token=bearer(req); if(!token) throw Object.assign(new Error('Authentication required'),{status:401});
  try{const user=await sj(`${SUPABASE_URL}/auth/v1/user`,token);return {token,user}}catch(e){throw Object.assign(new Error('Your MW session is invalid or expired. Sign in again.'),{status:401})}
}
async function one(path,token){const rows=await sj(`${SUPABASE_URL}/rest/v1/${path}`,token);return Array.isArray(rows)?(rows[0]||null):rows}
async function getAccountContext(req,{requireAthlete=false}={}){
  const {token,user}=await authenticate(req);
  const profile=await one(`profiles?select=user_id,first_name,last_name,coach_organization,coach_title,role,account_status&user_id=eq.${encodeURIComponent(user.id)}&limit=1`,token);
  if(!profile) throw Object.assign(new Error('MW profile not found for this login.'),{status:403});
  if(profile.account_status!=='active') throw Object.assign(new Error('This MW account is not active.'),{status:403});

  const role=String(profile.role||'athlete');
  const privileged=['founder_owner','admin','coach'].includes(role);
  if(role==='coach'){
    const [entitlement,billing]=await Promise.all([
      one(`coach_access_entitlements?select=coach_user_id,status,access_tier&coach_user_id=eq.${encodeURIComponent(user.id)}&status=eq.active&limit=1`,token),
      one(`billing_subscriptions?select=plan_code,status,current_period_end,provider,billing_type&beneficiary_user_id=eq.${encodeURIComponent(user.id)}&audience=eq.coach&limit=1`,token)
    ]);
    const paidStatus=['active','trialing','cancel_at_period_end'].includes(String(billing?.status||''));
    const paidPeriod=!billing?.current_period_end||new Date(billing.current_period_end).getTime()>Date.now();
    const expectedPlan={core:'coach_core',intelligence:'coach_intelligence',mw_sprint_performance:'mw_sprint_performance'}[String(entitlement?.access_tier||'')];
    const billingMatches=String(billing?.billing_type||'')==='individual'&&String(billing?.plan_code||'')===String(expectedPlan||'');
    if(!entitlement||!billing||!paidStatus||!paidPeriod||!billingMatches){
      throw Object.assign(new Error('An active paid MW Coach membership is required for Coach access.'),{status:403});
    }
  }
  const athlete=await one(`athletes?select=id,user_id,primary_event,secondary_event,experience_level,program_start_date&user_id=eq.${encodeURIComponent(user.id)}&limit=1`,token);

  if(!athlete){
    if(requireAthlete || !privileged){
      throw Object.assign(new Error('This login is not connected to an MW athlete record.'),{status:403});
    }
    return {
      token,
      user:{id:user.id,email:user.email},
      profile,
      athlete:null,
      programState:null,
      prs:[],
      mode:role==='founder_owner'?'founder':'staff'
    };
  }

  const programState=await one(`athlete_program_state?select=athlete_id,current_week,current_day,current_phase,program_status,start_date,last_completed_workout_at&athlete_id=eq.${encodeURIComponent(athlete.id)}&limit=1`,token);
  const prs=await sj(`${SUPABASE_URL}/rest/v1/athlete_prs?select=event,time_seconds,date_recorded,verified&athlete_id=eq.${encodeURIComponent(athlete.id)}&order=event.asc`,token);
  return {token,user:{id:user.id,email:user.email},profile,athlete,programState,prs:Array.isArray(prs)?prs:[],mode:'athlete'};
}
async function getAthleteContext(req){return getAccountContext(req,{requireAthlete:true})}
module.exports={SUPABASE_URL,SUPABASE_KEY,bearer,authenticate,getAccountContext,getAthleteContext};
