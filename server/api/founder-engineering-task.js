const {createHash,timingSafeEqual}=require('crypto');

const EXPECTED_SECRET_SHA256='f1664d218f4c2717fbfa974b1df2e5cc138214b6163776d5b72af16875ee59d6';

function clean(v,max=12000){return String(v??'').trim().slice(0,max)}
function outputText(data){
  if(typeof data?.output_text==='string'&&data.output_text.trim())return data.output_text.trim();
  const parts=[];
  for(const item of data?.output||[])for(const c of item?.content||[])if((c?.type==='output_text'||c?.type==='text')&&c?.text)parts.push(c.text);
  return parts.join('\n').trim();
}
function parseJson(text){
  const raw=String(text||'').trim().replace(/^\`\`\`(?:json)?/i,'').replace(/\`\`\`$/,'').trim();
  return JSON.parse(raw);
}
function authorized(req){
  const h=String(req.headers?.authorization||'');
  if(!h.toLowerCase().startsWith('bearer '))return false;
  const secret=h.slice(7).trim();
  if(!secret)return false;
  const actual=createHash('sha256').update(secret).digest();
  const expected=Buffer.from(EXPECTED_SECRET_SHA256,'hex');
  return actual.length===expected.length&&timingSafeEqual(actual,expected);
}
function pathAllowed(path,contextPaths){
  const p=String(path||'').replace(/\\/g,'/').replace(/^\.\//,'');
  if(!p||p.startsWith('/')||p.includes('..'))return false;
  if(!contextPaths.has(p))return false;
  const allowedPrefixes=['athlete/','coach/','assets/','lib/','server/api/','server/lib/'];
  if(!allowedPrefixes.some(x=>p.startsWith(x)))return false;
  const denied=[
    '.github/','supabase/','founder/','vercel.json','package.json','package-lock.json',
    'server/api/founder.js','server/api/founder-ai.js','server/api/founder-autonomous-task.js',
    'server/api/founder-engineering-task.js','server/lib/mw-auth.js',
    'server/api/billing.js','server/api/stripe-checkout.js','server/api/stripe-portal.js'
  ];
  return !denied.some(x=>p===x||p.startsWith(x));
}
function validEdit(edit,contextPaths){
  const p=String(edit?.path||'').replace(/\\/g,'/').replace(/^\.\//,'');
  const find=String(edit?.find||'');
  const replace=String(edit?.replace??'');
  return pathAllowed(p,contextPaths)&&find.length>=8&&find.length<=18000&&replace.length<=24000;
}
async function openai(instructions,input,max=5000){
  const ctl=new AbortController();
  const timer=setTimeout(()=>ctl.abort(),55000);
  try{
    const r=await fetch('https://api.openai.com/v1/responses',{
      method:'POST',
      headers:{Authorization:`Bearer ${process.env.OPENAI_API_KEY}`,'Content-Type':'application/json'},
      signal:ctl.signal,
      body:JSON.stringify({
        model:process.env.OPENAI_AUTONOMY_MODEL||process.env.OPENAI_MODEL||'gpt-5.6-sol',
        instructions,input,
        reasoning:{effort:process.env.OPENAI_AUTONOMY_REASONING_EFFORT||'medium'},
        max_output_tokens:max
      })
    });
    const d=await r.json().catch(()=>({}));
    if(!r.ok)throw Object.assign(new Error(d?.error?.message||'Engineering AI request failed.'),{status:r.status});
    return outputText(d);
  }finally{clearTimeout(timer)}
}

module.exports=async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='POST')return res.status(405).json({error:'POST only'});
  if(!authorized(req))return res.status(401).json({error:'Controlled engineering authorization failed.'});
  if(!process.env.OPENAI_API_KEY)return res.status(503).json({error:'Engineering AI model is unavailable.'});

  try{
    const body=typeof req.body==='string'?JSON.parse(req.body||'{}'):(req.body||{});
    const task=body.task&&typeof body.task==='object'?body.task:{};
    const job=body.job&&typeof body.job==='object'?body.job:{};
    const context=Array.isArray(body.context)?body.context.slice(0,18):[];
    const contextPaths=new Set(context.map(x=>String(x?.path||'').replace(/\\/g,'/')).filter(Boolean));
    if(!task.id||!job.id||!clean(task.title,200)||!contextPaths.size)return res.status(400).json({error:'Task, execution job, and repository context are required.'});

    const instructions=`You are the MW Dynasty controlled non-production engineering agent.
You are working ONLY on a disposable Git branch and preview environment. Production merge is forbidden.

Your job is to produce a minimal set of exact text replacements for the assigned engineering task.

HARD BOUNDARIES:
- Modify ONLY files explicitly present in REPOSITORY CONTEXT.
- Do not create new files.
- Do not touch .github, workflows, secrets, environment configuration, Vercel config, package manifests/lockfiles, Supabase migrations/functions, Founder OS, billing, payments, Stripe, account deletion, production authorization, or deployment configuration.
- Do not weaken authentication, authorization, RLS, privacy, athlete isolation, coach isolation, or security controls.
- Do not change official MW training methodology, prices, memberships, workout prescriptions, pace formulas, or program content unless the task explicitly requires a UI/state bug fix that preserves those values.
- Do not claim a test passed; tests happen after your patch in CI.
- Prefer the smallest change that resolves the defect and preserves existing design.
- If the supplied context is insufficient to safely implement the repair, return blocked_evidence with no edits.
- Each edit must identify an exact existing source string copied verbatim from REPOSITORY CONTEXT and its complete replacement.
- Keep each find string narrowly scoped but long enough to be unique. Do not use ellipses, placeholders, line numbers, regex, or invented surrounding code.
- Use no more than 6 edits and no more than 4 distinct files.
- Do not create, delete, rename, or chmod files.

Return JSON only:
{
  "disposition":"patch_ready|blocked_evidence",
  "summary":"what you changed or why blocked",
  "edits":[{"path":"existing/context/file","find":"exact source text","replace":"complete replacement text"}],
  "expected_behavior":["short verification points"],
  "risk_notes":["short risk notes"],
  "suggested_tests":["existing test commands or focused checks"]
}`;

    const ctx=context.map((x,i)=>`### CONTEXT ${i+1}: ${clean(x.path,300)}\n${clean(x.content,18000)}`).join('\n\n');
    const input=`EXECUTION JOB: ${clean(job.id,100)}
BRANCH: ${clean(job.branch_name,160)}
SCOPE: ${clean(job.execution_scope,100)}

TASK
Title: ${clean(task.title,260)}
Priority: ${clean(task.priority,40)}
Description:
${clean(task.description,7000)}

Task metadata:
${JSON.stringify(task.metadata||{}).slice(0,12000)}

REPOSITORY CONTEXT
${ctx}`;

    const raw=await openai(instructions,input,5200);
    let result;
    try{result=parseJson(raw)}catch{
      return res.status(200).json({ok:true,disposition:'blocked_evidence',summary:'Engineering model returned an unreadable edit response.',edits:[],expected_behavior:[],risk_notes:['No repository change was authorized.'],suggested_tests:[]});
    }

    const disposition=result?.disposition==='patch_ready'?'patch_ready':'blocked_evidence';
    const edits=Array.isArray(result?.edits)?result.edits.slice(0,7):[];
    if(disposition!=='patch_ready'||!edits.length){
      return res.status(200).json({
        ok:true,disposition:'blocked_evidence',summary:clean(result?.summary,4000)||'Repository context was insufficient for safe exact-code edits.',
        edits:[],expected_behavior:Array.isArray(result?.expected_behavior)?result.expected_behavior.slice(0,12):[],
        risk_notes:Array.isArray(result?.risk_notes)?result.risk_notes.slice(0,12):[],
        suggested_tests:Array.isArray(result?.suggested_tests)?result.suggested_tests.slice(0,12):[]
      });
    }
    if(edits.length>6)return res.status(422).json({error:'Engineering response exceeded the edit limit.'});
    const normalizedEdits=[];
    const paths=new Set();
    for(const edit of edits){
      if(!validEdit(edit,contextPaths))return res.status(422).json({error:'Engineering response attempted an invalid or unauthorized exact-code edit.'});
      const p=String(edit.path).replace(/\\/g,'/').replace(/^\.\//,'');
      paths.add(p);
      normalizedEdits.push({path:p,find:String(edit.find),replace:String(edit.replace??'')});
    }
    if(paths.size>4)return res.status(422).json({error:'Engineering response touched too many files.'});

    return res.status(200).json({
      ok:true,disposition:'patch_ready',summary:clean(result?.summary,4000),edits:normalizedEdits,
      changed_paths:[...paths],
      expected_behavior:Array.isArray(result?.expected_behavior)?result.expected_behavior.slice(0,12):[],
      risk_notes:Array.isArray(result?.risk_notes)?result.risk_notes.slice(0,12):[],
      suggested_tests:Array.isArray(result?.suggested_tests)?result.suggested_tests.slice(0,12):[],
      model:process.env.OPENAI_AUTONOMY_MODEL||process.env.OPENAI_MODEL||'gpt-5.6-sol'
    });
  }catch(e){
    return res.status(Number(e?.status)||500).json({error:e?.message||'Controlled engineering worker failed.'});
  }
};
