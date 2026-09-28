import fs from 'node:fs';
import path from 'node:path';
import {execFileSync,spawnSync} from 'node:child_process';

// Stage 2 execution control version 1
const EDGE='https://keqgunlfwhjgcsurynef.supabase.co/functions/v1/mw-founder-controlled-execution';
const PREVIEW='https://mwdynastyunifiedappv31tiered13plusdeploy-git-a-bab295-mw-sprint.vercel.app';
const ROOT=process.cwd();
const GH_REPO=process.env.GITHUB_REPOSITORY||'MWdynasty/mw-dynasty-unified-app';
const GH_TOKEN=process.env.GITHUB_TOKEN||'';

function log(msg){process.stdout.write(`[MW Stage 2] ${msg}\n`)}
function run(cmd,args=[],opts={}){
  return execFileSync(cmd,args,{cwd:ROOT,encoding:'utf8',stdio:['ignore','pipe','pipe'],...opts}).trim();
}
function sleep(ms){return new Promise(r=>setTimeout(r,ms))}
function safeText(v,max=6000){return String(v??'').slice(0,max)}
function normalized(p){return String(p||'').replace(/\\/g,'/').replace(/^\.\//,'')}
function isDenied(p,denied){
  return denied.some(d=>p===d||p.startsWith(d));
}
function isAllowed(p,allowed,denied){
  p=normalized(p);
  return !!p&&!p.startsWith('/')&&!p.includes('..')&&allowed.some(a=>p.startsWith(a))&&!isDenied(p,denied);
}
function patchPaths(patch){
  const out=new Set();
  for(const line of String(patch||'').split(/\r?\n/)){
    let m=line.match(/^diff --git a\/(.+?) b\/(.+)$/);
    if(m){out.add(normalized(m[1]));out.add(normalized(m[2]));continue}
    m=line.match(/^(?:---|\+\+\+) (?:a|b)\/(.+)$/);
    if(m)out.add(normalized(m[1]));
  }
  return [...out];
}
async function oidc(){
  const u=process.env.ACTIONS_ID_TOKEN_REQUEST_URL,t=process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN;
  if(!u||!t)throw new Error('GitHub OIDC environment is unavailable.');
  const join=u.includes('?')?'&':'?';
  const r=await fetch(`${u}${join}audience=mw-dynasty-stage2`,{headers:{Authorization:`bearer ${t}`}});
  const d=await r.json().catch(()=>({}));
  if(!r.ok||!d?.value)throw new Error(d?.message||'Could not obtain GitHub OIDC token.');
  return d.value;
}
async function edge(token,payload){
  const r=await fetch(EDGE,{
    method:'POST',
    headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},
    body:JSON.stringify(payload)
  });
  const d=await r.json().catch(()=>({}));
  if(!r.ok||d?.ok===false)throw new Error(d?.error||`Controlled execution gateway failed (${r.status})`);
  return d;
}
function tokensFor(task){
  const hints=Array.isArray(task?.metadata?.execution_context_hints)?task.metadata.execution_context_hints:[];
  const raw=[task?.title,task?.description,...hints].filter(Boolean).join(' ');
  const stop=new Set(['the','and','for','with','that','this','from','into','workout','athlete','repair','state','current','screen','conflicts','today']);
  const words=raw.toLowerCase().match(/[a-z0-9_'-]{3,}/g)||[];
  const uniq=[];
  for(const w of words){
    if(stop.has(w)||uniq.includes(w))continue;
    uniq.push(w);
    if(uniq.length>=22)break;
  }
  return {hints:hints.map(String),words:uniq};
}
function excerpt(content,terms,max=17500){
  if(content.length<=max)return content;
  const lines=content.split(/\r?\n/);
  const lower=lines.map(x=>x.toLowerCase());
  const ranked=[];
  for(let i=0;i<lines.length;i++){
    let score=0;
    for(let t=0;t<terms.length;t++){
      const term=String(terms[t]||'').toLowerCase();
      if(!term||!lower[i].includes(term))continue;
      score+=Math.max(2,40-t)+(term.includes(' ')?14:0)+(term.includes('_')||/[A-Z]/.test(String(terms[t]))?10:0);
    }
    if(score>0)ranked.push({i,score});
  }
  if(!ranked.length)return lines.slice(0,220).join('\n').slice(0,max);
  const hits=ranked.sort((a,b)=>b.score-a.score).slice(0,8).map(x=>x.i).sort((a,b)=>a-b);
  const ranges=[];
  for(const i of hits){
    const s=Math.max(0,i-32),e=Math.min(lines.length,i+44);
    const last=ranges[ranges.length-1];
    if(last&&s<=last[1]+8)last[1]=Math.max(last[1],e); else ranges.push([s,e]);
  }
  let out='';
  for(const [s,e] of ranges){
    const chunk=lines.slice(s,e).join('\n');
    const next=(out?out+'\n\n/* MW_CONTEXT_GAP */\n\n':'')+chunk;
    if(next.length>max)continue;
    out=next;
  }
  return (out||lines.slice(Math.max(0,hits[0]-45),Math.min(lines.length,hits[0]+90)).join('\n')).slice(0,max);
}
function buildContext(task,policy){
  const allowed=Array.isArray(policy?.allowed_prefixes)?policy.allowed_prefixes.map(String):[];
  const denied=Array.isArray(policy?.denied_paths)?policy.denied_paths.map(String):[];
  const files=run('git',['ls-files']).split(/\r?\n/).filter(Boolean).filter(p=>isAllowed(p,allowed,denied));
  const {hints,words}=tokensFor(task);
  const phraseTerms=[...hints.filter(x=>!x.includes('/')), 'renderCompletion','mwTodayTrackSessionNumber','workoutStatus','completion_status','unlockBadge','in progress','try again','track workout'];
  const scored=[];
  for(const p of files){
    let st;try{st=fs.statSync(path.join(ROOT,p))}catch{continue}
    if(!st.isFile()||st.size>900000)continue;
    if(!/\.(?:js|html|css|mjs|cjs)$/i.test(p))continue;
    let content;try{content=fs.readFileSync(path.join(ROOT,p),'utf8')}catch{continue}
    const lp=p.toLowerCase(),lc=content.toLowerCase();
    let score=0;
    if(hints.some(h=>normalized(h).toLowerCase()===lp))score+=100;
    for(const w of words){if(lp.includes(w))score+=8;const idx=lc.indexOf(w);if(idx>=0)score+=Math.min(14,2+(lc.split(w).length-1))}
    for(const ph of phraseTerms)if(ph&&lc.includes(ph.toLowerCase()))score+=24;
    if(score>0)scored.push({path:p,score,content});
  }
  scored.sort((a,b)=>b.score-a.score);
  const selected=scored.slice(0,12);
  if(!selected.length)throw new Error('No repository context matched the controlled execution task.');
  const terms=[...phraseTerms,...words].filter(Boolean).slice(0,30);
  return selected.map(x=>({path:x.path,content:excerpt(x.content,terms)}));
}
function validatePatch(patch,context,policy){
  if(!patch.startsWith('diff --git '))throw new Error('AI response did not contain a valid unified diff.');
  if(/GIT binary patch|new file mode|deleted file mode|rename from|rename to|old mode|new mode/.test(patch))throw new Error('Patch attempted an unsupported file operation.');
  if(/(?:---|\+\+\+) \/dev\/null/.test(patch))throw new Error('Patch attempted to create or delete a file.');
  const allowed=(policy?.allowed_prefixes||[]).map(String),denied=(policy?.denied_paths||[]).map(String);
  const contextPaths=new Set(context.map(x=>normalized(x.path)));
  const paths=patchPaths(patch);
  const maxFiles=Number(policy?.max_files||4);
  if(!paths.length||paths.length>maxFiles)throw new Error('Patch touched an invalid number of files.');
  for(const p of paths){
    if(!contextPaths.has(p))throw new Error(`Patch touched a file outside supplied context: ${p}`);
    if(!isAllowed(p,allowed,denied))throw new Error(`Patch touched a denied path: ${p}`);
  }
  return [...new Set(paths)];
}
async function github(endpoint,options={}){
  if(!GH_TOKEN)throw new Error('GITHUB_TOKEN is unavailable.');
  const r=await fetch(`https://api.github.com/repos/${GH_REPO}${endpoint}`,{
    ...options,
    headers:{Accept:'application/vnd.github+json',Authorization:`Bearer ${GH_TOKEN}`,'X-GitHub-Api-Version':'2022-11-28',...(options.headers||{})}
  });
  const d=await r.json().catch(()=>null);
  if(!r.ok)throw new Error(d?.message||`GitHub API failed (${r.status})`);
  return d;
}
async function ensureDraftPr(task,sha){
  try{
    const pulls=await github('/pulls?state=open&base=main&head=MWdynasty%3Aai-execution%2Fstage2&per_page=20');
    if(Array.isArray(pulls)&&pulls.length)return pulls[0]?.html_url||null;
    const title=`AI Stage 2 · ${safeText(task.title,120)}`;
    const body=[
      '## MW Dynasty controlled execution',
      '',
      'This draft PR was created by the Stage 2 non-production execution lane.',
      '',
      `Task: **${safeText(task.title,180)}**`,
      `Commit: \`${sha}\``,
      '',
      '- Automated repository tests must pass.',
      '- Vercel preview must match this commit.',
      '- Production merge is not authorized by this workflow.',
      '- Founder approval is required before production.'
    ].join('\n');
    const pr=await github('/pulls',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({title,head:'ai-execution/stage2',base:'main',body,draft:true})});
    return pr?.html_url||null;
  }catch(e){
    log(`Draft PR creation was unavailable: ${e.message}`);
    return null;
  }
}
async function waitForPreview(sha){
  for(let i=0;i<24;i++){
    try{
      const r=await fetch(`${PREVIEW}/api/build-info?mwqa=${Date.now()}`,{headers:{'cache-control':'no-cache'}});
      const d=await r.json().catch(()=>({}));
      if(r.ok&&String(d?.git_sha||'')===sha&&String(d?.git_ref||'')==='ai-execution/stage2')return d;
    }catch{}
    await sleep(10000);
  }
  throw new Error('Vercel preview did not reach the new commit within the QA window.');
}
async function smoke(){
  const paths=['/','/athlete/','/coach/'];
  const results=[];
  for(const p of paths){
    const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),20000);
    try{
      const r=await fetch(PREVIEW+p,{redirect:'follow',signal:ctl.signal,headers:{'cache-control':'no-cache'}});
      results.push({path:p,status:r.status,ok:r.status>=200&&r.status<400});
    }finally{clearTimeout(timer)}
  }
  if(results.some(x=>!x.ok))throw new Error('Preview smoke test failed: '+results.map(x=>`${x.path}=${x.status}`).join(', '));
  return results;
}

