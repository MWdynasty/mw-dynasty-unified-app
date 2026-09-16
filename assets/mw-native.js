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
