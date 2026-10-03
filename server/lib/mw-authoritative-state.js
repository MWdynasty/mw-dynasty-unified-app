const {effectiveCalendar}=require('./mw-season-calendar');

function clampWeek(v){
  const n=Number(v);
  return Number.isFinite(n)?Math.max(1,Math.min(41,Math.trunc(n))):1;
}
function clampDay(v){
  const n=Number(v);
  return Number.isFinite(n)?Math.max(1,Math.min(7,Math.trunc(n))):1;
}
function phaseFromWeek(w){
  const n=clampWeek(w);
  if(n<=8)return 1;
  if(n<=16)return 2;
  if(n<=24)return 3;
  if(n<=33)return 4;
  return 5;
}
function validTimeZone(value){
  const tz=String(value||'').trim();
  if(!tz)return null;
  try{new Intl.DateTimeFormat('en-US',{timeZone:tz}).format(new Date());return tz}catch{return null}
}
function isoDay(now=new Date(),timeZone=null){
  const tz=validTimeZone(timeZone);
  if(tz){
    const weekday=new Intl.DateTimeFormat('en-US',{timeZone:tz,weekday:'short'}).format(now);
    return ({Mon:1,Tue:2,Wed:3,Thu:4,Fri:5,Sat:6,Sun:7})[weekday]||1;
  }
  const d=now.getDay();
  return d===0?7:d;
}

/**
 * Season Intelligence is the source of truth for "where am I right now?".
 *
 * - calendar.week is the athlete-facing MW season week.
 * - sourceWeek is the master 41-week prescription source used internally.
 *   It can differ only when a season plan intentionally maps/compresses the
 *   master system.
 * - storedWeek is retained only for diagnostics; it must not override the
 *   Season Intelligence week in athlete-facing code.
 */
function resolveFromCalendar(stored={},calendar=null,{now=new Date(),timeZone=null}={}){
  const hasCalendar=calendar&&Number.isFinite(Number(calendar.week));
  const week=hasCalendar?clampWeek(calendar.week):clampWeek(stored.current_week||1);
  const phase=hasCalendar
    ? Math.max(1,Math.min(5,Number(calendar.phase||phaseFromWeek(week))))
    : Math.max(1,Math.min(5,Number(stored.current_phase||phaseFromWeek(week))));
  const sourceWeek=hasCalendar
    ? clampWeek(calendar.sourceWeek||week)
    : clampWeek(stored.source_program_week||week);
  const day=clampDay(isoDay(now,timeZone));

  return {
    authority:hasCalendar?'season_intelligence':'program_state_fallback',
    week,
    day,
    phase,
    sourceWeek,
    phaseCode:calendar?.phaseCode||stored.season_phase_code||null,
    seasonLengthWeeks:Number(calendar?.seasonLengthWeeks||stored.season_length_weeks||41),
    programStatus:calendar?.status||stored.program_status||'active',
    calendar:calendar||null,
    storedWeek:clampWeek(stored.current_week||1),
    storedDay:clampDay(stored.current_day||1),
    storedPhase:Number(stored.current_phase||phaseFromWeek(stored.current_week||1)),
    diverged:hasCalendar&&clampWeek(stored.current_week||1)!==week
  };
}

async function resolveAuthoritativeState(c,{now=new Date(),timeZone=null}={}){
  const stored=c?.programState||{};
  let calendar=null;
  try{
    if(c?.token)calendar=await effectiveCalendar(c.token,{now,timeZone:validTimeZone(timeZone)});
  }catch{}
  return resolveFromCalendar(stored,calendar,{now,timeZone});
}

function applyAuthoritativeState(programState,authority){
  if(!authority)return programState||null;
  const s={...(programState||{})};
  return {
    ...s,
    current_week:authority.week,
    current_day:authority.day,
    current_phase:authority.phase,
    source_program_week:authority.sourceWeek,
    season_phase_code:authority.phaseCode,
    season_length_weeks:authority.seasonLengthWeeks,
    program_status:authority.programStatus||s.program_status,
    state_authority:authority.authority,
    stored_current_week:authority.storedWeek,
    week_diverged:authority.diverged
  };
}

module.exports={resolveAuthoritativeState,resolveFromCalendar,applyAuthoritativeState,clampWeek,clampDay,phaseFromWeek,isoDay,validTimeZone};
