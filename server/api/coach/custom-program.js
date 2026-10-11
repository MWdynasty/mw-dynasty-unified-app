const {getAccountContext,SUPABASE_URL,SUPABASE_KEY}=require('../../lib/mw-coach-auth');
const {localCalendarDate}=require('../../lib/mw-season-calendar');
const Program=require('../../../lib/mw-coach-program');
const id=s=>/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s||'');
async function rest(path,token,body,method){const r=await fetch(SUPABASE_URL+'/rest/v1/'+path,{method:method||(body?'POST':'GET'),headers:{apikey:SUPABASE_KEY,Authorization:'Bearer '+token,'Content-Type':'application/json',...(method==='PATCH'?{Prefer:'return=representation'}:{})},...(body?{body:JSON.stringify(body)}:{})});const d=await r.json();if(!r.ok)throw Object.assign(Error(d.message||'Program request failed'),{status:r.status});return d;}
async function assignments(c){const rows=await rest('coach_program_assignments?select=*&coach_user_id=eq.'+c.user.id+'&status=eq.active&order=created_at.desc',c.token);return rows;}
async function workouts(c,date){
 const [as,programs,groups,members,connections,saved]=await Promise.all([assignments(c),rest('coach_programs?select=*&coach_user_id=eq.'+c.user.id+'&status=eq.active',c.token),rest('coach_groups?select=id,name&coach_user_id=eq.'+c.user.id+'&archived=eq.false',c.token),rest('coach_group_members?select=group_id,athlete_id',c.token),rest('coach_assignments?select=athlete_id'+(c.profile.role==='coach'?'&coach_user_id=eq.'+c.user.id:'')+'&status=eq.active',c.token),rest('coach_custom_practice_results?select=assignment_id,athlete_id,revision,workout_session_id,block_index,session_date&coach_user_id=eq.'+c.user.id+'&session_date=eq.'+date,c.token)]);
 const connected=new Set(connections.map(a=>a.athlete_id)),out=[];
 for(const a of as){const p=programs.find(p=>p.id===a.program_id),g=groups.find(g=>g.id===a.group_id);if(!p?.content?.reviewed||Program.validate(p.content.sessions).length||a.group_id&&!g)continue;const athleteIds=(a.athlete_id?[a.athlete_id]:members.filter(m=>m.group_id===a.group_id).map(m=>m.athlete_id)).filter(x=>connected.has(x));if(!athleteIds.length)continue;
  for(const session of Program.today(p,a.start_date,date))out.push({assignmentId:a.id,programId:p.id,programName:p.name,targetName:g?.name||'Individual assignment',athleteIds,revision:p.content.revision,session,date,completed:saved.filter(r=>r.assignment_id===a.id&&r.revision===p.content.revision&&r.workout_session_id===session.id)});
 }return out;
}
module.exports=async(req,res)=>{res.setHeader('Cache-Control','no-store');try{
 const c=await getAccountContext(req);if(!['coach','admin','founder_owner'].includes(c.profile.role))return res.status(403).json({error:'Coach access required'});
 const b=typeof req.body==='string'?JSON.parse(req.body):req.body||{},action=req.method==='GET'?req.query?.action:b.action;
 if(req.method==='GET'&&action==='today'){const date=localCalendarDate(new Date(),req.headers['x-mw-time-zone']||'UTC').toISOString().slice(0,10);return res.status(200).json({ok:true,date,workouts:await workouts(c,date)});}
 if(req.method==='GET'&&action==='assignments'){const [as,groups]=await Promise.all([assignments(c),rest('coach_groups?select=id,name&coach_user_id=eq.'+c.user.id,c.token)]);return res.status(200).json({assignments:as.map(a=>({...a,target_name:groups.find(g=>g.id===a.group_id)?.name||'Individual athlete'}))});}
 if(req.method==='POST'&&action==='delete'){
  if(!id(b.programId))return res.status(400).json({error:'Choose a valid program to delete.'});
  const rows=await rest('coach_programs?id=eq.'+b.programId+'&coach_user_id=eq.'+c.user.id+'&select=id,status',c.token,{status:'archived'},'PATCH');
  if(!Array.isArray(rows)||rows.length!==1||rows[0].id!==b.programId||rows[0].status!=='archived')return res.status(404).json({error:'Program not found or could not be deleted.'});
  return res.status(200).json({ok:true,programId:b.programId});
 }
 if(req.method==='POST'&&action==='assign'){
  if(!id(b.programId)||!/^\d{4}-\d{2}-\d{2}$/.test(b.startDate||''))return res.status(400).json({error:'Choose a program and valid start date.'});
  const rows=await rest('coach_programs?select=*&id=eq.'+b.programId+'&coach_user_id=eq.'+c.user.id,c.token),p=rows[0];if(!p||p.status!=='active'||!p.content?.reviewed||Program.validate(p.content.sessions).length)return res.status(400).json({error:'Save reviewed workout days as Active before assigning.'});
  const ids=Array.isArray(b.athleteIds)?[...new Set(b.athleteIds)]:[];if(b.groupId?!id(b.groupId)||ids.length:!ids.length||ids.length>200||ids.some(x=>!id(x)))return res.status(400).json({error:'Choose a group or individual athletes.'});
  const out=await rest('rpc/mw_assign_reviewed_coach_program',c.token,{p_program_id:b.programId,p_start_date:b.startDate,p_group_id:b.groupId||null,p_athlete_ids:ids});return res.status(200).json(out);
 }
 if(req.method==='POST'&&action==='practice'){
  if(!id(b.sessionId)||!Array.isArray(b.results)||!b.results.length||b.results.length>800)return res.status(400).json({error:'Valid practice session and results required.'});
  const date=localCalendarDate(new Date(),b.clientTimeZone||req.headers['x-mw-time-zone']||'UTC').toISOString().slice(0,10);
  for(const x of b.results)if(!id(x.athleteId)||!id(x.assignmentId)||!id(x.revision)||!x.customSessionId||!Number.isInteger(x.blockIndex)||x.blockIndex<0||!Number.isInteger(x.repNumber)||x.repNumber<1||!(x.timeSeconds>0)||!Number.isFinite(x.timeSeconds)||x.sessionDate!==date)return res.status(400).json({error:'Invalid, stale or undated custom workout results.'});
  const out=await rest('rpc/mw_save_custom_coach_practice',c.token,{p_session_id:b.sessionId,p_session_date:date,p_results:b.results});return res.status(200).json(out);
 }
 return res.status(405).json({error:'Unsupported program action'});
}catch(e){return res.status(e.status||500).json({error:e.message||'Program request failed'});}};
module.exports.workouts=workouts;
