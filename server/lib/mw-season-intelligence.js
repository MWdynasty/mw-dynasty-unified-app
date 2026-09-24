const {SUPABASE_URL,SUPABASE_KEY}=require('./mw-auth');

const MASTER_PHASE_SPANS={
  foundation:{start:1,end:12,label:'Foundation'},
  pre_competition:{start:13,end:30,label:'Pre-Competition'},
  competition:{start:31,end:35,label:'Competition'},
  peak:{start:36,end:41,label:'Peak / Championship'}
};

const FALLBACK_TEMPLATES={
  'middle_school|indoor|school':{minWeeks:8,targetWeeks:10,maxWeeks:12},
  'middle_school|outdoor|school':{minWeeks:8,targetWeeks:11,maxWeeks:13},
  'high_school|indoor|school':{minWeeks:11,targetWeeks:13,maxWeeks:16},
  'high_school|outdoor|school':{minWeeks:12,targetWeeks:15,maxWeeks:17},
  'youth_club|indoor|aau':{minWeeks:8,targetWeeks:10,maxWeeks:12},
  'youth_club|outdoor|aau':{minWeeks:12,targetWeeks:14,maxWeeks:16},
  'youth_club|indoor|usatf':{minWeeks:8,targetWeeks:10,maxWeeks:12},
  'youth_club|outdoor|usatf':{minWeeks:12,targetWeeks:14,maxWeeks:16},
  'collegiate|indoor|ncaa':{minWeeks:10,targetWeeks:11,maxWeeks:12},
  'collegiate|outdoor|ncaa':{minWeeks:12,targetWeeks:13,maxWeeks:15},
  'professional|indoor|professional_open':{minWeeks:8,targetWeeks:10,maxWeeks:12},
  'professional|outdoor|professional_open':{minWeeks:16,targetWeeks:18,maxWeeks:24}
};

