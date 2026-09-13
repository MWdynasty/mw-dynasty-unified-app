const {SUPABASE_URL,SUPABASE_KEY,authenticate,getAthleteContext}=require('../lib/mw-auth');
const {effectiveCalendar}=require('../lib/mw-season-calendar');
function ageOn(d){if(!d)return null;const dob=new Date(d),now=new Date();if(Number.isNaN(dob.getTime()))return null;let a=now.getUTCFullYear()-dob.getUTCFullYear();if(now.getUTCMonth()<dob.getUTCMonth()||(now.getUTCMonth()===dob.getUTCMonth()&&now.getUTCDate()<dob.getUTCDate()))a--;return a}
function recommendedTiers(c,b){
  const age=ageOn(b.dateOfBirth||c.athlete?.date_of_birth),years=Math.max(0,Number(b.trainingAge)||0),lifting=Math.max(0,Number(b.lifting)||0),continuity=Math.max(0,Number(b.continuity)||0),speed=Math.max(0,Number(b.speedExposure)||0),raced=Number(b.recentRace)===1;
  const performanceReady=years>=5&&continuity>=3&&speed>=3&&raced;
  const trackTier=(age!=null&&age<14)||years<2||continuity<=1||speed===0?'foundation':performanceReady?'performance':'development';
  const strengthTier=(age!=null&&age<14)||lifting===0?'foundation':lifting===1||years<4?'development':'performance';
  return {trackTier,strengthTier};
}
function cleanNumber(value,label){if(value==null||String(value).trim()==='')return null;const n=Number(value);if(!Number.isFinite(n)||n<=0)throw Object.assign(new Error(`Enter a valid ${label}.`),{status:400});return n}
function validDate(value){const d=new Date(`${value}T00:00:00Z`);return Number.isNaN(d.getTime())?null:d}
async function sj(path,token,opts={}){const r=await fetch(`${SUPABASE_URL}/rest/v1/${path}`,{...opts,headers:{apikey:SUPABASE_KEY,Authorization:`Bearer ${token}`,'Content-Type':'application/json',...(opts.headers||{})}});const d=await r.json().catch(()=>null);if(!r.ok)throw Object.assign(new Error(d?.message||d?.hint||`Supabase request failed (${r.status})`),{status:r.status});return d}
module.exports=async function handler(req,res){
  res.setHeader('Cache-Control','no-store, private');
  try{
    const {token}=await authenticate(req); const c=await getAthleteContext(req);
    if(req.method==='GET'){
      const rows=await sj(`athlete_entry_assessments?athlete_id=eq.${encodeURIComponent(c.athlete.id)}&select=*&order=created_at.desc&limit=1`,token,{method:'GET'});
      return res.status(200).json({assessment:Array.isArray(rows)?(rows[0]||null):null});
    }
    if(req.method!=='POST')return res.status(405).json({error:'GET or POST only'});
    const b=typeof req.body==='string'?JSON.parse(req.body||'{}'):(req.body||{});
    const firstName=String(b.firstName||'').trim().slice(0,80),lastName=String(b.lastName||'').trim().slice(0,80);
    const dob=validDate(String(b.dateOfBirth||''));
    const events=[...new Set((Array.isArray(b.events)?b.events:[]).map(String))].filter(x=>['100m','200m','400m'].includes(x));
    if(!firstName||!lastName||!dob||!events.length)return res.status(400).json({error:'First name, last name, date of birth, and at least one event are required.'});
    const age=ageOn(b.dateOfBirth);if(age==null||age<10)return res.status(400).json({error:'The MW athlete program is currently available for athletes age 10 and older.'});
    const timing=b.prTiming||{},prs=b.prs||{},maxes=b.maxes||{};
    const prRows=events.map(event=>({event,time_seconds:cleanNumber(prs[event],`${event} PR`),timing_method:['fat','hand','unknown'].includes(timing[event])?timing[event]:'unknown'})).filter(x=>x.time_seconds!=null);
    const weightUnit=['lb','kg'].includes(b.weightUnit)?b.weightUnit:'lb';
    const maxRow={power_clean_max:cleanNumber(maxes.powerClean,'Power Clean maximum'),front_squat_max:cleanNumber(maxes.frontSquat,'Front Squat maximum'),back_squat_max:cleanNumber(maxes.backSquat,'Back Squat maximum'),deadlift_max:cleanNumber(maxes.deadlift,'Deadlift maximum'),deadlift_type:maxes.deadliftType==='trap_bar'?'trap_bar':'conventional',weight_unit:weightUnit};
    await Promise.all([
      sj(`profiles?user_id=eq.${encodeURIComponent(c.user.id)}`,token,{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({first_name:firstName,last_name:lastName})}),
      sj(`athletes?id=eq.${encodeURIComponent(c.athlete.id)}`,token,{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({date_of_birth:b.dateOfBirth,primary_event:events[0],secondary_event:events[1]||null,selected_events:events,track_training_years:Number(b.trainingAge)||0,experience_level:Number(b.trainingAge)>=5?'professional':Number(b.trainingAge)>=2?'intermediate':'beginner'})}),
      sj('athlete_strength_maxes?on_conflict=athlete_id',token,{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=minimal'},body:JSON.stringify({athlete_id:c.athlete.id,...maxRow,updated_at:new Date().toISOString()})})
    ]);
    for(const pr of prRows)await sj('athlete_prs?on_conflict=athlete_id,event',token,{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=minimal'},body:JSON.stringify({athlete_id:c.athlete.id,...pr,verified:false})});
    const calendar=await effectiveCalendar(token);
    const payload={p_season_week:Number(calendar.week||1),p_event_group:String(b.eventGroup||''),p_training_age:Number(b.trainingAge),p_continuity:Number(b.continuity),p_speed_exposure:Number(b.speedExposure),p_recent_race:Number(b.recentRace),p_lifting:Number(b.lifting),p_health:String(b.health||'')};
    const d=await sj('rpc/mw_submit_smart_entry',token,{method:'POST',body:JSON.stringify(payload)});
    const result=(d&&typeof d==='object')?d:{};
    const tiers=recommendedTiers(c,b);
    const assignedWeek=Math.max(1,Math.min(41,Math.trunc(Number(result.assignedWeek||result.assigned_week||calendar.week||1))));
    if(result.hold){
      await sj(`athlete_program_state?athlete_id=eq.${encodeURIComponent(c.athlete.id)}`,token,{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({program_status:'needs_review',track_tier:'foundation',strength_tier:'foundation',program_version:'mw-41-tiered-v2.9',assignment_updated_at:new Date().toISOString(),assignment_updated_by:c.user.id})});
      return res.status(200).json({...result,trackTier:'foundation',strengthTier:'foundation',programVersion:'mw-41-tiered-v2.9',calendar});
    }
    await sj(`athlete_program_state?athlete_id=eq.${encodeURIComponent(c.athlete.id)}`,token,{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({track_tier:tiers.trackTier,strength_tier:tiers.strengthTier,program_version:'mw-41-tiered-v2.9',onboarding_assessment_completed_at:new Date().toISOString(),assignment_updated_at:new Date().toISOString(),assignment_updated_by:c.user.id})});
    await sj('athlete_program_assignment_history',token,{method:'POST',headers:{Prefer:'return=minimal'},body:JSON.stringify({athlete_id:c.athlete.id,track_tier:tiers.trackTier,strength_tier:tiers.strengthTier,week:assignedWeek,reason:'MW Smart Entry initial tier recommendation',changed_by:c.user.id})});
    return res.status(200).json({...result,...tiers,programVersion:'mw-41-tiered-v2.9',calendar});
  }catch(e){return res.status(e.status||500).json({error:e.message||'Smart Entry could not be saved'})}
};
