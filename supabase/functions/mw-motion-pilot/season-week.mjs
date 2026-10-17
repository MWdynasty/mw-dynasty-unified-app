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
