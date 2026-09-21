(function(){
  'use strict';
  if(window.MWResilience)return;

  const SUPABASE_URL='https://keqgunlfwhjgcsurynef.supabase.co';
  const SUPABASE_KEY='sb_publishable_JWCLQzrdWA_ZmvbpV5urVg_rcT6NECm';
  const SESSION_KEYS=['mwSupabaseSession','mwCoachSupabaseSession'];
  const TRANSIENT=new Set([408,425,429,500,502,503,504]);
  const nativeFetch=window.fetch.bind(window);
  const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  const state={online:navigator.onLine,lastRecoveredAt:null,refreshing:new Map(),mode:navigator.onLine?'normal':'offline',lastFailureAt:null};
  function setMode(mode,detail){
    if(state.mode===mode)return;
    state.mode=mode;
    document.documentElement.dataset.mwControlMode=mode;
    window.dispatchEvent(new CustomEvent('mw:control-mode',{detail:{mode,...(detail||{})}}));
  }

  function isTransientStatus(status){return TRANSIENT.has(Number(status))}
  function urlOf(input){
    try{return new URL(typeof input==='string'?input:input.url,location.href)}catch{return null}
  }
  function methodOf(input,init){
    return String(init?.method||(typeof input!=='string'&&input?.method)||'GET').toUpperCase()
  }
  function eligible(url){
    return !!url&&(url.origin===location.origin||url.href.startsWith(SUPABASE_URL))
  }
  function readRecords(){
    const out=[];
    for(const storage of [localStorage,sessionStorage]){
      for(const key of SESSION_KEYS){
        try{
          const raw=storage.getItem(key);if(!raw)continue;
          const session=JSON.parse(raw);if(session?.access_token||session?.refresh_token)out.push({storage,key,session});
        }catch{}
      }
    }
    return out
  }
  function persist(rec,next){
    const merged=Object.assign({},rec.session||{},next||{});
    if(!merged.expires_at&&merged.expires_in)merged.expires_at=Math.floor(Date.now()/1000)+Number(merged.expires_in||0);
    rec.storage.setItem(rec.key,JSON.stringify(merged));
    rec.session=merged;
    window.dispatchEvent(new CustomEvent('mw:session-refreshed',{detail:{key:rec.key,session:merged}}));
    return merged
  }
  function bearerFrom(input,init){
    try{
      const h=new Headers((init&&init.headers)||(typeof input!=='string'?input.headers:undefined)||{});
      const a=String(h.get('Authorization')||'');
      return a.toLowerCase().startsWith('bearer ')?a.slice(7).trim():''
    }catch{return ''}
  }
  function recordForToken(token){
    if(!token)return null;
    return readRecords().find(x=>x.session?.access_token===token)||null
  }
  async function refreshRecord(rec){
    if(!rec?.session?.refresh_token)return null;
    const id=rec.key+':'+(rec.storage===localStorage?'local':'session');
    if(state.refreshing.has(id))return state.refreshing.get(id);
    const work=(async()=>{
      let last=null;
      for(let attempt=0;attempt<3;attempt++){
        try{
          const r=await nativeFetch(SUPABASE_URL+'/auth/v1/token?grant_type=refresh_token',{
            method:'POST',
            headers:{apikey:SUPABASE_KEY,'Content-Type':'application/json'},
            body:JSON.stringify({refresh_token:rec.session.refresh_token})
          });
          const d=await r.json().catch(()=>({}));
          if(r.ok&&d?.access_token)return persist(rec,d);
          if(!isTransientStatus(r.status))return null;
          last=new Error(d?.error_description||d?.msg||'Session refresh temporarily unavailable');
        }catch(e){last=e}
        if(attempt<2)await sleep(180*(2**attempt));
      }
      if(last)throw last;
      return null
    })().finally(()=>state.refreshing.delete(id));
    state.refreshing.set(id,work);
    return work
  }
  async function proactiveRefresh(){
    const now=Date.now();
    for(const rec of readRecords()){
      const exp=Number(rec.session?.expires_at||0)*1000;
      if(rec.session?.refresh_token&&(!exp||exp<=now+2*60*1000)){
        try{await refreshRecord(rec)}catch{}
      }
    }
  }
  function rebuild(input,init,newToken){
    if(typeof input==='string'){
      const headers=new Headers(init?.headers||{});
      headers.set('Authorization','Bearer '+newToken);
      return [input,Object.assign({},init||{},{headers})]
    }
    try{
      const request=new Request(input,init||{});
      const headers=new Headers(request.headers);
      headers.set('Authorization','Bearer '+newToken);
      const retry=new Request(request,{headers});
      return [retry,undefined]
    }catch{return [input,init]}
  }
  async function resilientFetch(input,init){
    const url=urlOf(input);
    if(!eligible(url))return nativeFetch(input,init);

    const method=methodOf(input,init);
    const safeRead=method==='GET'||method==='HEAD';
    const refreshEndpoint=url.href.startsWith(SUPABASE_URL+'/auth/v1/token?grant_type=refresh_token');
    if(!navigator.onLine&&!safeRead&&!refreshEndpoint){
      const e=new Error('MW Dynasty is offline. This change was not submitted. Reconnect and try again.');
      e.name='MWOfflineWriteBlocked';
      e.code='MW_OFFLINE_WRITE_BLOCKED';
      e.mwTransient=true;
      setMode('offline',{reason:'write_blocked'});
      throw e
    }
    const attempts=(safeRead||refreshEndpoint)?3:1;
    let response=null,lastError=null;

    for(let attempt=0;attempt<attempts;attempt++){
      try{
        response=await nativeFetch(input,init);
        if(isTransientStatus(response.status)){
          state.lastFailureAt=Date.now();
          setMode('degraded',{status:response.status});
        }else if(response.ok&&state.online){
          setMode('normal',{status:response.status});
        }
        if(!(safeRead||refreshEndpoint)||!isTransientStatus(response.status)||attempt===attempts-1)break;
      }catch(e){
        lastError=e;state.lastFailureAt=Date.now();
        setMode(navigator.onLine?'degraded':'offline',{reason:'network_error'});
        if(attempt===attempts-1)throw e;
      }
      await sleep(160*(2**attempt));
    }
    if(!response){
      if(lastError)throw lastError;
      return nativeFetch(input,init)
    }

    if(response.status===401&&!refreshEndpoint){
      const oldToken=bearerFrom(input,init);
      const rec=recordForToken(oldToken);
      if(rec?.session?.refresh_token){
        try{
          const next=await refreshRecord(rec);
          if(next?.access_token){
            const [retryInput,retryInit]=rebuild(input,init,next.access_token);
            response=await nativeFetch(retryInput,retryInit)
          }
        }catch{}
      }
    }
    return response
  }

  window.fetch=resilientFetch;
  window.MWResilience={
    fetch:resilientFetch,
    nativeFetch,
    state,
    isTransientStatus,
    isTransientError(error){
      return !navigator.onLine||error?.mwTransient===true||/network|fetch|temporar|timeout|offline|connection/i.test(String(error?.message||''))
    },
    readSessions:()=>readRecords().map(x=>({key:x.key,session:x.session,persistent:x.storage===localStorage})),
    refresh:proactiveRefresh
  };

  window.addEventListener('offline',()=>{
    state.online=false;
    setMode('offline',{reason:'browser_offline'});
    document.documentElement.dataset.mwConnection='offline';
    window.dispatchEvent(new CustomEvent('mw:connection',{detail:{online:false}}))
  });
  window.addEventListener('online',()=>{
    state.online=true;state.lastRecoveredAt=Date.now();
    setMode('recovering',{reason:'browser_online'});
    document.documentElement.dataset.mwConnection='online';
    proactiveRefresh().catch(()=>{});
    window.dispatchEvent(new CustomEvent('mw:connection',{detail:{online:true}}))
  });
  document.documentElement.dataset.mwConnection=navigator.onLine?'online':'offline';
  document.documentElement.dataset.mwControlMode=state.mode;
  setInterval(()=>proactiveRefresh().catch(()=>{}),60000);
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')proactiveRefresh().catch(()=>{})});

  if('serviceWorker' in navigator&&location.protocol==='https:'){
    window.addEventListener('load',()=>navigator.serviceWorker.register('/mw-sw.js',{scope:'/'}).catch(()=>{}),{once:true})
  }
})();