async function main(){
  const token=await oidc();
  const claim=await edge(token,{action:'claim'});
  if(!claim?.job||!claim?.task){log('No controlled engineering task is eligible.');return}
  const {job,task,policy}=claim;
  log(`Claimed ${task.title} (${job.id})`);
  try{
    const context=buildContext(task,policy);
    log(`Prepared ${context.length} constrained repository context file(s).`);
    const generated=await edge(token,{action:'generate_patch',job_id:job.id,context});
    if(generated?.disposition!=='patch_ready'||!generated?.patch){
      log('Engineering worker blocked itself on insufficient evidence.');
      return;
    }

    const changed=validatePatch(generated.patch,context,policy);
    fs.writeFileSync('/tmp/mw-stage2.patch',generated.patch,'utf8');
    run('git',['apply','--check','/tmp/mw-stage2.patch']);
    run('git',['apply','/tmp/mw-stage2.patch']);
    run('git',['diff','--check']);

    const actual=run('git',['diff','--name-only']).split(/\r?\n/).filter(Boolean);
    if(actual.length!==changed.length||actual.some(p=>!changed.includes(p)))throw new Error('Applied changes did not match the approved patch file set.');

    await edge(token,{action:'evidence',job_id:job.id,state:'testing',evidence:{summary:'Patch applied in isolated GitHub Actions workspace.',changed_files:actual}});

    for(const p of actual.filter(x=>/\.(?:js|mjs|cjs)$/i.test(x)))run('node',['--check',p]);
    const test=spawnSync('npm',['test'],{cwd:ROOT,encoding:'utf8',timeout:12*60*1000,maxBuffer:12*1024*1024});
    const testOut=safeText((test.stdout||'')+'\n'+(test.stderr||''),7000);
    if(test.status!==0)throw new Error('npm test failed. '+safeText(testOut,3500));

    run('git',['config','user.name','MW Dynasty AI Engineer']);
    run('git',['config','user.email','ai-engineer@mwdynasty.local']);
    run('git',['add','--',...actual]);
    run('git',['commit','-m',`AI Stage 2: ${safeText(task.title,120)}`]);
    const sha=run('git',['rev-parse','HEAD']);
    run('git',['push','origin','HEAD:ai-execution/stage2']);

    await edge(token,{action:'evidence',job_id:job.id,state:'committed',evidence:{
      summary:'Controlled patch committed to isolated Stage 2 branch.',
      commit_sha:sha,changed_files:actual,
      test_summary:'npm test passed before push. '+safeText(testOut,2200)
    }});
    log(`Committed ${sha.slice(0,12)} and pushed Stage 2 branch.`);

    await waitForPreview(sha);
    await edge(token,{action:'evidence',job_id:job.id,state:'preview_ready',evidence:{
      summary:'Vercel preview is serving the exact controlled execution commit.',
      commit_sha:sha,preview_url:PREVIEW,changed_files:actual
    }});

    const smokeResults=await smoke();
    const prUrl=await ensureDraftPr(task,sha);
    const qa=`Repository regression suite passed; preview commit identity matched ${sha}; smoke checks passed: ${smokeResults.map(x=>x.path+' '+x.status).join(', ')}.`;
    await edge(token,{action:'evidence',job_id:job.id,state:'qa_passed',evidence:{
      summary:'Controlled execution passed non-production QA and is waiting for Founder approval.',
      commit_sha:sha,preview_url:PREVIEW,changed_files:actual,
      test_summary:'npm test passed.',
      qa_summary:qa,
      pull_request_url:prUrl||null,
      engineering_summary:safeText(generated.summary,3500),
      risk_notes:Array.isArray(generated.risk_notes)?generated.risk_notes.slice(0,12):[]
    }});
    log('QA passed. Production remains gated behind Founder approval.');
  }catch(e){
    const message=e instanceof Error?e.message:String(e);
    log(`FAILED: ${message}`);
    try{await edge(token,{action:'evidence',job_id:job.id,state:'failed',evidence:{summary:'Controlled execution failed before Founder approval.',error:safeText(message,5000)}})}catch{}
    process.exitCode=1;
  }
}
await main();
