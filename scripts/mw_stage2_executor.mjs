import fs from 'node:fs';
import path from 'node:path';
import {execFileSync,spawnSync} from 'node:child_process';

// Stage 2 execution control version 5
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
function countExact(haystack,needle){
  if(!needle)return 0;
  let count=0,pos=0;
  while((pos=haystack.indexOf(needle,pos))>=0){count++;pos+=Math.max(1,needle.length)}
  return count;
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
function anchoredSegments(content,anchors,max=7600){
  const lines=content.split(/\r?\n/),lower=lines.map(x=>x.toLowerCase()),seen=[];
  const out=[];
  for(const raw of anchors){
    const anchor=String(raw||'').trim();
    if(!anchor||anchor.includes('/'))continue;
    const a=anchor.toLowerCase();
    const i=lower.findIndex(x=>x.includes(a));
    if(i<0||seen.some(x=>Math.abs(x-i)<18))continue;
    seen.push(i);
    const s=Math.max(0,i-52),e=Math.min(lines.length,i+76);
    out.push(lines.slice(s,e).join('\n').slice(0,max));
    if(out.length>=10)break;
  }
  return out;
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
  const selected=scored.slice(0,8);
  if(!selected.length)throw new Error('No repository context matched the controlled execution task.');
  const terms=[...phraseTerms,...words].filter(Boolean).slice(0,30);
  const context=[];
  for(const x of selected){
    const exactFileHint=hints.some(h=>normalized(h).toLowerCase()===x.path.toLowerCase());
    const segments=exactFileHint?anchoredSegments(x.content,phraseTerms):[];
    if(segments.length){
      for(const segment of segments)context.push({path:x.path,content:segment});
    }else{
      context.push({path:x.path,content:excerpt(x.content,terms)});
    }
    if(context.length>=16)break;
  }
  return context.slice(0,16);
}
function validateAndApplyEdits(edits,context,policy){
  if(!Array.isArray(edits)||!edits.length||edits.length>6)throw new Error('Engineering response had an invalid number of exact-code edits.');
  const allowed=(policy?.allowed_prefixes||[]).map(String),denied=(policy?.denied_paths||[]).map(String);
  const contextPaths=new Set(context.map(x=>normalized(x.path)));
  const maxFiles=Number(policy?.max_files||4);
  const paths=[...new Set(edits.map(x=>normalized(x?.path)).filter(Boolean))];
  if(!paths.length||paths.length>maxFiles)throw new Error('Engineering edits touched an invalid number of files.');
  for(const p of paths){
    if(!contextPaths.has(p))throw new Error(`Edit touched a file outside supplied context: ${p}`);
    if(!isAllowed(p,allowed,denied))throw new Error(`Edit touched a denied path: ${p}`);
  }
  const originals=new Map(),working=new Map();
  for(const p of paths){
    const content=fs.readFileSync(path.join(ROOT,p),'utf8');
    originals.set(p,content);working.set(p,content);
  }
  for(const edit of edits){
    const p=normalized(edit?.path),find=String(edit?.find||''),replace=String(edit?.replace??'');
    if(find.length<8||find.length>18000||replace.length>24000)throw new Error(`Edit for ${p} exceeded exact-code size limits.`);
    const content=working.get(p),occurrences=countExact(content,find);
    if(occurrences!==1)throw new Error(`Exact source block for ${p} matched ${occurrences} times; refusing ambiguous edit.`);
    working.set(p,content.replace(find,replace));
  }
  for(const p of paths){
    const before=originals.get(p),after=working.get(p);
    if(before===after)throw new Error(`Engineering edit made no change to ${p}.`);
    if(Math.abs(after.length-before.length)>30000)throw new Error(`Engineering edit changed too much content in ${p}.`);
    fs.writeFileSync(path.join(ROOT,p),after,'utf8');
  }
  run('git',['diff','--check']);
  const numstat=run('git',['diff','--numstat']).split(/\r?\n/).filter(Boolean);
  let changedLines=0;
  for(const line of numstat){
    const [a,d]=line.split(/\s+/);
    if(a==='-'||d==='-')throw new Error('Binary changes are not allowed.');
    changedLines+=(Number(a)||0)+(Number(d)||0);
  }
  if(changedLines>260)throw new Error(`Engineering edit changed ${changedLines} lines; Stage 2 limit is 260.`);
  return paths;
}

function suiteCommands(){
  const pkg=JSON.parse(fs.readFileSync(path.join(ROOT,'package.json'),'utf8'));
  const script=String(pkg?.scripts?.test||'');
  return script.split('&&').map(x=>x.trim()).map(cmd=>{
    const m=cmd.match(/^node\s+([^\s]+\.js)(?:\s+.*)?$/);
    return m?m[1]:null;
  }).filter(Boolean);
}
function failureSignature(output){
  const text=String(output||'').replace(/\r/g,'');
  const lines=text.split('\n').map(x=>x.trim()).filter(Boolean);
  const err=lines.find(x=>/^(?:AssertionError|ReferenceError|TypeError|SyntaxError|RangeError|Error):/.test(x))
    ||lines.find(x=>/(?:AssertionError|ReferenceError|TypeError|SyntaxError|RangeError|Error):/.test(x))
    ||lines.slice(-1)[0]||'unknown failure';
  const frame=lines.find(x=>/test-[A-Za-z0-9_.-]+\.js:\d+/.test(x))||'';
  const file=(frame.match(/(test-[A-Za-z0-9_.-]+\.js):\d+/)||[])[1]||'';
  return (err+'|'+file).slice(0,900);
}
function runSuiteIndependently(){
  const commands=suiteCommands();
  if(!commands.length)throw new Error('No Node test files could be resolved from npm test.');
  return commands.map(file=>{
    const r=spawnSync('node',[file],{cwd:ROOT,encoding:'utf8',timeout:4*60*1000,maxBuffer:8*1024*1024});
    const output=safeText((r.stdout||'')+'\n'+(r.stderr||''),9000);
    return {file,ok:r.status===0,status:r.status,signature:r.status===0?'PASS':failureSignature(output),output};
  });
}
function compareSuites(before,after){
  const byFile=new Map(after.map(x=>[x.file,x]));
  const regressions=[],baselineFailures=[],improvements=[];
  for(const b of before){
    const a=byFile.get(b.file);
    if(!a){regressions.push(b.file+': missing after-change result');continue}
    if(b.ok&&!a.ok){regressions.push(b.file+': '+a.signature);continue}
    if(!b.ok&&a.ok){improvements.push(b.file);continue}
    if(!b.ok&&!a.ok){
      if(b.signature!==a.signature)regressions.push(b.file+': failure changed from '+b.signature+' to '+a.signature);
      else baselineFailures.push(b.file+': '+b.signature);
    }
  }
  for(const a of after)if(!before.some(b=>b.file===a.file))regressions.push(a.file+': new test command appeared during edit');
  return {regressions,baselineFailures,improvements,passedAfter:after.filter(x=>x.ok).length,total:after.length};
}
function checkChangedSyntax(files){
  let htmlScripts=0;
  for(const p of files){
    if(/\.(?:js|mjs|cjs)$/i.test(p)){run('node',['--check',p]);continue}
    if(/\.html$/i.test(p)){
      const html=fs.readFileSync(path.join(ROOT,p),'utf8');
      const scripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(x=>x[1]).filter(x=>x.trim());
      for(let i=0;i<scripts.length;i++){
        const tmp=`/tmp/mw-stage2-inline-${htmlScripts++}.js`;
        fs.writeFileSync(tmp,scripts[i],'utf8');
        run('node',['--check',tmp],{cwd:ROOT});
      }
    }
  }
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
  for(let i=0;i<30;i++){
    try{
      const d=await github(`/commits/${encodeURIComponent(sha)}/status`);
      const statuses=Array.isArray(d?.statuses)?d.statuses:[];
      const vercel=statuses.find(x=>String(x?.context||'').toLowerCase()==='vercel');
      if(vercel?.state==='success'){
        return {state:'success',target_url:vercel.target_url||null,description:vercel.description||'Deployment has completed'};
      }
      if(vercel&&['failure','error'].includes(String(vercel.state||''))){
        throw new Error('Vercel reported a failed deployment for the controlled execution commit.');
      }
    }catch(e){
      if(String(e?.message||'').includes('Vercel reported a failed deployment'))throw e;
    }
    await sleep(10000);
  }
  throw new Error('Vercel did not report deployment success for the controlled execution commit within the QA window.');
}
function verifyLocalRouteContract(){
  const required=['index.html','athlete/index.html','coach/index.html'];
  const missing=required.filter(p=>!fs.existsSync(path.join(ROOT,p)));
  if(missing.length)throw new Error('Preview route contract is missing required entry files: '+missing.join(', '));
  return required;
}
async function previewProtectionProbe(){
  const paths=['/','/athlete/','/coach/'];
  const results=[];
  for(const p of paths){
    const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),20000);
    try{
      const r=await fetch(PREVIEW+p,{redirect:'manual',signal:ctl.signal,headers:{'cache-control':'no-cache'}});
      const location=String(r.headers.get('location')||'');
      const protectedByVercel=r.status===302&&location.includes('vercel.com/sso-api');
      const directlyReachable=r.status>=200&&r.status<400&&!protectedByVercel;
      results.push({path:p,status:r.status,protected:protectedByVercel,reachable:directlyReachable});
    }finally{clearTimeout(timer)}
  }
  if(results.some(x=>!x.protected&&!x.reachable)){
    throw new Error('Preview front-door probe failed: '+results.map(x=>`${x.path}=${x.status}`).join(', '));
  }
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
    const baselineSuite=runSuiteIndependently();
    log(`Captured baseline regression state: ${baselineSuite.filter(x=>x.ok).length}/${baselineSuite.length} tests passing.`);
    const generated=await edge(token,{action:'generate_patch',job_id:job.id,context});
    if(generated?.disposition!=='patch_ready'){
      log('Engineering worker blocked itself on insufficient evidence.');
      return;
    }
    if(!Array.isArray(generated?.edits)||!generated.edits.length){
      throw new Error('Engineering worker returned patch_ready without exact edits; refusing to leave the job in a false-ready state.');
    }

    const changed=validateAndApplyEdits(generated.edits,context,policy);
    const actual=run('git',['diff','--name-only']).split(/\r?\n/).filter(Boolean);
    if(actual.length!==changed.length||actual.some(p=>!changed.includes(p)))throw new Error('Applied changes did not match the approved patch file set.');

    await edge(token,{action:'evidence',job_id:job.id,state:'testing',evidence:{summary:'Exact-code edits applied in isolated GitHub Actions workspace.',changed_files:actual}});

    checkChangedSyntax(actual);
    const afterSuite=runSuiteIndependently();
    const comparison=compareSuites(baselineSuite,afterSuite);
    if(comparison.regressions.length)throw new Error('Regression gate failed: '+comparison.regressions.join(' | '));
    const testSummary=[
      `Independent regression suite: ${comparison.passedAfter}/${comparison.total} tests pass after the edit.`,
      comparison.baselineFailures.length?`Pre-existing unchanged failures: ${comparison.baselineFailures.join(' | ')}`:'No baseline test failures remained.',
      comparison.improvements.length?`Improved baseline tests: ${comparison.improvements.join(', ')}`:''
    ].filter(Boolean).join(' ');
    await edge(token,{action:'evidence',job_id:job.id,state:'testing',evidence:{
      summary:'Exact-code edits passed the baseline-vs-after regression comparison.',
      changed_files:actual,test_summary:testSummary
    }});

    run('git',['config','user.name','MW Dynasty AI Engineer']);
    run('git',['config','user.email','ai-engineer@mwdynasty.local']);
    run('git',['add','--',...actual]);
    run('git',['commit','-m',`AI Stage 2: ${safeText(task.title,120)}`]);

    // The preview branch can receive isolation/config maintenance while a job is testing.
    // Never force-push: reconcile the remote head, rebase the tested commit, then push fast-forward only.
    run('git',['fetch','origin','ai-execution/stage2']);
    run('git',['rebase','origin/ai-execution/stage2']);
    const sha=run('git',['rev-parse','HEAD']);
    try{
      run('git',['push','origin','HEAD:ai-execution/stage2']);
    }catch(firstPushError){
      run('git',['fetch','origin','ai-execution/stage2']);
      run('git',['rebase','origin/ai-execution/stage2']);
      run('git',['push','origin','HEAD:ai-execution/stage2']);
    }

    const pushedSha=run('git',['rev-parse','HEAD']);
    await edge(token,{action:'evidence',job_id:job.id,state:'committed',evidence:{
      summary:'Controlled patch committed to isolated Stage 2 branch.',
      commit_sha:pushedSha,changed_files:actual,
      test_summary:testSummary
    }});
    log(`Committed ${pushedSha.slice(0,12)} and pushed Stage 2 branch.`);

    const deployment=await waitForPreview(pushedSha);
    const routeFiles=verifyLocalRouteContract();
    const protectionResults=await previewProtectionProbe();
    await edge(token,{action:'evidence',job_id:job.id,state:'preview_ready',evidence:{
      summary:'Vercel reported deployment success for the exact controlled execution commit; preview access protection remains intact.',
      commit_sha:pushedSha,preview_url:PREVIEW,changed_files:actual,
      vercel_status:deployment,route_contract:routeFiles,preview_protection:protectionResults
    }});

    const prUrl=await ensureDraftPr(task,pushedSha);
    const qa=`Regression comparison found no new test failures; Vercel reported deployment success for exact commit ${pushedSha}; local route contract is intact; preview front door remained protected: ${protectionResults.map(x=>x.path+' '+x.status+(x.protected?' protected':' reachable')).join(', ')}.`;
    await edge(token,{action:'evidence',job_id:job.id,state:'qa_passed',evidence:{
      summary:'Controlled execution passed non-production QA and is waiting for Founder approval.',
      commit_sha:pushedSha,preview_url:PREVIEW,changed_files:actual,
      test_summary:testSummary,
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
