(function(){
  'use strict';
  if(window.MWAccountScope)return;
  const stores={local:window.localStorage,session:window.sessionStorage};
  const keys=['mwSupabaseSession','mwCoachSupabaseSession','mwFounderSupabaseSession'];
  const path=location.pathname;
  const params=new URLSearchParams(location.search);
  const audience=params.get('role')||(params.get('coach')==='1'?'coach':'');
  const activeKey=path.startsWith('/founder')||audience==='founder'?keys[2]:path.startsWith('/coach')||audience==='coach'?keys[1]:keys[0];
  function claims(token){try{return JSON.parse(atob(String(token||'').split('.')[1].replace(/-/g,'+').replace(/_/g,'/')))}catch{return {}}}
  function session(key=activeKey){for(const s of Object.values(stores)){try{const v=JSON.parse(s.getItem(key)||'null');if(v?.access_token)return v}catch{}}return null}
  function identity(s){if(!s?.access_token)return '';const c=claims(s.access_token),uid=c.sub||s.user?.id;return uid?String(uid)+':'+String(c.session_id||''):''}
  let owner=identity(session()),invalid=false;
  const channel=typeof BroadcastChannel==='function'?new BroadcastChannel('mw-account-boundary'):null;
  function stale(){const e=new Error('Your MW account changed. Reloading your workspace.');e.name='MWAccountChanged';return e}
  function invalidate(reload=true){
    if(invalid)return;invalid=true;
    for(const key of keys)for(const s of Object.values(stores)){try{if(identity(JSON.parse(s.getItem(key)||'null'))===owner)s.removeItem(key)}catch{}}
    channel?.postMessage({identity:owner});
    // Hide private content synchronously, including pages restored from the back/forward cache.
    document.documentElement.style.visibility='hidden';
    window.dispatchEvent(new CustomEvent('mw:account-changed'));
    if(reload)location.reload();
  }
  function check(){
    const next=identity(session());
    if(owner&&next!==owner)invalidate();
    else if(!owner&&next&&!invalid)owner=next;
    return !invalid;
  }
  function scopedKey(key){if(!check())throw stale();const uid=claims(session()?.access_token).sub||session()?.user?.id;return uid?'mwAccount:'+uid+':'+String(key):null}
  function ownedLegacyKey(key){
    const uid=claims(session()?.access_token).sub||session()?.user?.id;if(!uid)return false;
    if(key==='mwConversationV3:'+uid)return true;
    return /^mw-(custom-practice-heats|practice-heats|practice-mode)-v1:/.test(key)
      &&(key.endsWith(':'+uid)||key.includes(':'+uid+':'));
  }
  function facade(s){return {
    getItem(key){if(invalid)throw stale();if(keys.includes(key))return s.getItem(key);const k=scopedKey(key);return k?(s.getItem(k)??(ownedLegacyKey(String(key))?s.getItem(key):null)):null},
    setItem(key,value){if(invalid)throw stale();if(keys.includes(key)){s.setItem(key,value);queueMicrotask(check);return}const k=scopedKey(key);if(k)s.setItem(k,String(value))},
    removeItem(key){if(invalid)return;if(keys.includes(key)){s.removeItem(key);queueMicrotask(check);return}const k=scopedKey(key);if(k)s.removeItem(k)},
    clear(){// Account deletion removes only this user's local records and session.
      const uid=claims(session()?.access_token).sub||session()?.user?.id;
      if(uid)for(let i=s.length-1;i>=0;i--){const k=s.key(i);if(k?.startsWith('mwAccount:'+uid+':'))s.removeItem(k)}
      s.removeItem(activeKey);
    }
  }}
  window.MWAccountStorage={local:facade(stores.local),session:facade(stores.session)};
  function leaseForToken(token){
    for(const key of keys)for(const s of Object.values(stores)){try{const rec=JSON.parse(s.getItem(key)||'null');if(rec?.access_token===token||rec?.refresh_token===token){const id=identity(rec);return ()=>!invalid&&(!owner||id===owner)&&identity(session(key))===id}}catch{}}
    return null;
  }
  const nativeFetch=window.fetch.bind(window);
  window.fetch=async function(input,init={}){
    const url=new URL(typeof input==='string'?input:input.url,location.href);
    const headers=new Headers(init.headers||(typeof input==='object'?input.headers:undefined));
    const bearer=String(headers.get('Authorization')||'').replace(/^Bearer\s+/i,'');
    let refresh='';if(url.pathname==='/auth/v1/token'&&url.searchParams.get('grant_type')==='refresh_token'){try{refresh=JSON.parse(init.body||'{}').refresh_token||''}catch{}}
    const logout=url.pathname==='/auth/v1/logout';
    const lease=logout?null:leaseForToken(refresh||bearer);
    if(!logout&&!check())throw stale();
    if(lease&&!lease())throw stale();
    const response=await nativeFetch(input,init);
    if(!logout&&!check())throw stale();
    if(lease&&!lease())throw stale();
    // Body consumption may happen after the account changes, even when headers arrived earlier.
    for(const method of ['json','text','blob','arrayBuffer']){
      const read=response[method]?.bind(response);if(read)response[method]=async()=>{const result=await read();if(lease&&!lease())throw stale();return result};
    }
    return response;
  };
  function handoff(target,key,value){
    if(!check()||!keys.includes(key)||identity(value)!==owner)throw stale();
    stores.local.setItem(key,JSON.stringify(value));
    stores.local.removeItem(activeKey);stores.session.removeItem(activeKey);
    invalid=true;document.documentElement.style.visibility='hidden';location.assign(target);
  }
  async function signOut(base,apikey,token=session()?.access_token){
    // Keep the document hidden and block stale work while the server revokes the session.
    // keepalive lets the revocation finish even if the user closes this tab.
    const pending=token?nativeFetch(base+'/auth/v1/logout',{method:'POST',keepalive:true,headers:{apikey,Authorization:'Bearer '+token}}).catch(()=>null):Promise.resolve(null);
    invalidate(false);
    let timer;
    try{await Promise.race([pending,new Promise(resolve=>{timer=setTimeout(resolve,8000)})])}
    finally{clearTimeout(timer);location.reload()}
  }
  window.MWAccountScope={sessionKey:activeKey,check,session,identity,leaseForToken,handoff,signOut,isCurrent:()=>check()};
  if(channel)channel.onmessage=e=>{if(owner&&e.data?.identity===owner)invalidate()};
  window.addEventListener('storage',e=>{if(e.key===activeKey||e.key===null)check()});
  window.addEventListener('pageshow',check);
  window.addEventListener('focus',check);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)check()});
})();
