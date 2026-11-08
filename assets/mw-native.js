(function(){
  // Phase 2: MW School and Motion Intelligence remain preserved, but unreleased.
  if(location.pathname.startsWith('/athlete')){
    var phase2Style=document.createElement('style');
    phase2Style.id='mw-phase2-feature-gates';
    phase2Style.textContent='button[onclick*="mwOpenMotionIntelligence"]{display:none!important}';
    (document.head||document.documentElement).appendChild(phase2Style);
    var refreshPhase2Menu=function(){
      document.querySelectorAll('[data-open="pacer"] small').forEach(function(el){
        if(/Motion Intelligence/i.test(el.textContent||'')){
          el.textContent='Open Sprint Pace AI and Distance Pacer.';
        }
      });
    };
    if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',refreshPhase2Menu,{once:true});
    else refreshPhase2Menu();
  }
  window.MW_APP_VERSION='3.0.16';
  window.mwNativePermission=function(type){
    return new Promise(function(resolve){
      try{
        var h=window.webkit&&window.webkit.messageHandlers&&window.webkit.messageHandlers.mwPermissions;
        if(!h){resolve({native:false});return}
        window.__mwPermissionResolve=resolve;
        h.postMessage({type:String(type||'')});
        setTimeout(function(){if(window.__mwPermissionResolve){window.__mwPermissionResolve=null;resolve({native:true,pending:true})}},1500);
      }catch(e){resolve({native:false,error:String(e)})}
    });
  };
  window.mwNativePermissionResult=function(result){
    var r=window.__mwPermissionResolve;window.__mwPermissionResolve=null;if(r)r(result||{native:true});
  };
  window.mwNativePushToken=function(token){
    if(!token)return;
    window.__mwPushToken=String(token);
    if(typeof window.mwRegisterPushDevice==='function')window.mwRegisterPushDevice();
  };
})();

;(function(){
  var base='https://keqgunlfwhjgcsurynef.supabase.co',key='sb_publishable_JWCLQzrdWA_ZmvbpV5urVg_rcT6NECm';
  function role(){return location.pathname.startsWith('/coach')?'coach':location.pathname.startsWith('/athlete')?'athlete':null}
  function session(){var r=role();if(!r)return null;var k=r==='coach'?'mwCoachSupabaseSession':'mwSupabaseSession';try{var s=window.MWAccountStorage||{local:localStorage,session:sessionStorage};return JSON.parse(s.local.getItem(k)||s.session.getItem(k)||'null')}catch{return null}}
  window.mwRegisterPushDevice=async function(){
    var token=window.__mwPushToken,s=session();if(!token||!s?.user?.id||!s.access_token)return false;
    var url=window.MW_SUPABASE_URL||base,headers={apikey:window.MW_SUPABASE_KEY||key,Authorization:'Bearer '+s.access_token,'Content-Type':'application/json',Prefer:'resolution=merge-duplicates,return=minimal'};
    var row={user_id:s.user.id,device_token:token,platform:'ios',environment:'production',app_bundle_id:'com.mwdynasty.app',last_seen_at:new Date().toISOString()};
    try{var r=await fetch(url+'/rest/v1/mw_push_devices',{method:'POST',headers:headers,body:JSON.stringify(row)});if(!r.ok)return false;await fetch(url+'/rest/v1/mw_notification_preferences?on_conflict=user_id',{method:'POST',headers:headers,body:JSON.stringify({user_id:s.user.id,push_enabled:true})});window.__mwPushRegistered=true;return true}catch{return false}
  };
  window.addEventListener('mw:account-changed',function(){window.mwRegisterPushDevice()});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',function(){window.mwRegisterPushDevice()});else window.mwRegisterPushDevice();
})();

;(function(){
  window.mwNativeBilling=function(payload){
    return new Promise(function(resolve){
      try{
        var h=window.webkit&&window.webkit.messageHandlers&&window.webkit.messageHandlers.mwBilling;
        if(!h){resolve({native:false,started:false});return}
        window.__mwBillingResolve=resolve;
        h.postMessage(payload||{});
        setTimeout(function(){if(window.__mwBillingResolve){window.__mwBillingResolve=null;resolve({native:true,started:true,pending:true})}},1800);
      }catch(e){resolve({native:false,started:false,error:String(e)})}
    });
  };
  window.mwNativeBillingResult=function(result){
    var r=window.__mwBillingResolve;window.__mwBillingResolve=null;if(r)r(result||{native:true,started:true});
  };
})();


