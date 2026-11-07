const {getAthleteContext,SUPABASE_URL,SUPABASE_KEY}=require('../../lib/mw-auth');

async function rows(path,token){
  const r=await fetch(`${SUPABASE_URL}/rest/v1/${path}`,{headers:{apikey:SUPABASE_KEY,Authorization:`Bearer ${token}`,'Content-Type':'application/json'}});
  const d=await r.json().catch(()=>[]);
  if(!r.ok)throw Object.assign(new Error(d?.message||d?.hint||'Performance data could not be loaded.'),{status:r.status});
  return Array.isArray(d)?d:[];
}
const esc=encodeURIComponent;
const num=(v)=>{const x=Number(v);return Number.isFinite(x)?x:null};
const dateKey=(v)=>String(v||'').slice(0,10);
const round=(v,d=2)=>Number(v.toFixed(d));

function empty(kind){
  return {status:'need_data',label:'Building a baseline',message:kind==='track'?'Save another matching sprint result to see how your time changed.':'Save the same lift for the same reps again to see how your strength changed.'};
}
function result(kind,group){
  if(!group||group.length<2)return empty(kind);
  const ordered=[...group].sort((a,b)=>String(a.date).localeCompare(String(b.date)));
  const first=ordered[0],latest=ordered.at(-1),delta=latest.value-first.value;
  const threshold=kind==='track'?.005:.5;
  const status=kind==='track'?(delta<-threshold?'improving':delta>threshold?'slower':'steady'):(delta>threshold?'improving':delta<-threshold?'slower':'steady');
  const label=status==='improving'?(kind==='track'?'Getting faster':'Getting stronger'):status==='slower'?'Keep building':'Holding steady';
  const amount=Math.abs(delta);
  const change=kind==='track'?amount.toFixed(2)+' seconds':Number(amount.toFixed(1))+' '+latest.unit;
  const message=kind==='track'
    ?status==='improving'?latest.distance+'m: your average is '+change+' faster than your first saved result.':status==='slower'?latest.distance+'m: your latest average is '+change+' slower. Keep following your plan and compare again.':latest.distance+'m: your latest average is about the same as your first saved result.'
    :status==='improving'?'You lifted '+change+' more on '+latest.name+' for the same '+latest.reps+' reps.':status==='slower'?'Your latest '+latest.name+' result was '+change+' lighter for the same '+latest.reps+' reps. Keep following your plan and compare again.':'You matched your earlier '+latest.name+' result for '+latest.reps+' reps.';
  return {status,label,message,first:{value:round(first.value),date:first.date},latest:{value:round(latest.value),date:latest.date},change:round(delta,kind==='track'?2:1),unit:kind==='track'?'seconds':latest.unit,match:kind==='track'?{distance_m:latest.distance,intent:latest.intent}:{lift:latest.name,reps:latest.reps,weight_unit:latest.unit}};
}

