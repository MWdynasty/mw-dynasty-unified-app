const SUPABASE_URL=process.env.SUPABASE_URL||'https://keqgunlfwhjgcsurynef.supabase.co';
const SUPABASE_ANON_KEY=process.env.SUPABASE_ANON_KEY||process.env.SUPABASE_PUBLISHABLE_KEY||'sb_publishable_JWCLQzrdWA_ZmvbpV5urVg_rcT6NECm';
const {PROGRAM_VERSION,TIERS}=require('../../lib/mw-program-service');
const SUPPORTING_KNOWLEDGE=require('../../knowledge/coach-mw-book-knowledge.json');

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

  const [assignments,athletes,attendance,states,prs,flags]=await Promise.all([
    sb(`coach_assignments?select=*&coach_user_id=eq.${encodeURIComponent(user.id)}&status=eq.active&limit=200`,token),
    sb(`athletes?select=*&limit=200`,token),
    sb(`attendance_records?select=*&order=attendance_date.desc&limit=250`,token),
    sb(`athlete_program_state?select=*&limit=200`,token),
    sb(`athlete_prs?select=*&limit=300`,token),
    sb(`athlete_flags?select=*&limit=200`,token)
  ]);
  const context={coach:me,assignments:assignments||[],athletes:athletes||[],attendance:attendance||[],programState:states||[],prs:prs||[],flags:flags||[]};

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
Foundation is not merely slower Performance work: it reduces volume and complexity, extends recovery, and prioritizes technique and age-appropriate strength. Development uses controlled volume and progressive complexity. Performance uses the complete prescription when readiness supports it.
When recommending a tier or week change, explain the evidence and require coach approval. Never claim a recommendation has changed the athlete record until the coach uses the approved assignment control.
The following knowledge was distilled from 85 founder-supplied screenshots of Track & Field Coaching Essentials. Apply it to biomechanics, periodization, warm-up, sprint sequencing, strength, plyometrics, recovery, youth safeguards, and event-specific reasoning. It is supporting science, not replacement prescriptions, and must not be presented as original MW authorship or reproduced at length:
${JSON.stringify(SUPPORTING_KNOWLEDGE)}
For Coach Core / Coach Intelligence own-program customers, the coach's uploaded program is the source of truth; never pretend MW authored it.
Use secured coach/team context when answering roster, attendance, PR, progression, flag, or athlete questions. If the required data is absent, say so.
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
