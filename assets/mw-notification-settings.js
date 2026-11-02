(function(){
  'use strict';
  if(window.MWNotificationSettings)return;
  var role=location.pathname.startsWith('/coach')?'coach':location.pathname.startsWith('/athlete')?'athlete':null;
  if(!role)return;
  var sessionKey=role==='coach'?'mwCoachSupabaseSession':'mwSupabaseSession';
  var base='https://keqgunlfwhjgcsurynef.supabase.co',key='sb_publishable_JWCLQzrdWA_ZmvbpV5urVg_rcT6NECm';
  var fields=['inactivity_reminders','adaptive_updates','progress_summaries','quiet_hours_enabled'];
  var defaults={push_enabled:false,inactivity_reminders:true,adaptive_updates:true,progress_summaries:false,quiet_hours_enabled:true,reminder_hour:18,timezone:'America/Chicago'};
  var panel=null,pushStatus=null,enablePushButton=null;

  function session(){try{var st=window.MWAccountStorage||{local:localStorage,session:sessionStorage};return JSON.parse(st.local.getItem(sessionKey)||st.session.getItem(sessionKey)||'null')}catch{return null}}
  function auth(){var s=session();return s&&s.user&&s.user.id&&s.access_token?s:null}
  function request(path,method,data){var s=auth();if(!s)return Promise.reject(new Error('Sign in to manage your settings.'));return fetch((window.MW_SUPABASE_URL||base)+'/rest/v1/'+path,{method:method||'GET',headers:{apikey:window.MW_SUPABASE_KEY||key,Authorization:'Bearer '+s.access_token,'Content-Type':'application/json',Prefer:'return=representation,resolution=merge-duplicates'},body:data?JSON.stringify(data):undefined}).then(async function(r){var out=await r.json().catch(()=>null);if(!r.ok)throw new Error(out?.message||'Unable to save your notification settings ('+r.status+').');return out})}
  function deviceId(userId){var storageKey='mwPushDeviceId:'+userId,id=localStorage.getItem(storageKey);if(!id){id=crypto.randomUUID?crypto.randomUUID():('xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,function(c){var r=Math.random()*16|0;return(c==='x'?r:(r&3|8)).toString(16)}));localStorage.setItem(storageKey,id)}return id}
  async function syncPushDevice(){var s=auth(),token=localStorage.getItem('mwAPNSDeviceToken'),environment=localStorage.getItem('mwAPNSEnvironment');if(!s||!token||!environment)return false;await request('rpc/mw_register_push_device','POST',{p_device_id:deviceId(s.user.id),p_device_token:token,p_apns_environment:environment});localStorage.setItem('mwPushRegisteredUser',s.user.id);if(pushStatus)pushStatus.textContent='This iPhone is registered. Save preferences to allow eligible MW push alerts.';return true}

  window.mwNativePushTokenAvailable=async function(payload){
    if(!payload||!payload.token)return;
    localStorage.setItem('mwAPNSDeviceToken',String(payload.token));localStorage.setItem('mwAPNSEnvironment',String(payload.environment||'production'));
    try{await syncPushDevice()}catch(error){if(pushStatus)pushStatus.textContent='Device registration failed: '+error.message}
  };
  window.mwNativePushOpened=function(payload){
    if(!payload||typeof payload!=='object')return;
    if(role==='coach')window.openPage?.(String(payload.action_view||'dashboard'));
    else {var view=String(payload.action_view||'home');window.openView?.(view,true);var entity=String(payload.entity_id||'');if(payload.notification_type==='workout_incomplete'){var workout=entity.match(/^mw-workout-v1:[0-9a-f-]+:(?:mw-41|(?:season|cycle):[0-9a-f-]+):w(\d+):d(\d+):track$/i)||entity.match(/^mw-track-w(\d+)-d(\d+)$/)||entity.match(/^mw-season-[0-9a-f-]+-w(\d+)-d(\d+)$/i);if(workout)setTimeout(function(){window.mwOpenPracticeFor?.(Number(workout[1]),Number(workout[2]))},80)}else if(payload.notification_type==='strength_incomplete'){var strength=entity.match(/^mw-strength-w(\d+)-d(\d+)$/)||entity.match(/^mw-season-strength-[0-9a-f-]+-w(\d+)-d(\d+)$/i);if(strength)setTimeout(function(){window.mwOpenStrengthSessionFor?.(Number(strength[1]),Number(strength[2]))},80)}}
  };

  function close(){if(panel){panel.remove();panel=null;pushStatus=null;enablePushButton=null}}
  async function enableNativePush(){
    if(typeof window.mwNativePermission!=='function'){pushStatus.textContent='Install the MW Dynasty iPhone app to enable native push notifications.';return}
    enablePushButton.disabled=true;pushStatus.textContent='Requesting iPhone notification permission…';
    try{var result=await window.mwNativePermission('notifications');if(!result?.native){pushStatus.textContent='Open this screen in the installed MW Dynasty iPhone app to register push.';return}if(!result.granted){pushStatus.textContent='Notifications are disabled for MW Dynasty in iPhone Settings.';return}pushStatus.textContent='Permission granted. Registering this iPhone…';await syncPushDevice().catch(function(e){pushStatus.textContent='Device registration is not ready: '+e.message})}
    finally{enablePushButton.disabled=false}
  }
  async function open(){
    if(panel){close();return}
    var s=auth();if(!s)return;
    panel=document.createElement('section');panel.id='mw-notification-settings';panel.setAttribute('role','dialog');panel.setAttribute('aria-modal','true');panel.setAttribute('aria-label','MW notification settings');
    panel.style.cssText='position:fixed;z-index:2147483600;inset:0;background:#020811d9;display:flex;align-items:center;justify-content:center;padding:16px;color:#fff;font-family:system-ui,sans-serif';
    var card=document.createElement('div');card.style.cssText='width:min(100%,440px);max-height:90vh;overflow:auto;background:#102131;border:1px solid #455363;border-radius:18px;padding:22px;box-shadow:0 12px 40px #0009';panel.appendChild(card);document.body.appendChild(panel);
    var h=document.createElement('h2');h.textContent='MW Notification Preferences';h.style.cssText='margin:0 0 12px;font-size:20px';card.appendChild(h);
    var note=document.createElement('p');note.textContent='Control coach alerts and training reminders for this account.';note.style.cssText='font-size:13px;color:#c4d0db;line-height:1.5';card.appendChild(note);
    pushStatus=document.createElement('p');pushStatus.textContent='Loading preferences…';pushStatus.style.cssText='font-size:13px;color:#e7bc65';card.appendChild(pushStatus);
    var form=document.createElement('form');card.appendChild(form);
    var labels={inactivity_reminders:'Inactivity reminders',adaptive_updates:'Adaptive training updates',progress_summaries:'Weekly progress summaries',quiet_hours_enabled:'Quiet hours (9 PM–7 AM)'},inputs={};
    fields.forEach(function(f){var row=document.createElement('label');row.style.cssText='display:flex;gap:10px;align-items:center;padding:10px 0;font-size:14px';var input=document.createElement('input');input.type='checkbox';input.name=f;row.appendChild(input);row.appendChild(document.createTextNode(labels[f]));form.appendChild(row);inputs[f]=input});
    var pushRow=document.createElement('label');pushRow.style.cssText='display:flex;gap:10px;align-items:center;padding:10px 0;font-size:14px;border-top:1px solid #405363;margin-top:6px';var pushInput=document.createElement('input');pushInput.type='checkbox';pushInput.name='push_enabled';pushRow.appendChild(pushInput);pushRow.appendChild(document.createTextNode('Enable iPhone push notifications'));form.appendChild(pushRow);
    enablePushButton=document.createElement('button');enablePushButton.type='button';enablePushButton.textContent='Register this iPhone';enablePushButton.style.cssText='background:#203647;color:#fff;padding:10px 12px;border:1px solid #6c8190;border-radius:8px';enablePushButton.onclick=enableNativePush;form.appendChild(enablePushButton);
    var timeLabel=document.createElement('label');timeLabel.textContent='Preferred reminder time';timeLabel.style.cssText='display:block;margin-top:12px;font-size:14px';var time=document.createElement('select');time.style.cssText='display:block;width:100%;margin-top:6px;padding:10px;background:#203647;color:#fff;border:1px solid #6c8190;border-radius:8px';[8,12,18].forEach(function(hour){var option=document.createElement('option');option.value=hour;option.textContent=hour===8?'8:00 AM':hour===12?'12:00 PM':'6:00 PM';time.appendChild(option)});timeLabel.appendChild(time);form.appendChild(timeLabel);
    var buttons=document.createElement('div');buttons.style.cssText='display:flex;gap:12px;margin-top:22px';form.appendChild(buttons);var save=document.createElement('button');save.type='submit';save.textContent='Save preferences';save.style.cssText='background:#e7bc65;color:#091521;padding:12px;border:0;border-radius:8px;font-weight:700;flex:1';buttons.appendChild(save);var cancel=document.createElement('button');cancel.type='button';cancel.textContent='Close';cancel.style.cssText='background:#344656;color:white;padding:12px;border:0;border-radius:8px';cancel.onclick=close;buttons.appendChild(cancel);
    panel.addEventListener('click',function(e){if(e.target===panel)close()});
    var settings=Object.assign({},defaults);
    try{var rows=await request('mw_notification_preferences?select=*&user_id=eq.'+encodeURIComponent(s.user.id));if(!panel)return;if(Array.isArray(rows)&&rows[0])Object.assign(settings,rows[0]);pushStatus.textContent=localStorage.getItem('mwAPNSDeviceToken')?'iPhone push token available.':'Register this iPhone to receive native push.'}catch(e){pushStatus.textContent=e.message;save.disabled=true}
    fields.forEach(function(f){inputs[f].checked=!!settings[f]});pushInput.checked=!!settings.push_enabled;time.value=String(settings.reminder_hour);
    form.onsubmit=async function(e){e.preventDefault();var current=auth();if(!current||current.user.id!==s.user.id){pushStatus.textContent='Session changed. Please reopen settings.';return}if(pushInput.checked&&!localStorage.getItem('mwAPNSDeviceToken')){pushStatus.textContent='Register this iPhone before enabling push delivery.';return}save.disabled=true;pushStatus.textContent='Saving…';var payload={user_id:s.user.id,push_enabled:pushInput.checked,reminder_hour:Number(time.value),timezone:Intl.DateTimeFormat().resolvedOptions().timeZone||'America/Chicago'};fields.forEach(function(f){payload[f]=inputs[f].checked});try{await request('mw_notification_preferences?on_conflict=user_id','POST',payload);pushStatus.textContent=pushInput.checked?'Push preference saved for this registered iPhone.':'Preferences saved.'}catch(err){pushStatus.textContent=err.message}finally{save.disabled=false}};
    syncPushDevice().catch(function(e){if(panel&&pushStatus)pushStatus.textContent='Device registration needs attention: '+e.message});
  }
  window.MWNotificationSettings={open:open};
  var launcher=document.createElement('button');launcher.type='button';launcher.textContent='🔔 Notification settings';launcher.setAttribute('aria-label','Open MW notification settings');launcher.style.cssText='position:fixed;right:14px;top:calc(14px + env(safe-area-inset-top,0px));z-index:1000;border:1px solid #c9a353;border-radius:999px;background:#112434;color:#f6d18b;padding:9px 13px;font:600 12px system-ui,sans-serif;box-shadow:0 4px 15px #0005';launcher.onclick=open;
  function mount(){if(document.body&&!document.getElementById('mw-notification-settings-launcher')){launcher.id='mw-notification-settings-launcher';document.body.appendChild(launcher)}}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount);else mount();
  window.addEventListener('mw:account-changed',function(){close();syncPushDevice().catch(function(){})});
})();
