const {authenticate}=require('../lib/mw-auth');
const {SUPABASE_URL,SUPABASE_KEY}=require('../lib/mw-auth');
const {effectiveCalendar}=require('../lib/mw-season-calendar');
const {
  loadTemplate,loadStateRegistry,weeksBetween,dateOnly,iso,addDays,
  phaseAllocation,phaseAtWeek,uiPhaseForCode
}=require('../lib/mw-season-intelligence');

async function rest(path,token,opts={}){
  const r=await fetch(`${SUPABASE_URL}/rest/v1/${path}`,{...opts,headers:{apikey:SUPABASE_KEY,Authorization:`Bearer ${token}`,'Content-Type':'application/json',...(opts.headers||{})}});
  const d=await r.json().catch(()=>null);
  if(!r.ok)throw Object.assign(new Error(d?.message||d?.hint||`Supabase request failed (${r.status})`),{status:r.status});
  return d;
}
function cleanLevel(value){
  const x=String(value||'').trim().toLowerCase().replace(/[\s/]+/g,'_');
  if(['middle_school','high_school','collegiate','club','private','professional'].includes(x))return x;
  if(x==='college'||x==='university')return 'collegiate';
  if(x==='club_aau'||x==='aau')return 'club';
  if(x==='private_coach')return 'private';
  return '';
}
function levelConfig(level){
  return ({
    middle_school:{group:'middle_school',competitionLevel:'8',path:'school'},
    high_school:{group:'high_school',competitionLevel:'12',path:'school'},
    collegiate:{group:'collegiate',competitionLevel:'collegiate',path:'ncaa'},
    club:{group:'youth_club',competitionLevel:'12',path:'aau'},
    private:{group:'high_school',competitionLevel:'12',path:'school'},
    professional:{group:'professional',competitionLevel:'professional',path:'professional_open'}
  })[level]||null;
}
function validateState(value){
  const x=String(value||'').trim().toUpperCase();
  return /^[A-Z]{2}$/.test(x)?x:'';
}
function validDate(value){return /^\d{4}-\d{2}-\d{2}$/.test(String(value||''))?String(value):null}
function defaultPeakDate(group,seasonType,seasonYear){
  const y=Number(seasonYear);
  if(seasonType==='indoor')return `${y}-03-15`;
  if(group==='collegiate')return `${y}-06-15`;
  if(group==='youth_club')return `${y}-07-25`;
  if(group==='professional')return `${y}-08-01`;
  return `${y}-05-31`;
}
function currentPosition(startDate,peakDate){
  const start=dateOnly(startDate),peak=dateOnly(peakDate),today=dateOnly(new Date());
  const length=weeksBetween(start,peak);
  if(!start||!peak||!length)return {};
  let status='active',week=1;
  if(today<start){status='preseason';week=1}
  else if(today>peak){status='completed';week=length}
  else week=Math.max(1,Math.min(length,Math.floor((today-start)/86400000/7)+1));
  const phasePlan=phaseAllocation(length);
  const phaseCode=phaseAtWeek(phasePlan,week);
  return {status,week,phase:uiPhaseForCode(phaseCode),phaseCode,seasonLengthWeeks:length,peakDate:iso(peak)};
}
function decorateCalendar(base,row){
  if(!row)return base;
  const out={...base,
    competitionState:row.competition_state||null,
    coachingLevel:row.coaching_level||null,
    seasonType:row.season_type||null,
    seasonYear:Number(row.season_year||0)||null,
    firstMeetDate:row.first_meet_date||null,
    primaryPeakDate:row.primary_peak_date||null,
    calendarSource:row.calendar_source||base?.source||null
  };
  if(row.season_start_date)out.startDate=row.season_start_date;
  if(row.season_start_date&&row.primary_peak_date)Object.assign(out,currentPosition(row.season_start_date,row.primary_peak_date));
  return out;
}
async function coachSettings(token,userId){
  const rows=await rest(`coach_season_settings?coach_user_id=eq.${encodeURIComponent(userId)}&select=*&limit=1`,token,{method:'GET'});
  return Array.isArray(rows)?rows[0]||null:null;
}
async function requireCoach(token,userId){
  const rows=await rest(`profiles?select=role,account_status&user_id=eq.${encodeURIComponent(userId)}&limit=1`,token,{method:'GET'});
  const p=Array.isArray(rows)?rows[0]:null;
  if(!p||p.account_status!=='active'||!['coach','admin','founder_owner'].includes(String(p.role)))throw Object.assign(new Error('Coach access required'),{status:403});
  return p;
}
async function estimateCalendar(token,{stateCode,coachingLevel,seasonType,seasonYear}){
  const state=validateState(stateCode),level=cleanLevel(coachingLevel),type=['indoor','outdoor','both'].includes(String(seasonType))?String(seasonType):'outdoor';
  const year=Math.trunc(Number(seasonYear));
  const cfg=levelConfig(level);
  if(!state)throw Object.assign(new Error('Choose the state where you coach.'),{status:400});
  if(!cfg)throw Object.assign(new Error('Choose your coaching level.'),{status:400});
  if(!year||year<2025||year>2035)throw Object.assign(new Error('Choose a valid season year.'),{status:400});

  if(type==='both'){
    const indoor=await estimateCalendar(token,{stateCode:state,coachingLevel:level,seasonType:'indoor',seasonYear:year});
    const outdoor=await estimateCalendar(token,{stateCode:state,coachingLevel:level,seasonType:'outdoor',seasonYear:year});
    const startDate=[indoor.startDate,outdoor.startDate].filter(Boolean).sort()[0]||outdoor.startDate||indoor.startDate;
    const firstMeetDate=[indoor.firstMeetDate,outdoor.firstMeetDate].filter(Boolean).sort()[0]||null;
    const peakDate=outdoor.primaryPeakDate||indoor.primaryPeakDate;
    const source=indoor.source==='state_registry'&&outdoor.source==='state_registry'
      ?'state_registry'
      :(indoor.source==='state_school_proxy'||outdoor.source==='state_school_proxy'?'state_school_proxy':'mw_estimate');
    return {
      competitionState:state,coachingLevel:level,seasonType:'both',seasonYear:year,
      startDate,firstMeetDate,primaryPeakDate:peakDate,seasonLengthWeeks:weeksBetween(startDate,peakDate),
      indoorPeakDate:indoor.primaryPeakDate||null,outdoorPeakDate:outdoor.primaryPeakDate||null,
      source,sourceConfidence:(indoor.sourceConfidence==='verified'&&outdoor.sourceConfidence==='verified')?'verified':'estimated',
      sourceLabel:'MW Dynasty combined indoor + outdoor calendar',
      registryLevel:outdoor.registryLevel||indoor.registryLevel||cfg.group
    };
  }

  const template=await loadTemplate(token,{group:cfg.group,seasonType:type,competitionPath:cfg.path});
  let registry=null,source='mw_estimate',registryLevel=cfg.group;
  if(['middle_school','high_school'].includes(cfg.group)&&cfg.path==='school'){
    registry=await loadStateRegistry(token,{stateCode:state,group:cfg.group,seasonType:type,seasonYear:year,competitionPath:'school'});
    if(!registry&&cfg.group==='middle_school'){
      registry=await loadStateRegistry(token,{stateCode:state,group:'high_school',seasonType:type,seasonYear:year,competitionPath:'school'});
      if(registry){source='state_school_proxy';registryLevel='high_school'}
    }else if(registry){source='state_registry'}
  }

  let startDate,firstMeetDate,peakDate;
  if(registry?.estimated_start_date&&registry?.estimated_peak_date){
    startDate=String(registry.estimated_start_date);
    firstMeetDate=registry.estimated_first_meet_date?String(registry.estimated_first_meet_date):null;
    peakDate=String(registry.estimated_peak_date);
  }else{
    peakDate=defaultPeakDate(cfg.group,type,year);
    const peak=dateOnly(peakDate);
    const target=Math.max(4,Math.min(41,Number(template?.targetWeeks||12)));
    startDate=iso(addDays(peak,-7*(target-1)));
    const first=addDays(dateOnly(startDate),Math.min(28,Math.max(14,Math.round(target*.22)*7)));
    firstMeetDate=first<peak?iso(first):null;
  }
  const length=weeksBetween(startDate,peakDate);
  return {
    competitionState:state,coachingLevel:level,seasonType:type,seasonYear:year,
    startDate,firstMeetDate,primaryPeakDate:peakDate,seasonLengthWeeks:length,
    source,sourceConfidence:registry?.source_confidence||'estimated',
    sourceLabel:registry?.source_label||'MW Dynasty estimated calendar',
    registryLevel
  };
}