function clamp(n,min,max){return Math.max(min,Math.min(max,Number(n)||min))}
function dateOnly(value){
  if(!value)return null;
  const d=value instanceof Date?new Date(value.getTime()):new Date(String(value).slice(0,10)+'T00:00:00Z');
  if(Number.isNaN(d.getTime()))return null;
  return new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),d.getUTCDate()));
}
function iso(d){return d?d.toISOString().slice(0,10):null}
function addDays(d,n){const x=new Date(d.getTime());x.setUTCDate(x.getUTCDate()+n);return x}
function weeksBetween(start,peak){
  const a=dateOnly(start),b=dateOnly(peak);if(!a||!b||b<a)return null;
  return clamp(Math.ceil((b-a)/86400000/7)+1,4,41);
}
function normalizeLevel(value){
  const x=String(value||'').trim().toLowerCase();
  if(['6','7','8','9','10','11','12','collegiate','professional'].includes(x))return x;
  return '';
}
function normalizeState(value){
  const x=String(value||'').trim().toUpperCase();
  return /^[A-Z]{2}$/.test(x)?x:'';
}
function normalizeSeasonType(value){
  const x=String(value||'').trim().toLowerCase();
  return ['indoor','outdoor'].includes(x)?x:'';
}
function normalizeSeasonPreference(value){
  const x=String(value||'').trim().toLowerCase();
  return ['indoor','outdoor','both','offseason'].includes(x)?x:'';
}
function normalizeCompetitionPath(value,level){
  const x=String(value||'').trim().toLowerCase();
  if(['school','aau','usatf','ncaa','professional_open'].includes(x))return x;
  if(level==='collegiate')return 'ncaa';
  if(level==='professional')return 'professional_open';
  return 'school';
}
function levelGroup(level,path='school'){
  const l=normalizeLevel(level),p=normalizeCompetitionPath(path,l);
  if(p==='aau'||p==='usatf')return 'youth_club';
  if(['6','7','8'].includes(l))return 'middle_school';
  if(['9','10','11','12'].includes(l))return 'high_school';
  if(l==='collegiate')return 'collegiate';
  if(l==='professional')return 'professional';
  return '';
}
function templateKey(group,season,path){return [group,season,path].join('|')}
function fallbackTemplate(group,season,path){
  return FALLBACK_TEMPLATES[templateKey(group,season,path)]||{minWeeks:8,targetWeeks:12,maxWeeks:16};
}
function exactNormalAllocation(total){
  const m={
    4:[1,1,1,1],5:[1,1,2,1],6:[1,2,2,1],7:[2,2,2,1],8:[2,2,3,1],
    9:[2,2,4,1],10:[3,2,4,1],11:[3,3,4,1],12:[3,3,4,2],
    13:[3,3,5,2],14:[4,3,5,2],15:[4,4,5,2],16:[4,4,6,2],
    18:[4,5,7,2],20:[5,5,8,2],24:[6,6,9,3]
  };
  return m[total]||null;
}
function ratioAllocation(total,ratios){
  const counts=[1,1,1,1],remaining=total-4;
  if(remaining<=0)return counts;
  const raw=ratios.map(r=>r*remaining),floors=raw.map(Math.floor);
  for(let i=0;i<4;i++)counts[i]+=floors[i];
  let left=remaining-floors.reduce((a,b)=>a+b,0);
  const order=raw.map((v,i)=>({i,frac:v-floors[i]})).sort((a,b)=>b.frac-a.frac||a.i-b.i);
  for(let k=0;k<left;k++)counts[order[k%4].i]++;
  return counts;
}
function phaseAllocation(totalWeeks,{continuation=false}={}){
  const total=clamp(Math.trunc(totalWeeks),4,41);
  let counts;
  if(!continuation)counts=exactNormalAllocation(total)||ratioAllocation(total,[.25,.25,.35,.15]);
  else counts=ratioAllocation(total,[.10,.30,.40,.20]);
  const keys=['foundation','pre_competition','competition','peak'];
  let cursor=1;const out={};
  keys.forEach((key,i)=>{const count=counts[i];out[key]={start:cursor,end:cursor+count-1,count,label:MASTER_PHASE_SPANS[key].label};cursor+=count});
  return out;
}
function sourceWeeksForPhase(key,count,{continuation=false}={}){
  let {start,end}=MASTER_PHASE_SPANS[key];
  if(continuation&&key==='foundation')start=7;
  if(continuation&&key==='pre_competition')start=19;
  if(count<=1)return [key==='peak'?end:Math.round((start+end)/2)];
  const out=[];
  for(let i=0;i<count;i++)out.push(Math.round(start+(end-start)*(i/(count-1))));
  return out;
}
function sourceWeekMap(phasePlan,{continuation=false}={}){
  const out={};
  for(const key of ['foundation','pre_competition','competition','peak']){
    const p=phasePlan[key];if(!p)continue;
    const src=sourceWeeksForPhase(key,p.count,{continuation});
    for(let i=0;i<p.count;i++){
      const seasonWeek=p.start+i;
      out[String(seasonWeek)]={sourceWeek:src[i],phase:key,phaseLabel:p.label};
    }
  }
  return out;
}
function phaseAtWeek(phasePlan,week){
  const w=Math.max(1,Math.trunc(Number(week)||1));
  for(const key of ['foundation','pre_competition','competition','peak']){
    const p=phasePlan?.[key];if(p&&w>=Number(p.start)&&w<=Number(p.end))return key;
  }
  return 'foundation';
}
function uiPhaseForCode(code){return code==='foundation'?1:code==='pre_competition'?3:code==='competition'?4:5}
function positionForPlan(plan,now=new Date()){
  if(!plan)return null;
  const start=dateOnly(plan.season_start_date),peak=dateOnly(plan.primary_peak_date),today=dateOnly(now);
  const length=clamp(plan.season_length_weeks,4,41);
  const phasePlan=typeof plan.phase_plan==='string'?JSON.parse(plan.phase_plan||'{}'):(plan.phase_plan||{});
  const map=typeof plan.source_week_map==='string'?JSON.parse(plan.source_week_map||'{}'):(plan.source_week_map||{});
  let status='active',week=1;
  if(today<start){status='preseason';week=1}
  else if(today>peak){status='completed';week=length}
  else week=clamp(Math.floor((today-start)/86400000/7)+1,1,length);
  const phaseCode=phaseAtWeek(phasePlan,week);
  const sourceWeek=clamp(map?.[String(week)]?.sourceWeek||week,1,41);
  return {status,week,phaseCode,phase:uiPhaseForCode(phaseCode),sourceWeek,seasonLengthWeeks:length,startDate:iso(start),peakDate:iso(peak)};
}
async function rest(path,token,opts={}){
  const r=await fetch(`${SUPABASE_URL}/rest/v1/${path}`,{...opts,headers:{apikey:SUPABASE_KEY,Authorization:`Bearer ${token}`,'Content-Type':'application/json',...(opts.headers||{})}});
  const d=await r.json().catch(()=>null);
  if(!r.ok)throw Object.assign(new Error(d?.message||d?.hint||`Supabase request failed (${r.status})`),{status:r.status});
  return d;
}
async function rpc(name,token,body={}){
  const r=await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`,{method:'POST',headers:{apikey:SUPABASE_KEY,Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify(body||{})});
  const d=await r.json().catch(()=>null);
  if(!r.ok)throw Object.assign(new Error(d?.message||d?.hint||`Supabase RPC failed (${r.status})`),{status:r.status});
  return d;
}
async function loadTemplate(token,{group,seasonType,competitionPath}){
  try{
    const rows=await rest(`mw_season_templates?level_group=eq.${encodeURIComponent(group)}&season_type=eq.${encodeURIComponent(seasonType)}&competition_path=eq.${encodeURIComponent(competitionPath)}&select=min_weeks,target_weeks,max_weeks,notes&limit=1`,token,{method:'GET'});
    const x=Array.isArray(rows)?rows[0]:null;
    if(x)return {minWeeks:Number(x.min_weeks),targetWeeks:Number(x.target_weeks),maxWeeks:Number(x.max_weeks),notes:x.notes||''};
  }catch{}
  return fallbackTemplate(group,seasonType,competitionPath);
}
async function loadStateRegistry(token,{stateCode,group,seasonType,seasonYear,competitionPath='school'}){
  if(!stateCode||!['middle_school','high_school'].includes(group)||competitionPath!=='school')return null;
  const rows=await rest(`mw_state_season_registry?state_code=eq.${encodeURIComponent(stateCode)}&level_group=eq.${encodeURIComponent(group)}&season_type=eq.${encodeURIComponent(seasonType)}&competition_path=eq.school&season_year=eq.${encodeURIComponent(seasonYear)}&select=*&limit=1`,token,{method:'GET'});
  return Array.isArray(rows)?(rows[0]||null):null;
}
function derivePlan({seasonType,competitionLevel,competitionState,competitionPath,seasonYear,startDate,firstMeetDate,primaryPeakDate,secondaryPeakDate,template,registry,continuation=false}){
  const level=normalizeLevel(competitionLevel),path=normalizeCompetitionPath(competitionPath,level),group=levelGroup(level,path),state=normalizeState(competitionState);
  if(!level||!group||!normalizeSeasonType(seasonType))throw Object.assign(new Error('Competition level and season type are required.'),{status:400});
  const target=Number(registry?.target_weeks||template?.targetWeeks||fallbackTemplate(group,seasonType,path).targetWeeks);
  const userStart=dateOnly(startDate),userPeak=dateOnly(primaryPeakDate),userMeet=dateOnly(firstMeetDate),userSecondary=dateOnly(secondaryPeakDate);
  const regStart=dateOnly(registry?.estimated_start_date),regPeak=dateOnly(registry?.estimated_peak_date),regMeet=dateOnly(registry?.estimated_first_meet_date);
  let start=userStart||regStart,peak=userPeak||regPeak,firstMeet=userMeet||regMeet;
  let calendarSource=(userStart||userPeak||userMeet||userSecondary)?'athlete_dates':registry?'state_registry':'mw_estimate';
  if(!start&&peak)start=addDays(peak,-7*(target-1));
  if(start&&!peak)peak=addDays(start,7*(target-1));
  if(!start||!peak){
    return {needsDates:true,levelGroup:group,targetWeeks:target,minWeeks:Number(template?.minWeeks||target),maxWeeks:Number(template?.maxWeeks||target),registry:registry||null};
  }
  const length=weeksBetween(start,peak);
  if(!length)throw Object.assign(new Error('Season start and championship dates are not valid.'),{status:400});
  const phasePlan=phaseAllocation(length,{continuation});
  const weekMap=sourceWeekMap(phasePlan,{continuation});
  return {
    needsDates:false,seasonYear:Number(seasonYear||peak.getUTCFullYear()),seasonType,competitionLevel:level,levelGroup:group,
    competitionState:state||null,competitionPath:path,calendarSource,seasonStartDate:iso(start),firstMeetDate:iso(firstMeet),
    primaryPeakDate:iso(peak),secondaryPeakDate:iso(userSecondary),seasonLengthWeeks:length,phasePlan,sourceWeekMap:weekMap,
    mappingVersion:'mw-season-map-v1',continuation,registry:registry||null
  };
}
async function reconcileSeasonPlan(token){
  try{return await rpc('mw_reconcile_own_season_plan',token,{})}catch{return null}
}
async function upsertSeasonPlan(token,plan,{activate=false,continuationFromPlanId=null}={}){
  return rpc('mw_upsert_own_season_plan',token,{
    p_season_year:plan.seasonYear,p_season_type:plan.seasonType,p_competition_level:plan.competitionLevel,
    p_level_group:plan.levelGroup,p_competition_state:plan.competitionState,p_competition_path:plan.competitionPath,
    p_calendar_source:plan.calendarSource,p_season_start_date:plan.seasonStartDate,p_first_meet_date:plan.firstMeetDate,
    p_primary_peak_date:plan.primaryPeakDate,p_secondary_peak_date:plan.secondaryPeakDate,p_season_length_weeks:plan.seasonLengthWeeks,
    p_phase_plan:plan.phasePlan,p_source_week_map:plan.sourceWeekMap,p_activate:!!activate,p_continuation_from_plan_id:continuationFromPlanId
  });
}
async function listOwnSeasonPlans(token,athleteId){
  if(!athleteId)return [];
  const rows=await rest(`athlete_season_plans?athlete_id=eq.${encodeURIComponent(athleteId)}&select=*&order=season_start_date.asc`,token,{method:'GET'});
  return Array.isArray(rows)?rows:[];
}
module.exports={
  MASTER_PHASE_SPANS,FALLBACK_TEMPLATES,normalizeLevel,normalizeState,normalizeSeasonType,normalizeSeasonPreference,
  normalizeCompetitionPath,levelGroup,phaseAllocation,sourceWeekMap,phaseAtWeek,uiPhaseForCode,positionForPlan,
  loadTemplate,loadStateRegistry,derivePlan,reconcileSeasonPlan,upsertSeasonPlan,listOwnSeasonPlans,rest,rpc,dateOnly,iso,addDays,weeksBetween
};
