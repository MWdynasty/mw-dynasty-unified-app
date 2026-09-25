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
  if(data.output_text)return data.output_text;
  return (data.output||[]).flatMap(x=>x.content||[]).filter(x=>x.type==='output_text').map(x=>x.text).join('\n').trim();
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
    if(!tr.ok||!['intelligence','mw_sprint_performance'].includes(coachTier))return res.status(403).json({error:'Coach Intelligence or MW Sprint Performance access required'});
  }

  const repTrackingEnabled=coachTier==='mw_sprint_performance';
  const [assignments,athletes,attendance,states,prs,flags,paceLogs,strengthLogs,strengthCheckins,completions,calendarEvents,athleteAvailability,seasonContexts]=await Promise.all([
    sb(`coach_assignments?select=*&coach_user_id=eq.${encodeURIComponent(user.id)}&status=eq.active&limit=200`,token),
    sb(`athletes?select=*&limit=200`,token),
    sb(`attendance_records?select=*&order=attendance_date.desc&limit=250`,token),
    coachTier==='mw_sprint_performance'?sb(`athlete_program_state?select=*&limit=200`,token):sb(`athlete_program_state?select=athlete_id,current_week,current_day,current_phase,program_status,start_date,last_completed_workout_at,track_tier,strength_tier,program_version,onboarding_assessment_completed_at&limit=200`,token),
    sb(`athlete_prs?select=*&limit=300`,token),
    sb(`athlete_flags?select=*&limit=200`,token),
    repTrackingEnabled?sb(`athlete_pace_logs?select=athlete_id,program_week,program_day,workout_key,rep_number,distance_m,target_seconds,actual_seconds,intensity_percent,recorded_at&actual_seconds=not.is.null&order=recorded_at.desc&limit=500`,token):Promise.resolve([]),
    sb(`athlete_strength_session_logs?select=athlete_id,program_week,program_day,session_label,exercise_name,set_number,reps_completed,target_load,actual_load,weight_unit,set_rpe,recorded_at&order=recorded_at.desc&limit=500`,token),
    sb(`athlete_strength_checkins?select=athlete_id,program_week,strength_day,day_label,status,note,recorded_at&order=recorded_at.desc&limit=500`,token),
    sb(`workout_completions?select=athlete_id,program_week,program_day,workout_key,completion_status,pace_check_status,pace_reps_total,pace_reps_hit,performance_checked_at,completed_at&order=completed_at.desc&limit=500`,token),
    sb(`coach_calendar_events?select=id,title,event_type,starts_at,ends_at,training_impact,location,notes,meet_priority,is_primary_target,qualification_stage,parent_event_id&coach_user_id=eq.${encodeURIComponent(user.id)}&order=starts_at.asc&limit=150`,token),
    sb(`athlete_schedule_constraints?select=id,athlete_id,constraint_type,title,starts_on,ends_on,training_impact,notes,review_status,coach_note,created_at&linked_coach_user_id=eq.${encodeURIComponent(user.id)}&order=starts_on.asc&limit=150`,token),
    sb(`coach_season_contexts?select=id,group_id,season_year,season_type,competition_level_group,competition_state,competition_path,first_practice_date,first_meet_date,primary_peak_date,secondary_peak_date,goal,status&coach_user_id=eq.${encodeURIComponent(user.id)}&order=primary_peak_date.asc&limit=50`,token)
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
  const context={coach:me,coachTier,seasonIntelligenceMode:coachTier==='mw_sprint_performance'?'engine':'insights',repTrackingEnabled,assignments:assignments||[],athletes:athletes||[],attendance:attendance||[],programState:states||[],prs:prs||[],flags:flags||[],calendarEvents:calendarEvents||[],athleteAvailability:athleteAvailability||[],seasonContexts:seasonContexts||[],performanceIntelligence,performance:{paceLogs:paceLogs||[],strengthLogs:strengthLogs||[],strengthCheckins:strengthCheckins||[],workoutCompletions:completions||[]}};

  const messages=Array.isArray(req.body?.messages)?req.body.messages.slice(-40):[];
  const input=messages.map(m=>{
    const assistant=m.role==='assistant';
    const content=[{type:assistant?'output_text':'input_text',text:String(m.content||'').slice(0,12000)}];
    if(!assistant&&typeof m.imageDataUrl==='string'&&/^data:image\/(png|jpeg|jpg|webp);base64,/i.test(m.imageDataUrl)&&m.imageDataUrl.length<8000000)content.push({type:'input_image',image_url:m.imageDataUrl});
    return {role:assistant?'assistant':'user',content};
  });
  const instructions=`You are Coach MW inside the MW Dynasty Coach platform.
You are a high-quality conversational AI for an authenticated coach. Understand follow-ups, corrections, incomplete questions, and active conversation context.
The human coach remains the authority. MW workflow is Detect -> Analyze -> Recommend -> Coach Approves -> System Executes.
Never silently change official athlete program state, prescriptions, attendance, or consequential coaching decisions.
For MW Sprint Performance, Coach Williams' 41-week track and strength methodology is authoritative. Do not replace it with generic web workouts.
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
SEASON INTELLIGENCE PRODUCT BOUNDARY:
${coachTier==='mw_sprint_performance'
  ? '- MW Sprint Performance has the full Season Intelligence Engine. You may reason about the athlete’s real season week, championship anchor, MW source-week mapping, synchronized track + strength phase, developmental tier/volume, meet priorities, and missed-session adaptation. Do not silently change official state; recommend and explain consequential changes.'
  : '- Coach Intelligence has Season Intelligence Insights only. You may analyze the coach’s dates, countdown, A/B/C meet priorities, school constraints, athlete availability, attendance/completion and broad readiness context for the coach’s OWN program. Never expose MW source-week mapping, generate the 41-week MW prescription, adapt the coach’s program as though it were MW-authored, or imply automatic MW track/strength programming is included.'}
- An A meet is a championship/primary target, B is important/preparatory, and C is a training/development meet. Do not recommend a full taper for every meet.
- Athlete age and training experience affect developmental loading. In MW Sprint Performance, Season Intelligence chooses the appropriate source content while Foundation/Development/Performance loading controls how much work, recovery, complexity, and strength volume the athlete receives.
SMART SCHEDULING TIER RULE:
${coachTier==='mw_sprint_performance'
  ? '- MW Sprint Performance: integrate saved constraints with the synchronized 41-week MW sprint + strength system. Preserve the current phase intent, key high-intensity exposures, recovery logic, and track/weight-room synchronization when recommending how to work around a constraint.'
  : '- Coach Intelligence: use saved constraints to help organize the coach’s own program. Do not convert it into the MW 41-week prescription or claim MW authored the coach’s program.'}
ATHLETE AVAILABILITY AUTHORITY:
- ATHLETE AVAILABILITY entries are reports from athletes this coach manages. They are context, not automatic permission to change training.
- Pending reports should be surfaced for coach review when relevant. Needs-discussion reports remain unresolved. Declined reports must not be treated as approved schedule changes.
- Approved reports may inform scheduling recommendations, but the human coach still approves any consequential training or calendar change.
- For MW Sprint Performance, use approved availability to protect the synchronized 41-week track + strength progression. For Coach Intelligence, use it only around the coach’s own program.
COACH TIER CAPABILITY RULES:
- Current coach tier: ${coachTier}.
- Coach Intelligence may use roster details, events, experience, attendance, PRs, flags, recent activity, program position, workout completion, quick pace check-ins, strength check-ins/logs, and progression trends.
- Coach Intelligence MUST NOT describe rep-by-rep sprint timing, stored MW target comparisons from timed reps, timed-rep consistency, first-to-last sprint drop-off, or Session RPE as included capabilities.
- Rep-by-rep sprint timing, target-vs-actual comparisons, timed-rep consistency, and first-to-last drop-off are MW Sprint Performance capabilities only.
- If the current tier is MW Sprint Performance and detailed pace logs actually exist, you may analyze those recorded sprint reps and compare actual values with stored targets.
- Session RPE is not part of the current normal athlete workout-completion workflow. Do not advertise it, rely on it, or imply athletes are being asked for it.
- Quick pace check-ins are not timed rep data. Use pace_reps_hit / pace_reps_total only as a simple execution/compliance signal and label it clearly as a quick check-in.
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
    model:process.env.OPENAI_MODEL||'gpt-5.6-sol',
    instructions,input,tools:[{type:'web_search'}],
    reasoning:{effort:process.env.OPENAI_REASONING_EFFORT||'medium'},
    max_output_tokens:2600
  })});
  const data=await r.json();
  if(!r.ok)return res.status(r.status).json({error:data?.error?.message||'OpenAI request failed'});
  return res.status(200).json({answer:outputText(data)});
}
