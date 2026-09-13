const {SUPABASE_URL,SUPABASE_KEY}=require('./mw-auth');

async function sj(path,token,opts={}){
  const r=await fetch(`${SUPABASE_URL}/rest/v1/${path}`,{...opts,headers:{apikey:SUPABASE_KEY,Authorization:`Bearer ${token}`,'Content-Type':'application/json',...(opts.headers||{})}});
  const d=await r.json().catch(()=>null);
  if(!r.ok)throw Object.assign(new Error(d?.message||d?.hint||`Supabase request failed (${r.status})`),{status:r.status});
  return d;
}
function dateOnlyUTC(d){return new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),d.getUTCDate()))}
function isoDate(d){return d.toISOString().slice(0,10)}
function addDays(d,n){const x=new Date(d.getTime());x.setUTCDate(x.getUTCDate()+n);return x}
function standardStartForYear(year){
  const sep1=new Date(Date.UTC(year,8,1));
  const offset=(8-sep1.getUTCDay())%7; // first Monday in September
  const laborDay=addDays(sep1,offset);
  return addDays(laborDay,1); // Tuesday after Labor Day
}
function calendarPosition({mode='standard',customStart=null,now=new Date()}){
  const today=dateOnlyUTC(now);
  let start,status='active',nextStart=null;
  if(mode==='custom'&&customStart){
    start=dateOnlyUTC(new Date(`${customStart}T00:00:00Z`));
    if(today<start){status='preseason';return {mode:'custom',status,week:1,phase:1,startDate:isoDate(start),nextStartDate:isoDate(start)};}
    const days=Math.floor((today-start)/86400000);
    if(days>=41*7){status='offseason';return {mode:'custom',status,week:1,phase:1,startDate:isoDate(start),nextStartDate:null};}
    const week=Math.max(1,Math.min(41,Math.floor(days/7)+1));
    return {mode:'custom',status,week,phase:phaseFromWeek(week),startDate:isoDate(start),nextStartDate:null};
  }

  const y=today.getUTCFullYear();
  const thisStart=standardStartForYear(y);
  const prevStart=standardStartForYear(y-1);
  const nextYearStart=standardStartForYear(y+1);
  if(today>=thisStart){start=thisStart;nextStart=nextYearStart;}
  else {start=prevStart;nextStart=thisStart;}
  const days=Math.floor((today-start)/86400000);
  if(days>=41*7){status='offseason';return {mode:'standard',status,week:1,phase:1,startDate:isoDate(start),nextStartDate:isoDate(nextStart)};}
  const week=Math.max(1,Math.min(41,Math.floor(days/7)+1));
  return {mode:'standard',status,week,phase:phaseFromWeek(week),startDate:isoDate(start),nextStartDate:isoDate(nextStart)};
}
function phaseFromWeek(w){w=Number(w)||1;if(w<=8)return 1;if(w<=16)return 2;if(w<=24)return 3;if(w<=33)return 4;return 5}
async function effectiveCalendar(token){
  let row={calendar_mode:'standard',season_start_date:null,source:'mw_standard',coach_user_id:null};
  try{
    const d=await sj('rpc/mw_effective_season_calendar',token,{method:'POST',body:'{}'});
    if(Array.isArray(d)&&d[0])row=d[0]; else if(d&&typeof d==='object')row=d;
  }catch(e){
    // Safe fallback keeps the public MW standard calendar usable if a legacy account has no setting yet.
  }
  const mode=row.calendar_mode==='custom'&&row.season_start_date?'custom':'standard';
  return {...calendarPosition({mode,customStart:row.season_start_date}),source:row.source||'mw_standard',coachUserId:row.coach_user_id||null};
}
module.exports={effectiveCalendar,calendarPosition,standardStartForYear,phaseFromWeek,sj};
