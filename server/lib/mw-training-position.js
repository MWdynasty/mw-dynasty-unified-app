'use strict';

const {positionForPlan}=require('./mw-season-intelligence');

function dateOnly(value){
  if(value instanceof Date)return new Date(Date.UTC(value.getUTCFullYear(),value.getUTCMonth(),value.getUTCDate(),12,0,0));
  const m=String(value||'').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m?new Date(Date.UTC(Number(m[1]),Number(m[2])-1,Number(m[3]),12,0,0)):null;
}
function isoDay(date){
  const d=date?.getUTCDay?.();
  return d===0?7:(d||1);
}
function phaseFromWeek(week){
  const w=Math.max(1,Math.min(41,Number(week)||1));
  return w<=8?1:w<=16?2:w<=24?3:w<=33?4:5;
}
function programPosition(state={},plan=null,localDate=new Date()){
  const today=dateOnly(localDate)||dateOnly(new Date());
  if(plan?.season_start_date){
    const pos=positionForPlan(plan,today);
    return {
      week:Math.max(1,Math.min(41,Number(pos?.week||state.current_week||1))),
      day:isoDay(today),
      phase:Number(pos?.phase||state.current_phase||phaseFromWeek(pos?.week||state.current_week)),
      sourceWeek:Number(pos?.sourceWeek||pos?.week||state.source_program_week||state.current_week||1),
      status:pos?.status||state.program_status||'active'
    };
  }
  const start=dateOnly(state.start_date);
  const startingWeek=Math.max(1,Math.min(41,Number(state.starting_week||1)));
  if(start&&today){
    if(today<start)return {week:startingWeek,day:isoDay(today),phase:phaseFromWeek(startingWeek),sourceWeek:startingWeek,status:'not_started'};
    const offset=Math.max(0,Math.floor((today-start)/86400000/7));
    const raw=startingWeek+offset;
    const week=Math.max(1,Math.min(41,raw));
    return {week,day:isoDay(today),phase:phaseFromWeek(week),sourceWeek:week,status:raw>41?'completed':'active'};
  }
  const week=Math.max(1,Math.min(41,Number(state.current_week||1)));
  return {
    week,
    day:isoDay(today),
    phase:Number(state.current_phase||phaseFromWeek(week)),
    sourceWeek:Number(state.source_program_week||week),
    status:state.program_status||'active'
  };
}

module.exports={programPosition,phaseFromWeek,dateOnly,isoDay};
