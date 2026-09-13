(function(){
const SUPABASE_URL='https://keqgunlfwhjgcsurynef.supabase.co';
const SUPABASE_KEY='sb_publishable_JWCLQzrdWA_ZmvbpV5urVg_rcT6NECm';
const SESSION_KEY='mwSupabaseSession';
async function api(path,token){const r=await fetch(SUPABASE_URL+'/rest/v1/'+path,{headers:{apikey:SUPABASE_KEY,Authorization:'Bearer '+token}});if(!r.ok)throw new Error(await r.text());return r.json()}
async function boot(){
  let session=null;
  try{session=JSON.parse(localStorage.getItem(SESSION_KEY)||'null')}catch{}
  if(!session?.access_token){location.replace('/');return}
  try{
    const ur=await fetch(SUPABASE_URL+'/auth/v1/user',{headers:{apikey:SUPABASE_KEY,Authorization:'Bearer '+session.access_token}});
    if(!ur.ok)throw new Error('session expired');
    const user=await ur.json(); session.user=user; window.MW_SESSION=session;
    const uid=user.id;
    const profiles=await api('profiles?user_id=eq.'+uid+'&select=first_name,last_name,role,account_status',session.access_token);
    const account=profiles[0]||null;
    if(!account || account.account_status!=='active'){
      localStorage.removeItem(SESSION_KEY);
      location.replace('/?access=membership');
      return;
    }
    const athletes=await api('athletes?user_id=eq.'+uid+'&select=id,primary_event,secondary_event',session.access_token);
    const athlete=athletes[0]; if(!athlete)throw new Error('athlete not found');
    const [prs,state]=await Promise.all([
      api('athlete_prs?athlete_id=eq.'+athlete.id+'&select=event,time_seconds',session.access_token),
      api('athlete_program_state?athlete_id=eq.'+athlete.id+'&select=current_week,current_day,current_phase,program_status',session.access_token)
    ]);
    window.MW_ATHLETE={profile:profiles[0]||{},athlete,prs,state:state[0]||{}};
    document.documentElement.classList.remove('mw-tool-pending'); document.dispatchEvent(new CustomEvent('mw-athlete-ready',{detail:window.MW_ATHLETE}));
  }catch(e){console.warn('MW athlete context',e);localStorage.removeItem(SESSION_KEY);location.replace('/')}
}
boot();
})();
