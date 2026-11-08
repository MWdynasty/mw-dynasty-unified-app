(function(){
'use strict';
if(window.MWNotificationSettings)return;
var role=location.pathname.startsWith('/coach')?'coach':location.pathname.startsWith('/athlete')?'athlete':null;
if(!role)return;
var sessionKey=role==='coach'?'mwCoachSupabaseSession':'mwSupabaseSession';
var base='https://keqgunlfwhjgcsurynef.supabase.co',key='sb_publishable_JWCLQzrdWA_ZmvbpV5urVg_rcT6NECm';
var fields=['inactivity_reminders','adaptive_updates','progress_summaries','quiet_hours_enabled'];
var defaults={push_enabled:false,inactivity_reminders:true,adaptive_updates:true,progress_summaries:false,quiet_hours_enabled:true,reminder_hour:18,timezone:'America/Chicago'};
function session(){try{var s=window.MWAccountStorage||{local:localStorage,session:sessionStorage};return JSON.parse(s.local.getItem(sessionKey)||s.session.getItem(sessionKey)||'null')}catch{return null}}
function auth(){var s=session();return s&&s.user&&s.user.id&&s.access_token?s:null}
function request(path,method,data){var s=auth();if(!s)return Promise.reject(new Error('Sign in to manage your settings.'));return fetch((window.MW_SUPABASE_URL||base)+'/rest/v1/'+path,{method:method||'GET',headers:{apikey:window.MW_SUPABASE_KEY||key,Authorization:'Bearer '+s.access_token,'Content-Type':'application/json',Prefer:'return=representation,resolution=merge-duplicates'},body:data?JSON.stringify(data):undefined}).then(async function(r){if(!r.ok)throw new Error('Unable to save notification preferences ('+r.status+').');return r.json()})}
var panel=null;
function close(){if(panel){panel.remove();panel=null}}
async function open(){
if(panel){close();return}
var s=auth();if(!s)return;
panel=document.createElement('section');panel.id='mw-notification-settings';panel.setAttribute('role','dialog');panel.setAttribute('aria-modal','true');panel.setAttribute('aria-label','MW notification settings');
panel.style.cssText='position:fixed;z-index:2147483600;inset:0;background:#020811d9;display:flex;align-items:center;justify-content:center;padding:16px;color:#fff;font-family:system-ui,sans-serif';
var card=document.createElement('div');card.style.cssText='width:min(100%,440px);max-height:90vh;overflow:auto;background:#102131;border:1px solid #455363;border-radius:18px;padding:22px;box-shadow:0 12px 40px #0009';
panel.appendChild(card);document.body.appendChild(panel);
var h=document.createElement('h2');h.textContent='MW Notification Preferences';h.style.cssText='margin:0 0 12px;font-size:20px';card.appendChild(h);
var note=document.createElement('p');note.textContent=window.__mwPushRegistered?'Manage your reminder preferences. iPhone alerts are enabled on this device.':'Manage your reminder preferences. Enable alerts on your iPhone to receive push notifications.';note.style.cssText='font-size:13px;color:#c4d0db;line-height:1.5';card.appendChild(note);
var enable=document.createElement('button');enable.type='button';enable.textContent='Enable iPhone alerts';enable.style.cssText='margin:4px 0 10px;padding:10px 14px;border:0;border-radius:8px;background:#3b82f6;color:#fff;font-weight:700';card.appendChild(enable);
var status=document.createElement('p');status.textContent='Loading preferences…';status.style.cssText='font-size:13px;color:#e7bc65';card.appendChild(status);
enable.onclick=async function(){enable.disabled=true;status.textContent='Requesting iPhone notification permission…';try{if(typeof window.mwNativePermission!=='function'){status.textContent='Open MW Dynasty from the installed iPhone app to enable alerts.';return}var result=await window.mwNativePermission('notifications');if(result&&result.granted){note.textContent='Manage your reminder preferences. iPhone notification permission is enabled.';status.textContent='Permission granted. Registering this iPhone for alerts…';if(typeof window.mwRegisterPushDevice==='function')await window.mwRegisterPushDevice();if(window.__mwPushRegistered)status.textContent='This iPhone is registered for MW Dynasty push notifications.';else status.textContent='Permission granted. This iPhone is still registering; close and reopen MW Dynasty in a moment.'}else if(result&&result.pending){status.textContent='iPhone is still checking notification permission. Close and reopen this panel shortly.'}else if(result&&result.native===false){status.textContent='Open MW Dynasty from the installed iPhone app to enable alerts.'}else{status.textContent='Notifications are off for MW Dynasty. Enable them in iPhone Settings → Notifications → MW Dynasty.'}}catch(e){status.textContent='Could not request iPhone notification permission. Close and reopen MW Dynasty, then try again.'}finally{enable.disabled=false}};
var form=document.createElement('form');card.appendChild(form);
var labels={inactivity_reminders:'Inactivity reminders',adaptive_updates:'Adaptive training updates',progress_summaries:'Weekly progress summaries',quiet_hours_enabled:'Quiet hours (9 PM–7 AM)'};
var inputs={};
fields.forEach(function(f){var row=document.createElement('label');row.style.cssText='display:flex;gap:10px;align-items:center;padding:10px 0;font-size:14px';var input=document.createElement('input');input.type='checkbox';input.name=f;row.appendChild(input);row.appendChild(document.createTextNode(labels[f]));form.appendChild(row);inputs[f]=input});
var timeLabel=document.createElement('label');timeLabel.textContent='Preferred reminder time';timeLabel.style.cssText='display:block;margin-top:12px;font-size:14px';var time=document.createElement('select');time.style.cssText='display:block;width:100%;margin-top:6px;padding:10px;background:#203647;color:#fff;border:1px solid #6c8190;border-radius:8px';[8,12,18].forEach(function(hour){var o=document.createElement('option');o.value=hour;o.textContent=hour===8?'8:00 AM':hour===12?'12:00 PM':'6:00 PM';time.appendChild(o)});timeLabel.appendChild(time);form.appendChild(timeLabel);
var buttons=document.createElement('div');buttons.style.cssText='display:flex;gap:12px;margin-top:22px';form.appendChild(buttons);
var save=document.createElement('button');save.type='submit';save.textContent='Save preferences';save.style.cssText='background:#e7bc65;color:#091521;padding:12px;border:0;border-radius:8px;font-weight:700;flex:1';buttons.appendChild(save);
var cancel=document.createElement('button');cancel.type='button';cancel.textContent='Close';cancel.style.cssText='background:#344656;color:white;padding:12px;border:0;border-radius:8px';cancel.onclick=close;buttons.appendChild(cancel);
panel.addEventListener('click',function(e){if(e.target===panel)close()});
var settings=Object.assign({},defaults);
try{var rows=await request('mw_notification_preferences?select=*&user_id=eq.'+encodeURIComponent(s.user.id));if(!panel)return;if(Array.isArray(rows)&&rows[0])Object.assign(settings,rows[0]);status.textContent='Preferences saved to your account; phone push is not yet active.'}catch(e){status.textContent=e.message;save.disabled=true}
fields.forEach(function(f){inputs[f].checked=!!settings[f]});time.value=String(settings.reminder_hour);
form.onsubmit=async function(e){e.preventDefault();var current=auth();if(!current||current.user.id!==s.user.id){status.textContent='Session changed. Please reopen settings.';return}save.disabled=true;status.textContent='Saving…';var payload={user_id:s.user.id,push_enabled:window.__mwPushRegistered===true,reminder_hour:Number(time.value),timezone:Intl.DateTimeFormat().resolvedOptions().timeZone||'America/Chicago'};fields.forEach(function(f){payload[f]=inputs[f].checked});try{await request('mw_notification_preferences?on_conflict=user_id','POST',payload);status.textContent=payload.push_enabled?'Preferences saved. iPhone push is enabled on this device.':'Preferences saved. Enable iPhone alerts to receive push notifications.'}catch(err){status.textContent=err.message}finally{save.disabled=false}};
}
window.MWNotificationSettings={open:open};
var launcher=document.createElement('button');launcher.type='button';launcher.textContent='🔔 Notification settings';launcher.setAttribute('aria-label','Open MW notification settings');launcher.style.cssText='position:fixed;right:14px;bottom:calc(16px + env(safe-area-inset-bottom,0px));z-index:1000;border:1px solid #c9a353;border-radius:999px;background:#112434;color:#f6d18b;padding:9px 13px;font:600 12px system-ui,sans-serif;box-shadow:0 4px 15px #0005';launcher.onclick=open;
function mount(){if(document.body&&!document.getElementById('mw-notification-settings-launcher')){launcher.id='mw-notification-settings-launcher';document.body.appendChild(launcher)}}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount);else mount();
window.addEventListener('mw:account-changed',close);
})();

