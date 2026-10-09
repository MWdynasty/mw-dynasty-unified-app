'use strict';
const distances=[60,100,150,200,300,400,500];
function parseResults(raw={},timing={},details={},include60=true){
  const rows=[];
  for(const distance of distances){
    if(distance===60&&!include60)continue;
    const event=distance+'m',input=raw[event],object=input&&typeof input==='object'?input:null;
    const value=object?object.time_seconds:input;
    if(value==null||String(value).trim()==='')continue;
    const time=Number(value);if(!Number.isFinite(time)||time<=0)throw Object.assign(new Error(`Enter a valid ${event} PR or trial time.`),{status:400});
    const meta=object||details[event]||{},method=meta.timing_method??timing[event]??'unknown',type=meta.mark_type??'unspecified';
    if(!['race_pr','time_trial','unspecified'].includes(type))throw Object.assign(new Error(`Choose a valid ${event} result type.`),{status:400});
    if(!['fat','hand','unknown'].includes(method))throw Object.assign(new Error(`Choose a valid ${event} timing method.`),{status:400});
    const date=String(meta.date_recorded||'').trim();
    if(date&&(!/^\d{4}-\d{2}-\d{2}$/.test(date)||Number.isNaN(Date.parse(date+'T00:00:00Z'))||new Date(date+'T00:00:00Z').toISOString().slice(0,10)!==date))throw Object.assign(new Error(`Enter a valid ${event} result date.`),{status:400});
    rows.push({event,time_seconds:time,timing_method:method,mark_type:type,date_recorded:date||null});
  }
  return rows;
}
module.exports={parseResults};
