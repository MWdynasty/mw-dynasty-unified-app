(function(){
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
    style.textContent='#mw-native-resume-loader{position:fixed;inset:0;z-index:2147483647;display:none;align-items:center;justify-content:center;background:#02060b;opacity:0;transition:opacity .16s ease}#mw-native-resume-loader.mw-show{display:flex;opacity:1}.mw-native-resume-ring{width:112px;height:112px;border-radius:28px;display:grid;place-items:center;animation:mwNativePulse 1.05s ease-in-out infinite;filter:drop-shadow(0 0 18px rgba(235,184,60,.32))}.mw-native-resume-ring img{width:94px;height:94px;object-fit:contain}@keyframes mwNativePulse{0%,100%{transform:scale(.94);opacity:.7}50%{transform:scale(1.06);opacity:1}}';
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