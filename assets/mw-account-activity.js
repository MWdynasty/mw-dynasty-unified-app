(function(){
  'use strict';
  if(window.MWAccountActivity)return;
  var role=location.pathname.startsWith('/coach')?'coach':location.pathname.startsWith('/athlete')?'athlete':null;
  if(!role)return;
  var key=role==='coach'?'mwCoachSupabaseSession':'mwSupabaseSession';
  var owner='',lastSent=0,inFlight=false;
  function session(){
    try{
      var stores=window.MWAccountStorage||{local:localStorage,session:sessionStorage};
      return JSON.parse(stores.local.getItem(key)||stores.session.getItem(key)||'null');
    }catch{return null}
  }
  function identity(s){
    if(window.MWAccountScope)return window.MWAccountScope.identity(s);
    return s?.user?.id||'';
  }
  async function record(){
    if(!owner||document.hidden||navigator.onLine===false||inFlight)return;
    var s=session();
    if(!s?.access_token||identity(s)!==owner)return;
    var now=Date.now();
    if(lastSent&&now-lastSent<60000)return;
    lastSent=now;inFlight=true;
    try{
      // The server chooses the user and timestamp. No keystrokes, paths, or content are sent.
      await fetch((window.MW_SUPABASE_URL||'https://keqgunlfwhjgcsurynef.supabase.co')+'/rest/v1/rpc/mw_record_account_activity',{
        method:'POST',cache:'no-store',keepalive:true,
        headers:{apikey:window.MW_SUPABASE_KEY||'sb_publishable_JWCLQzrdWA_ZmvbpV5urVg_rcT6NECm',Authorization:'Bearer '+s.access_token,'Content-Type':'application/json'},
        body:JSON.stringify({p_platform:/MWDynasty-iOS\//i.test(navigator.userAgent||'')||document.documentElement.classList.contains('mw-native-app')?'ios':'web'})
      });
    }catch{}finally{inFlight=false}
  }
  window.MWAccountActivity={
    start:function(authenticatedRole){
      if(authenticatedRole!==role)return;
      var next=identity(session());
      if(next!==owner){owner=next;lastSent=0}
      void record();
    }
  };
  ['pointerdown','keydown','scroll','touchstart'].forEach(function(type){
    document.addEventListener(type,function(e){if(e.isTrusted)void record()},{capture:true,passive:true});
  });
  // Returning to the foreground is app use; hidden tabs and background refreshes are not.
  document.addEventListener('visibilitychange',function(){if(!document.hidden)void record()});
  window.addEventListener('pageshow',function(){void record()});
  window.addEventListener('mw:account-changed',function(){owner='';lastSent=0});
})();