;(function(){
  if(!/MWDynasty-iOS\//i.test(navigator.userAgent||''))return;
  var overlay=null,hideTimer=null;
  function ensureResumeLoader(){
    if(overlay&&document.body&&document.body.contains(overlay))return overlay;
    if(!document.body)return null;
    overlay=document.createElement('div');
    overlay.id='mw-native-resume-loader';
    overlay.setAttribute('aria-hidden','true');
    overlay.innerHTML='<div class="mw-native-resume-ring"><img src="/assets/mw-official-crest.png" alt=""></div>';
    var style=document.createElement('style');
    style.textContent='#mw-native-resume-loader{pointer-events:none;position:fixed;inset:0;z-index:2147483647;display:none;align-items:center;justify-content:center;background:#02060b;opacity:0;transition:opacity .16s ease}#mw-native-resume-loader.mw-show{display:flex;opacity:1}.mw-native-resume-ring{width:112px;height:112px;border-radius:28px;display:grid;place-items:center;animation:mwNativePulse 1.05s ease-in-out infinite;filter:drop-shadow(0 0 18px rgba(235,184,60,.32))}.mw-native-resume-ring img{width:94px;height:94px;object-fit:contain}@keyframes mwNativePulse{0%,100%{transform:scale(.94);opacity:.7}50%{transform:scale(1.06);opacity:1}}';
    document.head.appendChild(style);document.body.appendChild(overlay);return overlay;
  }
  function showResumeLoader(){
    var el=ensureResumeLoader();if(!el)return;
    clearTimeout(hideTimer);el.classList.add('mw-show');
    hideTimer=setTimeout(function(){el.classList.remove('mw-show')},1400);
  }
  function hideResumeLoader(){
    var el=ensureResumeLoader();if(!el)return;
    clearTimeout(hideTimer);hideTimer=setTimeout(function(){el.classList.remove('mw-show')},420);
  }
  document.addEventListener('visibilitychange',function(){
    if(document.visibilityState==='visible'){showResumeLoader();requestAnimationFrame(function(){requestAnimationFrame(hideResumeLoader)})}
  });
  window.addEventListener('pageshow',function(e){if(e.persisted){showResumeLoader();hideResumeLoader()}});
})();

/* Athlete Coach MW: safe, readable replies without editing the athlete document. */
;(function(){
  if(!location.pathname.startsWith('/athlete'))return;
  function escapeText(value){return String(value).replace(/[&<>"']/g,function(ch){
    return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch];
  })}
  function formatCoachReply(input){
    var inline=function(value){return escapeText(value)
      .replace(/\*\*([^*\n]+)\*\*/g,'<strong>$1</strong>')
      .replace(/(^|[^*])\*([^*\n]+)\*/g,'$1<em>$2</em>')};
    var lines=String(input||'').replace(/\r\n?/g,'\n').split('\n');
    var out='',list='';
    function close(){if(list){out+='</'+list+'>';list=''}}
    lines.forEach(function(raw){
      var line=raw.trim(),heading=line.match(/^#{1,4}\s+(.+)$/);
      if(!line){close();return}
      if(heading){close();out+='<h3>'+inline(heading[1])+'</h3>';return}
      var bullet=line.match(/^[-*]\s+(.+)$/),number=line.match(/^\d+[.)]\s+(.+)$/);
      if(bullet||number){
        var kind=number?'ol':'ul';if(list!==kind){close();list=kind;out+='<'+kind+'>'}
        out+='<li>'+inline((bullet||number)[1])+'</li>';return;
      }
      close();out+='<p>'+inline(line)+'</p>';
    });
    close();return out||'<p></p>';
  }
  window.MWAthleteCoachReplyFormat=formatCoachReply;
  function formatMessages(){
    var chat=document.getElementById('chat');if(!chat)return;
    chat.querySelectorAll('.msg.coach').forEach(function(message){
      if(message.dataset.mwReplyFormatted==='1')return;
      // Never overwrite a rich message with buttons, media or other controls.
      if(message.querySelector('button,input,textarea,select,img,video,audio,a'))return;
      var raw=message.textContent||'';
      if(!/(^|\n)\s*#{1,4}\s|(^|\n)\s*[-*]\s|\*\*[^*\n]+\*\*/.test(raw))return;
      message.innerHTML='<div class="mw-athlete-coach-reply">'+formatCoachReply(raw)+'</div>';
      message.dataset.mwReplyFormatted='1';
    });
  }
  function boot(){
    var css=document.createElement('style');
    css.id='mw-athlete-coach-reply-format';
    css.textContent='#chat .mw-athlete-coach-reply{font-size:14px;line-height:1.65;white-space:normal;overflow-wrap:anywhere}'+
      '#chat .mw-athlete-coach-reply p{margin:0 0 11px;white-space:pre-wrap;line-height:inherit}'+
      '#chat .mw-athlete-coach-reply p:last-child{margin-bottom:0}'+
      '#chat .mw-athlete-coach-reply h3{font-size:15px;line-height:1.35;color:#f3cd7b;font-weight:750;margin:15px 0 8px}'+
      '#chat .mw-athlete-coach-reply h3:first-child{margin-top:0}'+
      '#chat .mw-athlete-coach-reply ul,#chat .mw-athlete-coach-reply ol{padding-left:22px;margin:7px 0 12px;list-style-position:outside}'+
      '#chat .mw-athlete-coach-reply li{margin-bottom:7px;padding-left:2px}'+
      '#chat .mw-athlete-coach-reply strong{font-weight:750;color:#f8f9fc}';
    (document.head||document.documentElement).appendChild(css);
    var chat=document.getElementById('chat');
    if(!chat)return;
    var queued=false;
    function refresh(){queued=false;formatMessages()}
    var observer=new MutationObserver(function(){
      if(!queued){queued=true;Promise.resolve().then(refresh)}
    });
    observer.observe(chat,{childList:true,subtree:true,characterData:true});
    formatMessages();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});
  else boot();
})();

