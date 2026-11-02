(function(){'use strict';
if(!location.pathname.startsWith('/athlete'))return;
function mount(){
 var home=document.getElementById('home');
 var train=document.getElementById('workouts');
 var guidance=document.getElementById('mw-return-guidance-launcher');
 var settings=document.getElementById('mw-notification-settings-launcher');
 if(!home||!train||!guidance||!settings)return false;
 var section=document.getElementById('mw-adaptive-tools');
 if(!section){
  section=document.createElement('section');section.id='mw-adaptive-tools';
  section.setAttribute('aria-label','Training intelligence tools');
  section.style.cssText='margin:18px 0 28px;padding:14px;border:1px solid rgba(225,188,103,.35);border-radius:16px;background:#101825;color:#f6e3ac';
  var title=document.createElement('h3');title.textContent='Training intelligence';title.style.cssText='font:700 16px system-ui;margin:0 0 6px';section.appendChild(title);
  var intro=document.createElement('p');intro.textContent='Get guidance for returning after a break and see whether a coach review is needed.';intro.style.cssText='margin:0 0 12px;color:#b8c5d1;font:13px/1.45 system-ui';section.appendChild(intro);
  var actions=document.createElement('div');actions.id='mw-adaptive-actions';actions.style.cssText='display:flex;flex-wrap:wrap;gap:10px';section.appendChild(actions);
  var focus=train.querySelector('#mwTodayToolsCard,.mwWorkoutCard,.workoutCard,.mwTodayCard,.card');
  if(focus&&focus.parentElement)focus.insertAdjacentElement('afterend',section);else train.appendChild(section);
 }
 var actions=section.querySelector('#mw-adaptive-actions');
 [guidance].forEach(function(button){
  if(button.parentElement!==actions)actions.appendChild(button);
  button.style.setProperty('position','static','important');
  button.style.setProperty('bottom','auto','important');
  button.style.setProperty('right','auto','important');
  button.style.setProperty('z-index','auto','important');
  button.style.setProperty('font-size','12px','important');
  button.style.setProperty('padding','10px 12px','important');
  button.style.setProperty('max-width','100%','important');
  button.style.setProperty('white-space','normal','important');
  button.style.setProperty('box-shadow','none','important');
 });
 var profile=document.getElementById('athlete');
 if(profile&&settings.parentElement!==profile){
  settings.style.cssText='position:static;display:block;margin:14px 0 24px;max-width:100%;white-space:normal;box-shadow:none';
  settings.style.setProperty('position','static','important');
  settings.style.setProperty('bottom','auto','important');
  settings.style.setProperty('right','auto','important');
  settings.style.setProperty('z-index','auto','important');
  settings.style.setProperty('font-size','12px','important');
  settings.style.setProperty('padding','10px 12px','important');
  settings.style.setProperty('max-width','100%','important');
  settings.style.setProperty('white-space','normal','important');
  settings.style.setProperty('box-shadow','none','important');
  profile.appendChild(settings);
 }
 return true;
}
function start(){if(mount())return;var observer=new MutationObserver(function(){if(mount())observer.disconnect()});observer.observe(document.body,{childList:true,subtree:true});setTimeout(function(){observer.disconnect()},12000)}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
})();
