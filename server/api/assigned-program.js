const Program=require('../../lib/mw-coach-program');
const {localCalendarDate}=require('../lib/mw-season-calendar');
const {SUPABASE_URL,SUPABASE_KEY}=require('../lib/mw-auth');
const {authenticate,rpc}=require('../lib/mw-auth');

function intOrNull(v,min=0,max=32767){if(v==null||String(v).trim()==='')return null;const n=Math.trunc(Number(v));if(!Number.isFinite(n))return null;return Math.max(min,Math.min(max,n))}

module.exports=async function handler(req,res){
  res.setHeader('Cache-Control','no-store, private');
  try{
    const {token}=await authenticate(req);
    if(req.method==='GET'){
      const [programs,checkins]=await Promise.all([
        rpc('mw_my_coach_assigned_programs',token),
        rpc('mw_my_coach_assigned_training_checkins',token)
      ]);
      const date=localCalendarDate(new Date(),req.headers['x-mw-time-zone']||'UTC').toISOString().slice(0,10);
      const rr=await fetch(SUPABASE_URL+'/rest/v1/coach_custom_practice_results?select=assignment_id,athlete_id,revision,workout_session_id,block_index,session_date,prescription,results,created_at&order=created_at.desc&limit=500',{headers:{apikey:SUPABASE_KEY,Authorization:'Bearer '+token}});
      if(!rr.ok)throw Object.assign(Error('Workout results could not load. Please retry.'),{status:rr.status});
      const customResults=await rr.json();
      const list=(Array.isArray(programs)?programs:[]).map(p=>({...p,todaySessions:p.content?.reviewed?Program.today(p,p.start_date,date):[]}));
      return res.status(200).json({programs:list,checkins:Array.isArray(checkins)?checkins:[],customResults,date});
    }
    if(req.method==='POST'){
      const b=typeof req.body==='string'?JSON.parse(req.body||'{}'):(req.body||{});
      const assignmentId=String(b.assignmentId||'').trim();
      if(!assignmentId)return res.status(400).json({error:'Assignment is required.'});
      const out=await rpc('mw_log_coach_assigned_training_checkin',token,{
        p_assignment_id:assignmentId,
        p_status:String(b.status||'completed'),
        p_session_rpe:intOrNull(b.sessionRpe,1,10),
        p_pace_check_status:b.paceStatus?String(b.paceStatus):null,
        p_pace_reps_total:intOrNull(b.repsTotal,0,999),
        p_pace_reps_hit:intOrNull(b.repsHit,0,999),
        p_athlete_note:String(b.note||'').trim().slice(0,2000)||null
      });
      return res.status(201).json(out&&typeof out==='object'?out:{ok:true});
    }
    return res.status(405).json({error:'GET or POST only'});
  }catch(e){return res.status(e.status||500).json({error:e.message||'Coach-assigned training request failed'});}
};
