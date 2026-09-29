const {getAccountContext,SUPABASE_URL,SUPABASE_KEY}=require('../../lib/mw-coach-auth');

async function rest(path,token,options={}){
  const r=await fetch(`${SUPABASE_URL}/rest/v1/${path}`,{...options,headers:{apikey:SUPABASE_KEY,Authorization:`Bearer ${token}`,'Content-Type':'application/json',Prefer:'return=representation',...(options.headers||{})}});
  const d=await r.json().catch(()=>[]);
  if(!r.ok)throw Object.assign(new Error(d?.message||d?.hint||'Practice timing request failed'),{status:r.status});
  return d;
}
const cleanId=(v)=>String(v||'').replace(/[^a-f0-9-]/gi,'');
const inList=(values)=>`(${[...new Set(values.map(cleanId).filter(Boolean))].join(',')})`;
async function completedCurrentWorkouts(athleteIds,token){
  const ids=[...new Set((athleteIds||[]).map(cleanId).filter(Boolean))];
  if(!ids.length)return [];
  const [states,completed]=await Promise.all([
    rest(`athlete_program_state?select=athlete_id,current_week,current_day&athlete_id=in.${inList(ids)}`,token),
    rest(`workout_completions?select=athlete_id,program_week,program_day,workout_key,completion_status,completed_at&athlete_id=in.${inList(ids)}&completion_status=eq.completed&order=completed_at.desc&limit=1000`,token)
  ]);
  const stateMap=new Map((states||[]).map(x=>[x.athlete_id,x]));
  const locked=new Map();
  for(const row of completed||[]){
    const state=stateMap.get(row.athlete_id);
    if(!state||locked.has(row.athlete_id))continue;
    if(Number(row.program_week)===Number(state.current_week)&&Number(row.program_day)===Number(state.current_day))locked.set(row.athlete_id,row);
  }
  return [...locked.entries()].map(([athlete_id,row])=>({athlete_id,...row}));
}
module.exports=async(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  try{
    const c=await getAccountContext(req),role=String(c.profile.role||'');
    if(!['founder_owner','admin','coach'].includes(role))return res.status(403).json({error:'Coach access required'});
    if(req.method==='DELETE'){
      const sessionId=String(req.query?.sessionId||'').trim();
      if(!sessionId)return res.status(400).json({error:'sessionId is required'});
      const rows=await rest(`coach_practice_timing_results?session_id=eq.${encodeURIComponent(sessionId)}&coach_user_id=eq.${encodeURIComponent(c.user.id)}`,c.token,{method:'DELETE'});
      return res.status(200).json({ok:true,deleted:Array.isArray(rows)?rows.length:0});
    }
    if(req.method==='POST'){
      const b=req.body||{},results=Array.isArray(b.results)?b.results:[];
      const sessionId=String(b.sessionId||'').trim()||null;
      if(!results.length)return res.status(400).json({error:'No timing results supplied'});
      if(results.length>200)return res.status(400).json({error:'Too many timing results in one save'});
      const invalidRep=results.find(x=>{const rep=Number(x.repNumber),limit=Number(x.prescribedReps);return !Number.isInteger(rep)||rep<1||(Number.isFinite(limit)&&limit>0&&rep>limit)});
      if(invalidRep)return res.status(400).json({error:'Timing result exceeds the prescribed rep count.',code:'rep_limit_exceeded'});
      const rows=results.map(x=>({
        coach_user_id:c.user.id,
        athlete_id:String(x.athleteId||''),
        session_date:String(x.sessionDate||new Date().toISOString().slice(0,10)),
        group_name:String(x.groupName||'All').slice(0,80),
        group_id:x.groupId||null,
        session_id:sessionId,
        division:['boys','girls','open'].includes(x.division)?x.division:null,
        lane_number:Number.isInteger(Number(x.laneNumber))&&Number(x.laneNumber)>=1&&Number(x.laneNumber)<=9?Number(x.laneNumber):null,
        timing_source:['coach','athlete','sensor','manual'].includes(x.timingSource)?x.timingSource:'coach',
        result_status:['finished','dnf','manual'].includes(x.resultStatus)?x.resultStatus:'finished',
        rep_number:Math.max(1,Number(x.repNumber)||1),
        time_seconds:Number(Number(x.timeSeconds).toFixed(3)),
        target_seconds:Number(x.targetSeconds)>0?Number(Number(x.targetSeconds).toFixed(3)):null,
        target_min_seconds:Number(x.targetMinSeconds)>0?Number(Number(x.targetMinSeconds).toFixed(3)):null,
        target_max_seconds:Number(x.targetMaxSeconds)>0?Number(Number(x.targetMaxSeconds).toFixed(3)):null,
        prescribed_rest_seconds:Number(x.prescribedRestSeconds)>=0?Number(Number(x.prescribedRestSeconds).toFixed(2)):null,
        actual_rest_seconds:Number(x.actualRestSeconds)>=0?Number(Number(x.actualRestSeconds).toFixed(2)):null,
        pace_status:['fast','on_pace','slow'].includes(x.paceStatus)?x.paceStatus:null
      }));
      if(rows.some(x=>!x.athlete_id||!Number.isFinite(x.time_seconds)||x.time_seconds<=0))return res.status(400).json({error:'Invalid timing result'});
      if(rows.some(x=>(x.target_min_seconds==null)!==(x.target_max_seconds==null)||((x.target_min_seconds!=null)&&x.target_min_seconds>x.target_max_seconds)))return res.status(400).json({error:'Invalid target pace range'});
      const locked=await completedCurrentWorkouts(rows.map(x=>x.athlete_id),c.token);
      if(locked.length)return res.status(409).json({
        error:'One or more athletes already completed their current MW workout. Practice Mode will not create duplicate timing results.',
        code:'workout_already_completed',
        athletes:locked.map(x=>({athleteId:x.athlete_id,programWeek:Number(x.program_week),programDay:Number(x.program_day),workoutKey:x.workout_key||null,completedAt:x.completed_at||null}))
      });
      const saved=await rest('coach_practice_timing_results',c.token,{method:'POST',body:JSON.stringify(rows)});
      return res.status(200).json({ok:true,count:Array.isArray(saved)?saved.length:rows.length});
    }
    if(req.method==='GET'){
      const rows=await rest(`coach_practice_timing_results?select=id,session_id,athlete_id,session_date,division,group_name,group_id,lane_number,rep_number,time_seconds,target_seconds,target_min_seconds,target_max_seconds,prescribed_rest_seconds,actual_rest_seconds,timing_source,result_status,pace_status,created_at&coach_user_id=eq.${encodeURIComponent(c.user.id)}&order=created_at.desc&limit=200`,c.token);
      return res.status(200).json({ok:true,results:rows});
    }
    return res.status(405).json({error:'GET, POST, or DELETE only'});
  }catch(e){return res.status(e.status||500).json({error:e.message||'Practice timing request failed'})}
};