(function(){'use strict';if(!location.pathname.startsWith('/athlete'))return;
var base='https://keqgunlfwhjgcsurynef.supabase.co',key='sb_publishable_JWCLQzrdWA_ZmvbpV5urVg_rcT6NECm';
function session(){try{var st=window.MWAccountStorage||{local:localStorage,session:sessionStorage};return JSON.parse(st.local.getItem('mwSupabaseSession')||st.session.getItem('mwSupabaseSession')||'null')}catch(e){return null}}
function el(tag,text,css){var x=document.createElement(tag);if(text!=null)x.textContent=text;if(css)x.style.cssText=css;return x}
function mount(){var home=document.getElementById('home');if(!home||document.getElementById('mw-performance-progression'))return false;
var section=el('section',null,'margin:18px 0 24px;padding:18px;border:1px solid #9b7a39;border-radius:18px;background:#101b29;color:#f7f5ef;font:14px system-ui');section.id='mw-performance-progression';
section.appendChild(el('h2','MY PERFORMANCE PROGRESSION','font-size:19px;letter-spacing:.05em;color:#f3c768;margin:0 0 6px'));
section.appendChild(el('p','Speed • Strength • Actual improvements','color:#aebdcc;margin:0 0 14px'));
var content=el('div','Loading your saved performances…');section.appendChild(content);
var anchor=home.querySelector('.mwTodayFocusCard,.todayFocusCard,.today-focus-card')||home.querySelector('section,article,.card');if(anchor)anchor.insertAdjacentElement('afterend',section);else home.prepend(section);
var s=session();if(!s||!s.access_token){content.textContent='Sign in to see your progression.';return true}
fetch((window.MW_SUPABASE_URL||base)+'/rest/v1/rpc/mw_get_performance_progression',{method:'POST',headers:{apikey:window.MW_SUPABASE_KEY||key,Authorization:'Bearer '+s.access_token,'Content-Type':'application/json'},body:'{}'}).then(async function(r){var d=await r.json();if(!r.ok)throw Error(d.message||'Unable to load');return d}).then(function(d){content.replaceChildren();
function heading(t){content.appendChild(el('h3',t,'color:#f1c466;font-size:15px;margin:16px 0 9px'))}
function card(main,sub){var x=el('div',null,'background:#0a1521;border:1px solid #334657;border-radius:12px;padding:12px;margin:8px 0');x.appendChild(el('strong',main,'display:block;font-size:17px'));x.appendChild(el('div',sub,'font-size:12px;color:#afbecd;margin-top:5px'));content.appendChild(x)}
heading('⚡ GETTING FASTER');if(!d.speed||!d.speed.length)card('Speed baseline not established','Record two speed-focused sessions at the same distance. Tempo and technical reps do not count as speed tests.');
else d.speed.forEach(function(v){var delta=v.improvement_seconds==null?'Awaiting comparison':(Number(v.improvement_seconds)>0?'▼ '+Number(v.improvement_seconds).toFixed(2)+'s faster':Number(v.improvement_seconds)<0?'▲ '+Math.abs(Number(v.improvement_seconds)).toFixed(2)+'s slower':'No change');card(v.distance_m+'m · '+Number(v.best_seconds).toFixed(2)+'s best',delta+' · '+v.sessions+' comparable session(s)')});
heading('🏋️ GETTING STRONGER');if(!d.strength||!d.strength.length)card('Strength baseline not established','Log actual weights and reps to track lift improvements. Completing a session alone does not prove strength gains.');
else d.strength.forEach(function(v){var delta=v.gain==null?'Awaiting second session':(Number(v.gain)>0?'+'+Number(v.gain).toFixed(1)+' '+v.unit+' estimated strength':Number(v.gain)<0?Number(v.gain).toFixed(1)+' '+v.unit+' estimated strength':'No change');card(v.exercise+' · '+Number(v.best_estimated_1rm).toFixed(1)+' '+v.unit+' estimated max',delta+' · '+v.sessions+' logged day(s)')});
content.appendChild(el('p','Comparisons use matching speed distances and matching lifts. Estimates are not measured personal records.','color:#a6b5c5;font-size:11px;margin-top:12px'));
}).catch(function(e){content.textContent='Progression unavailable: '+e.message});return true}
function start(){if(mount())return;var ob=new MutationObserver(function(){if(mount())ob.disconnect()});ob.observe(document.body,{childList:true,subtree:true});setTimeout(function(){ob.disconnect()},12000)}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
})();