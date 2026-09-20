(function(){
  'use strict';
  if(window.MWWebAnalytics)return;
  var SB_URL='https://keqgunlfwhjgcsurynef.supabase.co';
  var SB_KEY='sb_publishable_JWCLQzrdWA_ZmvbpV5urVg_rcT6NECm';
  var KEY='mwWebAnalyticsSessionV1';
  var NATIVE=/MWDynasty-iOS\//i.test(navigator.userAgent||'')||document.documentElement.classList.contains('mw-native-app');
  function sid(){
    try{
      var v=localStorage.getItem(KEY);
      if(v&&v.length>=8)return v;
      v=(crypto.randomUUID?crypto.randomUUID():('mw_'+Date.now()+'_'+Math.random().toString(36).slice(2))).replace(/[^a-zA-Z0-9_-]/g,'').slice(0,80);
      localStorage.setItem(KEY,v);return v;
    }catch{return ('mw_'+Date.now()+'_'+Math.random().toString(36).slice(2)).replace(/[^a-zA-Z0-9_-]/g,'').slice(0,80)}
  }
  function params(){try{return new URLSearchParams(location.search)}catch{return new URLSearchParams()}}
  function refHost(){try{return document.referrer?new URL(document.referrer).hostname:''}catch{return ''}}
  function device(){var w=window.innerWidth||0;return w<600?'mobile':w<1000?'tablet':'desktop'}
  function audience(){
    var p=location.pathname||'';
    if(p.indexOf('/athlete')===0)return 'athlete';
    if(p.indexOf('/coach')===0)return 'coach';
    return null;
  }
  function safeMeta(meta){
    var out={};if(!meta||typeof meta!=='object')return out;
    Object.keys(meta).slice(0,12).forEach(function(k){
      if(/email|name|message|token|password|secret|photo|image/i.test(k))return;
      var v=meta[k];if(typeof v==='string')out[k]=v.slice(0,100);else if(typeof v==='number'||typeof v==='boolean')out[k]=v;
    });return out;
  }
  async function track(eventType,extra){
    if(NATIVE)return false;
    extra=extra||{};
    var q=params();
    var body={
      p_session_key:sid(),
      p_event_type:String(eventType||'').slice(0,50),
      p_page_path:(location.pathname||'/').slice(0,160),
      p_audience:extra.audience||audience(),
      p_source:extra.source||q.get('utm_source')||q.get('source')||null,
      p_campaign:extra.campaign||q.get('utm_campaign')||null,
      p_referrer_host:refHost()||null,
      p_device_class:device(),
      p_metadata:safeMeta(extra.metadata||{})
    };
    try{
      await fetch(SB_URL+'/rest/v1/rpc/mw_record_web_event',{
        method:'POST',keepalive:true,
        headers:{apikey:SB_KEY,'Content-Type':'application/json'},
        body:JSON.stringify(body)
      });
    }catch{}
  }
  window.MWWebAnalytics={track:track,sessionKey:sid(),native:NATIVE};
  document.addEventListener('click',function(e){
    var el=e.target&&e.target.closest?e.target.closest('[data-mw-event]'):null;
    if(!el)return;
    track(el.getAttribute('data-mw-event'),{audience:el.getAttribute('data-mw-audience')||audience(),metadata:{label:el.getAttribute('data-mw-label')||''}});
  },true);
  setTimeout(function(){track('page_view')},50);
})();