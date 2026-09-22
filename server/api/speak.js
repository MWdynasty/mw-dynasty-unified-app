const {authenticate}=require('../lib/mw-auth');
const {founderAuth}=require('../lib/founder-auth');
module.exports=async function handler(req,res){
  if(req.method!=='POST')return res.status(405).json({error:'POST only'});
  if(!process.env.OPENAI_API_KEY)return res.status(503).json({error:'Coach MW voice is temporarily unavailable.'});
  try{
    const body=typeof req.body==='string'?JSON.parse(req.body||'{}'):(req.body||{});
    const coachType=String(body.coachType||'neutral').toLowerCase();
    const isFounderContext=coachType==='founder'||coachType==='employee';
    if(isFounderContext)await founderAuth(req);else await authenticate(req);
    const input=String(body.text||'').trim().slice(0,7000);if(!input)return res.status(400).json({error:'Missing text'});
    const isFounder=coachType==='founder';
    const isEmployee=coachType==='employee';
    const voice=(isFounder||isEmployee)?(process.env.OPENAI_FOUNDER_VOICE||process.env.OPENAI_MALE_VOICE||'onyx'):(coachType==='female'?(process.env.OPENAI_FEMALE_VOICE||'coral'):(process.env.OPENAI_MALE_VOICE||'onyx'));
    const roleLabel=String(body.roleLabel||'MW Dynasty AI employee').trim().slice(0,120);
    const instructions=isFounder?'Speak as MW Dynasty Founder AI: confident, calm, polished, executive, natural, and conversational. Use clear pacing, realistic pauses, and measured emphasis. Sound like a trusted chief-of-staff briefing the Founder, never like an announcer or a robot.':isEmployee?('Speak as '+roleLabel+' inside the MW Dynasty company: professional, natural, concise, conversational, and confident. Sound like a capable team member speaking directly to the Founder. Use realistic pauses and measured emphasis. Never sound like an announcer or robot.'):(coachType==='female'?'Speak like a confident elite female sprint coach: warm, grounded, natural, conversational, athletic, and human. Use realistic pauses and emphasis. Never sound like an announcer or robot. Keep the energy controlled unless celebrating.':'Speak like a confident elite male sprint coach: calm, grounded, natural, conversational, athletic, and human. Use realistic pauses and emphasis. Never sound like an announcer or robot. Keep the energy controlled unless celebrating.');
    const r=await fetch('https://api.openai.com/v1/audio/speech',{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${process.env.OPENAI_API_KEY}`},body:JSON.stringify({model:process.env.OPENAI_TTS_MODEL||'gpt-4o-mini-tts',voice,input,instructions,response_format:'mp3'})});
    if(!r.ok){const d=await r.json().catch(()=>({}));return res.status(r.status).json({error:d?.error?.message||'Coach MW voice request failed.'})}
    const a=Buffer.from(await r.arrayBuffer());res.setHeader('Content-Type','audio/mpeg');res.setHeader('Cache-Control','no-store');return res.status(200).send(a);
  }catch(e){return res.status(e.status||500).json({error:e?.message||'Coach MW voice server error.'})}
};
