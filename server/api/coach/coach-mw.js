const GroupProposals=require('../../lib/mw-group-proposals');
const {requireConsent,permittedAthleteIds,filterAthleteContext}=require('../../lib/mw-ai-consent');
const MW_QA_PREVIEW=process.env.VERCEL_ENV==='preview'&&process.env.VERCEL_GIT_COMMIT_REF==='feature/season-intelligence-v1';
const SUPABASE_URL=MW_QA_PREVIEW?'https://nktemtmsfhjcgjvkavrm.supabase.co':(process.env.SUPABASE_URL||'https://keqgunlfwhjgcsurynef.supabase.co');
const SUPABASE_ANON_KEY=MW_QA_PREVIEW?'sb_publishable_I6p9Atq2zd_-1vA85PjAtA_FILbwc99':(process.env.SUPABASE_ANON_KEY||process.env.SUPABASE_PUBLISHABLE_KEY||'sb_publishable_JWCLQzrdWA_ZmvbpV5urVg_rcT6NECm');
const {PROGRAM_VERSION,TIERS}=require('../../lib/mw-program-service');
const SUPPORTING_KNOWLEDGE=require('../../knowledge/coach-mw-book-knowledge.json');
const {evaluatePerformance}=require('../../lib/mw-performance-intelligence');

async function sb(path,token){
  const r=await fetch(`${SUPABASE_URL}/rest/v1/${path}`,{headers:{apikey:SUPABASE_ANON_KEY,Authorization:`Bearer ${token}`}});
  if(!r.ok)return null; return r.json();
}
function outputText(data){
  if(typeof data?.output_text==='string'&&data.output_text.trim())return data.output_text.trim();
  const out=[];
  for(const item of (data?.output||[])){
    for(const part of (item?.content||[])){
      const type=String(part?.type||'');
      const value=typeof part?.text==='string'
        ? part.text
        : (typeof part?.text?.value==='string'?part.text.value:'');
      if(value&&['output_text','text'].includes(type))out.push(value);
    }
  }
  return out.join('\n').trim();
}
function parseCoachAction(answer){
  const raw=String(answer||'');
  const marker='MW_ACTION_JSON:';
  const at=raw.lastIndexOf(marker);
  if(at<0)return {answer:raw.trim(),action:null};
  const tail=raw.slice(at+marker.length).trim();
  let action=null;
  try{action=JSON.parse(tail)}catch{
    const start=tail.indexOf('{');if(start>=0){let depth=0,inString=false,escape=false,end=-1;for(let i=start;i<tail.length;i++){const ch=tail[i];if(escape){escape=false;continue}if(ch==='\\\\'&&inString){escape=true;continue}if(ch==='"')inString=!inString;if(!inString){if(ch==='{')depth++;else if(ch==='}'&&--depth===0){end=i+1;break}}}if(end>start)try{action=JSON.parse(tail.slice(start,end))}catch{}}
  }
  return {answer:raw.slice(0,at).trim(),action};
}
function cleanActionText(v,max=160){return String(v||'').replace(/[<>]/g,'').trim().slice(0,max)}
function isoDay(v){return /^\d{4}-\d{2}-\d{2}$/.test(String(v||''))?String(v):''}
async function writeCoachCalendarEvent(token,payload){
  const r=await fetch(`${SUPABASE_URL}/rest/v1/coach_calendar_events`,{method:'POST',headers:{apikey:SUPABASE_ANON_KEY,Authorization:`Bearer ${token}`,'Content-Type':'application/json',Prefer:'return=representation'},body:JSON.stringify(payload)});
  const d=await r.json().catch(()=>null);if(!r.ok)throw Object.assign(new Error(d?.message||'Calendar update failed'),{status:r.status});return Array.isArray(d)?d[0]:d;
}
async function mutateCoachCalendarEvent(token,id,method,payload=null){
  const r=await fetch(`${SUPABASE_URL}/rest/v1/coach_calendar_events?id=eq.${encodeURIComponent(id)}`,{method,headers:{apikey:SUPABASE_ANON_KEY,Authorization:`Bearer ${token}`,'Content-Type':'application/json',Prefer:'return=representation'},body:payload?JSON.stringify(payload):undefined});
  const d=await r.json().catch(()=>null);if(!r.ok)throw Object.assign(new Error(d?.message||'Calendar action failed'),{status:r.status});return Array.isArray(d)?d[0]:d;
}
async function writeCoachMessage(token,payload){
  const r=await fetch(`${SUPABASE_URL}/rest/v1/coach_messages`,{method:'POST',headers:{apikey:SUPABASE_ANON_KEY,Authorization:`Bearer ${token}`,'Content-Type':'application/json',Prefer:'return=representation'},body:JSON.stringify(payload)});
  const d=await r.json().catch(()=>null);if(!r.ok)throw Object.assign(new Error(d?.message||'Message send failed'),{status:r.status});return Array.isArray(d)?d[0]:d;
}
async function coachOwnsGroup(token,userId,groupId){
  const rows=await sb(`coach_groups?select=id&coach_user_id=eq.${encodeURIComponent(userId)}&id=eq.${encodeURIComponent(groupId)}&archived=eq.false&limit=1`,token);
  return !!rows?.[0];
}
async function coachOwnsAthlete(token,userId,athleteId){
  const rows=await sb(`coach_assignments?select=athlete_id&coach_user_id=eq.${encodeURIComponent(userId)}&athlete_id=eq.${encodeURIComponent(athleteId)}&status=eq.active&limit=1`,token);
  return !!rows?.[0];
}
async function findCoachCalendarEvent(token,userId,a){
  const id=cleanActionText(a.eventId||'',80);
  if(id){
    const rows=await sb(`coach_calendar_events?select=*&id=eq.${encodeURIComponent(id)}&coach_user_id=eq.${encodeURIComponent(userId)}&limit=1`,token);
    return rows?.[0]||null;
  }
  const title=cleanActionText(a.matchTitle||a.title||'',120);
  if(!title)return null;
  const rows=await sb(`coach_calendar_events?select=*&coach_user_id=eq.${encodeURIComponent(userId)}&title=ilike.${encodeURIComponent(title)}&order=starts_at.desc&limit=5`,token);
  return rows?.[0]||null;
}

