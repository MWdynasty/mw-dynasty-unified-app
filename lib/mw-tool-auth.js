(function(){
const SUPABASE_URL='https://keqgunlfwhjgcsurynef.supabase.co';
const SUPABASE_KEY='sb_publishable_JWCLQzrdWA_ZmvbpV5urVg_rcT6NECm';
const SESSION_KEY='mwSupabaseSession';
function persistentSession(){return !!localStorage.getItem(SESSION_KEY)}
function readSession(){try{return JSON.parse(localStorage.getItem(SESSION_KEY)||sessionStorage.getItem(SESSION_KEY)||'null')}catch{return null}}
function saveSession(session){if(!session?.access_token)return;const store=persistentSession()?localStorage:sessionStorage;store.setItem(SESSION_KEY,JSON.stringify(session))}
function coachToolRequested(){return new URLSearchParams(location.search).get('coach')==='1'}
function returnToAthlete(reason){const suffix=reason?'?tool='+encodeURIComponent(reason):'';location.replace('/athlete/'+suffix+'#pacer')}
function returnToCoach(){location.replace('/coach/')}
function clearAndReturnToAthlete(){localStorage.removeItem(SESSION_KEY);sessionStorage.removeItem(SESSION_KEY);returnToAthlete('session')}
async function refreshSession(session){
  if(!session?.refresh_token)return null;
  const r=await fetch(SUPABASE_URL+'/auth/v1/token?grant_type=refresh_token',{
    method:'POST',
    headers:{apikey:SUPABASE_KEY,'Content-Type':'application/json'},
    body:JSON.stringify({refresh_token:session.refresh_token})
  });
  if(!r.ok)return null;
  const fresh=await r.json().catch(()=>null);
  if(!fresh?.access_token)return null;
  const merged={...session,...fresh};
  saveSession(merged);
  return merged;
}
async function currentUser(session){
  let active=session;
  let r=await fetch(SUPABASE_URL+'/auth/v1/user',{headers:{apikey:SUPABASE_KEY,Authorization:'Bearer '+active.access_token}});
  if(r.ok)return {session:active,user:await r.json()};
  active=await refreshSession(active);
  if(!active)return null;
  r=await fetch(SUPABASE_URL+'/auth/v1/user',{headers:{apikey:SUPABASE_KEY,Authorization:'Bearer '+active.access_token}});
  if(!r.ok)return null;
  return {session:active,user:await r.json()};
}
async function api(path,token){const r=await fetch(SUPABASE_URL+'/rest/v1/'+path,{headers:{apikey:SUPABASE_KEY,Authorization:'Bearer '+token}});if(!r.ok)throw new Error(await r.text());return r.json()}
async function rpc(name,token){const r=await fetch(SUPABASE_URL+'/rest/v1/rpc/'+name,{method:'POST',headers:{apikey:SUPABASE_KEY,Authorization:'Bearer '+token,'Content-Type':'application/json'},body:'{}'});if(!r.ok)return null;return r.json()}
function locked(){document.documentElement.classList.remove('mw-tool-pending');document.body.innerHTML='<main style="min-height:100vh;display:grid;place-items:center;background:#02060b;color:#f5f7fb;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Arial,sans-serif;padding:24px"><section style="max-width:520px;border:1px solid #34414d;border-radius:18px;padding:24px;background:#071019"><div style="font-size:12px;color:#f5b92e;font-weight:900;letter-spacing:.08em">MW DYNASTY</div><h1 style="margin:10px 0">Performance tools are locked on this sponsored plan.</h1><p style="color:#a9b5c0;line-height:1.55">The full MW pacing and Distance Pacer suite is part of the MW Sprint Performance athlete experience. Your coach-sponsored plan still includes the training and Coach MW capabilities authorized by your coach tier.</p><a href="/athlete/" style="display:inline-block;margin-top:10px;padding:12px 16px;border-radius:10px;background:#f5b92e;color:#111;text-decoration:none;font-weight:900">BACK TO ATHLETE APP</a></section></main>'}
async function boot(){
  let session=readSession();
  // A locally persisted MW session is enough to render the tool shell immediately.
  // Authorization is still verified below before athlete data/features are loaded.
  if(session?.access_token) document.documentElement.classList.remove('mw-tool-pending');
  if(!session?.access_token){
    if(session?.refresh_token)session=await refreshSession(session);
    if(!session){coachToolRequested()?returnToCoach():returnToAthlete('signin');return}
  }
  try{
    const auth=await currentUser(session);
    if(!auth){clearAndReturnToAthlete();return}
    session=auth.session;
    const user=auth.user;
    session.user=user;
    saveSession(session);
    window.MW_SESSION=session;
    const uid=user.id;
    const profiles=await api('profiles?user_id=eq.'+uid+'&select=first_name,last_name,role,account_status',session.access_token);const account=profiles[0]||null;
    if(!account||account.account_status!=='active'){location.replace('/athlete/?access=membership');return}
    const role=String(account.role||'athlete');
    const privileged=['coach','admin','founder_owner'].includes(role);
    if(privileged&&coachToolRequested()&&location.pathname.startsWith('/distance-pacer/')){
      const check=await fetch('/api/coach/roster',{headers:{Authorization:'Bearer '+session.access_token},cache:'no-store'});
      if(!check.ok){returnToCoach();return}
      window.MW_COACH_TOOL={profile:account,role};
      document.documentElement.classList.remove('mw-tool-pending');
      document.dispatchEvent(new CustomEvent('mw-coach-tool-ready',{detail:window.MW_COACH_TOOL}));
      return;
    }
    if(privileged){returnToCoach();return}
    const featureAccess=await rpc('mw_my_feature_access',session.access_token);
    if(!featureAccess||featureAccess.advanced_performance_tools!==true){locked();return}
    const athletes=await api('athletes?user_id=eq.'+uid+'&select=id,primary_event,secondary_event',session.access_token);const athlete=athletes[0];if(!athlete)throw new Error('athlete not found');
    const [prs,state,repTracking]=await Promise.all([
      api('athlete_prs?athlete_id=eq.'+athlete.id+'&select=event,time_seconds',session.access_token),
      api('athlete_program_state?athlete_id=eq.'+athlete.id+'&select=current_week,current_day,current_phase,program_status',session.access_token),
      rpc('mw_rep_tracking_access',session.access_token)
    ]);
    window.MW_ATHLETE={profile:profiles[0]||{},athlete,prs,state:state[0]||{},repTracking:repTracking===true,featureAccess};
    document.documentElement.classList.remove('mw-tool-pending');document.dispatchEvent(new CustomEvent('mw-athlete-ready',{detail:window.MW_ATHLETE}));
  }catch(e){
    console.warn('MW athlete context',e);
    const refreshed=await refreshSession(session);
    if(refreshed&&refreshed.access_token!==session?.access_token){location.reload();return}
    clearAndReturnToAthlete();
  }
}
boot();
})();
