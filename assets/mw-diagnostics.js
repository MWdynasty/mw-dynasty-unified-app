(function(){
  'use strict';
  if(window.MWDiag)return;
  var VERSION='1.0.0',QUEUE_KEY='mwLaunchDiagnosticsQueueV1',SYNC_KEY='mwLaunchDiagnosticsLastSyncV1';
  var native=/MWDynasty-iOS\//i.test(navigator.userAgent||'')||document.documentElement.classList.contains('mw-native-app');
  var explicitlyEnabled=localStorage.getItem('mwLaunchDiagnostics')==='on';
  var enabled=native||explicitlyEnabled;
  var originalFetch=window.fetch.bind(window),flushTimer=null,flushing=false;

  function surface(){
    var p=location.pathname||'/';
    if(p.indexOf('/coach')===0)return 'coach';
    if(p.indexOf('/athlete')===0)return 'athlete';
    if(p.indexOf('/account')===0)return 'account';
    return native?'native':'unknown';
  }
  function cleanString(value,max){
    if(value==null)return null;
    var s=String(value)
      .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,'[email]')
      .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi,'[id]')
      .replace(/\b(?:eyJ[A-Za-z0-9_-]+\.){2}[A-Za-z0-9_-]+\b/g,'[token]');
    return s.slice(0,max||180);
  }
  function scrub(input,depth){
    depth=depth||0;if(depth>2||input==null)return {};
    if(Array.isArray(input))return input.slice(0,10).map(function(v){return typeof v==='object'?scrub(v,depth+1):cleanString(v,100)});
    if(typeof input!=='object')return cleanString(input,100);
    var out={},entries=Object.entries(input).slice(0,20);
    entries.forEach(function(pair){
      var k=cleanString(pair[0],48),v=pair[1];
      if(!k||/token|password|secret|authorization|cookie|email|message|body|image|photo/i.test(k))return;
      if(v==null||typeof v==='boolean'||typeof v==='number')out[k]=v;
      else if(typeof v==='string')out[k]=cleanString(v,140);
      else if(typeof v==='object')out[k]=scrub(v,depth+1);
    });
    return out;
  }
  function route(value){
    try{
      var u=new URL(value||location.href,location.origin);
      return u.pathname.slice(0,140);
    }catch{return String(location.pathname||'/').slice(0,140)}
  }
  function readQueue(){try{return JSON.parse(localStorage.getItem(QUEUE_KEY)||'[]')}catch{return []}}
  function writeQueue(q){try{localStorage.setItem(QUEUE_KEY,JSON.stringify(q.slice(-100)))}catch{}}
  function accessToken(){
    var keys=['mwCoachSupabaseSession','mwSupabaseSession'];
    for(var i=0;i<keys.length;i++){
      try{
        var raw=localStorage.getItem(keys[i])||sessionStorage.getItem(keys[i]);
        var s=raw?JSON.parse(raw):null;if(s&&s.access_token)return s.access_token;
      }catch{}
    }
    return '';
  }
  function baseEvent(type,options){
    options=options||{};
    return {
      surface:options.surface||surface(),
      event_type:cleanString(type,80)||'event',
      severity:['info','warn','error'].indexOf(options.severity)>=0?options.severity:'info',
      code:cleanString(options.code,80),
      route:route(options.route),
      app_version:String(window.MW_APP_VERSION||'3.0.16'),
      ios_build:native?'13':null,
      platform:native?'ios-testflight/webview':'web',
      online:navigator.onLine!==false,
      context:scrub(options.context||{}),
      client_at:new Date().toISOString()
    };
  }
  function event(type,options){
    if(!enabled)return;
    var q=readQueue();q.push(baseEvent(type,options));writeQueue(q);
    if((options&&options.severity==='error')||q.length>=8)scheduleFlush(250);else scheduleFlush(3000);
  }
  function snapshot(context){event('entitlement_snapshot',{context:context||{}})}
  function scheduleFlush(ms){
    if(flushTimer)clearTimeout(flushTimer);
    flushTimer=setTimeout(flush,ms||1000);
  }
  async function flush(){
    if(!enabled||flushing||navigator.onLine===false)return {ok:false,reason:'offline'};
    var token=accessToken(),q=readQueue();if(!token||!q.length)return {ok:false,reason:!token?'no_session':'empty'};
    flushing=true;
    var batch=q.slice(0,25);
    try{
      var r=await originalFetch('/api/diagnostics',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({events:batch}),cache:'no-store'});
      if(!r.ok)throw new Error('diagnostics '+r.status);
      writeQueue(q.slice(batch.length));
      if(readQueue().length)scheduleFlush(600);
      return {ok:true,accepted:batch.length};
    }catch(e){return {ok:false,reason:'send_failed'}}finally{flushing=false}
  }
  async function report(){
    await flush();
    var token=accessToken();if(!token)return {ok:false,error:'No signed-in MW session'};
    var r=await originalFetch('/api/diagnostics?limit=25',{headers:{Authorization:'Bearer '+token},cache:'no-store'});
    return r.json().catch(function(){return {ok:false,error:'Diagnostics unavailable'}});
  }
  function enable(value){
    enabled=!!value;
    try{localStorage.setItem('mwLaunchDiagnostics',enabled?'on':'off')}catch{}
    if(enabled){event('diagnostics_enabled',{context:{native:native}});scheduleFlush(100)}
    return enabled;
  }
  function status(){return {enabled:enabled,native:native,queued:readQueue().length,lastSuccessfulSync:localStorage.getItem(SYNC_KEY)||null,online:navigator.onLine!==false,version:VERSION}}

  window.MWDiag={event:event,snapshot:snapshot,flush:flush,report:report,enable:enable,status:status,version:VERSION};

  if(!enabled)return;

  event('app_session_start',{context:{visibility:document.visibilityState||'unknown'}});

  window.addEventListener('error',function(e){
    event('client_error',{severity:'error',code:'window_error',context:{name:e.error&&e.error.name||'Error',detail:cleanString(e.message||'Unknown client error',140)}});
  });
  window.addEventListener('unhandledrejection',function(e){
    var reason=e.reason,detail=reason&&reason.message?reason.message:String(reason||'Unhandled promise rejection');
    event('client_error',{severity:'error',code:'unhandled_rejection',context:{detail:cleanString(detail,140)}});
  });
  window.addEventListener('offline',function(){event('network_state',{severity:'warn',code:'offline',context:{online:false}})});
  window.addEventListener('online',function(){event('network_state',{code:'online',context:{online:true}});scheduleFlush(50)});
  document.addEventListener('visibilitychange',function(){if(document.visibilityState==='hidden')flush()});
  document.addEventListener('click',function(e){
    var el=e.target&&e.target.closest?e.target.closest('[data-page],[data-open],.nav button[data-v]'):null;
    if(!el)return;
    var target=el.getAttribute('data-page')||el.getAttribute('data-open')||el.getAttribute('data-v');
    if(target)event('navigation',{context:{target:cleanString(target,60)}});
  },true);

  window.fetch=async function(input,init){
    var started=performance.now(),url='',method='GET';
    try{
      url=typeof input==='string'?input:(input&&input.url)||'';
      method=String(init&&init.method||(input&&input.method)||'GET').toUpperCase();
    }catch{}
    var path=route(url),track=(path.indexOf('/api/')===0||String(url).indexOf('supabase.co')>=0)&&path!='/api/diagnostics';
    try{
      var response=await originalFetch(input,init);
      if(track){
        var ms=Math.round(performance.now()-started);
        if(!response.ok){
          event('api_failure',{severity:response.status>=500?'error':'warn',code:'http_'+response.status,route:path,context:{method:method,status:response.status,duration_ms:ms}});
        }else if(method==='GET'&&(/\/api\/(me|billing|coach\/access|coach\/roster|coach\/performance)/.test(path)||path.indexOf('/rest/v1/')>=0)){
          var now=Date.now(),last=Number(localStorage.getItem(SYNC_KEY+'_ts')||0);
          localStorage.setItem(SYNC_KEY,new Date(now).toISOString());
          if(now-last>300000){localStorage.setItem(SYNC_KEY+'_ts',String(now));event('sync_ok',{route:path,context:{duration_ms:ms}})}
        }
      }
      return response;
    }catch(err){
      if(track)event('network_failure',{severity:'error',code:'fetch_error',route:path,context:{method:method,detail:cleanString(err&&err.message||'Network request failed',120)}});
      throw err;
    }
  };

  setInterval(function(){flush()},15000);
  setTimeout(function(){flush()},1000);
})();