module.exports=async function handler(req,res){
  if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});
  if(!process.env.OPENAI_API_KEY)return res.status(500).json({error:'OPENAI_API_KEY is not configured'});
  const token=(req.headers.authorization||'').replace(/^Bearer\s+/i,'');
  if(!token)return res.status(401).json({error:'Coach login required'});
  const u=await fetch(`${SUPABASE_URL}/auth/v1/user`,{headers:{apikey:SUPABASE_ANON_KEY,Authorization:`Bearer ${token}`}});
  if(!u.ok)return res.status(401).json({error:'Invalid coach session'});
  const user=await u.json();
  const profiles=await sb(`profiles?select=user_id,first_name,last_name,role,account_status&user_id=eq.${encodeURIComponent(user.id)}&limit=1`,token);
  const me=profiles?.[0];
  if(!me||!['coach','admin','founder_owner'].includes(me.role)||me.account_status!=='active')return res.status(403).json({error:'Coach access required'});
  let coachTier=['founder_owner','admin'].includes(me.role)?'mw_sprint_performance':null;
  if(me.role==='coach'){
    const tr=await fetch(`${SUPABASE_URL}/rest/v1/rpc/mw_coach_access_tier`,{method:'POST',headers:{apikey:SUPABASE_ANON_KEY,Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:'{}'});
    coachTier=await tr.json().catch(()=>null);
    if(!tr.ok||!['intelligence','mw_sprint_performance'].includes(coachTier))return res.status(403).json({error:'Coach Intelligence or Coach Velocity access required'});
  }

  if(req.body?.approvedAction&&typeof req.body.approvedAction==='object'){
    const a=req.body.approvedAction;
    if(!['calendar_create','calendar_block','calendar_update','calendar_delete','message_send','groups_create'].includes(a.type))return res.status(400).json({error:'Unsupported Coach MW action'});
    if(a.type==='groups_create'){
      try{
        await requireConsent(token,user.id);
        const proposal=GroupProposals.verify(a.approvalToken,user.id,process.env.OPENAI_API_KEY);
        const payload={p_request_id:proposal.requestId,p_groups:proposal.groups.map(g=>({id:g.id,name:g.name,athlete_ids:g.athletes.map(a=>a.athleteId)}))};
        const r=await fetch(`${SUPABASE_URL}/rest/v1/rpc/mw_coach_create_pr_groups`,{method:'POST',headers:{apikey:SUPABASE_ANON_KEY,Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify(payload)});
        const result=await r.json().catch(()=>null);if(!r.ok)throw Object.assign(new Error(result?.message||'Groups could not be saved. Please retry.'),{status:r.status});
        return res.status(200).json({ok:true,groups:result.groups,replayed:!!result.replayed,actionPage:'teams',answer:`${proposal.groups.length} PR groups saved to Teams and available in Practice. ${proposal.excluded.length?`${proposal.excluded.length} athletes still need a division or recorded time.`:''}`.trim()});
      }catch(e){return res.status(e.status||500).json({error:e.message});}
    }
    if(a.type==='message_send'){
      const body=cleanActionText(a.body||a.message||'',2000);
      const audienceType=['all_assigned','group','athlete'].includes(a.audienceType)?a.audienceType:'';
      if(!body||!audienceType)return res.status(400).json({error:'Coach MW needs a message and a valid audience.'});
      let athleteId=null,groupId=null,audienceLabel='your assigned athletes';
      if(audienceType==='athlete'){
        athleteId=cleanActionText(a.athleteId||'',80);
        if(!athleteId||!(await coachOwnsAthlete(token,user.id,athleteId)))return res.status(403).json({error:'That athlete is not currently assigned to this coach.'});
        const ar=await sb(`athletes?select=id,user_id& id=eq.${encodeURIComponent(athleteId)}&limit=1`.replace('?select=id,user_id& id','?select=id,user_id&id'),token);
        const pr=ar?.[0]?.user_id?await sb(`profiles?select=first_name,last_name&user_id=eq.${encodeURIComponent(ar[0].user_id)}&limit=1`,token):null;
        audienceLabel=[pr?.[0]?.first_name,pr?.[0]?.last_name].filter(Boolean).join(' ')||'the athlete';
      }else if(audienceType==='group'){
        groupId=cleanActionText(a.groupId||'',80);
        if(!groupId||!(await coachOwnsGroup(token,user.id,groupId)))return res.status(403).json({error:'That group is not available to this coach.'});
        const gr=await sb(`coach_groups?select=id,name&id=eq.${encodeURIComponent(groupId)}&limit=1`,token);
        audienceLabel=gr?.[0]?.name||'the group';
      }
      const message=await writeCoachMessage(token,{coach_user_id:user.id,audience_type:audienceType,body,group_id:groupId,athlete_id:athleteId});
      return res.status(200).json({ok:true,message,actionPage:'messages',answer:`Message sent to ${audienceLabel}.`});
    }
    if(a.type==='calendar_delete'){
      const existing=await findCoachCalendarEvent(token,user.id,a);if(!existing)return res.status(404).json({error:'I could not find that calendar entry to delete.'});
      await mutateCoachCalendarEvent(token,existing.id,'DELETE');
      return res.status(200).json({ok:true,deletedId:existing.id,answer:`${existing.title} was removed from your MW calendar.`});
    }
    const start=isoDay(a.startDate),end=isoDay(a.endDate||a.startDate);
    if(!start||!end||end<start)return res.status(400).json({error:'Coach MW needs valid start and end dates.'});
    const eventType=['school_break','exam_week','holiday','facility_closure','travel','practice','meet','testing','other'].includes(a.eventType)?a.eventType:'other';
    const impact=['no_practice','reduced_load','awareness_only'].includes(a.trainingImpact)?a.trainingImpact:'awareness_only';
    const payload={title:cleanActionText(a.title||'Schedule update',120),event_type:eventType,starts_at:start+'T00:00:00.000Z',ends_at:end+'T23:59:59.999Z',training_impact:impact,notes:cleanActionText(a.notes||'Updated through Coach MW',800),location:cleanActionText(a.location||'',180)||null};
    if(eventType==='meet'){
      payload.meet_priority=['A','B','C'].includes(String(a.meetPriority||'').toUpperCase())?String(a.meetPriority).toUpperCase():null;
      payload.qualification_stage=['regular','conference','district','sectional','regional','state','national','junior_olympics','ncaa_championship','professional_championship','other'].includes(String(a.qualificationStage||''))?String(a.qualificationStage):null;
      payload.is_primary_target=!!a.isPrimaryTarget;
      if(payload.is_primary_target){
        await fetch(`${SUPABASE_URL}/rest/v1/coach_calendar_events?coach_user_id=eq.${encodeURIComponent(user.id)}&event_type=eq.meet&is_primary_target=eq.true`,{method:'PATCH',headers:{apikey:SUPABASE_ANON_KEY,Authorization:`Bearer ${token}`,'Content-Type':'application/json',Prefer:'return=minimal'},body:JSON.stringify({is_primary_target:false})});
      }
    }
    if(a.type==='calendar_update'){
      const existing=await findCoachCalendarEvent(token,user.id,a);if(!existing)return res.status(404).json({error:'I could not find that calendar entry to update.'});
      const event=await mutateCoachCalendarEvent(token,existing.id,'PATCH',payload);
      return res.status(200).json({ok:true,event,answer:`${event.title} was updated on your MW calendar.`});
    }
    const event=await writeCoachCalendarEvent(token,{coach_user_id:user.id,...payload});
    return res.status(200).json({ok:true,event,answer:`${event.title} is now on your MW calendar from ${start} through ${end}.`});
  }

  if(typeof req.body?.clientStage==='string'){
    const stage=String(req.body.clientStage).replace(/[^a-zA-Z0-9_.:-]/g,'').slice(0,80);
    console.info('MW_COACH_CLIENT_STAGE',{stage,userId:user.id,ua:String(req.headers['user-agent']||'').slice(0,120)});
    return res.status(200).json({ok:true,stage});
  }

  await requireConsent(token,user.id);
  const repTrackingEnabled=coachTier==='mw_sprint_performance';
  const [assignments,athletes,attendance,states,prs,flags,paceLogs,strengthLogs,strengthCheckins,strengthMaxHistory,completions,calendarEvents,athleteAvailability,seasonContexts,coachGroups]=await Promise.all([
    sb(`coach_assignments?select=*&coach_user_id=eq.${encodeURIComponent(user.id)}&status=eq.active&limit=200`,token),
    sb(`athletes?select=*&limit=200`,token),
    sb(`attendance_records?select=*&order=attendance_date.desc&limit=250`,token),
    coachTier==='mw_sprint_performance'?sb(`athlete_program_state?select=*&limit=200`,token):sb(`athlete_program_state?select=athlete_id,current_week,current_day,current_phase,program_status,start_date,last_completed_workout_at,track_tier,strength_tier,program_version,onboarding_assessment_completed_at&limit=200`,token),
    sb(`athlete_prs?select=*&limit=300`,token),
    sb(`athlete_flags?select=*&limit=200`,token),
    repTrackingEnabled?sb(`athlete_practice_rep_results?select=athlete_id,program_week,program_day,workout_key,season_plan_id,workout_cycle_id,rep_number,distance_m,target_seconds,time_seconds,pace_status,mw_intent,mw_interpretation,entry_source,timing_source,result_status,recorded_at&time_seconds=not.is.null&order=recorded_at.desc&limit=500`,token).then(rows=>Array.isArray(rows)?rows.map(x=>({...x,actual_seconds:x.time_seconds})):[]):Promise.resolve([]),
    sb(`athlete_strength_session_logs?select=athlete_id,program_week,program_day,session_label,exercise_name,set_number,reps_completed,target_load,actual_load,weight_unit,set_rpe,recorded_at&order=recorded_at.desc&limit=500`,token),
    sb(`athlete_strength_checkins?select=athlete_id,program_week,strength_day,day_label,status,note,recorded_at,lifecycle_status,completed_at,completed_late,session_feel,feel_recorded_at&order=recorded_at.desc&limit=500`,token),
    sb(`athlete_strength_max_history?select=athlete_id,power_clean_max,front_squat_max,back_squat_max,deadlift_max,deadlift_type,weight_unit,last_max_test,recorded_at,change_source&order=recorded_at.desc&limit=800`,token),
    sb(`workout_completions?select=athlete_id,program_week,program_day,workout_key,completion_status,pace_check_status,pace_reps_total,pace_reps_hit,performance_checked_at,completed_at&order=completed_at.desc&limit=500`,token),
    sb(`coach_calendar_events?select=id,title,event_type,starts_at,ends_at,training_impact,location,notes,meet_priority,is_primary_target,qualification_stage,parent_event_id&coach_user_id=eq.${encodeURIComponent(user.id)}&order=starts_at.asc&limit=150`,token),
    sb(`athlete_schedule_constraints?select=id,athlete_id,constraint_type,title,starts_on,ends_on,training_impact,notes,review_status,coach_note,created_at&linked_coach_user_id=eq.${encodeURIComponent(user.id)}&order=starts_on.asc&limit=150`,token),
    sb(`coach_season_contexts?select=id,group_id,season_year,season_type,competition_level_group,competition_state,competition_path,first_practice_date,first_meet_date,primary_peak_date,secondary_peak_date,goal,status&coach_user_id=eq.${encodeURIComponent(user.id)}&order=primary_peak_date.asc&limit=50`,token),
    sb(`coach_groups?select=id,name,event_group&coach_user_id=eq.${encodeURIComponent(user.id)}&archived=eq.false&order=created_at.asc&limit=100`,token)
  ]);
  const assignedIds=new Set((assignments||[]).map(x=>String(x.athlete_id||'')).filter(Boolean));
  const performanceIntelligence=[...assignedIds].map(athleteId=>{
    const state=(states||[]).find(x=>String(x.athlete_id)===athleteId)||{};
    const perfContext={
      recentWorkouts:(completions||[]).filter(x=>String(x.athlete_id)===athleteId).slice(0,16),
      recentPaceLogs:(paceLogs||[]).filter(x=>String(x.athlete_id)===athleteId).slice(0,32),
      recentStrengthLogs:(strengthLogs||[]).filter(x=>String(x.athlete_id)===athleteId).slice(0,24)
    };
    return {athleteId,...evaluatePerformance(perfContext,{coachManaged:true,officialWeek:state.current_week,officialDay:state.current_day})};
  });
  const allowedAI=await permittedAthleteIds(token,athletes,assignments);
  const context=filterAthleteContext({coach:me,coachTier,seasonIntelligenceMode:coachTier==='mw_sprint_performance'?'engine':'insights',repTrackingEnabled,assignments:assignments||[],athletes:athletes||[],attendance:attendance||[],programState:states||[],prs:prs||[],flags:flags||[],calendarEvents:calendarEvents||[],athleteAvailability:athleteAvailability||[],seasonContexts:seasonContexts||[],coachGroups:coachGroups||[],performanceIntelligence,performance:{paceLogs:paceLogs||[],strengthLogs:strengthLogs||[],strengthCheckins:strengthCheckins||[],strengthMaxHistory:strengthMaxHistory||[],workoutCompletions:completions||[]}},allowedAI);

  const messages=Array.isArray(req.body?.messages)?req.body.messages.slice(-40):[];
  const input=messages.map(m=>{
    const assistant=m.role==='assistant';
    const content=[{type:assistant?'output_text':'input_text',text:String(m.content||'').slice(0,12000)}];
    if(!assistant&&typeof m.imageDataUrl==='string'&&/^data:image\/(png|jpeg|jpg|webp);base64,/i.test(m.imageDataUrl)&&m.imageDataUrl.length<8000000)content.push({type:'input_image',image_url:m.imageDataUrl});
    return {role:assistant?'assistant':'user',content};
  });
  const instructions=`You are Coach MW inside the MW Dynasty Coach platform.
You are a high-quality conversational AI for an authenticated coach. Understand follow-ups, corrections, incomplete questions, and active conversation context.
Sprint School is not currently launched. Do not advertise it, recommend it, link to it, or claim any membership includes its videos, courses, lessons, or curriculum. Keep guidance focused on available training and tools.
The human coach remains the authority. MW workflow is Detect -> Analyze -> Recommend -> Coach Approves -> System Executes.
Never silently change official athlete program state, prescriptions, attendance, or consequential coaching decisions.
For Coach Velocity, the MW Velocity 41-week track and strength methodology is authoritative. Do not replace it with generic web workouts.
The active program is ${PROGRAM_VERSION}. Every athlete_program_state row contains the shared track_tier and strength_tier used by the athlete app, coach dashboard, and athlete-facing Coach MW.
Tier definitions: ${JSON.stringify(TIERS)}
Foundation and Development remain challenging: condense the dose, not the stimulus. Foundation reduces reps, selected longer stress distances, complexity and loading while preserving the day's purpose. Development uses substantial controlled volume and progressive complexity. Performance uses the complete prescription when readiness supports it.
MW SPRINT SYSTEM V3 WEEKLY ARCHITECTURE:
- Monday = major track stress; Competition Warm-Up; daily performance wicket progression.
- Tuesday = technical development + synchronized strength; Competition Warm-Up; front-side/teaching wickets.
- Wednesday = recovery/restoration; Big Warm-Up; low-aggression recovery wickets.
- Thursday = technical development + controlled volume + synchronized strength; Competition Warm-Up; rhythm/max-velocity/competition-rhythm wickets by phase.
- Friday = second major track stress / future race slot. It may contain hills, 150s, 200s, 250s, split runs, special endurance, race modeling, or competition. Use the exact Friday Competition Warm-Up or Big Warm-Up stored in the approved session.
- Friday is never merely a hill day and is protected from make-up lifting.
- As competition approaches, Thursday strength is reduced or removed so Friday/Saturday competition readiness wins. Championship strength becomes minimal neural maintenance/primer work.
- Every Monday-Friday track day includes wickets with day-specific spacing, speed, volume, and intent.
EVENT BRANCH RULE:
- 100m and 200m athletes share the 100/200 branch.
- If 400m is among the athlete's selected events, use the 400m branch.
- Do not automatically give women more repetitions or reduce men's repetitions because of sex. Individual event, tier, training age, readiness, mechanics, recovery and measured response determine dosage.
When recommending a tier or week change, explain the evidence and require coach approval. Never claim a recommendation has changed the athlete record until the coach uses the approved assignment control.
The following knowledge was distilled from 85 founder-supplied screenshots of Track & Field Coaching Essentials. Apply it to biomechanics, periodization, warm-up, sprint sequencing, strength, plyometrics, recovery, youth safeguards, and event-specific reasoning. It is supporting science, not replacement prescriptions, and must not be presented as original MW authorship or reproduced at length:
${JSON.stringify(SUPPORTING_KNOWLEDGE)}
For Coach Core / Coach Intelligence own-program customers, the coach's uploaded program is the source of truth; never pretend MW authored it.
Use secured coach/team context when answering roster, attendance, PR, progression, flag, athlete, strength-log, workout-completion, pace-check-in, or scheduling questions. If the required data is absent, say so.
Respect the coach's saved calendar constraints when discussing or recommending schedules. Treat event_type school_break, holiday, or facility_closure with training_impact no_practice as unavailable training dates. Treat exam_week or any event marked reduced_load as a signal to reduce scheduling pressure, complexity, or total load. Awareness-only events should be mentioned when relevant but not treated as automatic cancellations. Never silently move official training; recommend an adjustment and keep the coach in control.
COACH MW ACTION PROTOCOL:
- Current system date: ${new Date().toISOString().slice(0,10)}. Use it to resolve future month/day scheduling requests; never silently choose a past occurrence when the coach is clearly planning an upcoming season.
- You are an operational assistant, not just a chat explainer. Route the coach's intent to the correct MW platform action. Calendar/practice/meet scheduling actions operate the live coach calendar; messaging actions operate live Coach Messages.
- For create/add/schedule requests use type calendar_create (calendar_block is accepted for backward compatibility). For edits use calendar_update. For removals use calendar_delete.
- A meet is a calendar event with eventType "meet". Include location, meetPriority (A/B/C) when known, qualificationStage when known, and isPrimaryTarget when explicitly identified. Meets written here automatically appear in the Meets section because Calendar is the single source of truth.
- A practice is a calendar event with eventType "practice". Practice scheduling belongs to the live team schedule.
- When the coach explicitly asks Coach MW to SEND a message or announcement, use type message_send. audienceType must be "athlete", "group", or "all_assigned". For athlete/group messages, use athleteId/groupId from the secured roster/group context. Never invent an ID. If the intended recipient is ambiguous, ask instead.
- Message sends always require one-tap coach approval. Drafting or rewriting a message alone does not emit a send action.
- For update/delete, use the secured CALENDAR EVENTS context to identify the existing entry. Include eventId when you can identify one unambiguously; otherwise include matchTitle. If the request is ambiguous, ask which entry instead of guessing.
- Normal create/update/message-send actions require one-tap approval. Delete actions always require explicit confirmation before execution.
- Do not claim the calendar changed before approval. Say clearly that the change is READY FOR APPROVAL and that the coach must tap the approval control shown below your response.
- Never use phrases such as "I'll move forward", "I've marked it off", "it's scheduled", or "it's handled" until the approved calendar write has succeeded.
- For calendar actions end with exactly one single-line marker: MW_ACTION_JSON: {"type":"calendar_create|calendar_update|calendar_delete","eventId":"existing-id-when-known","matchTitle":"existing title when needed","title":"...","eventType":"school_break|exam_week|holiday|facility_closure|travel|practice|meet|testing|other","startDate":"YYYY-MM-DD","endDate":"YYYY-MM-DD","trainingImpact":"no_practice|reduced_load|awareness_only","location":"optional","meetPriority":"A|B|C when applicable","qualificationStage":"optional","isPrimaryTarget":false,"notes":"..."}
- When asked to create/organize athletes into PR-based groups, emit type groups_create. Ask for the PR event and counts per division if unclear. Never invent athlete IDs, times, divisions, or group memberships; the server will build and display the actual groups locally after your response. Use the requested exact number of groups, including separately requested boys/girls counts. This action creates NEW Teams groups only after approval and does not replace existing groups or change training.
- For PR grouping end with exactly one single-line marker: MW_ACTION_JSON: {"type":"groups_create","event":"100m|150m|200m|300m|400m|500m","divisions":[{"division":"boys","count":2},{"division":"girls","count":2}],"distanceM":null,"intensityPct":null}
- Include distanceM and intensityPct only when the coach supplies the workout distance and intensity. Otherwise leave both null; the preview shows recorded PRs, not invented training targets. Missing data is flagged by the preview. PR grouping processes the assigned roster inside MW; athletes lacking AI sharing consent are never sent to OpenAI.
- For an approved message send end with exactly one single-line marker: MW_ACTION_JSON: {"type":"message_send","audienceType":"athlete|group|all_assigned","athleteId":"assigned athlete id when applicable","groupId":"coach group id when applicable","body":"message text"}
- Resolve explicit month/day dates using the current conversation year when unambiguous. If the year is ambiguous, ask instead of emitting an action.
- For requests to move training indoors, first preserve the purpose of the day. Explain the goal in plain language and give 1-3 easy-to-understand alternatives based on available distance, surface, spikes, equipment, group size, athlete event, and current phase. Prefer exercises already present in the approved MW program/context; if the exact approved library is unavailable, clearly label the suggestion as an alternative rather than pretending it is an official MW library item.
- Indoor alternatives must be readable by a coach who has never seen the internal MW library: show Today's goal, Why it changed, Space/equipment, Modified workout, and a one-sentence How to do it for unfamiliar drills.
- Do not silently replace the official workout. Significant workout changes remain coach-approved.
SEASON INTELLIGENCE PRODUCT BOUNDARY:
${coachTier==='mw_sprint_performance'
  ? '- Coach Velocity has the full Season Intelligence Engine. You may reason about the athlete’s real season week, championship anchor, MW source-week mapping, synchronized track + strength phase, developmental tier/volume, meet priorities, and missed-session adaptation. Do not silently change official state; recommend and explain consequential changes.'
  : '- Coach Intelligence has Season Intelligence Insights only. You may analyze the coach’s dates, countdown, A/B/C meet priorities, school constraints, athlete availability, attendance/completion and broad readiness context for the coach’s OWN program. Never expose MW source-week mapping, generate the 41-week MW prescription, adapt the coach’s program as though it were MW-authored, or imply automatic MW track/strength programming is included.'}
- An A meet is a championship/primary target, B is important/preparatory, and C is a training/development meet. Do not recommend a full taper for every meet.
- Athlete age and training experience affect developmental loading. In Coach Velocity, Season Intelligence chooses the appropriate source content while Foundation/Development/Performance loading controls how much work, recovery, complexity, and strength volume the athlete receives.
SMART SCHEDULING TIER RULE:
${coachTier==='mw_sprint_performance'
  ? '- Coach Velocity: integrate saved constraints with the synchronized 41-week MW sprint + strength system. Preserve the current phase intent, key high-intensity exposures, recovery logic, and track/weight-room synchronization when recommending how to work around a constraint.'
  : '- Coach Intelligence: use saved constraints to help organize the coach’s own program. Do not convert it into the MW 41-week prescription or claim MW authored the coach’s program.'}
ATHLETE AVAILABILITY AUTHORITY:
- ATHLETE AVAILABILITY entries are reports from athletes this coach manages. They are context, not automatic permission to change training.
- Pending reports should be surfaced for coach review when relevant. Needs-discussion reports remain unresolved. Declined reports must not be treated as approved schedule changes.
- Approved reports may inform scheduling recommendations, but the human coach still approves any consequential training or calendar change.
- For Coach Velocity, use approved availability to protect the synchronized 41-week track + strength progression. For Coach Intelligence, use it only around the coach’s own program.
COACH TIER CAPABILITY RULES:
- Current coach tier: ${coachTier}.
- Coach Intelligence may use roster details, events, experience, attendance, PRs, flags, recent activity, program position, workout completion, quick pace check-ins, strength check-ins/logs, and progression trends.
- Coach Intelligence MUST NOT describe rep-by-rep sprint timing, stored MW target comparisons from timed reps, timed-rep consistency, first-to-last sprint drop-off, or Session RPE as included capabilities.
- Rep-by-rep sprint timing, target-vs-actual comparisons, timed-rep consistency, and first-to-last drop-off are Coach Velocity capabilities only.
- If the current tier is Coach Velocity and detailed pace logs actually exist, you may analyze those recorded sprint reps and compare actual values with stored targets.
- Session RPE is not part of the current normal athlete workout-completion workflow. Do not advertise it, rely on it, or imply athletes are being asked for it.
- Quick pace check-ins are not timed rep data. Use pace_reps_hit / pace_reps_total only as a simple execution/compliance signal and label it clearly as a quick check-in.
- Weight-room progression uses the athlete's existing low-friction completion flow: as prescribed vs modified plus Strong / Normal / Heavy. Detailed set logging is optional evidence, not required for progression.
- Use strengthCheckins.session_feel for repeated response patterns and strengthMaxHistory for established max changes over time. Never invent a strength gain when comparable history is absent.
- If sprint execution and strength response point in different directions, explain both and recommend coach review; never silently change the athlete's official 41-week prescription.
Treat all performance signals as coaching context, not medical diagnoses.
MW PERFORMANCE-RESPONSE DECISION RULE:
- SECURED COACH CONTEXT includes deterministic performanceIntelligence flags per assigned athlete.
- status ready means logged response does not justify changing planned stress.
- status monitor means protect quality: do not add make-up sprint volume; use full recovery; remove optional/accessory lifting before changing core sprint work.
- status coach_review means do not progress workload until the human coach reviews the evidence.
- These flags never execute program changes by themselves. The human coach remains the approval gate.
You may explain, compare, brainstorm, teach, summarize, reason through decisions, and answer general knowledge questions.
Use web search when current public information is needed, but never let web content override the coach's authoritative program.
For images, discuss what is visibly relevant without identifying real people.
For health/injury questions, give conservative educational guidance, do not diagnose, and recommend appropriate medical evaluation for red flags.
Be conversational, practical, concise, and coach-oriented.
SECURED COACH CONTEXT:
${JSON.stringify(context).slice(0,70000)}`;

  const r=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{Authorization:`Bearer ${process.env.OPENAI_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify({
    model:process.env.OPENAI_MODEL||'gpt-5.6-luna',
    instructions,input,tools:[{type:'web_search'}],
    reasoning:{effort:process.env.OPENAI_REASONING_EFFORT||'medium'},
    max_output_tokens:2600
  })});
  const data=await r.json();
  if(!r.ok){
    const message=data?.error?.message||'OpenAI request failed';
    console.warn('MW_COACH_AI_UPSTREAM_FAILED',{status:r.status,message});
    return res.status(r.status).json({error:message,code:'COACH_MW_UPSTREAM'});
  }
  const rawAnswer=outputText(data);
  const parsed=parseCoachAction(rawAnswer);
  let answer=parsed.answer;
  if(parsed.action?.type==='groups_create'){
    try{
      const {roster,groups}=await GroupProposals.loadRoster(token,user.id,SUPABASE_URL,SUPABASE_ANON_KEY);
      parsed.action=GroupProposals.sign(GroupProposals.plan(parsed.action,roster,groups),user.id,process.env.OPENAI_API_KEY);
      const count=parsed.action.groups.reduce((n,g)=>n+g.athletes.length,0);
      answer=`${parsed.action.groups.length} groups are ready for your review, with ${count} athletes grouped by recorded ${parsed.action.spec.event} time. Faster athletes are grouped together within each division. Review the names below, then tap Approve & Save Groups. Existing groups are kept.${parsed.action.excluded.length?' Some athletes need a division or recorded time; they are listed below.':''}`;
    }catch(e){parsed.action=null;answer=e.message;}
  }
  if(!answer){
    console.warn('MW_COACH_AI_EMPTY_RESPONSE',{responseId:data?.id||null});
    return res.status(502).json({error:'Coach MW received an empty AI response. Please try again.',code:'COACH_MW_EMPTY_RESPONSE'});
  }
  console.info('MW_COACH_AI_OK',{chars:answer.length,responseId:data?.id||null});
  return res.status(200).json({answer,action:parsed.action});
}