module.exports=async function handler(req,res){
  res.setHeader('Cache-Control','no-store, private');
  try{
    const {token,user}=await authenticate(req);
    if(req.method==='GET'){
      const calendar=await effectiveCalendar(token);
      let settings=null;
      try{settings=await coachSettings(token,user.id)}catch{}
      return res.status(200).json({ok:true,calendar:decorateCalendar(calendar,settings)});
    }
    if(req.method!=='POST')return res.status(405).json({error:'GET or POST only'});
    await requireCoach(token,user.id);
    const b=typeof req.body==='string'?JSON.parse(req.body||'{}'):(req.body||{});

    if(String(b.action||'')==='estimate'){
      const estimate=await estimateCalendar(token,b);
      return res.status(200).json({ok:true,estimate});
    }

    const state=validateState(b.stateCode||b.competitionState);
    const level=cleanLevel(b.coachingLevel);
    const type=['indoor','outdoor','both'].includes(String(b.seasonType))?String(b.seasonType):'outdoor';
    const year=Math.trunc(Number(b.seasonYear));
    const startDate=validDate(b.startDate),firstMeetDate=validDate(b.firstMeetDate),peakDate=validDate(b.primaryPeakDate);
    if(!state)return res.status(400).json({error:'Choose the state where you coach.'});
    if(!level)return res.status(400).json({error:'Choose your coaching level.'});
    if(!year||year<2025||year>2035)return res.status(400).json({error:'Choose a valid season year.'});
    if(!startDate||!peakDate)return res.status(400).json({error:'Training start and championship dates are required.'});
    const length=weeksBetween(startDate,peakDate);
    if(!length)return res.status(400).json({error:'Championship date must be on or after the training start date.'});
    const source=['state_registry','state_school_proxy','mw_estimate','coach_edit'].includes(String(b.calendarSource))?String(b.calendarSource):'coach_edit';
    const payload={
      coach_user_id:user.id,calendar_mode:'custom',season_start_date:startDate,
      competition_state:state,coaching_level:level,season_type:type,season_year:year,
      first_meet_date:firstMeetDate,primary_peak_date:peakDate,calendar_source:source,
      updated_at:new Date().toISOString()
    };
    await rest('coach_season_settings?on_conflict=coach_user_id',token,{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=minimal'},body:JSON.stringify(payload)});
    const calendar=decorateCalendar(await effectiveCalendar(token),payload);
    return res.status(200).json({ok:true,calendar});
  }catch(e){return res.status(e.status||500).json({error:e.message||'Season calendar could not be saved'})}
};
