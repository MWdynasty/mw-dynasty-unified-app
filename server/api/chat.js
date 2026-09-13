const {getAthleteContext}=require('../lib/mw-auth');
const {PROGRAM,compactTrack,compactStrength,normalizeTier,PROGRAM_VERSION}=require('../lib/mw-program-service');
const SUPPORTING_KNOWLEDGE=require('../knowledge/coach-mw-book-knowledge.json');
const TRACK=PROGRAM.TRACK;
const STRENGTH=PROGRAM.STRENGTH;

function outputText(data){
  if(typeof data?.output_text==='string'&&data.output_text.trim())return data.output_text.trim();
  const parts=[];
  for(const item of data?.output||[]){
    for(const c of item?.content||[]){
      if((c?.type==='output_text'||c?.type==='text')&&c?.text)parts.push(c.text);
    }
  }
  return parts.join('\n').trim();
}

function prText(prs){
  return (prs||[]).map(x=>`${x.event}: ${x.time_seconds}s${x.verified?' (verified)':''}`).join(', ')||'No PRs on file';
}

function clampWeek(n){
  const x=Number(n);
  return Number.isFinite(x)?Math.max(1,Math.min(41,Math.trunc(x))):null;
}
function clampDay(n){
  const x=Number(n);
  return Number.isFinite(x)?Math.max(1,Math.min(4,Math.trunc(x))):null;
}

