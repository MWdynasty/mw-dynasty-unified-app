const {authenticate,SUPABASE_URL,SUPABASE_KEY}=require('../lib/mw-auth');

const SURFACES=new Set(['athlete','coach','account','native','unknown']);
const SEVERITIES=new Set(['info','warn','error']);

function cleanString(value,max=180){
  if(value==null)return null;
  let s=String(value)
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,'[email]')
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi,'[id]')
    .replace(/\b(?:eyJ[A-Za-z0-9_-]+\.){2}[A-Za-z0-9_-]+\b/g,'[token]');
  if(s.length>max)s=s.slice(0,max);
  return s;
}
function cleanContext(input,depth=0){
  if(depth>2||input==null)return {};
  if(Array.isArray(input))return input.slice(0,12).map(v=>typeof v==='object'?cleanContext(v,depth+1):cleanString(v,120));
  if(typeof input!=='object')return cleanString(input,120);
  const out={};
  for(const [k,v] of Object.entries(input).slice(0,24)){
    const key=cleanString(k,48);
    if(!key||/token|password|secret|authorization|cookie|email|message|body|image|photo/i.test(key))continue;
    if(v==null||typeof v==='boolean'||typeof v==='number')out[key]=v;
    else if(typeof v==='string')out[key]=cleanString(v,160);
    else if(typeof v==='object')out[key]=cleanContext(v,depth+1);
  }
  return out;
}
function cleanRoute(value){
  const s=cleanString(value,140)||'';
  return s.split('?')[0].split('#')[0].slice(0,140);
}
function normalizeEvent(raw,userId){
  const surface=SURFACES.has(String(raw?.surface||''))?String(raw.surface):'unknown';
  const severity=SEVERITIES.has(String(raw?.severity||''))?String(raw.severity):'info';
  return {
    user_id:userId,
    surface,
    event_type:cleanString(raw?.event_type||raw?.eventType||'event',80)||'event',
    severity,
    code:cleanString(raw?.code,80),
    route:cleanRoute(raw?.route),
    app_version:cleanString(raw?.app_version||raw?.appVersion,24),
    ios_build:cleanString(raw?.ios_build||raw?.iosBuild,24),
    platform:cleanString(raw?.platform,80),
    online:typeof raw?.online==='boolean'?raw.online:null,
    context:cleanContext(raw?.context||{})
  };
}
async function insertEvents(token,events){
  const r=await fetch(`${SUPABASE_URL}/rest/v1/launch_diagnostics`,{
    method:'POST',
    headers:{apikey:SUPABASE_KEY,Authorization:`Bearer ${token}`,'Content-Type':'application/json',Prefer:'return=minimal'},
    body:JSON.stringify(events)
  });
  if(!r.ok){
    const d=await r.json().catch(()=>({}));
    throw Object.assign(new Error(d?.message||'Diagnostics could not be recorded.'),{status:r.status});
  }
}
async function recent(token,userId,limit){
  const url=`${SUPABASE_URL}/rest/v1/launch_diagnostics?user_id=eq.${encodeURIComponent(userId)}&select=id,surface,event_type,severity,code,route,app_version,ios_build,platform,online,context,created_at&order=created_at.desc&limit=${limit}`;
  const r=await fetch(url,{headers:{apikey:SUPABASE_KEY,Authorization:`Bearer ${token}`}});
  const d=await r.json().catch(()=>[]);
  if(!r.ok)throw Object.assign(new Error('Diagnostics could not be loaded.'),{status:r.status});
  return Array.isArray(d)?d:[];
}

module.exports=async function diagnostics(req,res){
  res.setHeader('Cache-Control','no-store');
  try{
    const {token,user}=await authenticate(req);
    if(req.method==='POST'){
      const body=typeof req.body==='string'?JSON.parse(req.body||'{}'):(req.body||{});
      const raw=Array.isArray(body.events)?body.events:[body.event||body];
      if(!raw.length)return res.status(400).json({error:'No diagnostic events supplied.'});
      const events=raw.slice(0,25).map(x=>normalizeEvent(x,user.id));
      await insertEvents(token,events);
      return res.status(200).json({ok:true,accepted:events.length});
    }
    if(req.method==='GET'){
      const limit=Math.max(1,Math.min(50,Number(req.query?.limit)||20));
      const items=await recent(token,user.id,limit);
      const dayAgo=Date.now()-86400000;
      const last24=items.filter(x=>new Date(x.created_at).getTime()>=dayAgo);
      return res.status(200).json({
        ok:true,
        summary:{
          recent_events:items.length,
          errors_24h:last24.filter(x=>x.severity==='error').length,
          warnings_24h:last24.filter(x=>x.severity==='warn').length,
          last_event_at:items[0]?.created_at||null,
          last_successful_sync_at:items.find(x=>x.event_type==='sync_ok')?.created_at||null
        },
        items
      });
    }
    return res.status(405).json({error:'GET or POST only'});
  }catch(e){
    return res.status(e.status||500).json({error:e.message||'Diagnostics request failed'});
  }
};
