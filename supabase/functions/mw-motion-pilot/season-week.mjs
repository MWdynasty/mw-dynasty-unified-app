// Derive a single, continuous 41-week progression from the athlete's canonical
// start date. No indoor/outdoor reset, and no browser-authoritative week.
export function canonicalWeek(startDate, today=new Date()){
 if(typeof startDate!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(startDate))return null;
 const start=Date.parse(startDate+'T00:00:00Z');
 if(!Number.isFinite(start)||new Date(start).toISOString().slice(0,10)!==startDate)return null;
 const current=Date.UTC(today.getUTCFullYear(),today.getUTCMonth(),today.getUTCDate());
 const delta=Math.floor((current-start)/86400000);
 if(delta<0||delta>=41*7)return null;
 return Math.floor(delta/7)+1;
}

export function motionSeasonAnchor(profile,activePlans=[],today=new Date()){
 if(!Array.isArray(activePlans))return {weekNumber:null,weekSource:'unassigned',programStartDate:null};
 if(activePlans.length){
  const dates=[...new Set(activePlans.map(p=>p?.season_start_date).filter(Boolean))];
  if(dates.length!==1 || activePlans.some(p=>!p?.season_start_date))
   return {weekNumber:null,weekSource:'unassigned',programStartDate:null,
    issue:'conflicting_active_season_plans'};
  const start=dates[0];
  const week=canonicalWeek(start,today);
  return {weekNumber:week,weekSource:week===null?'unassigned':'active_season_plan',
   programStartDate:start};
 }
 const start=profile?.program_start_date||null;
 const week=canonicalWeek(start,today);
 return {weekNumber:week,weekSource:week===null?'unassigned':'athlete_program_start',
  programStartDate:start};
}
