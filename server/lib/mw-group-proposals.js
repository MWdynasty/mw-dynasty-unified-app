'use strict';
const crypto=require('node:crypto'),Pace=require('../../lib/mw-pace-model');
const fail=message=>{throw Object.assign(new Error(message),{status:400})};
function plan(spec,roster,existing=[]){
 const event=String(spec.event||'');if(!['100m','150m','200m','300m','400m','500m'].includes(event))fail('Choose the PR distance to use for grouping (for example, 200m).');
 const divisions=spec.divisions;
 if(!Array.isArray(divisions)||!divisions.length||divisions.length>3)fail('Choose how many groups to create for boys, girls, or open.');
 const seen=new Set();let total=0;
 for(const d of divisions){if(!['boys','girls','open'].includes(d.division)||seen.has(d.division)||!Number.isInteger(d.count)||d.count<1||d.count>12)fail('Use 1–12 groups per division, with each division listed once.');seen.add(d.division);total+=d.count;}
 if(total>24)fail('Create at most 24 groups in one request.');
 const distance=spec.distanceM==null?null:Number(spec.distanceM),intensity=spec.intensityPct==null?null:Number(spec.intensityPct);
 if((distance!==null||intensity!==null)&&(!(distance>=10&&distance<=500)||!(intensity>=40&&intensity<=100)))fail('For pacing targets, specify a rep distance (10–500m) and intensity (40–100%).');
 const usedNames=new Set(existing.map(g=>g.name)),groups=[],excluded=[];
 for(const a of roster){if(!a.competition_division)excluded.push({id:a.id,name:a.name,reason:'Division not set'});}
 for(const d of divisions){
  const rows=[];
  for(const a of roster.filter(a=>a.competition_division===d.division)){
   const marks=(a.prs||[]).filter(p=>p.event===event&&Number(p.time_seconds)>0&&Number.isFinite(Number(p.time_seconds))).sort((a,b)=>Number(a.time_seconds)-Number(b.time_seconds));
   if(!marks.length){excluded.push({id:a.id,name:a.name,reason:`No recorded ${event} PR or full-effort trial`});continue;}
   const p=marks[0],estimate=distance===null?null:Pace.calculate(a.prs,distance,intensity/100);
   rows.push({athleteId:a.id,name:a.name,prSeconds:Number(p.time_seconds),markType:p.mark_type||'race',timingMethod:p.timing_method||null,targetSeconds:estimate?.target||null,targetEstimated:estimate?.estimated||false});
  }
  rows.sort((a,b)=>a.prSeconds-b.prSeconds||a.athleteId.localeCompare(b.athleteId));
  if(rows.length<d.count)fail(`${d.division}: ${rows.length} athletes have a recorded ${event} time, so ${d.count} nonempty groups cannot be created. Add missing times or request fewer groups.`);
  let offset=0;
  for(let i=0;i<d.count;i++){
   const size=Math.floor(rows.length/d.count)+(i<rows.length%d.count?1:0),athletes=rows.slice(offset,offset+size);offset+=size;
   const label=d.division==='boys'?'Boys':d.division==='girls'?'Girls':'Open';
   const base=`${label} ${event} · PR Group ${i+1}`;let name=base,n=2;while(usedNames.has(name))name=`${base} (${n++})`;usedNames.add(name);
   groups.push({id:crypto.randomUUID(),name,division:d.division,athletes});
  }
 }
 return {type:'groups_create',requestId:crypto.randomUUID(),spec:{event,divisions:divisions.map(d=>({division:d.division,count:d.count})),distanceM:distance,intensityPct:intensity},groups,excluded,rosterCount:roster.length,createdAt:Date.now()};
}
function sign(action,coachId,key){const payload=Buffer.from(JSON.stringify({coachId,action})).toString('base64url');return {...action,approvalToken:payload+'.'+crypto.createHmac('sha256',key).update(payload).digest('base64url')};}
function verify(token,coachId,key){
 try{
  if(typeof token!=='string'||token.length>200000)throw Error();
  const [payload,sig,...rest]=token.split('.'),expected=crypto.createHmac('sha256',key).update(payload).digest();
  const actual=Buffer.from(sig||'','base64url');if(rest.length||actual.length!==expected.length||!crypto.timingSafeEqual(actual,expected))throw Error();
  const value=JSON.parse(Buffer.from(payload,'base64url').toString());
  if(value.coachId!==coachId||value.action.type!=='groups_create'||Date.now()-value.action.createdAt>86400000)throw Error();return value.action;
 }catch{throw Object.assign(new Error('This group preview is invalid or expired. Ask Coach MW to generate it again.'),{status:400})}
}
async function loadRoster(token,userId,url,key){
 const get=async path=>{const r=await fetch(url+'/rest/v1/'+path,{headers:{apikey:key,Authorization:'Bearer '+token}});const data=await r.json();if(!r.ok)throw Object.assign(new Error('The team roster could not be loaded. Please retry.'),{status:503});return data;};
 const assignments=await get(`coach_assignments?select=athlete_id&coach_user_id=eq.${encodeURIComponent(userId)}&status=eq.active`);
 const ids=[...new Set(assignments.map(a=>a.athlete_id))];if(!ids.length)fail('Connect athletes to your team before creating PR groups.');
 if(ids.length>200)fail('This grouping request supports up to 200 assigned athletes.');
 const athletes=await get(`athletes?select=id,user_id,competition_division&id=in.(${ids.map(encodeURIComponent).join(',')})`);
 const [profiles,prs,groups]=await Promise.all([
  get(`profiles?select=user_id,first_name,last_name&user_id=in.(${athletes.map(a=>encodeURIComponent(a.user_id)).join(',')})`),
  get(`athlete_prs?select=athlete_id,event,time_seconds,mark_type,timing_method&athlete_id=in.(${ids.map(encodeURIComponent).join(',')})&limit=2000`),
  get(`coach_groups?select=id,name&coach_user_id=eq.${encodeURIComponent(userId)}`)
 ]);
 return {roster:athletes.map(a=>{const p=profiles.find(p=>p.user_id===a.user_id);return {...a,name:[p?.first_name,p?.last_name].filter(Boolean).join(' ')||'Athlete',prs:prs.filter(p=>p.athlete_id===a.id)};}),groups};
}
module.exports={plan,sign,verify,loadRoster};