function requestedState(messages,officialWeek,officialDay){
  const lastUser=[...messages].reverse().find(m=>m?.role!=='assistant');
  const text=String(lastUser?.content||'');
  const wm=text.match(/\bweek\s*#?\s*(\d{1,2})\b/i);
  const dm=text.match(/\bday\s*#?\s*([1-4])\b/i);
  return {
    text,
    week:clampWeek(wm?.[1])||officialWeek,
    day:clampDay(dm?.[1])||officialDay,
    explicitlyRequestedWeek:!!wm,
    explicitlyRequestedDay:!!dm
  };
}

function getTrackWeek(week){
  return TRACK?.weeks?.[String(week)]||null;
}
function getTrackSession(week,day){
  const w=getTrackWeek(week);
  return w?.sessions?.find(s=>Number(s.day)===Number(day))||null;
}
function getStrengthWeek(week){
  return STRENGTH?.[String(week)]||null;
}

function compactTrackWeek(week,tier,events){return compactTrack(week,tier,events)}

function compactStrengthWeek(week,tier){return compactStrength(week,tier)}

module.exports=async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='POST')return res.status(405).json({error:'POST only'});
  if(!process.env.OPENAI_API_KEY){
    return res.status(503).json({error:'Coach MW is temporarily unavailable. Please try again shortly.'});
  }

  try{
    const c=await getAthleteContext(req);
    const body=typeof req.body==='string'?JSON.parse(req.body||'{}'):(req.body||{});
    const messages=Array.isArray(body.messages)?body.messages.slice(-40):[];
    const ps=c.programState||{};
    if(!ps.onboarding_assessment_completed_at)return res.status(403).json({error:'Complete your Athlete Profile Assessment before Coach MW provides individualized workouts.',assessmentRequired:true});
    const athleteName=c.profile?.first_name||'Athlete';
    const officialWeek=clampWeek(ps.current_week)||1;
    const officialDay=clampDay(ps.current_day)||1;
    const trackTier=normalizeTier(ps.track_tier||c.athlete?.experience_level);
    const strengthTier=normalizeTier(ps.strength_tier||c.athlete?.experience_level);
    const asked=requestedState(messages,officialWeek,officialDay);

    const athleteEvents=c.athlete?.selected_events||[c.athlete?.primary_event,c.athlete?.secondary_event].filter(Boolean);
    const officialTrackWeek=compactTrackWeek(officialWeek,trackTier,athleteEvents);
    const officialSession=officialTrackWeek?.sessions?.find(s=>Number(s.day)===officialDay)||null;
    const officialStrengthWeek=compactStrengthWeek(officialWeek,strengthTier);

    const futureLocked=asked.week>officialWeek;
    const browseWeek=futureLocked?officialWeek:asked.week;
    const requestedTrackWeek=browseWeek!==officialWeek?compactTrackWeek(browseWeek,trackTier,athleteEvents):null;
    const requestedSession=(browseWeek!==officialWeek||asked.day!==officialDay)
      ?requestedTrackWeek?.sessions?.find(s=>Number(s.day)===asked.day)||null:null;
    const requestedStrengthWeek=browseWeek!==officialWeek?compactStrengthWeek(browseWeek,strengthTier):null;

    const programContext={
      library:{
        trackProduct:TRACK.product,
        trackCoverage:TRACK.coverage,
        trackComplete:TRACK.complete,
        trackProvenance:TRACK.provenance_note,
        globalRules:TRACK.global_rules,
        supportingKnowledgeVersion:SUPPORTING_KNOWLEDGE.knowledgeVersion
      },
      official:{
        week:officialWeek,
        day:officialDay,
        trackTier,
        strengthTier,
        programVersion:ps.program_version||PROGRAM_VERSION,
        trackSession:officialSession,
        trackWeek:officialTrackWeek,
        strengthWeek:officialStrengthWeek
      },
      browsing:(asked.explicitlyRequestedWeek||asked.explicitlyRequestedDay)?{
        requestedWeek:asked.week,
        requestedDay:asked.day,
        futureLocked,
        requestedTrackSession:futureLocked?null:(requestedSession||getTrackSession(browseWeek,asked.day)),
        requestedTrackWeek:requestedTrackWeek,
        requestedStrengthWeek:requestedStrengthWeek
      }:null
    };

    const instructions=`You are Coach MW AI inside MW Dynasty. You help athletes execute Coach Mustaqeem Williams' MW Sprint Performance System. The AI does not create the MW Method and must not replace the program with generic workouts.

AUTHORITATIVE ATHLETE STATE (secured MW database)
Athlete: ${athleteName}
Official current week: ${officialWeek}
Official current day: ${officialDay}
Track tier: ${trackTier}
Strength tier: ${strengthTier}
Program version: ${ps.program_version||PROGRAM_VERSION}
Official phase: ${ps.current_phase||1}
Program status: ${ps.program_status||'not_started'}
PRs: ${prText(c.prs)}

MW PROGRAM KNOWLEDGE LOADED
- Complete original MW Dynasty 41-week track program (V3.2): LOADED. It is MW-owned and is not Track Wire or another coach's week-by-week calendar.
- Complete 41-week MW Strength & Power program: LOADED.
- The JSON below is authoritative MW program context for this response.
- The founder-supplied supporting science layer below was distilled from 85 screenshots of Track & Field Coaching Essentials. Use it to strengthen explanations, tier application, recovery decisions, and technical reasoning. It supports but never overrides the approved MW program.
- When the athlete asks "what is my workout today?", "what do I do today?", or equivalent, use official.trackSession for Week ${officialWeek}, Day ${officialDay}.
- When strength/lifting is asked about, use official.strengthWeek or browsing.requestedStrengthWeek as appropriate.
- If the athlete asks about another unlocked/past week/day, that is browsing only; state that their official assignment remains Week ${officialWeek}, Day ${officialDay}.
- Never reveal prescriptions from a future locked week. If browsing.futureLocked is true, say that week is locked until the athlete officially progresses there.
- Never replace an exact MW prescription with a generic workout.
- Never claim program data is missing when the needed session exists in PROGRAM_CONTEXT.
- If a field is genuinely absent from PROGRAM_CONTEXT, say only that specific detail is not listed; do not invent it.
- Preserve exact distances, reps, percentages, recovery, circuit order, and other prescription details that are present.
- Navigation never changes training status. Only MW progression rules or authorized coach/founder action can change official status.
- Track quality comes first. Do not encourage training through sharp pain, neurological symptoms, severe swelling, or an altered gait/stride.
- Be practical, concise, athlete-friendly, conversational, and grounded in MW methodology.
- Behave like a high-quality general conversational AI: understand follow-ups, pronouns, incomplete questions, corrections, and context from earlier turns.
- You can explain, compare, brainstorm, teach, summarize, reason through choices, and answer general knowledge questions—not only workout questions.
- Use web search when current/up-to-date public information is actually needed. Never use the web to override MW's authoritative program prescriptions.
- When an athlete provides an image, inspect what is actually visible and answer the question about it. Never identify a real person in an image.
- Separate facts from recommendations. If uncertain, say what is uncertain instead of bluffing.
- For health/injury questions, provide conservative educational guidance and encourage appropriate medical evaluation for red flags; do not diagnose.
- Maintain conversation continuity without making the athlete repeat information already present in the active conversation or secured athlete context.
- Faith may be discussed when relevant. MW's stated foundation is historic Trinitarian Christianity; do not claim private revelation from God and do not substitute prayer for medical/safety guidance.

PROGRAM_CONTEXT:
${JSON.stringify(programContext,null,2)}

MW_SUPPORTING_SCIENCE:
${JSON.stringify(SUPPORTING_KNOWLEDGE)}`;

    const input=messages.map(m=>{
      const assistant=m.role==='assistant';
      const content=[{type:assistant?'output_text':'input_text',text:String(m.content||'').slice(0,12000)}];
      if(!assistant && typeof m.imageDataUrl==='string' && /^data:image\/(png|jpeg|jpg|webp);base64,/i.test(m.imageDataUrl) && m.imageDataUrl.length<8000000){
        content.push({type:'input_image',image_url:m.imageDataUrl});
      }
      return {role:assistant?'assistant':'user',content};
    });

    const r=await fetch('https://api.openai.com/v1/responses',{
      method:'POST',
      headers:{
        'Content-Type':'application/json',
        'Authorization':`Bearer ${process.env.OPENAI_API_KEY}`
      },
      body:JSON.stringify({
        model:process.env.OPENAI_MODEL||'gpt-5.6-sol',
        instructions,
        input,
        tools:[{type:'web_search'}],
        reasoning:{effort:process.env.OPENAI_REASONING_EFFORT||'medium'},
        max_output_tokens:2200
      })
    });

    const data=await r.json();
    if(!r.ok)return res.status(r.status).json({error:data?.error?.message||'Coach MW AI request failed.'});
    const text=outputText(data);
    if(!text)return res.status(502).json({error:'Coach MW received an empty AI response. Please try again.'});

    return res.status(200).json({
      text,
      officialState:{week:officialWeek,day:officialDay},
      programKnowledge:{trackWeeks:41,strengthWeeks:41,loaded:true}
    });
  }catch(e){
    return res.status(e.status||500).json({error:e?.message||'Coach MW server error.'});
  }
};
