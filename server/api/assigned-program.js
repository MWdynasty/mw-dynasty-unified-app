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
      return res.status(200).json({programs:Array.isArray(programs)?programs:[],checkins:Array.isArray(checkins)?checkins:[]});
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
