const {founderAuth}=require('../lib/founder-auth');

function cleanMime(v){
  const s=String(v||'audio/webm').toLowerCase().split(';')[0].trim();
  return ['audio/webm','audio/mp4','audio/mpeg','audio/wav','audio/ogg'].includes(s)?s:'audio/webm';
}
function extForMime(mime){
  if(mime==='audio/mp4')return 'm4a';
  if(mime==='audio/mpeg')return 'mp3';
  if(mime==='audio/wav')return 'wav';
  if(mime==='audio/ogg')return 'ogg';
  return 'webm';
}

module.exports=async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='POST')return res.status(405).json({error:'POST only'});
  if(!process.env.OPENAI_API_KEY)return res.status(503).json({error:'Founder voice input is temporarily unavailable.'});
  try{
    await founderAuth(req);
    const body=typeof req.body==='string'?JSON.parse(req.body||'{}'):(req.body||{});
    const raw=String(body.audioBase64||'').replace(/^data:[^,]+,/,'').trim();
    if(!raw)return res.status(400).json({error:'Missing audio recording.'});
    const audio=Buffer.from(raw,'base64');
    if(!audio.length)return res.status(400).json({error:'Empty audio recording.'});
    if(audio.length>3*1024*1024)return res.status(413).json({error:'Voice message is too long. Keep recordings under about one minute.'});
    const mime=cleanMime(body.mimeType);
    const form=new FormData();
    form.append('file',new Blob([audio],{type:mime}),`founder-voice.${extForMime(mime)}`);
    form.append('model',process.env.OPENAI_TRANSCRIBE_MODEL||'gpt-4o-mini-transcribe');
    form.append('language','en');
    form.append('response_format','json');
    const r=await fetch('https://api.openai.com/v1/audio/transcriptions',{
      method:'POST',
      headers:{Authorization:`Bearer ${process.env.OPENAI_API_KEY}`},
      body:form
    });
    const d=await r.json().catch(()=>({}));
    if(!r.ok)return res.status(r.status).json({error:d?.error?.message||'Voice transcription failed.'});
    const text=String(d.text||'').trim();
    if(!text)return res.status(422).json({error:'I could not hear enough speech to transcribe that recording.'});
    return res.status(200).json({ok:true,text});
  }catch(e){
    return res.status(e.status||500).json({error:e?.message||'Founder voice transcription failed.'});
  }
};
