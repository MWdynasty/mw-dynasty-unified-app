/* Shared browser/Node contract. A workout slot is independent of who times it.
 * Source-program week and coach timing-run UUID are evidence, not workout identity.
 */
(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory();
  else root.MWWorkoutIdentity=factory();
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  function uuid(value){
    const id=String(value||'').toLowerCase();
    if(!UUID.test(id))throw new Error('Invalid workout athlete/season identifier');
    return id;
  }
  function create({athleteId,seasonPlanId=null,workoutCycleId=null,week,day,sessionId='track'}){
    athleteId=uuid(athleteId);seasonPlanId=seasonPlanId?uuid(seasonPlanId):null;
    if(seasonPlanId&&workoutCycleId)throw new Error('Workout identity cannot have both season and unplanned cycle');
    workoutCycleId=seasonPlanId?null:(workoutCycleId?uuid(workoutCycleId):null);
    week=Number(week);day=Number(day);
    if(!Number.isInteger(week)||week<1||week>41||!Number.isInteger(day)||day<1||day>7)throw new Error('Invalid workout week/day');
    if(!/^[a-z][a-z0-9-]{0,63}$/.test(sessionId))throw new Error('Invalid workout session');
    const trainingCycleKey=seasonPlanId?'season:'+seasonPlanId:workoutCycleId?'cycle:'+workoutCycleId:'mw-41';
    const workoutKey=`mw-workout-v1:${athleteId}:${trainingCycleKey}:w${week}:d${day}:${sessionId}`;
    return {athleteId,seasonPlanId,workoutCycleId,trainingCycleKey,week,day,sessionId,workoutKey};
  }
  function legacyKeys(identity){
    if(identity.sessionId!=='track')return [];
    const bare=`mw-track-w${identity.week}-d${identity.day}`;
    return identity.seasonPlanId?[`mw-season-${identity.seasonPlanId}-w${identity.week}-d${identity.day}`,bare]:[bare];
  }
  function readKeys(identity){return [identity.workoutKey,...legacyKeys(identity)]}
  function acceptsInput(key,identity){return readKeys(identity).includes(String(key||''))}
  // Resolve from the record's own scope, NEVER from the current athlete season.
  // Unscoped mw-track history belongs to the historical mw-41 cycle.
  function fromRow(row){
    try{
      const key=String(row.workout_key||''),w=Number(row.program_week),d=Number(row.program_day);
      let plan=row.season_plan_id||null,cycle=row.workout_cycle_id||null,sessionId='track';
      const canonical=key.match(/^mw-workout-v1:([0-9a-f-]+):(mw-41|(?:season|cycle):([0-9a-f-]+)):w(\d+):d(\d+):([a-z][a-z0-9-]*)$/);
      const seasonal=key.match(/^mw-season-([0-9a-f-]+)-w(\d+)-d(\d+)$/);
      if(canonical){
        if(canonical[1]!==String(row.athlete_id||'').toLowerCase()||Number(canonical[4])!==w||Number(canonical[5])!==d)return null;
        const encodedPlan=canonical[2].startsWith('season:')?canonical[3]:null,encodedCycle=canonical[2].startsWith('cycle:')?canonical[3]:null;
        if(plan&&String(plan).toLowerCase()!==encodedPlan)return null;
        if(cycle&&String(cycle).toLowerCase()!==encodedCycle)return null;
        plan=encodedPlan;cycle=encodedCycle;sessionId=canonical[6];
      }else if(seasonal){
        if(Number(seasonal[2])!==w||Number(seasonal[3])!==d||(plan&&String(plan).toLowerCase()!==seasonal[1]))return null;
        plan=seasonal[1];
      }else if(key!==`mw-track-w${w}-d${d}`)return null;
      if(plan&&cycle)return null;
      const identity=create({athleteId:row.athlete_id,seasonPlanId:plan,workoutCycleId:cycle,week:w,day:d,sessionId});
      return canonical&&key!==identity.workoutKey?null:identity;
    }catch{return null}
  }
  function matches(row,identity){return fromRow(row)?.workoutKey===identity.workoutKey}
  function preferRows(rows,identity){
    const reps=new Map();
    for(const row of rows||[]){
      if(!matches(row,identity))continue;
      const index=Number(row.rep_number),prior=reps.get(index);
      if(!prior||row.workout_key===identity.workoutKey)reps.set(index,row);
    }
    return [...reps.values()].sort((a,b)=>Number(a.rep_number)-Number(b.rep_number));
  }
  return Object.freeze({create,legacyKeys,readKeys,acceptsInput,fromRow,matches,preferRows});
});
