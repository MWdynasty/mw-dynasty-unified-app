'use strict';
const {SUPABASE_URL,SUPABASE_KEY}=require('./mw-auth');
const VERSION='2026-10-06';
async function permissions(token,userId){
  const r=await fetch(`${SUPABASE_URL}/rest/v1/ai_sharing_permissions?select=own_ai,coach_ai,policy_version&user_id=eq.${encodeURIComponent(userId)}&limit=1`,{headers:{apikey:SUPABASE_KEY,Authorization:`Bearer ${token}`}});
  if(!r.ok)throw Object.assign(new Error('AI sharing permissions could not be verified. Try again shortly.'),{status:503});
  const rows=await r.json();const row=rows?.[0];
  return {ownAI:row?.policy_version===VERSION&&row?.own_ai===true,coachAI:row?.policy_version===VERSION&&row?.coach_ai===true};
}
async function requireConsent(token,userId){
  if(!(await permissions(token,userId)).ownAI)throw Object.assign(new Error('Allow sharing with OpenAI in AI & Data Sharing before using Coach MW.'),{status:403,code:'AI_CONSENT_REQUIRED'});
}
async function permittedAthleteIds(token,athletes,assignments){
  const rows=Array.isArray(athletes)?athletes:[],assigned=new Set((assignments||[]).map(x=>String(x.athlete_id)));
  if(!rows.length)return new Set();
  const ids=[...new Set(rows.filter(a=>assigned.has(String(a.id))).map(a=>a.user_id).filter(Boolean))];
  if(!ids.length)return new Set();
  const r=await fetch(`${SUPABASE_URL}/rest/v1/ai_sharing_permissions?select=user_id&coach_ai=eq.true&policy_version=eq.${VERSION}&user_id=in.(${ids.map(encodeURIComponent).join(',')})`,{headers:{apikey:SUPABASE_KEY,Authorization:`Bearer ${token}`}});
  if(!r.ok)throw Object.assign(new Error('Athlete AI sharing permissions could not be verified.'),{status:503});
  const allowed=new Set((await r.json()).map(x=>x.user_id));
  return new Set(rows.filter(a=>assigned.has(String(a.id))&&allowed.has(a.user_id)).map(a=>String(a.id)));
}
function filterAthleteContext(context,allowed){
  const out={...context};
  for(const key of ['assignments','attendance','programState','prs','flags','athleteAvailability'])out[key]=(context[key]||[]).filter(x=>allowed.has(String(x.athlete_id)));
  out.athletes=(context.athletes||[]).filter(x=>allowed.has(String(x.id))).map(({date_of_birth,user_id,...a})=>a);
  out.performanceIntelligence=(context.performanceIntelligence||[]).filter(x=>allowed.has(String(x.athleteId)));
  out.performance=Object.fromEntries(Object.entries(context.performance||{}).map(([key,rows])=>[key,rows.filter(x=>allowed.has(String(x.athlete_id)))]));
  out.aiSharing={athletesIncluded:out.athletes.length,notice:'Only currently assigned athletes who permitted coach-to-OpenAI sharing are included. Missing athletes are not evidence of absent performance.'};
  return out;
}
module.exports={VERSION,permissions,requireConsent,permittedAthleteIds,filterAthleteContext};