module.exports=async(req,res)=>{
  res.setHeader('Cache-Control','no-store, private');
  if(req.method!=='GET')return res.status(405).json({error:'GET only'});
  try{
    const c=await getAthleteContext(req),id=esc(c.athlete.id);
    const [practice,pace,strength]=await Promise.all([
      rows(`athlete_practice_rep_results?athlete_id=eq.${id}&select=workout_key,distance_m,time_seconds,mw_intent,result_status,recorded_at&time_seconds=not.is.null&order=recorded_at.desc&limit=1200`,c.token).catch(()=>[]),
      rows(`athlete_pace_logs?athlete_id=eq.${id}&select=workout_key,distance_m,actual_seconds,mw_intent,recorded_at&actual_seconds=not.is.null&order=recorded_at.desc&limit=1200`,c.token).catch(()=>[]),
      rows(`athlete_strength_session_logs?athlete_id=eq.${id}&select=program_week,program_day,session_label,exercise_name,reps_completed,actual_load,weight_unit,recorded_at&order=recorded_at.desc&limit=1600`,c.token).catch(()=>[])
    ]);
    const sprints=new Map();
    const merged=new Map();
    for(const r of pace||[])merged.set(`${r.workout_key||''}|${r.distance_m}|${r.recorded_at}|${r.actual_seconds}`,{distance_m:r.distance_m,time_seconds:r.actual_seconds,mw_intent:r.mw_intent,recorded_at:r.recorded_at,workout_key:r.workout_key,result_status:'finished'});
    for(const r of practice||[])merged.set(`${r.workout_key||''}|${r.distance_m}|${r.recorded_at}|${r.time_seconds}`,r);
    for(const r of merged.values()){
      const time=num(r.time_seconds),distance=num(r.distance_m),status=String(r.result_status||'').toLowerCase();
      if(!(time>0)||!(distance>0)||['dnf','did_not_finish','incomplete'].includes(status))continue;
      const intent=String(r.mw_intent||'speed').toLowerCase();
      if(/tempo|recovery|technical|warm.?up|cool.?down|relay/.test(intent))continue;
      const key=distance+'|'+intent+'|'+String(r.workout_key||'');
      if(!sprints.has(key))sprints.set(key,{distance,intent,workout:r.workout_key||'',values:[]});
      sprints.get(key).values.push({value:time,date:String(r.recorded_at||'')});
    }
    const sprintSessions=[...sprints.values()].map(g=>({...g,session:{value:g.values.reduce((a,b)=>a+b.value,0)/g.values.length,date:g.values.map(x=>x.date).sort().at(-1)||''}}));
    const sprintByMatch=new Map();
    for(const g of sprintSessions){const key=g.distance+'|'+g.intent;if(!sprintByMatch.has(key))sprintByMatch.set(key,[]);sprintByMatch.get(key).push(g.session)}
    const speedGroup=[...sprintByMatch.values()].filter(g=>g.length>=2).sort((a,b)=>b.length-a.length)[0];
    const singleSpeed=sprintSessions.sort((a,b)=>b.session.date.localeCompare(a.session.date))[0];
    const track=speedGroup?result('track',speedGroup):empty('track');
    if(!speedGroup&&singleSpeed)track.message='One '+singleSpeed.distance+'m sprint result saved. Save the same kind of sprint again to see your change.';

    const byLift=new Map();
    for(const r of strength||[]){
      const load=num(r.actual_load),reps=num(r.reps_completed),unit=String(r.weight_unit||'lb').toLowerCase();
      if(!(load>0)||!(reps>0))continue;
      const name=String(r.exercise_name||'').trim();if(!name)continue;
      const day=dateKey(r.recorded_at),session=[r.program_week||0,r.program_day||0,r.session_label||'',day].join('|');
      const key=name.toLowerCase()+'|'+reps+'|'+unit;
      if(!byLift.has(key))byLift.set(key,{name,reps,unit,sessions:new Map()});
      const g=byLift.get(key);
      if(!g.sessions.has(session))g.sessions.set(session,{loads:[],date:String(r.recorded_at||'')});
      const set=g.sessions.get(session);set.loads.push(load);if(String(r.recorded_at||'')>set.date)set.date=String(r.recorded_at||'');
    }
    const liftGroups=[...byLift.values()].map(g=>({name:g.name,reps:g.reps,unit:g.unit,sessions:[...g.sessions.values()].map(s=>({value:s.loads.reduce((a,b)=>a+b,0)/s.loads.length,date:s.date,name:g.name,reps:g.reps,unit:g.unit}))})).filter(g=>g.sessions.length>=2).sort((a,b)=>b.sessions.length-a.sessions.length);
    const strengthGroup=liftGroups[0]?.sessions;
    const strengthInsight=strengthGroup?result('strength',strengthGroup):empty('strength');
    return res.status(200).json({ok:true,track,strength:strengthInsight});
  }catch(e){return res.status(e.status||500).json({error:e.message||'Athlete performance could not be loaded.'})}
};
