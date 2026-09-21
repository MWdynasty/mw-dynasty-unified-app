const app=document.getElementById('app');
const SUPABASE_URL='https://keqgunlfwhjgcsurynef.supabase.co';
const SUPABASE_KEY='sb_publishable_JWCLQzrdWA_ZmvbpV5urVg_rcT6NECm';
const SESSION_KEY='mwCoachSupabaseSession';
const MW_APP_VERSION='3.0.16';
const MW_IOS_BUILD='13';
let authSession=null;
let accountAccess={role:null,tier:null,isFounder:false,firstName:'',lastName:'',organization:'',coachTitle:'',email:''};
function coachTransient(error,status=0){return !navigator.onLine||error?.mwTransient===true||window.MWResilience?.isTransientStatus?.(status)===true||window.MWResilience?.isTransientError?.(error)===true}
function coachAccessError(message,status=0){const e=new Error(message);e.status=status;e.mwTransient=window.MWResilience?.isTransientStatus?.(status)===true;return e}

const PLANS={
 core:{name:'MW Coach Core',theme:'',title:'MW COACH CORE',tag:'MANAGE. ORGANIZE. COACH.',sub:'Bring Your Own Program — Built for Coaches.',side:'COACH\nCORE',footer:'BUILD\nDEVELOP\nCOMPETE',planCode:'coach_core',monthly:49,sponsor:5},
 intelligence:{name:'MW Coach Intelligence',theme:'blue',title:'MW COACH INTELLIGENCE',tag:'YOUR PROGRAM. AMPLIFIED.',sub:'Bring Your Own Program + Full AI Intelligence.',side:'COACH\nINTELLIGENCE',footer:'DATA\nINTELLIGENCE\nRESULTS',planCode:'coach_intelligence',monthly:79,sponsor:6},
 performance:{name:'MW Sprint Performance System',theme:'gold',title:'MW SPRINT PERFORMANCE SYSTEM',tag:'PROVEN SPEED. A STRONGER FUTURE.',sub:'Complete MW System + Full AI Intelligence.',side:'PERFORMANCE\nSYSTEM',footer:'SPEED\nINTELLIGENCE\nLEGACY',planCode:'mw_sprint_performance',monthly:109,sponsor:7}
};
let pricingCatalogLoaded=false;
function centsToDollars(cents,fallback){const n=Number(cents);return Number.isFinite(n)?n/100:fallback}
async function loadPricingCatalog(){
  try{
    const r=await fetch('/api/pricing',{cache:'no-store'}),d=await r.json().catch(()=>({}));
    if(!r.ok||!Array.isArray(d.plans))throw new Error(d.error||'Pricing lookup failed');
    const byCode=new Map(d.plans.map(p=>[p.plan_code,p]));
    for(const p of Object.values(PLANS)){
      const live=byCode.get(p.planCode);if(!live)continue;
      p.monthly=centsToDollars(live.monthly_price_cents,p.monthly);
      p.sponsor=centsToDollars(live.sponsored_athlete_price_cents,p.sponsor);
    }
    pricingCatalogLoaded=true;
    return d.plans;
  }catch(e){console.warn('MW pricing catalog unavailable; using built-in locked fallback prices.',e);return null}
}
let experience='core';
const nav={
 core:[['dashboard','⌂','Home'],['athletes','♟','Team'],['programs','🏃','Training'],['calendar','📅','Calendar'],['messages','✉','Messages'],['account','⚙','Profile']],
 intelligence:[['dashboard','⌂','Home'],['athletes','♟','Team'],['coachmw','MW','Coach MW'],['calendar','📅','Calendar'],['messages','✉','Messages'],['account','⚙','Profile']],
 performance:[['dashboard','⌂','Home'],['athletes','♟','Team'],['coachmw','MW','Coach MW'],['calendar','📅','Calendar'],['messages','✉','Messages'],['account','⚙','Profile']]
};
function sideNav(){const items=[...nav[experience]],artById={dashboard:'mwNavHome',athletes:'mwNavProfile',programs:'mwNavTrain',coachmw:'mwNavTrain',messages:'mwNavProgram',account:'mwNavCoach'};return items.map(([id,ic,label])=>`<button class="nav-btn ${id==='dashboard'?'active':''}" data-page="${id}">${id==='calendar'?'<span class="nav-icon mwCalendarNav" aria-hidden="true">📅</span>':`<span class="nav-icon mwNavArt ${artById[id]||''}" aria-hidden="true"></span>`}<span>${label}</span></button>`).join('')}
function shell(content){const p=PLANS[experience],coachName=[accountAccess.firstName,accountAccess.lastName].filter(Boolean).join(' ')||'MW Coach',defaultRole=accountAccess.isFounder?'Founder / Coach':accountAccess.role==='admin'?'MW Administrator':'Coach',coachRole=accountAccess.coachTitle||defaultRole,coachMeta=[coachRole,accountAccess.organization].filter(Boolean).join(' · '),profileNudge=accountAccess.role==='coach'&&(!accountAccess.organization||!accountAccess.coachTitle)?`<div class="tile mw-profile-nudge"><div><div class="eyebrow">COACH PROFILE</div><b>Complete your coaching identity</b><p>Add your school / organization and coaching title so athletes know exactly who is coaching them.</p></div><button class="action" data-page="account">Complete Profile</button></div>`:'';app.innerHTML=`<div class="app ${p.theme}"><div class="top-ribbon"><span>THREE PLATFORMS. ONE ECOSYSTEM.</span><span>${experience==='performance'?'SAME FOUNDATION. DIFFERENT POWER.':'GREATER ATHLETES. BETTER COACHES. A STRONGER FUTURE.'}</span></div><div class="frame"><header class="brand-head"><div class="brand-title">${p.title}</div><div class="brand-tag">${p.tag}</div><div class="brand-sub">${p.sub}</div></header><div class="workspace"><aside class="sidebar"><div class="side-brand-row"><div class="side-logo"><span class="mw-mark">MW</span><span>${p.side.replace('\n','<br>')}</span></div><button class="mobile-menu" id="mobileMenu" type="button" aria-expanded="false" aria-controls="sideNav">Menu</button></div><nav class="side-nav" id="sideNav">${sideNav()}</nav><div class="side-account"><button class="coach-row coach-profile-entry" data-page="account" type="button" aria-label="Open Coach profile"><span class="avatar coach-initials" aria-hidden="true">${escapeHtml(((accountAccess.firstName?.[0]||'M')+(accountAccess.lastName?.[0]||'W')).toUpperCase())}</span><span class="coach-profile-copy"><span class="coach-name">${escapeHtml(coachName)}</span><span class="coach-role">${escapeHtml(coachMeta)}</span></span></button><button class="signout" id="signout">Sign Out</button></div></aside><main class="main">${profileNudge}${content}</main></div><footer class="footer"><div class="footer-brand">MW DYNASTY</div><div class="footer-mid">GREATER ATHLETES. BETTER COACHES. A STRONGER FUTURE.</div><div class="footer-right">${p.footer}</div></footer></div></div>`; bindGlobal();hydrateLiveAthleteCount();}
function topbar(placeholder){return `<div class="topbar"><div class="mw-search-wrap"><label class="search">⌕<input id="dashSearch" autocomplete="off" placeholder="${placeholder}"></label><div id="dashSearchResults" class="mw-search-results" hidden></div></div><button class="icon-btn mw-notification-btn" id="notificationBell" type="button" aria-label="Notifications">🔔<span id="notificationBadge" class="mw-notification-badge" hidden>0</span></button></div>`}
function stats(items){return `<div class="stats">${items.map(([n,l])=>`<button class="stat" data-stat="${l}"><b>${n}</b><span>${l}</span></button>`).join('')}</div>`}
function athleteStatusClassify(a){
  const now=Date.now();
  const last=a?.last_completed_workout_at?new Date(a.last_completed_workout_at).getTime():0;
  const days=last?Math.max(0,(now-last)/86400000):null;
  const hasPr=Array.isArray(a?.prs)&&a.prs.length>0;
  const explicit=String(a?.status||'').toLowerCase();
  const reasons=[];
  let level='ontrack';
  const perf=a?.performance||null,perfFlags=Array.isArray(perf?.flags)?perf.flags:[],latest=perf?.sprint?.latest||null;
  if(perfFlags.some(f=>f.level==='attention')){level='attention';reasons.push(perfFlags.find(f=>f.level==='attention')?.message||'Performance execution needs review')}
  else if(perfFlags.some(f=>f.level==='watch')){level='watch';reasons.push(perfFlags.find(f=>f.level==='watch')?.message||'Performance trend worth watching')}
  else if(latest?.execution_score_pct!=null){reasons.push(`${latest.execution_score_pct}% pace execution in latest check-in`)}
  if(days!==null&&days>14){level='attention';reasons.push(`No recorded workout in ${Math.floor(days)} days`)}
  else if(days===null){if(level==='ontrack')level='watch';reasons.push('No completed workout recorded yet')}
  else if(days>7){if(level==='ontrack')level='watch';reasons.push(`Last workout ${Math.floor(days)} days ago`)}
  if(!hasPr){if(level==='ontrack')level='watch';reasons.push('PR data incomplete')}
  if(/attention|at risk|behind|inactive/.test(explicit)){level='attention';reasons.unshift(a.status)}
  else if(/watch|monitor|review/.test(explicit)&&level!=='attention'){level='watch';reasons.unshift(a.status)}
  if(!reasons.length)reasons.push('Training activity and athlete data are current');
  return {level,reasons:[...new Set(reasons)]};
}
function athleteStatusLabel(level){return level==='attention'?'Needs Attention':level==='watch'?'Watch':'On Track'}
function athleteStatusBoardShell(){return `<section class="section athlete-status-section"><div class="section-head"><div><div class="status-kicker">LIVE ROSTER INTELLIGENCE</div><h2>Athlete Status Board</h2><p class="status-subcopy">See who is on track, who to watch, and who needs your attention.</p></div><button class="link-btn" data-page="athletes">View Athletes →</button></div><div id="athleteStatusBoard" class="athlete-status-board"><div class="tile">Analyzing live athlete status…</div></div></section>`}
async function hydrateAthleteStatusBoard(){
  const el=document.getElementById('athleteStatusBoard');if(!el)return;
  try{
    const [d,p]=await Promise.all([fetchCoachRoster(),fetchCoachPerformance().catch(()=>({athletes:[]}))]),athletes=Array.isArray(d.athletes)?d.athletes:[],perfMap=new Map((p.athletes||[]).map(x=>[x.athlete_id,x]));
    const groups={ontrack:[],watch:[],attention:[]};
    for(const raw of athletes){const a={...raw,performance:perfMap.get(raw.id)||null},c=athleteStatusClassify(a);groups[c.level].push({...a,_status:c})}
    const summary=`<div class="status-summary"><div class="status-summary-card ontrack"><span class="status-dot"></span><b>${groups.ontrack.length}</b><small>On Track</small></div><div class="status-summary-card watch"><span class="status-dot"></span><b>${groups.watch.length}</b><small>Watch</small></div><div class="status-summary-card attention"><span class="status-dot"></span><b>${groups.attention.length}</b><small>Needs Attention</small></div></div>`;
    const ordered=[...groups.attention,...groups.watch,...groups.ontrack];
    const cards=ordered.slice(0,12).map(a=>{const level=a._status.level;const reason=a._status.reasons[0];const event=a.event||a.primary_event||'Event not set';const week=Number(a.current_week||1);const acc=a.performance?.sprint?.latest?.execution_score_pct;return `<button class="athlete-status-card ${level}" data-athlete-id="${escapeHtml(a.id)}"><div class="athlete-status-top"><span class="status-pill ${level}"><span class="status-dot"></span>${athleteStatusLabel(level)}</span><span class="athlete-status-week">WEEK ${week}</span></div><h3>${escapeHtml(a.name||'Athlete')}</h3><p>${escapeHtml(event)}</p><div class="athlete-status-reason">${escapeHtml(reason)}</div><div class="athlete-status-foot"><span>${acc!=null?`Pace execution ${acc}%`:a.last_completed_workout_at?`Last workout ${escapeHtml(fmtDate(a.last_completed_workout_at))}`:'No performance data yet'}</span><span>Open →</span></div></button>`}).join('');
    el.innerHTML=summary+(cards?`<div class="athlete-status-grid">${cards}</div>`:`<div class="tile"><h3>No athletes connected yet</h3><p>Connect athletes to activate roster intelligence.</p></div>`);
    el.querySelectorAll('[data-athlete-id]').forEach(b=>b.onclick=()=>athleteDetail(b.dataset.athleteId));
  }catch(e){el.innerHTML=`<div class="tile"><h3>Status board unavailable</h3><p>${escapeHtml(e.message)}</p></div>`}
}
function coachPhaseName(phase){return ({1:'Foundation',2:'Strength & Speed Development',3:'Power / Pre-Competition',4:'Competition',5:'Peak / Championship'})[Number(phase)]||'MW Progression'}
function coachTrainingYearShell(){return `<button type="button" class="coach-training-year-card" data-page="account"><span class="coach-training-year-icon">▣</span><span class="coach-training-year-copy"><small id="coachTrainingYearLabel">MW TRAINING YEAR</small><b id="coachTrainingYearMain">Loading your training calendar…</b><span id="coachTrainingYearSub">Standard calendar + coach-controlled placement</span></span><span class="coach-training-year-arrow">→</span></button>`}
async function hydrateCoachTrainingYearCard(){
  const label=document.getElementById('coachTrainingYearLabel'),main=document.getElementById('coachTrainingYearMain'),sub=document.getElementById('coachTrainingYearSub');if(!main)return;
  try{
    const cal=await coachSeasonCalendarRequest();const custom=cal?.mode==='custom';
    if(label)label.textContent=custom?'CUSTOM TRAINING CALENDAR':'MW STANDARD TRAINING YEAR';
    if(cal?.status==='active')main.textContent=`Week ${cal.week} of 41 · ${coachPhaseName(cal.phase)}`;
    else if(cal?.status==='preseason')main.textContent='Preseason · Week 1 begins on your training-year start';
    else main.textContent='Between 41-week cycles · Foundation entry protected';
    if(sub)sub.textContent=custom?'Assigned athletes inherit your coach calendar and placement.':'Standard Week 1 begins the day after Labor Day · late joiners use Smart Entry.';
  }catch(e){main.textContent='Training calendar unavailable';if(sub)sub.textContent='Open Account to review the MW training-year setting.'}
}
function simpleCoachHome(primaryPage,primaryLabel,showIntel=false){
  const coachMW=experience==='core'?'':`<button data-page="coachmw"><b>MW</b><span>COACH MW<small>Ask your coaching assistant</small></span></button>`;
  const attention=showIntel?athleteStatusBoardShell():'';
  shell(`${topbar('Search your team...')}
  <section class="coach-command-head">
    <div><span class="status-kicker">COACH HOME</span><h1>What needs your attention?</h1><p>Your team, today’s work, messages, and coaching tools in one place.</p></div>
    <button class="action" data-page="practice">START PRACTICE</button>
  </section>
  ${stats([['—','Athletes']])}
  ${attention}
  <section class="simple-start coach-home-actions"><div><span class="status-kicker">QUICK ACTIONS</span><h2>Coach your team</h2></div><div class="simple-actions">
    <button data-page="athletes"><b>👥</b><span>TEAM<small>Roster, progress, attendance & notes</small></span></button>
    <button data-page="${primaryPage}"><b>🏃</b><span>${primaryLabel}<small>Open today’s training</small></span></button>
    <button data-page="messages"><b>✉</b><span>MESSAGES<small>Talk with your athletes</small></span></button>
    ${coachMW}
  </div></section>
  ${coachTrainingYearShell()}`);
}
async function practiceModePage(){
  pageBase('Practice Mode','Run groups, capture finish times, and save the session without leaving the track.',`
    <div class="practice-mode-head"><div><span class="status-kicker">GROUP TIMING</span><h2 id="practiceClock">00.00</h2><small id="practiceClockState">Ready for Rep 1</small></div><div class="practice-timer-actions"><button class="action" id="practiceTimerStart">START REP</button><button class="back" id="practiceTimerReset">RESET</button></div></div>
    <div class="practice-group-tabs" id="practiceGroupTabs"><button class="active" data-practice-group="all">ALL</button><button data-practice-group="boys">BOYS</button><button data-practice-group="girls">GIRLS</button></div>
    <div class="tile" style="margin-top:14px"><div class="practice-group-tools"><label>Group<select id="practiceEventGroup"><option value="All Sprinters">All Sprinters</option><option value="100 / 200">100 / 200</option><option value="400">400</option><option value="Development">Development</option><option value="Varsity">Varsity</option><option value="Relays">Relays</option></select></label><label>Target Time (optional)<input id="practiceTarget" type="number" min=".01" step=".01" inputmode="decimal" placeholder="e.g. 12.50"></label></div><small>BOYS/GIRLS assignments are saved on this device. Tap an athlete's group badge to change it.</small></div>
    <div class="tile" style="margin-top:14px"><div class="practice-finish-head"><div><h3>Finish Line</h3><p>Start the rep, then tap each athlete as they cross.</p></div><b id="practiceRepLabel">REP 1</b></div><div id="practiceTimingRoster" class="practice-timing-grid"><div class="row">Loading athletes…</div></div><div class="practice-next-actions"><button class="action" id="practiceNextRep" disabled>NEXT REP</button><button class="back" id="practiceFinishSession" disabled>FINISH & SAVE</button></div><div id="practiceTimingState"></div></div>
    <div class="panel-grid" style="margin-top:14px"><button class="tile practice-launch" id="practiceTraining"><h3>🏃 Today’s Training</h3><p>${experience==='performance'?'Open the MW Sprint Performance workout.':'Open your coaching program.'}</p><b>OPEN →</b></button><button class="tile practice-launch mw-coach-launch" id="practiceCoachMW" ${experience==='core'?'style="display:none"':''}><h3><span class="mw-coach-crest" aria-hidden="true">MW</span> Coach MW</h3><p>Ask a quick coaching question.</p><b>OPEN →</b></button></div>
    <div class="tile" style="margin-top:14px"><div style="display:flex;justify-content:space-between;gap:12px;align-items:center;flex-wrap:wrap"><div><h3>Quick Attendance</h3><p>Set status and save once.</p></div><b id="practiceAttendanceCount">Loading…</b></div><div class="list" id="practiceRoster" style="margin-top:10px"><div class="row">Loading assigned athletes…</div></div><button class="action" id="practiceSaveAttendance" style="margin-top:14px" disabled>Save Practice Attendance</button><div id="practiceAttendanceState" style="margin-top:10px"></div></div>
  `);
  const training=document.getElementById('practiceTraining');if(training)training.onclick=()=>openPage(experience==='performance'?'mwtrack':'programs');const ai=document.getElementById('practiceCoachMW');if(ai)ai.onclick=()=>openPage('coachmw');
  const clock=document.getElementById('practiceClock'),clockState=document.getElementById('practiceClockState'),startBtn=document.getElementById('practiceTimerStart'),resetBtn=document.getElementById('practiceTimerReset'),nextBtn=document.getElementById('practiceNextRep'),finishBtn=document.getElementById('practiceFinishSession'),timingRoster=document.getElementById('practiceTimingRoster'),timingState=document.getElementById('practiceTimingState'),repLabel=document.getElementById('practiceRepLabel'),targetInput=document.getElementById('practiceTarget'),eventGroup=document.getElementById('practiceEventGroup');
  let rep=1,repStart=0,tick=null,activeGroup='all',athletes=[],repResults=[],sessionResults=[];
  const groupKey='mwPracticeSexGroups',sexGroups=(()=>{try{return JSON.parse(localStorage.getItem(groupKey)||'{}')}catch{return {}}})();
  const fmt=t=>(t/1000).toFixed(2),paintClock=()=>{if(!clock)return;clock.textContent=repStart?fmt(performance.now()-repStart):'00.00'};
  const stopTick=()=>{if(tick){cancelAnimationFrame(tick);tick=null}},loop=()=>{paintClock();if(repStart)tick=requestAnimationFrame(loop)};
  const visible=()=>athletes.filter(a=>activeGroup==='all'||sexGroups[a.id]===activeGroup);
  const pace=(ms)=>{const target=Number(targetInput?.value);if(!(target>0))return {status:null,label:''};const diff=ms/1000-target,tol=Math.max(.05,target*.01);return diff < -tol?{status:'fast',label:'FAST'}:diff > tol?{status:'slow',label:'SLOW'}:{status:'on_pace',label:'ON PACE'}};
  const renderTiming=()=>{const list=visible();if(!list.length){timingRoster.innerHTML='<div class="row">No athletes assigned to this group. Tap ALL and assign athletes to BOYS or GIRLS.</div>';return}timingRoster.innerHTML=list.map(a=>{const hit=repResults.find(x=>x.athleteId===a.id),g=sexGroups[a.id]||'all';return `<button class="practice-finish-athlete ${hit?'finished':''}" data-finish-athlete="${escapeHtml(a.id)}" ${hit?'disabled':''}><span><b>${escapeHtml(a.name)}</b><small>${escapeHtml(a.event||'Events not set')}</small></span><em>${hit?fmt(hit.ms)+'s':'TAP FINISH'}</em><i data-sex-athlete="${escapeHtml(a.id)}">${g==='boys'?'BOYS':g==='girls'?'GIRLS':'SET GROUP'}</i>${hit&&hit.paceLabel?`<strong class="pace-${hit.paceStatus}">${hit.paceLabel}</strong>`:''}</button>`}).join('');document.querySelectorAll('[data-finish-athlete]').forEach(btn=>btn.onclick=e=>{if(!repStart)return toast('Start the rep first');const id=btn.dataset.finishAthlete;if(repResults.some(x=>x.athleteId===id))return;const ms=performance.now()-repStart,p=pace(ms);repResults.push({athleteId:id,ms,paceStatus:p.status,paceLabel:p.label});renderTiming();nextBtn.disabled=false;finishBtn.disabled=false});document.querySelectorAll('[data-sex-athlete]').forEach(b=>b.onclick=e=>{e.preventDefault();e.stopPropagation();const id=b.dataset.sexAthlete,current=sexGroups[id]||'all';sexGroups[id]=current==='all'?'boys':current==='boys'?'girls':'all';localStorage.setItem(groupKey,JSON.stringify(sexGroups));renderTiming()})};
  document.querySelectorAll('[data-practice-group]').forEach(btn=>btn.onclick=()=>{activeGroup=btn.dataset.practiceGroup;document.querySelectorAll('[data-practice-group]').forEach(x=>x.classList.toggle('active',x===btn));renderTiming()});
  startBtn.onclick=()=>{if(repStart){stopTick();repStart=0;startBtn.textContent='RESUME REP';clockState.textContent='Timer paused';return}repStart=performance.now();startBtn.textContent='PAUSE';clockState.textContent=`Rep ${rep} running — tap athletes at the line`;loop()};
  resetBtn.onclick=()=>{stopTick();repStart=0;repResults=[];paintClock();startBtn.textContent='START REP';clockState.textContent=`Ready for Rep ${rep}`;nextBtn.disabled=true;renderTiming()};
  const commitRep=()=>{const target=Number(targetInput.value)||null;for(const x of repResults)sessionResults.push({...x,repNumber:rep,targetSeconds:target,groupName:eventGroup.value});};
  nextBtn.onclick=()=>{commitRep();rep++;repResults=[];stopTick();repStart=0;paintClock();repLabel.textContent=`REP ${rep}`;clockState.textContent=`Ready for Rep ${rep}`;startBtn.textContent='START REP';nextBtn.disabled=true;renderTiming()};
  finishBtn.onclick=async()=>{if(repResults.length)commitRep();if(!sessionResults.length)return;stopTick();repStart=0;finishBtn.disabled=true;finishBtn.textContent='SAVING…';try{const body={results:sessionResults.map(x=>({athleteId:x.athleteId,sessionDate:new Date().toISOString().slice(0,10),groupName:x.groupName,repNumber:x.repNumber,timeSeconds:x.ms/1000,targetSeconds:x.targetSeconds,paceStatus:x.paceStatus}))},r=await fetch('/api/coach/practice-timing',{method:'POST',headers:{Authorization:`Bearer ${mwSessionToken()}`,'Content-Type':'application/json'},body:JSON.stringify(body)}),d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||'Timing session could not be saved');timingState.innerHTML=`<b>✓ ${d.count||sessionResults.length} athlete times saved to MW performance history.</b>`;toast('Practice timing saved');sessionResults=[];repResults=[];rep=1;repLabel.textContent='REP 1';clockState.textContent='Ready for Rep 1';startBtn.textContent='START REP';paintClock();renderTiming()}catch(e){timingState.innerHTML=`<b>Save error:</b> ${escapeHtml(e.message)}`;finishBtn.disabled=false;finishBtn.textContent='FINISH & SAVE'}};
  const roster=document.getElementById('practiceRoster'),count=document.getElementById('practiceAttendanceCount'),save=document.getElementById('practiceSaveAttendance'),state=document.getElementById('practiceAttendanceState');
  try{const d=await fetchCoachRoster();athletes=Array.isArray(d.athletes)?d.athletes:[];renderTiming();if(count)count.textContent=`${athletes.length} athlete${athletes.length===1?'':'s'}`;if(!athletes.length){roster.innerHTML='<div class="row">No assigned athletes yet.</div>';return}roster.innerHTML=athletes.map(a=>`<div class="row practice-athlete"><span><b>${escapeHtml(a.name)}</b><br><small>${escapeHtml(a.event||'Events not set')}</small></span><select data-practice-athlete="${escapeHtml(a.id)}"><option value="present">Present</option><option value="late">Late</option><option value="excused">Excused</option><option value="absent">Absent</option><option value="injured">Injured</option></select></div>`).join('');save.disabled=false;save.onclick=async()=>{const rows=[...document.querySelectorAll('[data-practice-athlete]')];save.disabled=true;save.textContent='Saving…';if(state)state.textContent='Syncing attendance…';try{const token=mwSessionToken(),sessionDate=new Date().toISOString().slice(0,10);await Promise.all(rows.map(async el=>{const r=await fetch('/api/coach/attendance',{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({athleteId:el.dataset.practiceAthlete,status:el.value,sessionDate,sessionType:'training'})});const x=await r.json().catch(()=>({}));if(!r.ok)throw new Error(x.error||'Attendance save failed')}));if(state)state.innerHTML='<b>✓ Practice attendance saved.</b>';toast('Practice attendance saved')}catch(e){if(state)state.innerHTML=`<b>Attendance error:</b> ${escapeHtml(e.message)}`}finally{save.disabled=false;save.textContent='Save Practice Attendance'}}}catch(e){roster.innerHTML=`<div class="row">Roster unavailable: ${escapeHtml(e.message)}</div>`;timingRoster.innerHTML=`<div class="row">Roster unavailable: ${escapeHtml(e.message)}</div>`;if(count)count.textContent='—'}
}
function coreDashboard(){simpleCoachHome('programs','TRAINING',false)}
function intelligenceDashboard(){simpleCoachHome('programs','TRAINING',true)}
function performanceDashboard(){simpleCoachHome('mwtrack','MW TRAINING',true)}
function dashboard(){
  if(!history.state?.mwCoachPage||history.state.mwCoachPage!=='dashboard')history.replaceState({...history.state,mwCoachPage:'dashboard'},'',location.href);
  if(experience==='core')coreDashboard();
  else if(experience==='intelligence'){intelligenceDashboard();hydrateAthleteStatusBoard();hydrateLivePerformanceSummary();hydratePerformanceInsightPreview();}
  else {performanceDashboard();hydrateAthleteStatusBoard();hydrateLivePerformanceSummary();hydratePerformanceInsightPreview();}
  hydrateCoachTrainingYearCard();
  window.setTimeout(()=>maybeStartCoachTour(),180);
}
function pageBase(title,subtitle,body){const p=PLANS[experience];app.innerHTML=`<div class="page ${p.theme}"><div class="page-wrap"><div class="page-top"><button class="back" id="back">← Dashboard</button><div style="flex:1"><div class="eyebrow">${p.name}</div><h1>${title}</h1><div style="color:#adbdc8">${subtitle}</div></div><button class="icon-btn mw-notification-btn" id="notificationBell" type="button" aria-label="Notifications">🔔<span id="notificationBadge" class="mw-notification-badge" hidden>0</span></button>${accountAccess.isFounder?'<button class="switch" id="switch">Founder Preview</button>':''}<button class="back mw-page-signout" id="pageSignout" type="button">Sign Out</button></div><div class="panel">${body}</div></div></div>`;document.getElementById('back').onclick=dashboard;const sw=document.getElementById('switch');if(sw)sw.onclick=founderPreviewPage;const bell=document.getElementById('notificationBell');if(bell)bell.onclick=openNotifications;const pageSignout=document.getElementById('pageSignout');if(pageSignout)pageSignout.onclick=signOut;hydrateNotificationBadge();bindPageActions();bindPageNavigation(app);}
function morePage(){
  const common=[['teams','👥','Teams'],['calendar','📅','Calendar'],['meets','🏁','Meets'],['attendance','✅','Attendance'],['messages','💬','Messages'],['activity','◔','Activity Log'],['account','⚙️','Account'],['support','?','Help']];
  const smart=experience==='core'?[]:[['coachmw','MW','Coach MW'],['taskboard','☑','Task Board'],['season','📅','Season Planner'],['adjustment','↔','Season Adjustment']];
  const mw=experience==='performance'?[['strength','🏋️','Strength & Power'],['school','🎓','Sprint School'],['race','🏁','Race Strategy'],['pacing','⏱️','Pacing Tools']]:[];
  const founder=accountAccess.isFounder?[['founderpreview','◈','Founder Preview']]:[];
  const items=[...mw,...smart,...common,...founder];
  pageBase('Coach Tools','Advanced tools and administration stay here when you need them.',`<div class="simple-more-grid">${items.map(([id,ic,label])=>`<button data-page="${id}"><b>${ic}</b><span>${label}</span><em>→</em></button>`).join('')}</div><div class="tile" style="margin-top:14px"><h3>Coach Session</h3><p>Securely sign out of this Coach account on this device.</p><button class="back" id="coachMoreSignout" style="margin-top:10px">Sign Out</button></div>`)
  const moreSignout=document.getElementById('coachMoreSignout');if(moreSignout)moreSignout.onclick=signOut;
}
function teamsPage(){pageBase('Teams','Manage squads, groups and coach assignments.',`<div class="panel-grid">${['Varsity Sprint Group','Development Group','400m Group','Relays'].map(n=>`<div class="tile"><h3>${n}</h3><p>Roster, attendance, messages and assignments.</p><button class="action" data-toast="Opened ${n}" style="margin-top:12px">Open Team</button></div>`).join('')}</div>`)}
function programsPage(){pageBase(experience==='performance'?'MW Track Program':'My Program',experience==='performance'?'41-week MW training system.':'Bring your own program and manage workouts.',`<div class="form"><textarea rows="9">Monday — Acceleration\nTuesday — Tempo + Strength\nWednesday — Recovery\nThursday — Max Velocity\nFriday — Speed Endurance</textarea><button class="action" data-toast="Program saved">Save Program</button></div>`)}
function calendarPage(){pageBase('Calendar','Practice, meet and team schedule.',`<div class="list"><div class="row"><span>APR 12 · Spring Invitational</span><button class="action" data-toast="Meet opened">Open</button></div><div class="row"><span>APR 19 · County Championship</span><button class="action" data-toast="Meet opened">Open</button></div><div class="row"><span>MAY 3 · State Qualifier</span><button class="action" data-toast="Meet opened">Open</button></div></div>`)}
function meetsPage(){pageBase('Meets','Manage registration and meet readiness.',`<div class="list"><div class="row"><span><b>Spring Invitational</b><br>Huntsville, AL</span><button class="action" data-toast="Registration opened">Registered</button></div><div class="row"><span><b>County Championship</b><br>Birmingham, AL</span><button class="action" data-toast="Registration opened">Registered</button></div><div class="row"><span><b>State Qualifier</b><br>Montgomery, AL</span><button class="action" data-toast="Registration started">Register</button></div></div>`)}
function messagesPage(){pageBase('Messages','Communicate with athletes and teams.',`<div class="form"><textarea rows="6" placeholder="Message the team..."></textarea><button class="action" data-toast="Message sent">Send Message</button></div>`)}
function activityPage(){pageBase('Activity Log','Recent coach and athlete activity.',`<div class="list"><div class="row"><span>Azel Johnson added to team</span><small>3 hours ago</small></div><div class="row"><span>Attendance updated</span><small>Yesterday</small></div><div class="row"><span>Workout edited</span><small>Yesterday</small></div></div>`)}
function supportPage(){pageBase('Help & Support','MW Dynasty coach support.',`<div class="form"><input placeholder="Subject"><textarea rows="6" placeholder="How can we help?"></textarea><button class="action" data-toast="Support request prepared">Submit Request</button></div>`)}
function taskBoardPage(){pageBase('AI Task Board','Daily coaching tasks and priorities.',`<div class="list"><div class="row"><span><b>Maya T. — Missed Training</b><br>Review workload before next high-intensity day.</span><button class="action" data-toast="Task reviewed">Review</button></div><div class="row"><span><b>Tyler B. — Performance Trend</b><br>Flying 30 trend improved across three sessions.</span><button class="action" data-toast="Task approved">Approve</button></div><div class="row"><span><b>Aaliyah R. — Meet Preparation</b><br>Competition warm-up and race-model review are due.</span><button class="action" data-toast="Task opened">Open</button></div></div>`)}
function seasonPage(){pageBase('AI Season Planner','Build and optimize the season while keeping the coach in control.',`<div class="panel-grid"><div class="tile"><h3>Current Phase</h3><p>Acceleration Development · Week 12</p></div><div class="tile"><h3>Next Meet</h3><p>Spring Invitational · APR 12</p></div></div><button class="action" data-toast="Season recommendation generated" style="margin-top:14px">Generate Recommendation</button>`)}
function adjustmentPage(){pageBase('AI Season Adjustment','Detect → Analyze → Recommend → Coach Approves → System Executes.',`<div class="tile"><h3>Recommended Adjustment</h3><p>Maya T. missed two sessions. Hold the next high-intensity progression until attendance and readiness are reviewed.</p><button class="action" data-toast="Recommendation approved" style="margin-top:12px">Approve Adjustment</button> <button class="back" data-toast="Recommendation dismissed">Dismiss</button></div>`)}
function coachMWPrefs(){
  try{return {...{coachType:'male',voiceSpeed:1,voiceMode:'fast',autoVoice:'on'},...(JSON.parse(localStorage.getItem('mwCoachAISettings')||'{}')||{})}}catch{return {coachType:'male',voiceSpeed:1,voiceMode:'fast',autoVoice:'on'}}
}
function coachMWSettingsHTML(){
  const pref=coachMWPrefs();
  return `<div class="tile" id="coachMWSettings"><h3>Coach MW Settings</h3><p>Choose the Coach MW voice and visual once. Coach Intelligence loads this preference automatically.</p><div class="form" style="grid-template-columns:1fr 1fr"><label>Coach MW<select id="coachMWType"><option value="male" ${pref.coachType==='male'?'selected':''}>Male Coach MW</option><option value="female" ${pref.coachType==='female'?'selected':''}>Female Coach MW</option></select></label><label>Voice Speed<select id="coachMWVoiceSpeed"><option value="0.9" ${Number(pref.voiceSpeed)===0.9?'selected':''}>0.9× Relaxed</option><option value="1" ${Number(pref.voiceSpeed)===1?'selected':''}>1.0× Natural</option><option value="1.1" ${Number(pref.voiceSpeed)===1.1?'selected':''}>1.1× Quick</option><option value="1.2" ${Number(pref.voiceSpeed)===1.2?'selected':''}>1.2× Fast</option></select></label><label>Voice Response<select id="coachMWVoiceMode"><option value="fast" ${pref.voiceMode==='fast'?'selected':''}>Fast — start speaking sooner</option><option value="standard" ${pref.voiceMode==='standard'?'selected':''}>Standard — full response audio</option></select></label><label>Auto-Play Coach Voice<select id="coachMWAutoVoice"><option value="on" ${pref.autoVoice==='on'?'selected':''}>On</option><option value="off" ${pref.autoVoice==='off'?'selected':''}>Off</option></select></label></div><button class="action" id="saveCoachMWSettings" style="margin-top:12px">Save Coach MW Settings</button></div>`;
}
function bindCoachMWSettings(){
  const btn=document.getElementById('saveCoachMWSettings');if(!btn)return;
  btn.onclick=()=>{const prefs={coachType:document.getElementById('coachMWType')?.value==='female'?'female':'male',voiceSpeed:Number(document.getElementById('coachMWVoiceSpeed')?.value||1),voiceMode:document.getElementById('coachMWVoiceMode')?.value==='standard'?'standard':'fast',autoVoice:document.getElementById('coachMWAutoVoice')?.value==='off'?'off':'on'};localStorage.setItem('mwCoachAISettings',JSON.stringify(prefs));btn.textContent='✓ Saved';setTimeout(()=>btn.textContent='Save Coach MW Settings',1000)};
}
function seasonCalendarSettingsHTML(){
  return `<div class="tile" id="seasonCalendarSettings"><h3>MW Training Year</h3><p>Use the MW Standard Training Year, or set a custom Week 1 start when your team calendar needs a different date. Assigned athletes follow the coach calendar and placement.</p><div class="form" style="grid-template-columns:1fr 1fr"><label>Training Calendar<select id="seasonCalendarMode"><option value="standard">MW Standard Training Year</option><option value="custom">Custom Week 1 Start</option></select></label><label id="seasonCalendarStartWrap">Custom Week 1 Start Date<input id="seasonCalendarStart" type="date"></label></div><div id="seasonCalendarSummary" class="tile" style="margin-top:12px"><small>Loading current training year…</small></div><button class="action" id="saveSeasonCalendar" type="button" style="margin-top:12px">Save Training Year</button></div>`;
}
function seasonCalendarSummaryHTML(calendar){
  const c=calendar||{},mode=c.mode==='custom'?'Custom':'MW Standard',week=Number(c.week||1),phase=Number(c.phase||1),status=String(c.status||'active');
  const statusLabel=status==='preseason'?'Preseason':status==='offseason'?'Offseason':'Active';
  return `<b>${escapeHtml(mode)} Training Year</b><br><small>${statusLabel} · Week ${week} · Phase ${phase}${c.startDate?' · Week 1: '+escapeHtml(c.startDate):''}</small>`;
}
function bindSeasonCalendarSettings(){
  const root=document.getElementById('seasonCalendarSettings');if(!root)return;
  const mode=root.querySelector('#seasonCalendarMode'),start=root.querySelector('#seasonCalendarStart'),wrap=root.querySelector('#seasonCalendarStartWrap'),summary=root.querySelector('#seasonCalendarSummary'),save=root.querySelector('#saveSeasonCalendar');
  const sync=()=>{if(wrap)wrap.style.display=mode?.value==='custom'?'grid':'none'};
  if(mode){mode.onchange=sync;sync()}
  const token=mwSessionToken();
  if(!token){if(summary)summary.innerHTML='<small>Sign in again to manage the training year.</small>';if(save)save.disabled=true;return}
  fetch('/api/season-calendar',{headers:{Authorization:`Bearer ${token}`},cache:'no-store'}).then(async r=>{const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||'Training year unavailable');const c=d.calendar||{};if(mode)mode.value=c.mode==='custom'?'custom':'standard';if(start)start.value=c.mode==='custom'&&c.startDate?c.startDate:'';sync();if(summary)summary.innerHTML=seasonCalendarSummaryHTML(c)}).catch(e=>{if(summary)summary.innerHTML=`<small>${escapeHtml(e.message||'Training year unavailable')}</small>`});
  if(save)save.onclick=async()=>{const selected=mode?.value==='custom'?'custom':'standard',startDate=start?.value||'';if(selected==='custom'&&!startDate)return toast('Choose the custom Week 1 start date.');const old=save.textContent;save.disabled=true;save.textContent='Saving…';try{const r=await fetch('/api/season-calendar',{method:'POST',headers:{Authorization:`Bearer ${mwSessionToken()}`,'Content-Type':'application/json'},body:JSON.stringify({mode:selected,startDate:selected==='custom'?startDate:null})});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||'Training year could not be saved');if(summary)summary.innerHTML=seasonCalendarSummaryHTML(d.calendar||{});toast('Training year saved')}catch(e){if(summary)summary.innerHTML=`<small>${escapeHtml(e.message||'Training year could not be saved')}</small>`}finally{save.disabled=false;save.textContent=old}};
}
function coachMWPage(){
  pageBase('Coach MW','Your coaching assistant. Ask, review, decide.',`
  <div class="mw-coach-thread-shell">
    <div class="mw-coach-presence"><span class="mw-coach-crest mw-coach-crest-large" aria-hidden="true">MW</span><div><b>COACH MW</b><small>READY • COACHING INTELLIGENCE</small></div></div>
    <div id="mwchat" class="mw-coach-thread"></div>
    <div class="mw-coach-input-row">
      <button class="back" id="mwmic" title="Speak to Coach MW" aria-label="Speak to Coach MW">🎙</button>
      <button class="back" id="mwattach" title="Add photo" aria-label="Add photo">＋</button>
      <input id="mwimage" type="file" accept="image/png,image/jpeg,image/webp" style="display:none">
      <input id="mwq" placeholder="Ask Coach MW anything...">
      <button class="action" id="askmw">Ask</button>
    </div>
    <div id="mwattachstate" class="mw-coach-state"></div>
    <div class="mw-coach-suggestions"><button class="back" data-mw-prompt="Who on my team needs attention today?">Team attention</button><button class="back" data-mw-prompt="Review my athletes' latest training and performance signals.">Review performance</button><button class="back" data-mw-prompt="Help me plan today's practice using my current MW context.">Plan practice</button></div>
  </div>`);
  let pendingImage='',activeAudio=null,activeVoiceButton=null,activeVoiceURL='',voiceRun=0;
  const chat=document.getElementById('mwchat'),q=document.getElementById('mwq'),pick=document.getElementById('mwimage'),attach=document.getElementById('mwattach'),mic=document.getElementById('mwmic'),state=document.getElementById('mwattachstate');
  const draftPrompt=sessionStorage.getItem('mwCoachDraftPrompt')||'';if(draftPrompt){q.value=draftPrompt;sessionStorage.removeItem('mwCoachDraftPrompt')}
  let history=[];try{history=JSON.parse(sessionStorage.getItem('mwCoachProConversation')||'[]')}catch{}
  const voiceChunks=(text,mode)=>{if(mode==='standard')return [text];const parts=String(text).match(/[^.!?]+[.!?]+|[^.!?]+$/g)||[text],chunks=[];let current='';for(const part of parts){if((current+part).length>360&&current){chunks.push(current.trim());current=''}current+=part}if(current.trim())chunks.push(current.trim());return chunks.slice(0,8)};
  const resetVoice=()=>{voiceRun++;if(activeAudio){try{activeAudio.pause();activeAudio.currentTime=0}catch{}}if(activeVoiceURL)URL.revokeObjectURL(activeVoiceURL);if(activeVoiceButton){activeVoiceButton.textContent='▶ Start Voice';activeVoiceButton.disabled=false;activeVoiceButton=null}activeAudio=null;activeVoiceURL=''};
  const readAloud=async(text,button)=>{
    if(activeVoiceButton===button&&activeAudio){resetVoice();return}
    resetVoice();
    const prefs=coachMWPrefs(),token=mwSessionToken();if(!token)return toast('Coach session expired. Sign in again.');
    const run=++voiceRun;button.disabled=true;button.textContent='Loading voice…';activeVoiceButton=button;
    try{for(const chunk of voiceChunks(text,prefs.voiceMode)){if(run!==voiceRun)return;const r=await fetch('/api/speak',{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({text:chunk,coachType:prefs.coachType})});if(!r.ok){const d=await r.json().catch(()=>({}));throw new Error(d.error||'Coach MW voice unavailable')}const blob=await r.blob(),url=URL.createObjectURL(blob),audio=new Audio(url);audio.playbackRate=Number(prefs.voiceSpeed||1);activeAudio=audio;activeVoiceURL=url;button.textContent='■ Stop Reading';button.disabled=false;await new Promise((resolve,reject)=>{audio.onended=()=>{if(activeVoiceURL===url){URL.revokeObjectURL(url);activeVoiceURL=''}activeAudio=null;resolve()};audio.onerror=()=>reject(new Error('Voice playback error'));audio.play().catch(reject)});if(run!==voiceRun)return}if(run===voiceRun)resetVoice()}catch(e){if(run===voiceRun){resetVoice();button.disabled=false;button.textContent='🔊 Read Aloud';toast(e.message)}}
  };
  const render=()=>{chat.innerHTML=history.map((m,i)=>`<div class="tile mw-coach-message ${m.role==='user'?'mw-coach-user':'mw-coach-assistant'}"><b>${m.role==='user'?'Coach':'Coach MW'}</b><p style="white-space:pre-wrap">${escapeHtml(m.content)}</p>${m.role==='assistant'?`<button class="back mw-read-aloud" data-i="${i}" type="button">🔊 Read Aloud</button>`:''}</div>`).join('');chat.querySelectorAll('.mw-read-aloud').forEach(b=>{const item=history[Number(b.dataset.i)];b.onclick=()=>readAloud(item?.content||'',b)});chat.scrollTop=chat.scrollHeight};
  render();
  document.querySelectorAll('[data-mw-prompt]').forEach(b=>b.onclick=()=>{q.value=b.dataset.mwPrompt||'';q.focus()});
  attach.onclick=()=>pick.click();
  pick.onchange=()=>{const f=pick.files?.[0];if(!f)return;if(f.size>3*1024*1024){state.textContent='Photo too large. Use 3 MB or less.';pick.value='';return}const r=new FileReader();r.onload=()=>{pendingImage=String(r.result||'');state.textContent='Photo attached.'};r.readAsDataURL(f)};
  const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
  if(SR){const recognition=new SR();recognition.lang='en-US';recognition.interimResults=false;recognition.continuous=false;recognition.onstart=()=>{mic.classList.add('listening');mic.textContent='●';state.textContent='Listening…'};recognition.onresult=e=>{const text=e.results?.[0]?.[0]?.transcript||'';if(text){q.value=text;state.textContent='Voice captured. Tap Ask when ready.'}};recognition.onerror=()=>{state.textContent='Voice input could not start. You can still type your question.'};recognition.onend=()=>{mic.classList.remove('listening');mic.textContent='🎙'};mic.onclick=async()=>{try{await window.mwNativePermission?.('voice')}catch{}try{recognition.start()}catch{}}}else{mic.onclick=()=>toast('Voice input is not available in this browser yet.')}
  const send=async()=>{
    const text=q.value.trim();if(!text)return toast('Type or speak a question first');
    const userMsg={role:'user',content:text};if(pendingImage)userMsg.imageDataUrl=pendingImage;
    history.push(userMsg);q.value='';render();state.textContent='Coach MW is thinking…';
    try{const token=mwSessionToken(),headers={'Content-Type':'application/json'};if(token)headers.Authorization='Bearer '+token;const r=await fetch('/api/coach/coach-mw',{method:'POST',headers,body:JSON.stringify({messages:history})});const d=await r.json();if(!r.ok)throw new Error(d.error||'Coach MW request failed');history.push({role:'assistant',content:d.answer||'I could not produce a response.'});history=history.slice(-40).map(m=>({role:m.role,content:m.content}));sessionStorage.setItem('mwCoachProConversation',JSON.stringify(history));pendingImage='';pick.value='';state.textContent='';render();if(coachMWPrefs().autoVoice==='on'){const buttons=chat.querySelectorAll('.mw-read-aloud');const last=buttons[buttons.length-1];if(last)readAloud(d.answer||'',last)}}catch(e){state.textContent='Coach MW connection error: '+e.message}
  };
  document.getElementById('askmw').onclick=send;q.onkeydown=e=>{if(e.key==='Enter')send()};
}
function membershipPage(){return coachAccountPage()}
function founderPreviewPage(){
  if(!accountAccess.isFounder)return coachAccountPage();
  const p=PLANS[experience];
  app.innerHTML=`<div class="page ${p.theme}"><div class="page-wrap"><div class="page-top"><button class="back" id="back">← Dashboard</button><div style="flex:1"><div class="eyebrow">Founder Preview</div><h1>Preview Coach Tier</h1><div style="color:#adbdc8">Founder-only preview. This changes only the preview experience, not billing or entitlements.</div></div><button class="back" id="founderAccount">Coach Profile</button></div><div class="plans">${Object.entries(PLANS).map(([k,v])=>`<div class="plan ${k===experience?'current':''}"><h2>${v.name}</h2><p>${v.sub}</p><p><b>$${v.monthly}/month</b><br><small>Sponsored athletes +$${v.sponsor}/athlete/month</small></p><button class="action" data-plan="${k}">${k===experience?'Current Preview':'Preview Tier'}</button></div>`).join('')}</div>${seasonCalendarSettingsHTML()}<section class="section coach-tour-account-card"><div><div class="eyebrow">GUIDED TOUR</div><h2>Learn ${escapeHtml(p.name)}</h2><p>Replay the full walkthrough for this coach platform anytime.</p></div><button class="action" id="replayCoachTour">Replay Tutorial</button></section></div></div>`;
  document.getElementById('back').onclick=dashboard;document.getElementById('founderAccount').onclick=coachAccountPage;
  document.querySelectorAll('[data-plan]').forEach(btn=>btn.onclick=()=>smoothSwitchExperience(btn.dataset.plan,btn));
  document.getElementById('replayCoachTour').onclick=()=>startCoachTour({force:true,mode:'full'});bindSeasonCalendarSettings();
}
function coachAccountPage(){
  pageBase('Profile','Your coaching identity, organization, membership, and settings.',`<div class="coach-profile-hero"><div class="coach-profile-monogram">${escapeHtml(((accountAccess.firstName||'C')[0]+(accountAccess.lastName||'')[0]).toUpperCase())}</div><div><span class="status-kicker">MW COACH PROFILE</span><h2>${escapeHtml([accountAccess.firstName,accountAccess.lastName].filter(Boolean).join(' ')||'Coach')}</h2><p>${escapeHtml(accountAccess.organization||accountAccess.coachTitle||'MW Dynasty Coach')}</p></div></div><details class="tile coach-profile-section" open><summary><b>COACH DETAILS</b></summary><p>Your identity is used across MW Dynasty so athletes and teams know who is coaching them.</p><div class="form" style="margin-top:12px"><div class="form-grid"><label>First Name<input id="coachProfileFirst" maxlength="80" autocomplete="given-name" value="${escapeHtml(accountAccess.firstName||'')}"></label><label>Last Name<input id="coachProfileLast" maxlength="80" autocomplete="family-name" value="${escapeHtml(accountAccess.lastName||'')}"></label></div><label>School / Organization <small>(optional)</small><input id="coachProfileOrganization" maxlength="160" autocomplete="organization" placeholder="School, club, team, or organization" value="${escapeHtml(accountAccess.organization||'')}"></label><label>Coach Role / Title <small>(optional)</small><input id="coachProfileTitle" maxlength="120" autocomplete="organization-title" placeholder="Head Coach, Sprints Coach, Assistant Coach…" value="${escapeHtml(accountAccess.coachTitle||'')}"></label><label>Email<input value="${escapeHtml(accountAccess.email||'')}" disabled></label><button class="action" id="saveCoachProfile">Save Coach Profile</button><div id="coachProfileState" style="margin-top:8px"></div></div></details><details class="tile coach-profile-section"><summary><b>MEMBERSHIP & BILLING</b></summary><div class="coach-profile-inner"><h3>${escapeHtml(PLANS[experience].name)}</h3><p><b>$${PLANS[experience].monthly}/month</b> · Sponsored athletes <b>+$${PLANS[experience].sponsor}/athlete/month</b></p><p>Plan changes are protected: upgrades wait for payment confirmation; downgrades wait until the end of the paid period. Your current access stays live while the transition is pending.</p><small>MW Dynasty ${MW_APP_VERSION} · iOS Build ${MW_IOS_BUILD}</small><div style="margin:14px 0"><button class="action" type="button" onclick="location.href='/account/'">Open MW Account & Billing</button></div><div class="tile" id="coachBillingPanel"><h3>Manage Coach Plan</h3><p>Loading secure billing status…</p></div></div></details>${experience!=='core'?coachMWSettingsHTML():''}${seasonCalendarSettingsHTML()}<div class="tile coach-tour-account-card"><div><h3>App Tutorial</h3><p>Replay the guided walkthrough for your current coach platform.</p></div><button class="action" id="replayCoachTour">Replay Tutorial</button></div><div class="tile"><h3>Launch Diagnostics</h3><p id="coachDiagnosticsStatus">TestFlight diagnostics are active on iPhone builds. MW records only non-sensitive technical events.</p><button class="back" id="coachDiagnosticsSend">Send Diagnostics Now</button></div><div class="tile"><h3>Privacy & Support</h3><p>Review the privacy policy, contact MW Support, or initiate account deletion.</p><div style="display:flex;gap:10px;flex-wrap:wrap"><button class="back" id="coachPrivacy">Privacy Policy</button><button class="back" id="coachSupport">Contact Support</button></div></div><div class="tile" style="border-color:#7a2c2c"><h3>Delete Coach Account</h3><p>Coach accounts can initiate deletion from inside MW Dynasty. Because coach accounts may be connected to team and athlete records, the request may require safe administrative cleanup before final removal.</p><button class="action" id="deleteCoachAccount" style="background:#7a2c2c">Delete Account</button><div id="deleteCoachState" style="margin-top:10px"></div></div>`);
  const saveProfile=document.getElementById('saveCoachProfile');if(saveProfile)saveProfile.onclick=async()=>{const state=document.getElementById('coachProfileState'),firstName=document.getElementById('coachProfileFirst').value.trim(),lastName=document.getElementById('coachProfileLast').value.trim(),organization=document.getElementById('coachProfileOrganization').value.trim(),coachTitle=document.getElementById('coachProfileTitle').value.trim();if(!firstName||!lastName){state.textContent='First and last name are required.';return}saveProfile.disabled=true;saveProfile.textContent='Saving…';state.textContent='';try{const r=await fetch('/api/coach/access',{method:'PATCH',headers:{Authorization:`Bearer ${mwSessionToken()}`,'Content-Type':'application/json'},body:JSON.stringify({firstName,lastName,organization,coachTitle})}),d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||'Coach profile could not be saved.');accountAccess={...accountAccess,firstName:d.firstName||firstName,lastName:d.lastName||lastName,organization:d.organization||'',coachTitle:d.coachTitle||'',email:d.email||accountAccess.email};state.textContent='✓ Coach profile saved';saveProfile.textContent='✓ Saved';setTimeout(()=>{saveProfile.textContent='Save Coach Profile';saveProfile.disabled=false},1000)}catch(e){state.textContent=e.message;saveProfile.textContent='Save Coach Profile';saveProfile.disabled=false}};
  const replay=document.getElementById('replayCoachTour');if(replay)replay.onclick=()=>startCoachTour({force:true,mode:'full'});
  const diagBtn=document.getElementById('coachDiagnosticsSend'),diagState=document.getElementById('coachDiagnosticsStatus');
  const paintDiag=()=>{if(!diagState||!window.MWDiag)return;const d=window.MWDiag.status();diagState.textContent=`Launch Diagnostics: ${d.enabled?'ON':'OFF'} · queued ${d.queued} · ${d.online?'online':'offline'}${d.lastSuccessfulSync?' · last sync '+new Date(d.lastSuccessfulSync).toLocaleString():''}. No passwords, messages, photos, payment details, or tokens are recorded.`};
  if(diagBtn)diagBtn.onclick=async()=>{diagBtn.disabled=true;diagBtn.textContent='Sending…';try{window.MWDiag?.event('manual_diagnostics_check',{context:{surface:'coach_profile',tier:experience}});const r=await window.MWDiag?.report();if(diagState&&r?.summary)diagState.textContent=`Diagnostics sent · ${r.summary.errors_24h||0} errors · ${r.summary.warnings_24h||0} warnings in recent diagnostics.`;else paintDiag()}catch{if(diagState)diagState.textContent='Diagnostics could not be sent right now. They remain queued for the next connection.'}finally{diagBtn.disabled=false;diagBtn.textContent='Send Diagnostics Now'}};paintDiag();
  document.getElementById('coachPrivacy').onclick=()=>location.href='/privacy.html';
  document.getElementById('coachSupport').onclick=()=>supportPage();
  document.getElementById('deleteCoachAccount').onclick=requestCoachAccountDeletion;
  bindSeasonCalendarSettings();
  bindCoachBillingPanel();
  bindCoachMWSettings();
}
async function coachBillingRequest(method='GET',body=null){
  const token=mwSessionToken();if(!token)throw new Error('Coach session expired. Sign in again.');
  const r=await fetch('/api/billing',{method,headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});
  const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||'Billing request failed');return d;
}
function mwMoney(cents){const n=Number(cents||0);return new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(n/100)}
function coachTierFromPlanCode(code){return code==='coach_core'?'core':code==='coach_intelligence'?'intelligence':code==='mw_sprint_performance'?'performance':experience}
async function bindCoachBillingPanel(){
  const panel=document.getElementById('coachBillingPanel');if(!panel)return;
  try{
    const d=await coachBillingRequest(),st=d.status||{},pending=st.pending_transition;
    panel.innerHTML=`<h3>Manage Coach Plan</h3><p><b>Current:</b> ${escapeHtml(PLANS[experience].name)}</p>${pending?`<div class="tile"><b>Plan change in progress</b><br><small>${escapeHtml(String(pending.direction||'change'))} · ${escapeHtml(String(pending.status||''))}${pending.effective_at?' · '+escapeHtml(fmtDate(pending.effective_at)):''}</small><br><small>Your current plan stays active until the transition is safely completed.</small></div>`:''}<div class="plans">${Object.entries(PLANS).map(([k,v])=>`<div class="plan ${k===experience?'current':''}"><h3>${escapeHtml(v.name)}</h3><p><b>$${v.monthly}/month</b><br><small>Sponsored athletes +$${v.sponsor}/athlete/month</small></p><button class="action coach-plan-change" data-tier="${k==='performance'?'mw_sprint_performance':k}" ${k===experience?'disabled':''}>${k===experience?'Current Plan':(PLANS[k].monthly>PLANS[experience].monthly?'Upgrade':'Downgrade')}</button></div>`).join('')}</div><p id="coachBillingState" style="margin-top:12px"><small>MW keeps the current entitlement active until billing confirms the next state. No mid-transition access gap.</small></p>`;
    panel.querySelectorAll('.coach-plan-change').forEach(btn=>btn.onclick=async()=>{const state=panel.querySelector('#coachBillingState');btn.disabled=true;const old=btn.textContent;btn.textContent='Preparing…';try{const out=await coachBillingRequest('POST',{action:'coach_plan_change',requestedTier:btn.dataset.tier}),r=out.result||{};state.innerHTML=r.direction==='upgrade'?`<b>Upgrade prepared.</b><br><small>Due now: <b>${mwMoney(Number(r.amount_due_now_cents||0))}</b>${Number(r.full_cycle_difference_cents||0)>Number(r.amount_due_now_cents||0)?` prorated from a ${mwMoney(Number(r.full_cycle_difference_cents||0))} full-cycle difference`:''}. You are never charged the full new plan twice. Your current plan stays active until payment confirms the upgrade.</small>`:`<b>Downgrade protected.</b><br><small>The lower tier will take effect at the end of the paid period${r.effective_at?' on '+escapeHtml(fmtDate(r.effective_at)):''}. Your current plan remains active until that handoff.</small>`;toast('Plan transition prepared')}catch(e){state.textContent=e.message}finally{btn.disabled=false;btn.textContent=old}});
  }catch(e){panel.innerHTML=`<h3>Manage Coach Plan</h3><p>${escapeHtml(e.message)}</p>`}
}
async function requestCoachAccountDeletion(){
  if(accountAccess.isFounder)return toast('Founder accounts must be transferred or removed through MW administration.');
  const typed=prompt('Delete your MW Dynasty coach account? If you have an Apple-billed subscription, deleting the MW account does NOT cancel Apple billing; manage that subscription separately. You may still initiate deletion now. Type DELETE to continue.');if(typed!=='DELETE')return;
  if(!confirm('Final confirmation: submit this coach account for deletion?'))return;
  const token=mwSessionToken(),btn=document.getElementById('deleteCoachAccount'),state=document.getElementById('deleteCoachState');
  if(!token){if(state)state.textContent='Sign in again before deleting your account.';return}
  if(btn){btn.disabled=true;btn.textContent='SUBMITTING…'}
  try{
    const r=await fetch(`${SUPABASE_URL}/functions/v1/mw-delete-account`,{method:'POST',headers:{apikey:SUPABASE_KEY,Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:'{}'});
    const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||'Account deletion request failed');
    if(state)state.innerHTML=d.deleted?'<b>Account deleted.</b>':'<b>Deletion request submitted.</b><br>Your request is recorded in MW Dynasty.';
    window.setTimeout(signOut,900);
  }catch(e){if(state)state.textContent=e.message||'Account deletion request failed.';if(btn){btn.disabled=false;btn.textContent='Delete Account'}}
}
function openPage(id,pushHistory=true){if(id!=='messages'&&window.__mwCoachMessagePoll){clearInterval(window.__mwCoachMessagePoll);window.__mwCoachMessagePoll=null}const routes={dashboard,practice:practiceModePage,founderpreview:founderPreviewPage,athletes:athletesPage,teams:teamsPage,programs:programsPage,calendar:calendarPage,meets:meetsPage,attendance:attendancePage,messages:messagesPage,activity:activityPage,account:membershipPage,support:supportPage,taskboard:taskBoardPage,season:seasonPage,adjustment:adjustmentPage,coachmw:coachMWPage,insights:insightsPage,mwtrack:mwTrackPage,strength:strengthPage,school:schoolPage,race:racePage,pacing:pacingPage,more:morePage};const page=routes[id]?id:'support';if(pushHistory&&history.state?.mwCoachPage!==page)history.pushState({...history.state,mwCoachPage:page},'',location.href);(routes[page]||supportPage)()}
if(!window.__mwCoachHistoryBound){window.__mwCoachHistoryBound=true;window.addEventListener('popstate',e=>{if(mwSessionToken())openPage(e.state?.mwCoachPage||'dashboard',false)})}
function bindPageNavigation(root=document){
  root.querySelectorAll('[data-page]').forEach(b=>{if(b.dataset.mwBound==='1')return;b.dataset.mwBound='1';b.addEventListener('click',()=>openPage(b.dataset.page))});
  root.querySelectorAll('[data-stat]').forEach(b=>{if(b.dataset.mwStatBound==='1')return;b.dataset.mwStatBound='1';b.addEventListener('click',()=>{const m={'Athletes':'athletes','Teams':'teams','Upcoming Meets':'meets','Attendance':'attendance','Active Workouts':'programs','Week Program':'mwtrack','Pace Execution':'insights'};openPage(m[b.dataset.stat]||'dashboard')})});
}
async function coachSearchResults(query){
  const q=String(query||'').trim().toLowerCase();if(!q)return [];
  const navItems=[['athletes','Athletes','People you coach'],['teams','Teams','Groups and squads'],['calendar','Calendar','Practices and events'],['meets','Meets','Competition schedule'],['attendance','Attendance','Training attendance'],['messages','Messages','Coach communication'],['programs','Programs','Your training programs'],['activity','Activity Log','Recent coach activity'],['account','Account','Settings and training year'],['support','Help','Support and privacy']];
  if(experience!=='core')navItems.push(['insights','Performance Intelligence','Coach intelligence'],['coachmw','Coach MW AI','AI coaching assistant'],['taskboard','Task Board','Athlete priorities']);
  if(experience==='performance')navItems.push(['mwtrack','MW Training','41-week MW system'],['strength','Strength & Power','MW strength system'],['school','Sprint School','Education library'],['race','Race Strategy','Race planning'],['pacing','Pacing Tools','Training targets']);
  const results=navItems.filter(x=>(x[1]+' '+x[2]).toLowerCase().includes(q)).map(x=>({kind:'page',page:x[0],title:x[1],sub:x[2]}));
  try{
    const [roster,groups,programs,events]=await Promise.all([
      fetchCoachRoster().then(d=>d.athletes||[]).catch(()=>[]),
      sbRest('coach_groups?select=id,name,event_group&archived=eq.false&order=created_at.asc').catch(()=>[]),
      sbRest('coach_programs?select=id,name,program_type,status&order=updated_at.desc').catch(()=>[]),
      sbRest('coach_calendar_events?select=id,title,event_type,starts_at,location&order=starts_at.asc').catch(()=>[])
    ]);
    roster.filter(a=>`${a.name} ${a.event||''}`.toLowerCase().includes(q)).slice(0,5).forEach(a=>results.push({kind:'athlete',id:a.id,title:a.name,sub:a.event||'Athlete'}));
    groups.filter(g=>`${g.name} ${g.event_group||''}`.toLowerCase().includes(q)).slice(0,4).forEach(g=>results.push({kind:'group',id:g.id,title:g.name,sub:g.event_group||'Team / Group'}));
    programs.filter(x=>`${x.name} ${x.program_type||''}`.toLowerCase().includes(q)).slice(0,4).forEach(x=>results.push({kind:'program',id:x.id,title:x.name,sub:`${x.program_type||'program'} · ${x.status||'draft'}`}));
    events.filter(e=>`${e.title} ${e.location||''} ${e.event_type||''}`.toLowerCase().includes(q)).slice(0,4).forEach(e=>results.push({kind:'event',id:e.id,title:e.title,sub:`${e.event_type||'event'}${e.location?' · '+e.location:''}`}));
  }catch{}
  return results.slice(0,12);
}
function openCoachSearchResult(r){
  if(r.kind==='athlete')return athleteDetail(r.id);
  if(r.kind==='group')return groupWorkspaceLive(r.id);
  if(r.kind==='program')return programEditor(r.id);
  if(r.kind==='event')return calendarEventModal(r.id);
  openPage(r.page||'dashboard');
}
function bindCoachSearch(){
  const q=document.getElementById('dashSearch'),box=document.getElementById('dashSearchResults');if(!q||!box)return;let seq=0,last=[];
  const render=async()=>{const term=q.value.trim();const my=++seq;if(!term){box.hidden=true;box.innerHTML='';return}box.hidden=false;box.innerHTML='<div class="mw-search-loading">Searching MW Dynasty…</div>';const rows=await coachSearchResults(term);if(my!==seq)return;last=rows;box.innerHTML=rows.length?rows.map((r,i)=>`<button type="button" class="mw-search-result" data-search-i="${i}"><b>${escapeHtml(r.title)}</b><small>${escapeHtml(r.sub||'')}</small></button>`).join(''):'<div class="mw-search-loading">No matches found.</div>';box.querySelectorAll('[data-search-i]').forEach(b=>b.onclick=()=>{box.hidden=true;openCoachSearchResult(last[Number(b.dataset.searchI)])});};
  q.addEventListener('input',()=>{clearTimeout(q.__mwSearchTimer);q.__mwSearchTimer=setTimeout(render,180)});
  q.addEventListener('focus',()=>{if(q.value.trim())render()});
  q.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();if(last[0]){box.hidden=true;openCoachSearchResult(last[0])}else render()}if(e.key==='Escape')box.hidden=true});
  document.addEventListener('click',e=>{if(!e.target.closest('.mw-search-wrap'))box.hidden=true},{once:false});
}
async function fetchCoachNotifications(){
  const token=mwSessionToken();if(!token)throw new Error('Coach session expired. Sign in again.');
  const r=await fetch('/api/coach/notifications',{headers:{Authorization:`Bearer ${token}`},cache:'no-store'});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||'Notifications unavailable.');return d;
}
async function hydrateNotificationBadge(){const badge=document.getElementById('notificationBadge');if(!badge)return;try{const d=await fetchCoachNotifications(),n=Number(d.unread||0);badge.textContent=n>99?'99+':String(n);badge.hidden=n===0}catch{badge.hidden=true}}
async function openNotifications(){
  const modal=mwModal('Notifications','<div id="notificationLive" class="list"><div class="tile">Loading notifications…</div></div><button class="back" id="markNotificationsRead" style="margin-top:12px">Mark All Read</button>');const wrap=modal.querySelector('#notificationLive');
  try{const d=await fetchCoachNotifications(),items=d.items||[];wrap.innerHTML=items.length?items.map(n=>`<button class="row mw-notification-row ${n.read_at?'':'unread'}" data-notification-id="${escapeHtml(n.id)}" data-notification-page="${escapeHtml(n.action_page||'dashboard')}" style="width:100%;text-align:left"><span><b>${escapeHtml(n.title)}</b><br><small>${escapeHtml(n.body)}</small></span><small>${new Date(n.created_at).toLocaleString()}</small></button>`).join(''):'<div class="tile"><h3>You’re all caught up</h3><p>No coach notifications yet.</p></div>';wrap.querySelectorAll('[data-notification-id]').forEach(b=>b.onclick=async()=>{try{await fetch('/api/coach/notifications',{method:'POST',headers:{Authorization:`Bearer ${mwSessionToken()}`,'Content-Type':'application/json'},body:JSON.stringify({action:'mark_read',id:b.dataset.notificationId})})}catch{}modal.remove();openPage(b.dataset.notificationPage||'dashboard')});}catch(e){wrap.innerHTML=`<div class="tile"><h3>Notifications unavailable</h3><p>${escapeHtml(e.message)}</p></div>`}
  const all=modal.querySelector('#markNotificationsRead');all.onclick=async()=>{all.disabled=true;try{await fetch('/api/coach/notifications',{method:'POST',headers:{Authorization:`Bearer ${mwSessionToken()}`,'Content-Type':'application/json'},body:JSON.stringify({action:'mark_all_read'})});await hydrateNotificationBadge();modal.remove()}finally{all.disabled=false}};
}
function bindGlobal(){const mm=document.getElementById('mobileMenu');const nav=document.getElementById('sideNav');if(mm&&nav){mm.addEventListener('click',()=>{const open=nav.classList.toggle('open');mm.setAttribute('aria-expanded',String(open));mm.textContent=open?'Close':'Menu';});}bindPageNavigation(document);const s=document.getElementById('signout');if(s)s.onclick=signOut;bindCoachSearch();const bell=document.getElementById('notificationBell');if(bell)bell.onclick=openNotifications;hydrateNotificationBadge();if(window.__mwCoachNotificationPoll)clearInterval(window.__mwCoachNotificationPoll);window.__mwCoachNotificationPoll=setInterval(()=>{if(document.getElementById('notificationBell'))hydrateNotificationBadge()},30000);}
function bindPageActions(){document.querySelectorAll('[data-toast]').forEach(b=>b.onclick=()=>toast(b.dataset.toast))}
function toast(msg){let el=document.querySelector('.toast');if(!el){el=document.createElement('div');el.className='toast';document.body.appendChild(el)}el.textContent=msg;el.classList.add('show');clearTimeout(window.__mwToast);window.__mwToast=setTimeout(()=>el.classList.remove('show'),1600)}
function escapeHtml(s){return String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]))}
function smoothSwitchExperience(next,button){
  if(!PLANS[next]||next===experience){dashboard();return;}
  if(button){button.disabled=true;button.textContent='Opening…';}
  const current=document.querySelector('.app,.page');
  if(current)current.classList.add('experience-leaving');
  let veil=document.getElementById('experienceVeil');
  if(!veil){veil=document.createElement('div');veil.id='experienceVeil';veil.className='experience-veil';document.body.appendChild(veil);}
  const nextPlan=PLANS[next];
  veil.innerHTML=`<div class="experience-card ${nextPlan.theme}"><div class="experience-kicker">MW DYNASTY COACH</div><div class="experience-name">${nextPlan.title}</div><div class="experience-tag">${nextPlan.tag}</div><div class="experience-line"><span></span></div></div>`;
  requestAnimationFrame(()=>veil.classList.add('show'));
  window.setTimeout(()=>{
    experience=next;localStorage.setItem('mwCoachExperience',experience);dashboard();
    const fresh=document.querySelector('.app');if(fresh)fresh.classList.add('experience-entering');
    requestAnimationFrame(()=>{if(fresh)fresh.classList.add('experience-entered')});
    veil.classList.remove('show');
    window.setTimeout(()=>{veil.remove();if(fresh){fresh.classList.remove('experience-entering','experience-entered')}},520);
  },420);
}


/* ===== V2.6 COACH PLATFORM GUIDED TOURS ===== */
const COACH_TOUR_RANK={core:1,intelligence:2,performance:3};
const COACH_TOURS={
  core:[
    {icon:'✦',title:'Welcome to MW Coach Core',body:'This walkthrough is built around how you will actually coach inside MW Dynasty — where to start, where to go next, and why each main button matters.',hint:'The goal is not just to show you buttons. It is to teach you the coaching flow so you can move through the app without guessing.',target:null,label:'COACH CORE'},
    {icon:'',title:'These Five Buttons Are Your Coaching Map',body:'HOME, TEAM, TRAINING, MESSAGES and PROFILE are the five anchors of Coach Core. Almost everything you do starts from one of these buttons.',hint:'Learn these five first. Once they make sense, the rest of the platform becomes much easier to navigate.',target:'#sideNav',label:'YOUR COACHING MAP',navPreview:true},
    {icon:'',title:'1. Home — Know What Needs Your Attention',body:'HOME is where a coaching day should begin. It brings you back to your command center so you can see the current picture before jumping into individual tasks.',hint:'Why it matters: good coaching decisions start with context. Use Home to orient yourself before you act.',target:'#sideNav [data-page="dashboard"]',label:'HOME'},
    {icon:'',title:'2. Team — Know the Athlete Before You Coach the Athlete',body:'TEAM is where you move from the big picture to the people you coach. Open your roster, review athlete information, assignments and the athletes connected to your account.',hint:'Why it matters: training decisions should be athlete-specific. Team is the bridge between your roster and the work you assign.',target:'#sideNav [data-page="athletes"]',label:'TEAM'},
    {icon:'',title:'3. Training — Turn the Plan Into Action',body:'TRAINING is where your coaching plan lives. Create, organize and manage the workouts and programs your athletes need to execute.',hint:'Why it matters: this is where coaching intent becomes actual work. Build the plan here, then use Team to make sure the right athletes are connected to it.',target:'#sideNav [data-page="programs"]',label:'TRAINING'},
    {icon:'',title:'4. Messages — Close the Coaching Loop',body:'MESSAGES keeps communication with your athletes inside the same coaching workspace. Use it for clarification, follow-up and the communication that helps the plan get executed correctly.',hint:'Why it matters: a workout on a screen is not enough. Communication is how you correct, reinforce and keep athletes connected to the plan.',target:'#sideNav [data-page="messages"]',label:'MESSAGES'},
    {icon:'',title:'5. Profile — Keep the System Accurate',body:'PROFILE is where your coaching identity, organization, training-year settings, membership and account controls stay current.',hint:'Why it matters: MW uses these settings to know who you are, what access you have and how your coaching environment should operate.',target:'#sideNav [data-page="account"]',label:'PROFILE'},
    {icon:'📅',title:'Set the Training Year Before You Build Around It',body:'Your training-year setting gives the rest of the platform a calendar reference. Keep the MW Standard Week 1 or choose a Custom Season Start when your team needs a different starting point.',hint:'Assigned athletes follow your coach calendar and placement. Getting this right early keeps your roster and training weeks aligned.',target:'.coach-training-year-card',label:'TRAINING YEAR'},
    {icon:'',title:'Your Everyday Coach Core Flow',body:'A simple rhythm is HOME → TEAM → TRAINING → MESSAGES. Use PROFILE when settings or account information need attention, then return HOME to reset your view.',hint:'You do not need to hunt through the app. Let the five main buttons organize how you coach.',target:'#sideNav',label:'DAILY COACH FLOW',navPreview:true}
  ],
  intelligence:[
    {icon:'✦',title:'Welcome to MW Coach Intelligence',body:'This walkthrough is built around how you will actually use intelligence while coaching — orient yourself, understand the athlete, ask better questions and act on what matters.',hint:'MW Intelligence should make your coaching decisions clearer, not make the app feel more complicated.',target:null,label:'COACH INTELLIGENCE'},
    {icon:'',title:'These Five Buttons Are Your Coaching Map',body:'HOME, TEAM, COACH MW, MESSAGES and PROFILE are the five anchors of Coach Intelligence. Think of them as the permanent map underneath the intelligence tools.',hint:'The intelligence features are powerful, but these five buttons keep you grounded and make the platform easy to move through.',target:'#sideNav',label:'YOUR COACHING MAP',navPreview:true},
    {icon:'',title:'1. Home — Start With the Big Picture',body:'HOME is where every coaching day should begin. Use it to see the overall state of your roster and what deserves attention before opening a single athlete.',hint:'Why it matters: intelligence is most useful when you begin with the whole picture instead of reacting to one isolated data point.',target:'#sideNav [data-page="dashboard"]',label:'HOME'},
    {icon:'',title:'2. Team — Move From Signal to Athlete',body:'TEAM is where you inspect the actual athlete behind a status, flag or recommendation. Open profiles, assignments and the information connected to the people you coach.',hint:'Why it matters: MW can surface a signal, but you still need athlete context before making a coaching decision.',target:'#sideNav [data-page="athletes"]',label:'TEAM'},
    {icon:'',title:'3. Coach MW — Turn Information Into a Coaching Question',body:'COACH MW lets you ask about athletes, workload, planning and the signals MW is seeing across your roster.',hint:'Why it matters: use Coach MW to understand and organize information faster. It recommends — you decide what should actually happen.',target:'#sideNav [data-page="coachmw"]',label:'COACH MW'},
    {icon:'',title:'4. Messages — Turn the Decision Into Communication',body:'MESSAGES is where you follow through with the athlete after you review the data and decide what needs to be addressed.',hint:'Why it matters: intelligence only helps if it improves what the athlete understands and executes.',target:'#sideNav [data-page="messages"]',label:'MESSAGES'},
    {icon:'',title:'5. Profile — Control the Environment',body:'PROFILE keeps your coaching identity, organization, training-year setup, membership and account settings accurate.',hint:'Why it matters: these settings give MW the correct coaching context and keep your platform access organized.',target:'#sideNav [data-page="account"]',label:'PROFILE'},
    {icon:'◉',title:'Use Athlete Status as Your Early-Warning Board',body:'The Athlete Status Board separates the roster into On Track, Watch and Needs Attention so you know where to look first.',hint:'Do not treat a flag as the final answer. Use it as a reason to open Team, inspect the athlete and make the coaching decision yourself.',target:'.athlete-status-section',label:'ATHLETE STATUS'},
    {icon:'☑',title:'Use the Task Board to Prioritize Follow-Up',body:'The AI Task Board turns roster signals into an organized coaching queue so important follow-up does not disappear underneath everything else you are managing.',hint:'A useful rhythm is Status → Athlete → Coach MW if needed → Coach decision → Message or action.',target:'[data-page="taskboard"]',label:'AI TASK BOARD'},
    {icon:'',title:'Your Everyday Intelligence Flow',body:'A simple rhythm is HOME → TEAM → COACH MW → MESSAGES. PROFILE controls the environment. The intelligence tools support that flow instead of replacing it.',hint:'Start broad, inspect the athlete, ask the right question, make the decision, then communicate it.',target:'#sideNav',label:'DAILY COACH FLOW',navPreview:true}
  ],
  performance:[
    {icon:'✦',title:'Welcome to MW Sprint Performance',body:'This walkthrough shows you how to operate the complete MW system without getting lost in all of its power — where to start, how to move, and what each main button is responsible for.',hint:'The 41-week system, strength, pacing and intelligence all become easier when you understand the five navigation anchors first.',target:null,label:'SPRINT PERFORMANCE'},
    {icon:'',title:'These Five Buttons Are Your Coaching Map',body:'HOME, TEAM, COACH MW, MESSAGES and PROFILE are the five anchors of Sprint Performance. The complete MW system branches out from this navigation.',hint:'When you always know which anchor you are working from, the full performance platform stays organized instead of overwhelming.',target:'#sideNav',label:'YOUR COACHING MAP',navPreview:true},
    {icon:'',title:'1. Home — Start With Today’s Coaching Picture',body:'HOME is where you orient yourself before touching the program. See what is happening across the coaching environment and what needs your attention first.',hint:'Why it matters: the training system is structured, but your coaching day still starts with understanding what is happening right now.',target:'#sideNav [data-page="dashboard"]',label:'HOME'},
    {icon:'',title:'2. Team — Connect the System to the Athlete',body:'TEAM is where the MW system becomes personal. Review the athlete, their placement, assignments and the information that should shape how you coach the prescribed work.',hint:'Why it matters: the system provides structure; Team gives you the athlete context needed to coach that structure correctly.',target:'#sideNav [data-page="athletes"]',label:'TEAM'},
    {icon:'',title:'3. Coach MW — Understand the System in Context',body:'COACH MW connects the MW methodology, your roster and coaching intelligence so you can ask questions about the work and the athletes doing it.',hint:'Why it matters: use Coach MW to understand, compare and prepare. The final coaching decision still belongs to you.',target:'#sideNav [data-page="coachmw"]',label:'COACH MW'},
    {icon:'',title:'4. Messages — Make Sure the Athlete Understands',body:'MESSAGES gives you the communication layer around the training system. Use it to reinforce cues, clarify expectations and follow up when execution needs attention.',hint:'Why it matters: even the best program fails if the athlete does not understand what the coach wants executed.',target:'#sideNav [data-page="messages"]',label:'MESSAGES'},
    {icon:'',title:'5. Profile — Keep Your Coaching Setup Correct',body:'PROFILE controls your coaching identity, organization, training-year setup, membership and account settings.',hint:'Why it matters: these settings keep the 41-week system, your roster and your access tied to the correct coaching environment.',target:'#sideNav [data-page="account"]',label:'PROFILE'},
    {icon:'🏃',title:'The 41-Week Track System Is the Backbone',body:'The protected MW Track Program gives you the progressive sprint prescription, recovery, cues and circuit order across the season.',hint:'Use the navigation anchors to manage the coaching day; use the MW Track Program when you need the actual system prescription.',target:'[data-page="mwtrack"]',label:'MW TRACK PROGRAM'},
    {icon:'🏋',title:'Strength Supports the Track Work',body:'Strength & Power is synchronized with the sprint progression so the weight room supports the same performance objective as the track.',hint:'Do not treat track and strength as two unrelated programs. They are designed to progress together.',target:'[data-page="strength"]',label:'STRENGTH & POWER'},
    {icon:'◷',title:'Pacing Makes the Prescription Individual',body:'Pacing Tools use athlete PR data to turn the prescribed work into individualized target times.',hint:'The program tells you the training intent. Pacing helps each athlete execute that intent at the right target.',target:'[data-page="pacing"]',label:'PACING TOOLS'},
    {icon:'',title:'Your Everyday Sprint Performance Flow',body:'A simple rhythm is HOME → TEAM → COACH MW → execute the MW system → MESSAGES. PROFILE controls your setup. Use the performance tools when the coaching question requires them.',hint:'The five main buttons keep you oriented; the 41-week system and performance tools give you the depth.',target:'#sideNav',label:'DAILY COACH FLOW',navPreview:true}
  ]
};

const COACH_UPGRADE_TOURS={
  intelligence:[
    {icon:'⚡',title:'Coach Intelligence Is Unlocked',body:'Your platform now adds live roster intelligence and AI decision support on top of your coaching workflow.',hint:'Here are the biggest new tools.',target:null,label:'WHAT’S NEW'},
    {icon:'◉',title:'Athlete Status Board',body:'Your roster is now organized into On Track, Watch and Needs Attention so you can prioritize faster.',hint:'Every flag includes the reason MW detected it.',target:'.athlete-status-section',label:'NEW · ATHLETE STATUS'},
    {icon:'☑',title:'AI Priorities',body:'The AI Task Board turns athlete signals into daily coaching priorities for you to review.',hint:'You decide what gets approved and acted on.',target:'[data-page="taskboard"]',label:'NEW · AI TASK BOARD'},
    {icon:'☻',title:'Coach MW + Insights',body:'Coach MW AI and AI Insights give you deeper context without taking control away from the coach.',hint:'Your upgraded platform is ready.',target:'#sideNav [data-page="coachmw"]',label:'NEW · COACH MW'}
  ],
  performance:[
    {icon:'⚡',title:'MW Sprint Performance Is Unlocked',body:'You now have the complete MW system plus the full Coach Intelligence layer.',hint:'Here are the major tools added with this platform.',target:null,label:'WHAT’S NEW'},
    {icon:'🏃',title:'41-Week Track System',body:'The complete progressive MW Track Program is now available. Standard Week 1 begins the day after Labor Day, or your team can use a coach-controlled Custom Season Start.',hint:'Athletes do not freely jump weeks: coached athletes follow coach placement; independent late joiners use Smart Entry.',target:'[data-page="mwtrack"]',label:'NEW · TRACK PROGRAM'},
    {icon:'🏋',title:'Strength & Power',body:'The synchronized MW weight-room progression is now connected to the sprint program.',hint:'Track and strength now live together.',target:'[data-page="strength"]',label:'NEW · STRENGTH'},
    {icon:'▤',title:'Sprint School + Race Strategy',body:'Technique education, starts, race strategy and execution resources are now part of your platform.',hint:'Teach the athlete as well as train the athlete.',target:'[data-page="school"]',label:'NEW · SPRINT SCHOOL'},
    {icon:'◷',title:'Pacing Tools',body:'Use live athlete PRs to calculate individualized target times for the prescribed work.',hint:'The complete performance platform is ready.',target:'[data-page="pacing"]',label:'NEW · PACING'}
  ]
};
let coachTourState=null;
function coachTourUserKey(){return String(authSession?.user?.id||readStoredSession()?.user?.id||'local')}
function coachTourCompleteKey(tier=experience){return `mwCoachTourComplete:${coachTourUserKey()}:${tier}:v29`}
function coachTourLastTierKey(){return `mwCoachLastTier:${coachTourUserKey()}`}
function coachTourRank(t){return COACH_TOUR_RANK[t]||0}
function maybeStartCoachTour(){
  if(document.getElementById('coachTour'))return;
  const uid=coachTourUserKey();if(uid==='local')return;
  if(accountAccess.isFounder){
    if(localStorage.getItem(coachTourCompleteKey(experience))!=='1')startCoachTour({mode:'full'});
    return;
  }
  const last=localStorage.getItem(coachTourLastTierKey())||'';
  const current=experience;
  if(last&&coachTourRank(current)>coachTourRank(last)&&COACH_UPGRADE_TOURS[current]){
    startCoachTour({mode:'upgrade'});return;
  }
  if(localStorage.getItem(coachTourCompleteKey(current))!=='1')startCoachTour({mode:'full'});
  else localStorage.setItem(coachTourLastTierKey(),current);
}
function coachTourEnsureDashboard(){
  if(!document.querySelector('.app'))dashboard();
}
function coachTourOpenNavIfNeeded(step){
  const navEl=document.getElementById('sideNav'),menu=document.getElementById('mobileMenu');
  if(!navEl||!menu)return;
  if((step?.target==='#sideNav'||step?.target?.includes('#sideNav'))&&window.matchMedia('(max-width:820px)').matches){navEl.classList.add('open');menu.setAttribute('aria-expanded','true');menu.textContent='Close';}
}
function coachTourCloseNav(){const navEl=document.getElementById('sideNav'),menu=document.getElementById('mobileMenu');if(navEl&&menu&&window.matchMedia('(max-width:820px)').matches){navEl.classList.remove('open');menu.setAttribute('aria-expanded','false');menu.textContent='Menu';}}
function startCoachTour(opts={}){
  const mode=opts.mode||'full';
  if(opts.force){document.getElementById('coachTour')?.remove();coachTourEnsureDashboard();}
  const steps=mode==='upgrade'?(COACH_UPGRADE_TOURS[experience]||COACH_TOURS[experience]):COACH_TOURS[experience];
  if(!steps?.length)return;
  if(!document.querySelector('.app')){dashboard();window.setTimeout(()=>startCoachTour(opts),220);return;}
  document.getElementById('coachTour')?.remove();
  const root=document.createElement('div');root.id='coachTour';root.className=`coach-tour ${PLANS[experience].theme} ${mode==='upgrade'?'upgrade':''}`;
  root.innerHTML=`<div class="coach-tour-spotlight" id="coachTourSpotlight"></div><div class="coach-tour-tag" id="coachTourTag"></div><section class="coach-tour-card" id="coachTourCard" role="dialog" aria-modal="true" aria-label="${escapeHtml(PLANS[experience].name)} tutorial"><div class="coach-tour-top"><div class="coach-tour-kicker">MW DYNASTY · ${mode==='upgrade'?'WHAT’S NEW':'GUIDED TOUR'}</div><div class="coach-tour-step" id="coachTourStep"></div></div><div class="coach-tour-lead"><div class="coach-tour-icon" id="coachTourIcon"></div><div><h2 id="coachTourTitle"></h2><p id="coachTourBody"></p></div></div><div class="coach-tour-nav-preview" id="coachTourNavPreview"></div><div class="coach-tour-hint" id="coachTourHint"></div><div class="coach-tour-dots" id="coachTourDots"></div><div class="coach-tour-actions"><button type="button" class="coach-tour-skip" id="coachTourSkip">SKIP</button><button type="button" class="coach-tour-back" id="coachTourBack">BACK</button><button type="button" class="coach-tour-next" id="coachTourNext">NEXT</button></div></section>`;
  document.body.appendChild(root);
  coachTourState={mode,steps,index:0,root};
  root.querySelector('#coachTourSkip').onclick=()=>finishCoachTour(true);
  root.querySelector('#coachTourBack').onclick=()=>{if(coachTourState.index>0){coachTourState.index--;renderCoachTourStep()}};
  root.querySelector('#coachTourNext').onclick=()=>{if(coachTourState.index>=steps.length-1)finishCoachTour(false);else{coachTourState.index++;renderCoachTourStep()}};
  window.addEventListener('resize',coachTourReposition,{passive:true});
  renderCoachTourStep();
}
function renderCoachTourStep(){
  const st=coachTourState;if(!st)return;const step=st.steps[st.index],root=st.root;
  coachTourOpenNavIfNeeded(step);
  root.querySelector('#coachTourStep').textContent=`${st.index+1} OF ${st.steps.length}`;
  const tourIcon=root.querySelector('#coachTourIcon'),navPreview=root.querySelector('#coachTourNavPreview');
  if(tourIcon){tourIcon.classList.remove('mw-tour-nav-art');tourIcon.style.backgroundImage='';tourIcon.textContent=step.icon||'✦'}
  if(navPreview){navPreview.classList.toggle('show',!!step.navPreview);navPreview.innerHTML=''}
  const tourTarget=step.target?document.querySelector(step.target):null;
  const targetArt=tourTarget?.matches?.('.nav-btn')?tourTarget.querySelector('.mwNavArt'):tourTarget?.querySelector?.('.mwNavArt');
  if(targetArt&&tourIcon){
    const bg=getComputedStyle(targetArt).backgroundImage;
    if(bg&&bg!=='none'){tourIcon.classList.add('mw-tour-nav-art');tourIcon.style.backgroundImage=bg;tourIcon.textContent=''}
  }
  if(step.navPreview&&navPreview){
    const buttons=[...document.querySelectorAll('#sideNav .nav-btn')].slice(0,5);
    navPreview.innerHTML=buttons.map(btn=>{
      const art=btn.querySelector('.mwNavArt'),label=btn.querySelector('span:last-child')?.textContent?.trim()||'MW';
      const bg=art?getComputedStyle(art).backgroundImage:'none';
      return `<div><i style='background-image:${bg}'></i><span>${escapeHtml(label)}</span></div>`;
    }).join('');
    const firstArt=buttons[0]?.querySelector('.mwNavArt');
    const firstBg=firstArt?getComputedStyle(firstArt).backgroundImage:'none';
    if(tourIcon&&firstBg&&firstBg!=='none'){tourIcon.classList.add('mw-tour-nav-art');tourIcon.style.backgroundImage=firstBg;tourIcon.textContent=''}
  }
  root.querySelector('#coachTourTitle').textContent=step.title;
  root.querySelector('#coachTourBody').textContent=step.body;
  root.querySelector('#coachTourHint').textContent=step.hint||'';
  root.querySelector('#coachTourBack').disabled=st.index===0;
  root.querySelector('#coachTourNext').textContent=st.index===st.steps.length-1?'FINISH':'NEXT';
  root.querySelector('#coachTourDots').innerHTML=st.steps.map((_,i)=>`<i class="${i===st.index?'active':''}"></i>`).join('');
  root.classList.toggle('no-target',!step.target);
  window.setTimeout(()=>coachTourPosition(step),60);
}
function coachTourPosition(step){
  const root=coachTourState?.root;if(!root)return;const spot=root.querySelector('#coachTourSpotlight'),tag=root.querySelector('#coachTourTag'),card=root.querySelector('#coachTourCard');
  if(!step.target){spot.style.display='none';tag.style.display='none';card.classList.remove('at-top');return;}
  const target=document.querySelector(step.target);if(!target){spot.style.display='none';tag.style.display='none';return;}
  target.scrollIntoView({block:'nearest',inline:'nearest'});
  const r=target.getBoundingClientRect(),pad=7;
  const left=Math.max(8,r.left-pad),top=Math.max(8,r.top-pad),width=Math.min(window.innerWidth-left-8,r.width+pad*2),height=Math.min(window.innerHeight-top-8,r.height+pad*2);
  spot.style.display='block';spot.style.left=`${left}px`;spot.style.top=`${top}px`;spot.style.width=`${Math.max(38,width)}px`;spot.style.height=`${Math.max(34,height)}px`;
  tag.style.display='block';tag.textContent=step.label||'';tag.style.left=`${Math.max(10,Math.min(left,window.innerWidth-150))}px`;tag.style.top=`${Math.max(8,top-30)}px`;
  card.classList.toggle('at-top',r.top>window.innerHeight*.52);
}
function coachTourReposition(){const st=coachTourState;if(st)coachTourPosition(st.steps[st.index])}
function finishCoachTour(skipped=false){
  const st=coachTourState;if(!st)return;
  localStorage.setItem(coachTourCompleteKey(experience),'1');
  if(!accountAccess.isFounder)localStorage.setItem(coachTourLastTierKey(),experience);
  window.removeEventListener('resize',coachTourReposition);
  st.root?.remove();coachTourState=null;coachTourCloseNav();
  toast(skipped?'Tutorial skipped — replay it from Account anytime.':'Tutorial complete — you’re ready to coach.');
}

function renderLogin(message=''){
  app.innerHTML=`<div class="coach-login-screen">
    <section class="coach-login-stage" aria-label="MW Coach sign in">
      <div class="coach-login-bg" aria-hidden="true"></div>
      <header class="coach-login-header">
        <div class="coach-login-brand" aria-label="MW Coach">
          <img class="coach-login-crest" src="/mw-dynasty-app-icon-512.png" alt="MW Dynasty crest">
          <div class="coach-login-wordmark">
            <div class="coach-login-coach">DYNASTY</div>
            <div class="coach-login-tagline">COACH • LEAD • DEVELOP • BUILD</div>
          </div>
        </div>
        <nav class="coach-login-nav" aria-label="MW Coach values">
          <span>DISCIPLINE</span><i></i><span>DEVELOPMENT</span><i></i><span>DOMINANCE</span><i></i><span>RESOURCES</span>
        </nav>
        <div class="coach-login-mission">COACHES TODAY<br>STRONGER ATHLETES<br>BRIGHTER TOMORROW<div></div></div>
      </header>

      <div class="coach-login-content">
        <div class="coach-login-person" role="img" aria-label="Coach standing trackside"></div>

        <div class="coach-login-card-wrap">
          <div class="coach-login-card">
            <a class="coach-login-role-back" href="https://mwdynasty.com/" aria-label="Open MW Dynasty website">← MW WEBSITE</a>
            <div class="coach-login-mobile-brand" aria-hidden="true">DYNASTY · COACH</div>
            <h2>Welcome Back Coach</h2>
            <p>Sign in to your MW Dynasty Coach experience.</p>
            <form id="loginForm" class="coach-login-form" novalidate>
              <label class="coach-field">
                <span aria-hidden="true">✉</span>
                <input id="loginEmail" type="email" autocomplete="email" inputmode="email" placeholder="Enter your email" required>
              </label>
              <label class="coach-field">
                <span aria-hidden="true">▣</span>
                <input id="loginPassword" type="password" autocomplete="current-password" placeholder="Enter your password" required>
                <button id="togglePassword" type="button" class="coach-password-toggle" aria-label="Show password">◉</button>
              </label>
              <div class="coach-login-options">
                <label class="coach-remember"><input id="rememberMe" type="checkbox" checked><span>Keep me signed in</span></label>
                <button id="forgotPassword" type="button" class="coach-forgot">Forgot password?</button>
              </div>
              <div id="loginMessage" class="login-message ${message?'show':''}" role="status" aria-live="polite">${escapeHtml(message)}</div>
              <button id="loginSubmit" class="coach-login-submit" type="submit"><span>Sign In</span><span aria-hidden="true">→</span></button>
              <a class="coach-login-athlete-switch" href="/athlete/">ATHLETE SIGN IN <span aria-hidden="true">→</span></a>
              <button class="coach-login-signup-tab" type="button" data-coach-signup="1">SIGN UP <span aria-hidden="true">→</span></button>
            </form>
            <div class="coach-login-access-note"><b>MW Coach requires an authorized MW Dynasty account.</b> Need account help? <a href="/support.html" target="_blank" rel="noopener">Contact MW Support</a>.</div>
            <div class="coach-login-access-note"><a href="/privacy.html" target="_blank" rel="noopener">Privacy</a> • <a href="/terms.html" target="_blank" rel="noopener">Terms</a> • <a href="/support.html" target="_blank" rel="noopener">Support</a></div>
          </div>
        </div>
      </div>

      <div class="coach-login-standard" aria-hidden="true"><b>MORE THAN SPORTS</b><span>A HIGHER STANDARD</span></div>

      <div class="coach-login-features" aria-label="MW Coach capabilities">
        <div><b>♟</b><span>MANAGE<br>ATHLETES</span></div>
        <div><b>▥</b><span>TRACK<br>PROGRESS</span></div>
        <div><b>▣</b><span>PLAN<br>SEASONS</span></div>
        <div><b>◉</b><span>AI<br>COACHING</span></div>
        <div><b>🏆</b><span>BUILD<br>CHAMPIONS</span></div>
      </div>
    </section>
  </div>`;
  bindLogin();
  if(new URLSearchParams(location.search).get('apply')==='1')renderCoachApplication();
}
/* MW coach signup tab hook */
document.addEventListener('click',function(e){const b=e.target.closest&&e.target.closest('[data-coach-signup]');if(!b)return;e.preventDefault();renderCoachApplication();});
function renderCoachApplication(){
  try{window.MWWebAnalytics?.track('signup_start',{audience:'coach',metadata:{flow:'coach_application'}})}catch{}
  const existing=document.getElementById('coachApplyModal');if(existing)existing.remove();
  const wrap=document.createElement('div');wrap.id='coachApplyModal';wrap.className='coach-apply-modal';
  wrap.innerHTML=`<div class="coach-apply-backdrop" data-close="1"></div><section class="coach-apply-card coach-signup-wizard" role="dialog" aria-modal="true" aria-labelledby="coachApplyTitle">
    <div class="coach-apply-head">
      <div><div class="coach-apply-kicker">MW DYNASTY • COACH ACCESS</div><h2 id="coachApplyTitle">Apply for Coach Access</h2><p>Coach accounts are verified before access is activated. Complete the steps below to build your coach profile and verify your coaching role.</p></div>
      <button type="button" class="coach-apply-close" data-close="1" aria-label="Close">×</button>
    </div>
    <div class="coach-signup-progress" aria-label="Coach application progress">
      <div class="active" data-progress-step="1"><b>1</b><span>Profile</span></div>
      <div data-progress-step="2"><b>2</b><span>Verification</span></div>
      <div data-progress-step="3"><b>3</b><span>Review</span></div>
    </div>
    <form id="coachApplyForm" class="coach-apply-form">
      <section class="coach-signup-step active" data-signup-step="1">
        <div class="coach-signup-step-head"><span>STEP 1 OF 3</span><h3>Coach Profile</h3><p>Tell MW Dynasty who you are and where you coach.</p></div>
        <div class="coach-apply-two"><label>First name<input id="applyFirst" required maxlength="80" autocomplete="given-name"></label><label>Last name<input id="applyLast" required maxlength="80" autocomplete="family-name"></label></div>
        <label>Email<input id="applyEmail" type="email" required maxlength="320" autocomplete="email"></label>
        <label>School / club / organization<input id="applyOrg" required maxlength="160" placeholder="Your current program or organization"></label>
        <label>Coach role / title<input id="applyCoachTitle" required maxlength="120" placeholder="Head Coach, Sprints Coach, Assistant Coach…"></label>
        <div class="coach-apply-two"><label>City<input id="applyCity" required maxlength="100" autocomplete="address-level2"></label><label>State<input id="applyState" required maxlength="80" autocomplete="address-level1"></label></div>
        <button class="coach-login-submit coach-signup-next" type="button" data-next-step="2"><span>Continue to Verification</span><span>→</span></button>
      </section>

      <section class="coach-signup-step" data-signup-step="2">
        <div class="coach-signup-step-head"><span>STEP 2 OF 3</span><h3>Verify Your Coaching Role</h3><p>This information helps MW Dynasty confirm that coach access is being requested by a real coach.</p></div>
        <div class="coach-apply-two">
          <label>Coaching level<select id="applyLevel" required><option value="">Select</option><option>High School</option><option>College</option><option>Club / AAU</option><option>Private Coach</option><option>Middle School</option><option>Professional</option><option>Other</option></select></label>
          <label>Years coaching<input id="applyYears" type="number" min="0" max="80" inputmode="numeric" required></label>
        </div>
        <label>Approximate athletes coached <span class="coach-apply-optional">(optional)</span><input id="applyAthleteCount" type="number" min="1" max="5000" inputmode="numeric" placeholder="Example: 24"></label>
        <label>How can we verify your coaching role?
          <select id="applyVerifyMethod" required>
            <option value="">Select a verification method</option>
            <option>School or organization staff directory</option>
            <option>School or organization website</option>
            <option>Professional coaching profile</option>
            <option>Program administrator / reference contact</option>
            <option>Other verifiable source</option>
          </select>
        </label>
        <label>Verification link or contact<input id="applyVerifyDetail" required maxlength="500" placeholder="Website URL, staff directory, administrator name/email, or other verification detail"></label>
        <label>Website or social coaching profile<input id="applySocial" maxlength="300" placeholder="Optional additional profile"></label>
        <div class="coach-signup-actions"><button class="coach-signup-back" type="button" data-prev-step="1">← Back</button><button class="coach-login-submit coach-signup-next" type="button" data-next-step="3"><span>Continue to Review</span><span>→</span></button></div>
      </section>

      <section class="coach-signup-step" data-signup-step="3">
        <div class="coach-signup-step-head"><span>STEP 3 OF 3</span><h3>Review & Submit</h3><p>We'll verify what we can automatically. If anything is unclear, MW Dynasty will review it—no extra work from you.</p></div>
        <div id="coachApplySummary" class="coach-apply-summary"></div>
        <label>Anything you'd like us to know? <span class="coach-apply-optional">(optional)</span><textarea id="applyReason" rows="3" maxlength="1600" placeholder="Optional"></textarea></label>
        <label class="coach-apply-certify"><input id="applyCertify" type="checkbox" required><span>I certify that the coaching and organization information I provided is accurate and may be verified by MW Dynasty.</span></label>
        <div id="coachApplyMessage" class="login-message" role="status" aria-live="polite"></div>
        <div class="coach-signup-actions"><button class="coach-signup-back" type="button" data-prev-step="2">← Back</button><button id="coachApplySubmit" class="coach-login-submit" type="submit"><span>Submit for Coach Verification</span><span>→</span></button></div>
      </section>
    </form>
    <p class="coach-apply-foot"><b>That's it.</b> We'll verify your coaching role first. If approved, you'll choose your membership, optionally add sponsored-athlete seats, and complete payment before Coach access is activated.</p>
  </section>`;
  document.body.appendChild(wrap);
  wrap.querySelectorAll('[data-close="1"]').forEach(x=>x.addEventListener('click',()=>wrap.remove()));
  wrap.querySelectorAll('[data-next-step]').forEach(x=>x.addEventListener('click',()=>goCoachSignupStep(Number(x.dataset.nextStep))));
  wrap.querySelectorAll('[data-prev-step]').forEach(x=>x.addEventListener('click',()=>showCoachSignupStep(Number(x.dataset.prevStep))));
  document.getElementById('coachApplyForm').addEventListener('submit',submitCoachApplication);
}
function showCoachSignupStep(step){
  document.querySelectorAll('#coachApplyModal [data-signup-step]').forEach(x=>x.classList.toggle('active',Number(x.dataset.signupStep)===step));
  document.querySelectorAll('#coachApplyModal [data-progress-step]').forEach(x=>{const n=Number(x.dataset.progressStep);x.classList.toggle('active',n===step);x.classList.toggle('done',n<step)});
  document.querySelector('#coachApplyModal .coach-apply-card')?.scrollTo({top:0,behavior:'smooth'});
}
function goCoachSignupStep(step){
  const current=step-1;
  const section=document.querySelector(`#coachApplyModal [data-signup-step="${current}"]`);
  if(section){
    const fields=[...section.querySelectorAll('input,select,textarea')];
    for(const field of fields){if(!field.checkValidity()){field.reportValidity();field.focus();return}}
  }
  if(step===3)renderCoachApplySummary();
  showCoachSignupStep(step);
}
function renderCoachApplySummary(){
  const v=id=>escapeHtml((document.getElementById(id)?.value||'').trim());
  const summary=document.getElementById('coachApplySummary');if(!summary)return;
  summary.innerHTML=`<div><span>Coach</span><b>${v('applyFirst')} ${v('applyLast')}</b></div>
    <div><span>Organization</span><b>${v('applyOrg')}</b></div>
    <div><span>Role</span><b>${v('applyCoachTitle')}</b></div>
    <div><span>Level</span><b>${v('applyLevel')}</b></div>
    <div><span>Verification</span><b>${v('applyVerifyMethod')}</b></div>`;
}
async function submitCoachApplication(e){
  e.preventDefault();
  const b=document.getElementById('coachApplySubmit'),m=document.getElementById('coachApplyMessage');
  const form=document.getElementById('coachApplyForm');
  if(!form.checkValidity()){form.reportValidity();return}
  const rawReason=document.getElementById('applyReason').value.trim();
  const verifyMethod=document.getElementById('applyVerifyMethod').value;
  const verifyDetail=document.getElementById('applyVerifyDetail').value.trim();
  const athleteCount=document.getElementById('applyAthleteCount').value;
  const payload={
    first_name:document.getElementById('applyFirst').value.trim(),
    last_name:document.getElementById('applyLast').value.trim(),
    email:document.getElementById('applyEmail').value.trim(),
    organization:document.getElementById('applyOrg').value.trim(),
    coach_title:document.getElementById('applyCoachTitle').value.trim(),
    city:document.getElementById('applyCity').value.trim(),
    state:document.getElementById('applyState').value.trim(),
    coaching_level:document.getElementById('applyLevel').value,
    years_coaching:document.getElementById('applyYears').value||null,
    website_or_social:document.getElementById('applySocial').value.trim(),
    verification_method:verifyMethod,
    verification_detail:verifyDetail,
    athlete_count:athleteCount?Number(athleteCount):null,
    channel:document.documentElement.classList.contains('mw-native-app')?'ios':'website',
    reason:rawReason
  };
  b.disabled=true;b.innerHTML='<span class="login-spinner"></span><span>Submitting for verification…</span>';m.textContent='Creating your pending coach application…';m.className='login-message show neutral';
  try{
    const r=await fetch(`${SUPABASE_URL}/functions/v1/mw-coach-apply`,{method:'POST',headers:{apikey:SUPABASE_KEY,'Content-Type':'application/json'},body:JSON.stringify(payload)});
    const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||'Application could not be submitted.');
    try{window.MWWebAnalytics?.track('signup_complete',{audience:'coach',metadata:{flow:'coach_application',verification_status:String(d.verification_status||'submitted')}})}catch{}
    const card=document.querySelector('#coachApplyModal .coach-apply-card');
    const auto=d.verification_status==='auto_approved',denied=d.verification_status==='denied';
    const kicker=auto?'COACH VERIFIED':denied?'VERIFICATION COMPLETE':'APPLICATION RECEIVED';
    const title=auto?'You’re Verified':denied?'Application Not Approved':'Quick Review Needed';
    const copy=auto?'We verified your coaching role automatically. Check your email for your secure setup link—membership and optional sponsored athletes are next.':denied?'We couldn’t approve this Coach application. If you believe this decision should be reviewed, MW Support can help.':'We received everything. A quick MW Dynasty review is needed before membership and payment unlock. You don’t need to submit anything again.';
    const steps=auto?'<span>1. Open the secure setup email.</span><span>2. Create your password and choose your Coach membership.</span><span>3. Add sponsored athletes if you want.</span><span>4. Complete payment and enter Coach MW Dynasty.</span>':denied?'<span>Contact MW Support if you believe the information should be reviewed.</span>':'<span>1. MW Dynasty reviews the verification details.</span><span>2. If approved, we email your secure setup link.</span><span>3. Choose membership, optional sponsored athletes, and pay.</span><span>4. Enter Coach MW Dynasty.</span>';
    if(card)card.innerHTML=`<div class="coach-apply-result">
      <div class="coach-apply-result-icon">${denied?'!':'✓'}</div>
      <div class="coach-apply-kicker">${kicker}</div>
      <h2>${title}</h2>
      <p>${copy}</p>
      <div class="coach-apply-next-steps"><b>What happens next</b>${steps}</div>
      <button type="button" class="coach-login-submit" data-finish-coach-apply="1"><span>Return to Coach Sign In</span><span>→</span></button>
    </div>`;
    card.querySelector('[data-finish-coach-apply]')?.addEventListener('click',()=>document.getElementById('coachApplyModal')?.remove());
  }catch(err){
    m.textContent=err.message;m.className='login-message show error';b.disabled=false;b.innerHTML='<span>Submit for Coach Verification</span><span>→</span>';
  }
}
async function verifyCoachAccess(session){
  let r;
  try{r=await fetch('/api/coach/access',{headers:{Authorization:`Bearer ${session.access_token}`}})}
  catch(e){const err=coachAccessError('Coach access is temporarily unavailable.',503);err.mwTransient=true;throw err}
  const d=await r.json().catch(()=>({}));
  if(!r.ok){
    if(window.MWResilience?.isTransientStatus?.(r.status))throw coachAccessError(d.error||'Coach access is temporarily unavailable.',r.status);
    throw coachAccessError(r.status===403?'This login is not an approved, active MW Coach account.':(d.error||'Coach access could not be verified.'),r.status)
  }
  accountAccess={role:d.role||null,tier:d.tier||null,isFounder:!!d.isFounder,firstName:d.firstName||'',lastName:d.lastName||'',organization:d.organization||'',coachTitle:d.coachTitle||'',email:d.email||''};
  window.MWDiag?.snapshot({audience:'coach',role:String(d.role||''),tier:String(d.tier||''),founder:!!d.isFounder,native:document.documentElement.classList.contains('mw-native-app')});
  if(accountAccess.isFounder){experience='performance';return d;}
  const map={core:'core',intelligence:'intelligence',mw_sprint_performance:'performance'};
  if(!map[d.tier])throw new Error('This coach account does not have an active MW Coach tier.');
  experience=map[d.tier];
  return d;
}
function setLoginMessage(text,type='error'){
  const el=document.getElementById('loginMessage');if(!el)return;el.textContent=text;el.className=`login-message show ${type}`;
}
function setLoginBusy(busy){
  const b=document.getElementById('loginSubmit');if(!b)return;b.disabled=busy;b.innerHTML=busy?'<span class="login-spinner" aria-hidden="true"></span><span>Signing In…</span>':'<span>Sign In</span><span aria-hidden="true">→</span>';
}
async function supabasePasswordLogin(email,password){
  const r=await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`,{method:'POST',headers:{apikey:SUPABASE_KEY,'Content-Type':'application/json'},body:JSON.stringify({email,password})});
  const data=await r.json().catch(()=>({}));
  if(!r.ok)throw new Error(data.error_description||data.msg||data.message||'Unable to sign in. Check your email and password.');
  return data;
}
async function validateSession(session){
  if(!session?.access_token)return false;
  let r;
  try{r=await fetch(`${SUPABASE_URL}/auth/v1/user`,{headers:{apikey:SUPABASE_KEY,Authorization:`Bearer ${session.access_token}`}})}
  catch(e){const err=coachAccessError('Coach authentication is temporarily unavailable.',503);err.mwTransient=true;throw err}
  if(window.MWResilience?.isTransientStatus?.(r.status))throw coachAccessError('Coach authentication is temporarily unavailable.',r.status);
  return r.ok;
}
function storedSessionIsPersistent(){return !!localStorage.getItem(SESSION_KEY)}
async function refreshCoachSession(session){
  if(!session?.refresh_token)return null;
  let r;
  try{r=await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`,{method:'POST',headers:{apikey:SUPABASE_KEY,'Content-Type':'application/json'},body:JSON.stringify({refresh_token:session.refresh_token})})}
  catch(e){const err=coachAccessError('Coach session refresh is temporarily unavailable.',503);err.mwTransient=true;throw err}
  const d=await r.json().catch(()=>null);
  if(!r.ok||!d?.access_token){
    if(window.MWResilience?.isTransientStatus?.(r.status))throw coachAccessError(d?.error_description||d?.msg||'Coach session refresh is temporarily unavailable.',r.status);
    return null
  }
  persistSession(d,storedSessionIsPersistent());return d;
}
function persistSession(session,remember=true){
  authSession=session;
  if(remember){localStorage.setItem(SESSION_KEY,JSON.stringify(session));sessionStorage.removeItem(SESSION_KEY)}else{sessionStorage.setItem(SESSION_KEY,JSON.stringify(session));localStorage.removeItem(SESSION_KEY)}
}
function clearSession(){authSession=null;localStorage.removeItem(SESSION_KEY);sessionStorage.removeItem(SESSION_KEY)}
function readStoredSession(){
  try{return JSON.parse(localStorage.getItem(SESSION_KEY)||sessionStorage.getItem(SESSION_KEY)||'null')}catch{return null}
}
async function signOut(){
  if(window.__mwCoachNotificationPoll){clearInterval(window.__mwCoachNotificationPoll);window.__mwCoachNotificationPoll=null}
  const token=authSession?.access_token;
  clearSession();
  if(token){try{await fetch(`${SUPABASE_URL}/auth/v1/logout`,{method:'POST',headers:{apikey:SUPABASE_KEY,Authorization:`Bearer ${token}`}})}catch{}}
  renderLogin('You have been signed out.');
}

function renderCoachMembershipSelection(session=authSession){
  if(session?.access_token)authSession=session;
  const isNative=document.documentElement.classList.contains('mw-native-app');
  let selected='core',sponsorOn=false,sponsorQty=1;
  const planCards=()=>Object.entries(PLANS).map(([key,p])=>`<button type="button" class="coach-member-plan ${key===selected?'selected':''}" data-member-plan="${key}">
    <span class="coach-member-check">✓</span><span class="coach-member-plan-name">${escapeHtml(p.name)}</span>
    <b>&#36;${p.monthly}<small>/mo</small></b><span>${key==='core'?'Team management + core coaching tools':key==='intelligence'?'Core tools + Coach MW intelligence':'Complete MW sprint system + intelligence'}</span>
  </button>`).join('');
  const draw=()=>{
    const p=PLANS[selected],sponsorTotal=sponsorOn?sponsorQty*p.sponsor:0,total=p.monthly+sponsorTotal;
    app.innerHTML=`<div class="coach-membership-screen">
      <section class="coach-membership-shell">
        <div class="coach-membership-progress"><span class="done">✓ Verified</span><i></i><span class="active">2 Membership</span><i></i><span>3 Payment</span><i></i><span>4 Start Coaching</span></div>
        <div class="coach-membership-head"><div class="coach-apply-kicker">MW DYNASTY • COACH</div><h1>Choose what fits your program.</h1><p>Your coaching role is verified. Pick a membership, add sponsored athletes only if you want them, then you're ready for checkout.</p></div>
        <div class="coach-membership-plans">${planCards()}</div>
        <div class="coach-sponsor-choice">
          ${isNative
            ? `<div><b>Sponsored athletes come next</b><span>Activate your Coach membership through the App Store first. You can add sponsored-athlete seats from Account & Billing immediately after activation.</span></div>`
            : `<div><b>Sponsor athletes?</b><span>Optional. You can also add sponsored athletes later.</span></div>
               <div class="coach-sponsor-buttons"><button type="button" data-sponsor="no" class="${!sponsorOn?'selected':''}">No thanks</button><button type="button" data-sponsor="yes" class="${sponsorOn?'selected':''}">Yes, add athletes</button></div>
               ${sponsorOn?`<div class="coach-sponsor-qty"><button type="button" data-qty="-1" aria-label="Remove one athlete">−</button><div><b>${sponsorQty}</b><span>Sponsored athlete${sponsorQty===1?'':'s'} · &#36;${p.sponsor}/athlete/mo</span></div><button type="button" data-qty="1" aria-label="Add one athlete">+</button></div>`:''}`}
        </div>
        <div class="coach-membership-total"><div><span>Coach membership</span><b>&#36;${p.monthly}/mo</b></div>${!isNative&&sponsorOn?`<div><span>${sponsorQty} sponsored athlete${sponsorQty===1?'':'s'}</span><b>&#36;${sponsorTotal}/mo</b></div>`:''}<div class="total"><span>Total today</span><b>&#36;${isNative?p.monthly:total}/mo</b></div></div>
        <button type="button" id="coachMembershipContinue" class="coach-login-submit coach-membership-continue"><span>${isNative?'Continue to App Purchase':'Continue to Secure Payment'}</span><span>→</span></button>
        ${isNative?'<button type="button" id="coachRestorePurchase" class="back" style="width:100%;margin-top:10px">Restore App Store Purchase</button>':''}
        <p class="coach-membership-note">No setup fee. Sponsorship is optional. Your Coach dashboard unlocks after payment is confirmed.</p>
        <div id="coachMembershipMessage" class="login-message" role="status" aria-live="polite"></div>
      </section>
    </div>`;
    app.querySelectorAll('[data-member-plan]').forEach(b=>b.onclick=()=>{selected=b.dataset.memberPlan;draw()});
    app.querySelectorAll('[data-sponsor]').forEach(b=>b.onclick=()=>{sponsorOn=b.dataset.sponsor==='yes';draw()});
    app.querySelectorAll('[data-qty]').forEach(b=>b.onclick=()=>{sponsorQty=Math.max(1,Math.min(250,sponsorQty+Number(b.dataset.qty||0)));draw()});
    document.getElementById('coachMembershipContinue').onclick=async()=>{
      const btn=document.getElementById('coachMembershipContinue'),msg=document.getElementById('coachMembershipMessage'),plan=PLANS[selected],qty=sponsorOn?sponsorQty:0;
      btn.disabled=true;msg.textContent='Preparing your membership…';msg.className='login-message show neutral';
      try{
        const token=authSession?.access_token||session?.access_token;if(!token)throw new Error('Your secure setup session expired. Sign in again.');
        if(isNative){
          if(qty>0)throw new Error('Sponsored-athlete seats are added through Coach billing after your App Store Coach membership is active. Choose “No thanks” here, then add seats from your Coach account.');
          const save=await fetch(`${SUPABASE_URL}/rest/v1/rpc/mw_mark_membership_checkout_started`,{method:'POST',headers:{apikey:SUPABASE_KEY,Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({p_plan_code:plan.planCode,p_sponsor_quantity:0,p_provider:'apple',p_provider_reference:null})});
          const saved=await save.json().catch(()=>({}));if(!save.ok)throw new Error(saved.message||saved.hint||'Membership choice could not be saved.');
          const nativePurchase=window.webkit?.messageHandlers?.mwPurchase;
          if(!nativePurchase)throw new Error('App Store purchase is not available in this build yet. Your membership choice is saved.');
          nativePurchase.postMessage({planCode:plan.planCode,sponsorQuantity:0,accessToken:token});
          msg.textContent='Opening the App Store purchase…';return;
        }
        const r=await fetch('/api/stripe/checkout',{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({planCode:plan.planCode,sponsorQuantity:qty})});
        const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||'Secure checkout could not start.');
        if(!d.url)throw new Error('Secure checkout link was not returned.');
        location.assign(d.url);
      }catch(e){msg.textContent=e.message||'Membership setup could not continue.';msg.className='login-message show error';btn.disabled=false}
    };
    if(isNative&&document.getElementById('coachRestorePurchase')){
      document.getElementById('coachRestorePurchase').onclick=()=>{
        const token=authSession?.access_token||session?.access_token,restore=window.webkit?.messageHandlers?.mwRestorePurchase;
        if(!token||!restore){msg.textContent='App Store restore is not available in this build yet.';msg.className='login-message show error';return}
        msg.textContent='Checking your App Store membership…';msg.className='login-message show neutral';
        restore.postMessage({planCode:PLANS[selected].planCode,accessToken:token});
      };
    }
  };
  draw();
  (async()=>{
    const token=authSession?.access_token||session?.access_token;if(!token)return;
    try{
      const r=await fetch(`${SUPABASE_URL}/rest/v1/onboarding_journeys?audience=eq.coach&select=selected_plan_code,sponsored_athlete_seats,payment_status&order=updated_at.desc&limit=1`,{headers:{apikey:SUPABASE_KEY,Authorization:`Bearer ${token}`}});
      const rows=await r.json().catch(()=>[]),journey=Array.isArray(rows)?rows[0]:null;
      if(journey){
        const map={coach_core:'core',coach_intelligence:'intelligence',mw_sprint_performance:'performance'},key=map[journey.selected_plan_code];
        if(key&&PLANS[key])selected=key;
        sponsorQty=Math.max(1,Math.min(250,Number(journey.sponsored_athlete_seats||1)));sponsorOn=!isNative&&Number(journey.sponsored_athlete_seats||0)>0;draw();
      }
      if(new URLSearchParams(location.search).get('checkout')==='cancelled'){
        const msg=document.getElementById('coachMembershipMessage');if(msg){msg.textContent='Checkout was cancelled. Your membership choice is saved — continue whenever you’re ready.';msg.className='login-message show neutral'}
      }
    }catch{}
  })();
}

window.mwNativePurchaseResult=function(result){
  window.MWDiag?.event('storekit_result',{severity:result?.ok?'info':(result?.cancelled?'info':'warn'),code:result?.ok?'verified':result?.cancelled?'cancelled':result?.pending?'pending':'failed',context:{ok:!!result?.ok,restored:!!result?.restored,pending:!!result?.pending,cancelled:!!result?.cancelled,plan_code:String(result?.planCode||'')}});
  const msg=document.getElementById('coachMembershipMessage'),btn=document.getElementById('coachMembershipContinue');
  if(result?.ok){
    if(msg){msg.textContent='Payment confirmed. Activating your Coach account…';msg.className='login-message show neutral'}
    setTimeout(()=>location.reload(),700);return;
  }
  if(msg){msg.textContent=result?.error||'App Store purchase could not be confirmed.';msg.className='login-message show error'}
  if(btn)btn.disabled=false;
};

function bindLogin(){
  const form=document.getElementById('loginForm'),pass=document.getElementById('loginPassword'),toggle=document.getElementById('togglePassword'),forgot=document.getElementById('forgotPassword');
  toggle.addEventListener('click',()=>{const show=pass.type==='password';pass.type=show?'text':'password';toggle.textContent=show?'Hide':'Show';toggle.setAttribute('aria-label',show?'Hide password':'Show password')});
  forgot.addEventListener('click',async()=>{
    const email=document.getElementById('loginEmail').value.trim();
    if(!email)return setLoginMessage('Enter your email address first, then tap Forgot password.');
    forgot.disabled=true;forgot.textContent='Sending…';
    try{const redirectTo=location.origin+'/coach/';const r=await fetch(`${SUPABASE_URL}/auth/v1/recover?redirect_to=${encodeURIComponent(redirectTo)}`,{method:'POST',headers:{apikey:SUPABASE_KEY,'Content-Type':'application/json'},body:JSON.stringify({email})});if(!r.ok){const d=await r.json().catch(()=>({}));throw new Error(d.msg||d.message||'Unable to send reset email.')}setLoginMessage('Password reset email sent. Check your inbox.','success')}catch(e){setLoginMessage(e.message)}finally{forgot.disabled=false;forgot.textContent='Forgot password?'}
  });
  form.addEventListener('submit',async e=>{
    e.preventDefault();
    const email=document.getElementById('loginEmail').value.trim(),password=pass.value,remember=document.getElementById('rememberMe').checked;
    if(!email||!password)return setLoginMessage('Enter both your email address and password.');
    setLoginBusy(true);setLoginMessage('Signing you in…','neutral');
    try{
      const session=await supabasePasswordLogin(email,password);
      persistSession(session,remember);
      try{await verifyCoachAccess(session);dashboard()}
      catch(accessErr){
        if(coachTransient(accessErr)){setLoginMessage('Signed in, but MW is having a temporary connection issue. Your Coach session is safe and will reconnect automatically.','neutral');return}
        renderCoachMembershipSelection(session)
      }
    }catch(err){
      if(coachTransient(err)&&authSession?.access_token){setLoginMessage('Connection interrupted after sign-in. Your Coach session is safe and will reconnect automatically.','neutral')}
      else{clearSession();setLoginMessage(err.message)}
    }finally{setLoginBusy(false)}
  });
}
function recoverySessionFromUrl(){
  const h=new URLSearchParams(location.hash.replace(/^#/,''));
  const type=h.get('type')||'';
  if(!['recovery','invite'].includes(type)||!h.get('access_token'))return null;
  return {mw_link_type:type,access_token:h.get('access_token'),refresh_token:h.get('refresh_token')||'',token_type:h.get('token_type')||'bearer',expires_in:Number(h.get('expires_in')||3600),expires_at:Math.floor(Date.now()/1000)+Number(h.get('expires_in')||3600)};
}
function renderCoachPasswordReset(session){
  authSession=session;
  app.innerHTML=`<div class="coach-login-screen"><section class="coach-login-stage"><div class="coach-login-bg" aria-hidden="true"></div><div class="coach-login-content"><div class="coach-login-card-wrap"><div class="coach-login-card"><div class="coach-login-mobile-brand"><span>MW</span> DYNASTY · COACH</div><h2>${session.mw_link_type==='invite'?'Finish Your Coach Setup':'Create New Password'}</h2><p>${session.mw_link_type==='invite'?'You’re verified. Create your password, then choose your membership.':'Choose a new password for your MW Dynasty Coach account.'}</p><form id="coachResetForm" class="coach-login-form"><label class="coach-field"><span>▣</span><input id="coachResetPassword" type="password" autocomplete="new-password" placeholder="At least 8 characters" required></label><label class="coach-field"><span>▣</span><input id="coachResetConfirm" type="password" autocomplete="new-password" placeholder="Confirm new password" required></label><div id="coachResetMessage" class="login-message" role="status"></div><button id="coachResetSubmit" class="coach-login-submit" type="submit"><span>Save New Password</span><span>→</span></button></form></div></div></div></section></div>`;
  document.getElementById('coachResetForm').onsubmit=async e=>{
    e.preventDefault();const p=document.getElementById('coachResetPassword').value,q=document.getElementById('coachResetConfirm').value,m=document.getElementById('coachResetMessage'),b=document.getElementById('coachResetSubmit');
    const say=(t,bad=true)=>{m.textContent=t;m.className='login-message show '+(bad?'error':'success')};
    if(p.length<8)return say('Use at least 8 characters.');if(p!==q)return say('The passwords do not match.');
    b.disabled=true;b.textContent='Saving…';
    try{const r=await fetch(`${SUPABASE_URL}/auth/v1/user`,{method:'PUT',headers:{apikey:SUPABASE_KEY,Authorization:`Bearer ${session.access_token}`,'Content-Type':'application/json'},body:JSON.stringify({password:p})});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.msg||d.message||'Password could not be updated.');history.replaceState({},document.title,location.pathname);if(session.mw_link_type==='invite'){persistSession(session,true);renderCoachMembershipSelection(session)}else{clearSession();renderLogin('Password updated. Sign in with your new password.')}}catch(err){say(err.message||'Password could not be updated.');b.disabled=false;b.innerHTML='<span>Save New Password</span><span>→</span>'}
  };
}
async function waitForCoachActivation(session){
  const params=new URLSearchParams(location.search);
  if(params.get('checkout')!=='success')return false;
  app.innerHTML=`<div class="coach-membership-screen"><section class="coach-membership-shell coach-membership-finalizing"><div class="coach-apply-kicker">MW DYNASTY • PAYMENT RECEIVED</div><h1>Setting up your Coach account…</h1><p>Payment is complete. We’re unlocking your membership and sponsored-athlete seats now.</p><div class="login-spinner" aria-hidden="true"></div></section></div>`;
  for(let i=0;i<10;i++){
    try{await verifyCoachAccess(session);history.replaceState({},document.title,location.pathname);dashboard();return true}catch{}
    await new Promise(r=>setTimeout(r,1200));
  }
  history.replaceState({},document.title,location.pathname);
  renderCoachMembershipSelection(session);
  const msg=document.getElementById('coachMembershipMessage');
  if(msg){msg.textContent='Payment was received and activation is still syncing. Give it a moment, then sign in again.';msg.className='login-message show neutral'}
  return true;
}

async function initAuth(){
  await loadPricingCatalog();
  const recovery=recoverySessionFromUrl();if(recovery){renderCoachPasswordReset(recovery);return}
  const stored=readStoredSession();
  if(stored){
    authSession=stored;
    try{
      let active=stored;
      if(!(await validateSession(active)))active=await refreshCoachSession(active);
      if(active&&await validateSession(active)){
        if(await waitForCoachActivation(active))return;
        try{await verifyCoachAccess(active);dashboard();return}
        catch(accessErr){
          if(coachTransient(accessErr))throw accessErr;
          renderCoachMembershipSelection(active);return
        }
      }
    }catch(err){
      if(coachTransient(err)){
        renderLogin('MW is having a temporary connection issue. Your saved Coach session is safe; we’ll reconnect automatically.');
        return
      }
    }
    clearSession();
  }
  renderLogin();
  const params=new URLSearchParams(location.search);
  if(params.get('apply')==='1'){setTimeout(()=>renderCoachApplication(),50);}
}


/* ===== V11.21 FULL INTERACTIVE INTERFACES ===== */
function mwSessionToken(){return authSession?.access_token||readStoredSession()?.access_token||''}
async function mwCurrentUser(){
  if(authSession?.user?.id)return authSession.user;
  const token=mwSessionToken(); if(!token)return null;
  const r=await fetch(`${SUPABASE_URL}/auth/v1/user`,{headers:{apikey:SUPABASE_KEY,Authorization:`Bearer ${token}`}});
  if(!r.ok)return null; return await r.json();
}
function mwModal(title,body){
  document.getElementById('mwModal')?.remove();
  const el=document.createElement('div');el.id='mwModal';el.className=`mw-modal ${PLANS[experience].theme}`;
  el.innerHTML=`<div class="mw-modal-backdrop" data-close-modal></div><section class="mw-modal-card" role="dialog" aria-modal="true" aria-label="${escapeHtml(title)}"><div class="mw-modal-head"><div><div class="eyebrow">${PLANS[experience].name}</div><h2>${escapeHtml(title)}</h2></div><button class="back" type="button" data-close-modal>✕</button></div><div class="mw-modal-body">${body}</div></section>`;
  document.body.appendChild(el);el.querySelectorAll('[data-close-modal]').forEach(x=>x.onclick=()=>el.remove());return el;
}
function mwStore(key,value){localStorage.setItem('mwCoach:'+key,JSON.stringify(value))}
function mwLoad(key,fallback){try{return JSON.parse(localStorage.getItem('mwCoach:'+key)||'null')??fallback}catch{return fallback}}
async function fetchCoachRoster(){
  const token=mwSessionToken();if(!token)throw new Error('Coach session expired. Sign in again.');
  const r=await fetch('/api/coach/roster',{headers:{Authorization:`Bearer ${token}`}});
  const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||'Roster could not be loaded.');return d;
}
async function fetchCoachPerformance(athleteId=''){
  const token=mwSessionToken();if(!token)throw new Error('Coach session expired. Sign in again.');
  const qs=athleteId?`?athleteId=${encodeURIComponent(athleteId)}`:'';
  const r=await fetch('/api/coach/performance'+qs,{headers:{Authorization:`Bearer ${token}`},cache:'no-store'});
  const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||'Performance intelligence could not be loaded.');return d;
}
async function hydrateLivePerformanceSummary(){
  const stat=document.querySelector('[data-stat="Pace Execution"] b');if(!stat)return;
  try{const d=await fetchCoachPerformance();if(d.rep_tracking_enabled===false){stat.textContent='MW ONLY';return}const v=d.summary?.average_latest_execution_pct;stat.textContent=v==null?'—':`${v}%`}catch{stat.textContent='—'}
}
async function hydratePerformanceInsightPreview(){
  const el=document.getElementById('performanceInsightPreview');if(!el)return;
  try{const d=await fetchCoachPerformance();if(d.rep_tracking_enabled===false){el.innerHTML='<div class="insight"><span class="insight-symbol" style="color:#e3b51d">★</span><div><h4>Rep Tracking — MW System Exclusive</h4><p>Rep-by-rep sprint execution is reserved for the MW Sprint Performance System. Coach Intelligence still supports your coaching workflow without exposing MW rep tracking.</p></div><span>PREMIUM</span></div>';return}const a=d.athletes||[],s=d.summary||{},flagged=a.filter(x=>(x.flags||[]).length).sort((x,y)=>((y.flags||[]).some(f=>f.level==='attention')?2:1)-((x.flags||[]).some(f=>f.level==='attention')?2:1)),first=flagged[0];
    const cards=[`<div class="insight"><span class="insight-symbol" style="color:#159bff">◷</span><div><h4>Pace Execution</h4><p>${s.average_latest_execution_pct!=null?`${s.average_latest_execution_pct}% average across latest check-ins.`:'No pace check-ins recorded yet.'}</p></div><span>LIVE</span></div>`,`<div class="insight"><span class="insight-symbol" style="color:#e3b51d">!</span><div><h4>Coach Review</h4><p>${s.review_flags||0} review flag${Number(s.review_flags||0)===1?'':'s'} · ${s.watch_flags||0} watch flag${Number(s.watch_flags||0)===1?'':'s'}.</p></div><span>LIVE</span></div>`];
    if(first){const roster=await fetchCoachRoster(),name=(roster.athletes||[]).find(x=>x.id===first.athlete_id)?.name||'Athlete',msg=first.flags?.[0]?.message||'Performance trend worth review';cards.push(`<div class="insight"><span class="insight-symbol" style="color:#ff8d66">↗</span><div><h4>${escapeHtml(name)}</h4><p>${escapeHtml(msg)}</p></div><span>REVIEW</span></div>`)}
    el.innerHTML=cards.join('');
  }catch(e){el.innerHTML=`<div class="tile"><h3>Performance intelligence unavailable</h3><p>${escapeHtml(e.message)}</p></div>`}
}
async function hydrateLiveAthleteCount(){
  const stat=document.querySelector('[data-stat="Athletes"] b');if(!stat)return;
  try{const d=await fetchCoachRoster();stat.textContent=String(d.count??d.athletes?.length??0)}catch{}
}
function fmtDate(v){if(!v)return '—';try{return new Date(v).toLocaleDateString()}catch{return '—'}}
async function athleteDetail(athleteId){
  const modal=mwModal('Athlete Profile',`<div id="athleteDetailState" class="tile">Loading live athlete record…</div>`);
  const state=modal.querySelector('#athleteDetailState');
  try{
    const token=mwSessionToken();if(!token)throw new Error('Coach session expired. Sign in again.');
    const [r,perfD]=await Promise.all([fetch(`/api/coach/athlete?id=${encodeURIComponent(athleteId)}`,{headers:{Authorization:`Bearer ${token}`}}),fetchCoachPerformance(athleteId).catch(()=>({athlete:null}))]);
    const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||'Athlete record could not be loaded.');
    const a=d.athlete||{},prs=Array.isArray(a.prs)?a.prs:[],notes=Array.isArray(a.notes)?a.notes:[],assignedCheckins=Array.isArray(a.assigned_training_checkins)?a.assigned_training_checkins:[],sponsorship=a.sponsorship||{billing_type:'self_pay',has_entitlement:false},isSponsored=sponsorship.billing_type==='coach_sponsored',sponsorshipEnding=sponsorship.sponsorship_status==='ending',perf=perfD.athlete||null,repTrackingEnabled=perfD.rep_tracking_enabled!==false;
    modal.querySelector('.mw-modal-head h2').textContent=a.name||'Athlete Profile';
    state.outerHTML=`<div id="athleteDetailLive">
      <div class="panel-grid">
        <div class="tile"><h3>Events</h3><p>${escapeHtml(a.event||'Events not set')}</p><small>${a.track_training_years!=null?escapeHtml(String(a.track_training_years))+' years consistent training':escapeHtml(a.experience_level||'Experience level not set')}</small></div>
        <div class="tile"><h3>Program</h3><p><b>Week ${Number(a.current_week||1)} · Day ${Number(a.current_day||1)}</b></p><small>${escapeHtml(String(a.program_status||'On Track'))}</small></div>
        <div class="tile"><h3>Track Tier</h3><p><b>${escapeHtml(String(a.track_tier||'foundation').toUpperCase())}</b></p><small>${escapeHtml(a.program_version||'mw-41-tiered-v2.9')}</small></div>
        <div class="tile"><h3>Strength Tier</h3><p><b>${escapeHtml(String(a.strength_tier||'foundation').toUpperCase())}</b></p><small>Shared with athlete + Coach MW</small></div>
        <div class="tile"><h3>Starting Week</h3><p>${Number(a.starting_week||1)}</p><small>Program start: ${escapeHtml(fmtDate(a.program_start_date))}</small></div>
        <div class="tile"><h3>Last Workout</h3><p>${escapeHtml(fmtDate(a.last_completed_workout_at))}</p><small>Live MW athlete record</small></div>
      </div>
      <div class="tile" style="margin-top:14px"><h3>Athlete Goal</h3><p>${escapeHtml(a.training_goal||'No Athlete Goal has been set yet.')}</p><small>Set by the athlete in MW Smart Entry or Athlete Profile</small></div>
      <div class="tile" style="margin-top:14px"><h3>Membership Responsibility</h3><p><b>${isSponsored?'Coach Sponsored':'Athlete Self-Pay'}</b></p><small>${isSponsored?`Sponsored rate: ${sponsorship.sponsored_athlete_price_cents?mwMoney(Number(sponsorship.sponsored_athlete_price_cents))+'/month':'current coach tier rate'}${sponsorship.access_ends_at?' · access scheduled through '+escapeHtml(fmtDate(sponsorship.access_ends_at)):''}`:'This athlete is responsible for their own MW Athlete membership.'}</small>${accountAccess.role==='coach'&&isSponsored?`<div style="margin-top:12px"><button class="${sponsorshipEnding?'action':'back'}" id="athSponsorshipAction">${sponsorshipEnding?'Resume Sponsorship':'Schedule Sponsorship End'}</button><div id="athSponsorshipState" style="margin-top:8px"></div></div>`:''}</div>
      <div class="tile" style="margin-top:14px"><h3>Performance Intelligence</h3>${!repTrackingEnabled?'<div class="lockNote"><b>MW SPRINT PERFORMANCE EXCLUSIVE</b><br>Rep-by-rep sprint tracking is available only inside the MW Sprint Performance System.</div>':perf?.sprint?.latest?`<div class="panel-grid" style="margin-top:10px"><div class="tile"><h3>Pace Execution</h3><p><b>${perf.sprint.latest.execution_score_pct??'—'}%</b></p><small>${perf.sprint.latest.source==='quick_checkin'?'Quick athlete check-in':'Detailed timed session'}</small></div><div class="tile"><h3>Consistency</h3><p><b>${perf.sprint.latest.consistency_score??'—'}</b></p><small>Rep execution score</small></div><div class="tile"><h3>Late Drop-Off</h3><p><b>${perf.sprint.latest.first_to_last_dropoff_pct??'—'}%</b></p><small>First rep → last rep</small></div><div class="tile"><h3>Session RPE</h3><p><b>${perf.sprint.latest.session_rpe??'—'}/10</b></p><small>Athlete reported effort</small></div></div><p style="margin-top:10px"><b>${escapeHtml(perf.sprint.latest.reason||'Performance recorded')}</b><br><small>Trend: ${escapeHtml(String(perf.sprint.trend||'insufficient data').replaceAll('_',' '))}. These are coaching signals, not medical conclusions.</small></p><div class="list" style="margin-top:10px">${(perf.sprint.sessions||[]).slice(0,5).map(x=>`<div class="row"><span><b>Week ${x.program_week} · Day ${x.program_day}</b><br><small>${x.rep_count} timed reps · ${x.session_rpe?`RPE ${x.session_rpe}/10 · `:''}${escapeHtml(x.reason||'Recorded')}</small></span><b>${x.execution_score_pct==null?'—':x.execution_score_pct+'%'}</b></div>`).join('')}</div>`:'<p>No pace check-in yet. Once the athlete taps DONE, their pace check-in will appear here.</p>'}${perf?.strength?.latest_checkin?`<div style="margin-top:14px;border-top:1px solid #263641;padding-top:12px"><h3>Strength Check-In</h3><p><b>${perf.strength.latest_checkin.status==='as_prescribed'?'✓ Completed as written':'↔ Modified'}</b></p><small>Week ${perf.strength.latest_checkin.program_week} · ${escapeHtml(perf.strength.latest_checkin.day_label||'Strength day')}</small></div>`:''}${perf?.strength?.latest?`<details style="margin-top:12px"><summary style="cursor:pointer;color:#adbdc8">Detailed strength log</summary><p>${perf.strength.latest.set_count} logged sets · ${perf.strength.latest.actual_volume??0} volume (${escapeHtml(perf.strength.latest.sets?.[0]?.weight_unit||'lb')})</p><small>${escapeHtml((perf.strength.latest.exercises||[]).join(' · '))}</small></details>`:''}</div>
      <div class="tile" style="margin-top:14px"><h3>Coach-Assigned Training Check-Ins</h3>${assignedCheckins.length?`<div class="list">${assignedCheckins.slice(0,10).map(x=>`<div class="row"><span><b>${escapeHtml(String(x.status||'completed').replaceAll('_',' ').toUpperCase())}</b><br><small>${escapeHtml(fmtDate(x.completed_at))}${x.session_rpe?` · RPE ${x.session_rpe}/10`:''}${x.pace_check_status?` · ${escapeHtml(String(x.pace_check_status).replaceAll('_',' '))}`:''}${x.pace_reps_total!=null?` · ${Number(x.pace_reps_hit||0)}/${Number(x.pace_reps_total)} reps`:''}</small>${x.athlete_note?`<br><small>${escapeHtml(x.athlete_note)}</small>`:''}</span></div>`).join('')}</div>`:'<p>No coach-assigned training check-ins yet.</p>'}</div>
      <div class="tile" style="margin-top:14px"><h3>Personal Records</h3>${prs.length?`<div class="list">${prs.map(pr=>`<div class="row"><span><b>${escapeHtml(pr.event)}</b><br><small>${pr.verified?'Verified':'Athlete entered'} · ${pr.timing_method==='fat'?'Fully automatic':pr.timing_method==='hand'?'Hand timed':'Timing unknown'}${pr.date_recorded?' · '+escapeHtml(fmtDate(pr.date_recorded)):''}</small></span><b>${escapeHtml(String(pr.time_seconds))}s</b></div>`).join('')}</div>`:'<p>No PRs recorded yet.</p>'}</div>
      <div class="tile" style="margin-top:14px"><h3>Assessment Weight-Room Maximums</h3>${a.strength_maxes?`<div class="list"><div class="row"><span>Power Clean</span><b>${a.strength_maxes.power_clean_max??'Not established'} ${a.strength_maxes.power_clean_max!=null?escapeHtml(a.strength_maxes.weight_unit||'lb'):''}</b></div><div class="row"><span>Front Squat</span><b>${a.strength_maxes.front_squat_max??'Not established'} ${a.strength_maxes.front_squat_max!=null?escapeHtml(a.strength_maxes.weight_unit||'lb'):''}</b></div><div class="row"><span>Back Squat</span><b>${a.strength_maxes.back_squat_max??'Not established'} ${a.strength_maxes.back_squat_max!=null?escapeHtml(a.strength_maxes.weight_unit||'lb'):''}</b></div><div class="row"><span>${a.strength_maxes.deadlift_type==='trap_bar'?'Trap-Bar Deadlift':'Deadlift'}</span><b>${a.strength_maxes.deadlift_max??'Not established'} ${a.strength_maxes.deadlift_max!=null?escapeHtml(a.strength_maxes.weight_unit||'lb'):''}</b></div></div>`:'<p>No lifting maximums established. Use Foundation technique loading.</p>'}</div>
      <div class="form" style="margin-top:14px"><h3>Coach-Approved Assignment</h3><label>Track Tier<select id="athTrackTier"><option value="foundation">Foundation</option><option value="development">Development</option><option value="performance">Performance</option></select></label><label>Strength Tier<select id="athStrengthTier"><option value="foundation">Foundation</option><option value="development">Development</option><option value="performance">Performance</option></select></label><label>Official Week<input id="athProgramWeek" type="number" min="1" max="41" value="${Number(a.current_week||1)}"></label><label>Reason<textarea id="athAssignmentReason" rows="3" maxlength="1000" placeholder="Why is this assignment appropriate?"></textarea></label><button class="action" id="saveAthAssignment">Approve & Sync Assignment</button><div id="athAssignmentState"></div></div>
      <div class="tile" style="margin-top:14px"><h3>Private Coach Notes</h3><div id="athleteNotes">${notes.length?notes.map(n=>`<div class="row"><span>${escapeHtml(n.note)}<br><small>${escapeHtml(fmtDate(n.created_at))}</small></span></div>`).join(''):'<p>No coach notes yet.</p>'}</div></div>
      <div class="form" style="margin-top:14px"><label>Add Private Coach Note<textarea rows="4" id="athNote" maxlength="5000" placeholder="Add a private coaching note…"></textarea></label><button class="action" id="saveAthNote">Save Note</button><div id="athNoteState"></div></div>
    </div>`;
    const sponsorshipBtn=modal.querySelector('#athSponsorshipAction');
    if(sponsorshipBtn)sponsorshipBtn.onclick=async()=>{
      const msg=modal.querySelector('#athSponsorshipState'),ending=sponsorshipEnding;
      if(!ending&&!confirm('Schedule this coach sponsorship to end in 30 days? The athlete keeps their account and can move to self-pay.'))return;
      sponsorshipBtn.disabled=true;sponsorshipBtn.textContent=ending?'Resuming…':'Scheduling…';if(msg)msg.textContent='';
      try{
        const rr=await fetch('/api/coach/athlete',{method:'POST',headers:{Authorization:`Bearer ${mwSessionToken()}`,'Content-Type':'application/json'},body:JSON.stringify({action:ending?'resume_sponsorship':'end_sponsorship',athleteId})});
        const dd=await rr.json().catch(()=>({}));if(!rr.ok)throw new Error(dd.error||'Sponsorship could not be updated.');
        if(msg)msg.textContent=ending?'✓ Sponsorship resumed.':'✓ Sponsorship end scheduled. Athlete access remains active during the transition.';
        toast(ending?'Sponsorship resumed':'Sponsorship end scheduled');
        window.setTimeout(()=>{modal.remove();athleteDetail(athleteId)},650);
      }catch(e){if(msg)msg.textContent=e.message;sponsorshipBtn.disabled=false;sponsorshipBtn.textContent=ending?'Resume Sponsorship':'Schedule Sponsorship End'}
    };
    modal.querySelector('#athTrackTier').value=a.track_tier||'foundation';
    modal.querySelector('#athStrengthTier').value=a.strength_tier||'foundation';
    modal.querySelector('#saveAthAssignment').onclick=async()=>{
      const btn=modal.querySelector('#saveAthAssignment'),msg=modal.querySelector('#athAssignmentState');btn.disabled=true;btn.textContent='Syncing…';msg.textContent='';
      try{const payload={action:'update_assignment',athleteId,trackTier:modal.querySelector('#athTrackTier').value,strengthTier:modal.querySelector('#athStrengthTier').value,week:Number(modal.querySelector('#athProgramWeek').value),reason:modal.querySelector('#athAssignmentReason').value.trim()};const rr=await fetch('/api/coach/athlete',{method:'POST',headers:{Authorization:`Bearer ${mwSessionToken()}`,'Content-Type':'application/json'},body:JSON.stringify(payload)});const dd=await rr.json().catch(()=>({}));if(!rr.ok)throw new Error(dd.error||'Assignment could not be synced.');msg.textContent='✓ Saved. Athlete app, coach dashboard, and Coach MW now use this assignment.';toast('Athlete assignment synced')}catch(e){msg.textContent=e.message}finally{btn.disabled=false;btn.textContent='Approve & Sync Assignment'}
    };
    modal.querySelector('#saveAthNote').onclick=async()=>{
      const text=modal.querySelector('#athNote').value.trim(),btn=modal.querySelector('#saveAthNote'),msg=modal.querySelector('#athNoteState');
      if(!text)return toast('Enter a note first');btn.disabled=true;btn.textContent='Saving…';msg.textContent='';
      try{const rr=await fetch('/api/coach/athlete',{method:'POST',headers:{Authorization:`Bearer ${mwSessionToken()}`,'Content-Type':'application/json'},body:JSON.stringify({athleteId,note:text})});const dd=await rr.json().catch(()=>({}));if(!rr.ok)throw new Error(dd.error||'Note could not be saved.');modal.querySelector('#athNote').value='';msg.textContent='Saved to MW Dynasty.';const notesEl=modal.querySelector('#athleteNotes');const empty=notesEl.querySelector('p');if(empty)notesEl.innerHTML='';notesEl.insertAdjacentHTML('afterbegin',`<div class="row"><span>${escapeHtml(text)}<br><small>Just now</small></span></div>`);toast('Coach note saved')}catch(e){msg.textContent=e.message}finally{btn.disabled=false;btn.textContent='Save Note'}
    };
  }catch(e){state.innerHTML=`<h3>Could not open athlete</h3><p>${escapeHtml(e.message)}</p>`}
}
async function inviteAthleteModal(){
  const sponsorPrice=PLANS[experience].sponsor;
  let sponsoredBillingActive=false,sponsorSeatsAvailable=0,sponsorSeatsTotal=0;
  try{const b=await coachBillingRequest();sponsoredBillingActive=!!b?.status?.sponsored_billing_active;sponsorSeatsAvailable=Number(b?.status?.sponsored_seats_available||0);sponsorSeatsTotal=Number(b?.status?.sponsored_seats_total||0)}catch{}
  const canSponsor=sponsoredBillingActive&&sponsorSeatsAvailable>0;
  const modal=mwModal('Invite Athlete',`<div class="tile"><h3>Connect an athlete to your dashboard</h3><p>The athlete can be new to MW Dynasty or already have an account. Choose the access path, then send one invitation.</p></div><div class="form" style="margin-top:14px"><label>Athlete Email<input id="inviteEmail" type="email" inputmode="email" placeholder="athlete@example.com"></label><label>Invite Type<select id="inviteType"><option value="coach_invite">Coach invitation</option><option value="team_invite">Team invitation</option></select></label><label>Membership<select id="inviteBillingType"><option value="coach_sponsored" ${canSponsor?'':'disabled'}>Use 1 sponsored-athlete seat${canSponsor?` — ${sponsorSeatsAvailable} available`:' — no seats available'}</option><option value="self_pay">Athlete pays for their own membership</option></select></label><div class="tile" id="inviteBillingHelp">${canSponsor?`<b>Coach Sponsored</b><br><small>This uses 1 of your ${sponsorSeatsTotal} prepaid sponsored-athlete seats. The athlete skips membership checkout.</small>`:'<b>Athlete Self-Pay</b><br><small>No sponsored seat is currently available. You can still invite this athlete as self-pay.</small>'}</div><button class="action" id="createInvite">Send Athlete Invitation</button><div id="inviteState" class="tile" style="display:none"></div></div>`);
  const billingSelect=modal.querySelector('#inviteBillingType'),billingHelp=modal.querySelector('#inviteBillingHelp');if(!canSponsor)billingSelect.value='self_pay';
  billingSelect.onchange=()=>{billingHelp.innerHTML=billingSelect.value==='coach_sponsored'?`<b>Coach Sponsored</b><br><small>This reserves 1 prepaid sponsored-athlete seat. The athlete creates or signs into their profile and skips membership checkout.</small>`:`<b>Athlete Self-Pay</b><br><small>The invitation connects the athlete to you, but the athlete completes their own MW Athlete membership.</small>`};
  modal.querySelector('#createInvite').onclick=async()=>{
    const email=modal.querySelector('#inviteEmail').value.trim().toLowerCase(),state=modal.querySelector('#inviteState'),btn=modal.querySelector('#createInvite'),billingType=billingSelect.value;
    if(!email||!email.includes('@'))return toast('Enter a valid athlete email');btn.disabled=true;btn.textContent='Creating…';
    try{const token=mwSessionToken();if(!token)throw new Error('Coach session expired. Sign in again.');const r=await fetch('/api/coach/invite',{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({email,inviteType:modal.querySelector('#inviteType').value,billingType})});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||'Invitation could not be created');const inv=d.invitation||{},isSponsored=(inv.billing_type||billingType)==='coach_sponsored';state.style.display='block';state.innerHTML=`<h3>${d.reused?'Pending Invitation Ready':'Invitation Created'}</h3><p><b>${escapeHtml(email)}</b></p><p>${isSponsored?'Coach Sponsored':'Athlete Self-Pay'} · Pending · expires ${escapeHtml(fmtDate(inv.expires_at))}</p><p><b>${d.emailSent?'✓ Invitation email sent':'⚠ Invitation email not sent'}</b>${d.emailError?`<br><small>${escapeHtml(d.emailError)}</small>`:''}</p>${d.inviteUrl?`<label>Invite Link<input id="inviteLink" readonly value="${escapeHtml(d.inviteUrl)}"></label><button class="back" id="copyInviteLink" type="button">Copy Invite Link</button>`:''}<label>Backup Invite Code<input id="inviteCode" readonly value="${escapeHtml(inv.invite_token||'')}"></label><button class="back" id="copyInvite" type="button">Copy Backup Code</button><p><small>${isSponsored?'When accepted, the athlete profile is covered by your sponsorship.':'When accepted, the athlete is connected to you and keeps responsibility for their own membership.'}</small></p>`;const copy=async(id,label)=>{const input=modal.querySelector(id);if(!input)return;try{await navigator.clipboard.writeText(input.value);toast(label)}catch{input.select();document.execCommand('copy');toast(label)}};modal.querySelector('#copyInviteLink')?.addEventListener('click',()=>copy('#inviteLink','Invite link copied'));modal.querySelector('#copyInvite').onclick=()=>copy('#inviteCode','Invite code copied');}catch(e){state.style.display='block';state.innerHTML=`<h3>Invitation Error</h3><p>${escapeHtml(e.message)}</p>`}finally{btn.disabled=false;btn.textContent='Create Secure Invitation'}
  };
}
function csvCell(v){const s=String(v??'');return /[",\n]/.test(s)?'"'+s.replaceAll('"','""')+'"':s}
async function exportCoachRoster(athletes){
  const rows=[['Athlete','Events','Current Week','Current Day','Program Status','Last Completed Workout','PRs'],...(athletes||[]).map(a=>[a.name||'',a.event||'',a.current_week||1,a.current_day||1,a.status||'',a.last_completed_workout_at?new Date(a.last_completed_workout_at).toLocaleDateString():'',a.pr||''])],csv=rows.map(r=>r.map(csvCell).join(',')).join('\n'),file=new File([csv],`MW-Dynasty-Roster-${new Date().toISOString().slice(0,10)}.csv`,{type:'text/csv'});
  try{if(navigator.share&&navigator.canShare?.({files:[file]})){await navigator.share({title:'MW Dynasty Coach Roster',files:[file]});return}}
  catch(e){if(e?.name==='AbortError')return}
  const url=URL.createObjectURL(file),a=document.createElement('a');a.href=url;a.download=file.name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1200);toast('Roster export prepared');
}
async function athletesPage(){
  pageBase('Team','Your athletes, coaching status, and team actions in one place.',`
    <div class="team-command-actions">
      <button class="action" id="inviteAthlete">+ Invite Athlete</button>
      <button class="back" data-page="attendance">Take Attendance</button>
      <button class="back" data-page="teams">Groups</button>
      <button class="back" id="exportAthletes" disabled>Export</button>
    </div>
    <div class="team-filter-row">
      <label class="search">⌕<input id="teamSearch" autocomplete="off" placeholder="Search athletes"></label>
      <div class="team-filter-buttons"><button class="back active" data-team-filter="all">ALL</button><button class="back" data-team-filter="attention">NEEDS ATTENTION</button><button class="back" data-team-filter="sponsored">SPONSORED</button></div>
    </div>
    <div id="teamSummary" class="team-summary-strip"><div><b>—</b><span>Athletes</span></div><div><b>—</b><span>Need Attention</span></div><div><b>—</b><span>Sponsored</span></div></div>
    <div id="athleteList" class="team-athlete-grid"><div class="tile">Loading your team…</div></div>
    <div id="pendingInviteWrap" style="margin-top:18px"></div>`);
  bindPageNavigation(document);
  document.getElementById('inviteAthlete').onclick=inviteAthleteModal;
  const exportBtn=document.getElementById('exportAthletes'),list=document.getElementById('athleteList'),summary=document.getElementById('teamSummary'),search=document.getElementById('teamSearch');
  let athletes=[],performanceMap=new Map(),filter='all';
  try{
    const [d,billing,perf]=await Promise.all([fetchCoachRoster(),coachBillingRequest().catch(()=>({status:{}})),fetchCoachPerformance().catch(()=>({athletes:[]}))]);
    athletes=Array.isArray(d.athletes)?d.athletes:[];performanceMap=new Map((perf.athletes||[]).map(x=>[x.athlete_id,x]));
    const pending=Array.isArray(d.pendingInvitations)?d.pendingInvitations:[],sponsoredBillingActive=!!billing?.status?.sponsored_billing_active,pendingWrap=document.getElementById('pendingInviteWrap');
    const enriched=()=>athletes.map(a=>{const status=athleteStatusClassify({...a,performance:performanceMap.get(a.id)||null}),sponsored=a.sponsorship?.billing_type==='coach_sponsored'||a.billing_type==='coach_sponsored';return {...a,_coachStatus:status,_sponsored:sponsored}});
    const paintSummary=()=>{const rows=enriched(),attention=rows.filter(a=>a._coachStatus.level==='attention').length,sponsored=rows.filter(a=>a._sponsored).length;summary.innerHTML=`<div><b>${rows.length}</b><span>Athletes</span></div><div><b>${attention}</b><span>Need Attention</span></div><div><b>${sponsored}</b><span>Sponsored</span></div>`};
    const paint=()=>{const q=String(search.value||'').trim().toLowerCase();let rows=enriched().filter(a=>!q||(`${a.name||''} ${a.event||''}`).toLowerCase().includes(q));if(filter==='attention')rows=rows.filter(a=>a._coachStatus.level==='attention');if(filter==='sponsored')rows=rows.filter(a=>a._sponsored);list.innerHTML=rows.length?rows.map(a=>`<button class="team-athlete-card" data-athlete-id="${escapeHtml(a.id)}"><div class="team-athlete-card-top"><span class="status-pill ${a._coachStatus.level}"><span class="status-dot"></span>${athleteStatusLabel(a._coachStatus.level)}</span><span class="team-athlete-week">WEEK ${Number(a.current_week||1)}</span></div><h3>${escapeHtml(a.name)}</h3><p>${escapeHtml(a.event||'Events not set')}</p><small>${escapeHtml(a._coachStatus.reasons[0]||'Open athlete profile')}</small><div class="team-athlete-card-foot"><span>${a._sponsored?'COACH SPONSORED':'ATHLETE MEMBERSHIP'}</span><b>OPEN →</b></div></button>`).join(''):'<div class="tile"><h3>No athletes match this view</h3><p>Try another filter or invite an athlete.</p></div>';list.querySelectorAll('[data-athlete-id]').forEach(b=>b.onclick=()=>athleteDetail(b.dataset.athleteId))};
    search.oninput=paint;document.querySelectorAll('[data-team-filter]').forEach(b=>b.onclick=()=>{filter=b.dataset.teamFilter;document.querySelectorAll('[data-team-filter]').forEach(x=>x.classList.toggle('active',x===b));paint()});
    if(exportBtn){exportBtn.disabled=!athletes.length;exportBtn.onclick=()=>exportCoachRoster(athletes)}
    if(pendingWrap&&pending.length)pendingWrap.innerHTML=`<details class="tile"><summary><b>Pending Invitations (${pending.length})</b></summary><div class="list" style="margin-top:12px">${pending.map(i=>`<div class="row"><span><b>${escapeHtml(i.athlete_email)}</b><br><small>${escapeHtml(i.billing_type==='coach_sponsored'?'Coach Sponsored':'Athlete Self-Pay')} · Pending${i.billing_type==='coach_sponsored'&&!sponsoredBillingActive?' · Billing setup required':''} · expires ${escapeHtml(fmtDate(i.expires_at))}</small></span></div>`).join('')}</div></details>`;
    paintSummary();paint();
  }catch(e){list.innerHTML=`<div class="tile"><h3>Team unavailable</h3><p>${escapeHtml(e.message)}</p><button class="back" id="retryRoster">Try Again</button></div>`;document.getElementById('retryRoster').onclick=athletesPage}
}
function teamWorkspace(name){mwModal(name,`<div class="panel-grid"><div class="tile"><h3>Roster</h3><p>Manage assigned athletes and pending invitations.</p><button class="action" id="teamRoster">View Athletes</button></div><div class="tile"><h3>Team Communication</h3><p>Open the team message composer.</p><button class="action" id="teamMessage">Message Team</button></div><div class="tile"><h3>Attendance</h3><p>Record attendance for this group.</p><button class="action" id="teamAttendance">Take Attendance</button></div></div>`);document.getElementById('teamRoster').onclick=()=>{document.getElementById('mwModal')?.remove();athletesPage()};document.getElementById('teamMessage').onclick=()=>{document.getElementById('mwModal')?.remove();messagesPage()};document.getElementById('teamAttendance').onclick=()=>{document.getElementById('mwModal')?.remove();attendancePage()}}
function teamsPage(){const teams=['Varsity Sprint Group','Development Group','400m Group','Relays'];pageBase('Teams','Manage squads, groups and coach assignments.',`<div class="panel-grid">${teams.map(n=>`<div class="tile"><h3>${n}</h3><p>Roster, attendance, messages and assignments.</p><button class="action team-open" data-team="${n}" style="margin-top:12px">Open Team</button></div>`).join('')}</div>`);document.querySelectorAll('.team-open').forEach(b=>b.onclick=()=>teamWorkspace(b.dataset.team))}
function programsPage(){const saved=mwLoad('program',`Monday — Acceleration\nTuesday — Tempo + Strength\nWednesday — Recovery\nThursday — Max Velocity\nFriday — Speed Endurance`);pageBase(experience==='performance'?'MW Track Program':'My Program',experience==='performance'?'41-week MW training system.':'Bring your own program and manage workouts.',`<div class="form"><label>Program / Weekly Plan<textarea id="programText" rows="11">${escapeHtml(saved)}</textarea></label><div style="display:flex;gap:10px;flex-wrap:wrap"><button class="action" id="saveProgram">Save Program</button><button class="back" id="previewProgram">Preview Week</button></div></div>`);document.getElementById('saveProgram').onclick=()=>{mwStore('program',document.getElementById('programText').value);toast('Program saved on this coach device')};document.getElementById('previewProgram').onclick=()=>mwModal('Program Preview',`<div class="tile"><pre style="white-space:pre-wrap;margin:0">${escapeHtml(document.getElementById('programText').value)}</pre></div>`)}
function calendarPage(){const ev=[['APR 12','Spring Invitational','Huntsville, AL'],['APR 19','County Championship','Birmingham, AL'],['MAY 3','State Qualifier','Montgomery, AL']];pageBase('Calendar','Practice, meet and team schedule.',`<div class="list">${ev.map((e,i)=>`<div class="row"><span><b>${e[0]} · ${e[1]}</b><br><small>${e[2]}</small></span><button class="action cal-open" data-i="${i}">Open</button></div>`).join('')}</div><button class="action" id="addCalendar" style="margin-top:14px">+ Add Event</button>`);document.querySelectorAll('.cal-open').forEach(b=>b.onclick=()=>{const e=ev[+b.dataset.i];mwModal(e[1],`<div class="form"><label>Date<input value="${e[0]}"></label><label>Location<input value="${e[2]}"></label><label>Notes<textarea rows="4" placeholder="Meet or practice notes..."></textarea></label><button class="action" data-close-modal>Done</button></div>`) });document.getElementById('addCalendar').onclick=()=>mwModal('Add Calendar Event',`<div class="form"><label>Event Name<input id="eventName"></label><label>Date<input id="eventDate" type="date"></label><label>Location<input id="eventLocation"></label><button class="action" id="saveEvent">Save Event</button></div>`);setTimeout(()=>{const b=document.getElementById('saveEvent');if(b)b.onclick=()=>{const x=mwLoad('calendarEvents',[]);x.push({name:eventName.value,date:eventDate.value,location:eventLocation.value});mwStore('calendarEvents',x);toast('Calendar event saved');document.getElementById('mwModal')?.remove()}},0)}
function meetModal(name,location){const states=mwLoad('meetStatus',{});mwModal(name,`<div class="form"><label>Location<input value="${escapeHtml(location)}" readonly></label><label>Registration Status<select id="meetStatus"><option ${states[name]==='Registered'?'selected':''}>Registered</option><option ${states[name]==='Not Registered'?'selected':''}>Not Registered</option></select></label><label>Coach Notes<textarea id="meetNotes" rows="4" placeholder="Entries, travel, readiness notes..."></textarea></label><button class="action" id="saveMeet">Save Meet</button></div>`);document.getElementById('saveMeet').onclick=()=>{states[name]=document.getElementById('meetStatus').value;mwStore('meetStatus',states);toast('Meet updated');document.getElementById('mwModal')?.remove();meetsPage()}}
function meetsPage(){const meets=[['Spring Invitational','Huntsville, AL'],['County Championship','Birmingham, AL'],['State Qualifier','Montgomery, AL']];const states=mwLoad('meetStatus',{});pageBase('Meets','Manage registration and meet readiness.',`<div class="list">${meets.map(([n,l])=>`<div class="row"><span><b>${n}</b><br>${l}</span><button class="action meet-open" data-name="${n}" data-loc="${l}">${states[n]||'Open Meet'}</button></div>`).join('')}</div>`);document.querySelectorAll('.meet-open').forEach(b=>b.onclick=()=>meetModal(b.dataset.name,b.dataset.loc))}
async function attendancePage(){
  pageBase('Attendance','Attendance is recorded only for athletes this coach is authorized to manage.',`<div class="form"><label>Session Date<input id="attDate" type="date" value="${new Date().toISOString().slice(0,10)}"></label><label>Session Type<input id="attType" value="training"></label></div><div class="list" id="attList"><div class="tile">Loading assigned athletes…</div></div><button class="action" id="saveAttendance" style="margin-top:14px" disabled>Save Attendance</button><div id="attState" class="tile" style="display:none;margin-top:12px"></div>`);
  const list=document.getElementById('attList'),save=document.getElementById('saveAttendance'),st=document.getElementById('attState');
  try{
    const d=await fetchCoachRoster(),athletes=Array.isArray(d.athletes)?d.athletes:[];
    if(!athletes.length){list.innerHTML='<div class="tile"><h3>No athletes available</h3><p>Attendance can be taken after an athlete is actively assigned to this coach.</p></div>';return}
    list.innerHTML=athletes.map(a=>`<div class="row"><span><b>${escapeHtml(a.name)}</b><br><small>${escapeHtml(a.event||'Events not set')}</small></span><select data-att-athlete="${escapeHtml(a.id)}" aria-label="Attendance for ${escapeHtml(a.name)}"><option value="present">Present</option><option value="absent">Absent</option><option value="excused">Excused</option><option value="injured">Injured</option><option value="late">Late</option></select></div>`).join('');
    save.disabled=false;
    save.onclick=async()=>{
      const rows=[...document.querySelectorAll('[data-att-athlete]')];if(!rows.length)return;
      save.disabled=true;save.textContent='Saving…';st.style.display='block';st.textContent='Saving live attendance…';
      try{
        const token=mwSessionToken(),sessionDate=document.getElementById('attDate').value,sessionType=document.getElementById('attType').value.trim()||'training';
        const results=await Promise.all(rows.map(async el=>{const r=await fetch('/api/coach/attendance',{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({athleteId:el.dataset.attAthlete,status:el.value,sessionDate,sessionType})});const x=await r.json().catch(()=>({}));if(!r.ok)throw new Error(x.error||'Attendance save failed');return x}));
        st.innerHTML=`<b>Attendance saved.</b><p>${results.length} athlete record${results.length===1?'':'s'} synced to MW Dynasty.</p>`;toast('Live attendance saved');
      }catch(e){st.innerHTML=`<b>Attendance error</b><p>${escapeHtml(e.message)}</p>`}finally{save.disabled=false;save.textContent='Save Attendance'}
    };
  }catch(e){list.innerHTML=`<div class="tile"><h3>Attendance roster unavailable</h3><p>${escapeHtml(e.message)}</p></div>`}
}
function messagesPage(){const history=mwLoad('messages',[]);pageBase('Messages','Communicate with athletes and teams.',`<div class="form"><label>Audience<select id="msgAudience"><option>Entire Team</option><option>Varsity Sprint Group</option><option>Development Group</option><option>400m Group</option><option>Relays</option></select></label><label>Message<textarea id="msgText" rows="6" placeholder="Message the team..."></textarea></label><button class="action" id="sendMsg">Send Message</button></div><div class="list" id="msgHistory" style="margin-top:16px">${history.slice(-5).reverse().map(m=>`<div class="row"><span><b>${escapeHtml(m.audience)}</b><br>${escapeHtml(m.text)}</span><small>${escapeHtml(m.time)}</small></div>`).join('')||'<div class="tile">No coach messages sent from this device yet.</div>'}</div>`);document.getElementById('sendMsg').onclick=()=>{const text=msgText.value.trim();if(!text)return toast('Write a message first');history.push({audience:msgAudience.value,text,time:new Date().toLocaleString()});mwStore('messages',history);msgText.value='';toast('Message recorded');messagesPage()}}
function supportPage(){pageBase('Help & Support','Send a real support request to MW Dynasty.',`<div class="form"><label>Category<select id="supportCategory"><option value="app_issue">App issue</option><option value="account">Account</option><option value="training_data">Training data</option><option value="privacy">Privacy</option><option value="other">Other</option></select></label><label>Subject<input id="supportSubject" maxlength="120" placeholder="Short summary"></label><label>Request<textarea id="supportText" maxlength="4000" rows="6" placeholder="How can we help?"></textarea></label><button class="action" id="submitSupport">Submit Request</button><div id="supportState" class="tile" style="display:none"></div></div>`);document.getElementById('submitSupport').onclick=async()=>{const s=supportSubject.value.trim(),text=supportText.value.trim(),state=document.getElementById('supportState'),btn=document.getElementById('submitSupport');if(!s||text.length<5)return toast('Add a subject and a little more detail');btn.disabled=true;btn.textContent='Sending…';state.style.display='block';state.textContent='Sending to MW Support…';try{const u=await mwCurrentUser();if(!u?.id)throw new Error('Coach session expired. Sign in again.');await sbRest('support_requests',{method:'POST',prefer:'return=minimal',body:{user_id:u.id,athlete_id:null,category:supportCategory.value,message:`${s}\n\n${text}`,app_version:MW_APP_VERSION,device_info:navigator.userAgent}});state.innerHTML='<b>✓ Request sent.</b><p>MW Support received your coach support request.</p>';supportSubject.value='';supportText.value=''}catch(e){state.innerHTML=`<b>Support request failed.</b><p>${escapeHtml(e.message)}</p>`}finally{btn.disabled=false;btn.textContent='Submit Request'}}}
function taskBoardPage(){let tasks=mwLoad('aiTasks',[{name:'Maya T. — Missed Training',detail:'Review workload before next high-intensity day.',status:'Review'},{name:'Tyler B. — Performance Trend',detail:'Flying 30 trend improved across three sessions.',status:'Approve'},{name:'Aaliyah R. — Meet Preparation',detail:'Competition warm-up and race-model review are due.',status:'Open'}]);pageBase('AI Task Board','Daily coaching tasks and priorities.',`<div class="list">${tasks.map((t,i)=>`<div class="row"><span><b>${escapeHtml(t.name)}</b><br>${escapeHtml(t.detail)}<br><small>Status: ${escapeHtml(t.status)}</small></span><button class="action task-open" data-i="${i}">Open Task</button></div>`).join('')}</div>`);document.querySelectorAll('.task-open').forEach(b=>b.onclick=()=>{const i=+b.dataset.i,t=tasks[i];mwModal('AI Task',`<div class="tile"><h3>${escapeHtml(t.name)}</h3><p>${escapeHtml(t.detail)}</p></div><div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:12px"><button class="action" id="approveTask">Approve</button><button class="back" id="holdTask">Hold</button></div>`);approveTask.onclick=()=>{tasks[i].status='Approved';mwStore('aiTasks',tasks);document.getElementById('mwModal')?.remove();taskBoardPage()};holdTask.onclick=()=>{tasks[i].status='Held';mwStore('aiTasks',tasks);document.getElementById('mwModal')?.remove();taskBoardPage()}})}
async function seasonPage(){const rec=mwLoad('seasonRecommendation',null);pageBase('AI Season Planner','Build and optimize the season while keeping the coach in control.',`<div class="panel-grid"><div class="tile"><h3>Training-Year Position</h3><p id="seasonPlannerCalendar">Loading MW season calendar…</p></div><div class="tile"><h3>Next Meet</h3><p id="seasonPlannerNextMeet">Loading live meet schedule…</p></div></div><div class="form" style="margin-top:14px"><label>Season Goal<textarea id="seasonGoal" rows="4" placeholder="What should the team be ready for?"></textarea></label><button class="action" id="genSeason">Generate Recommendation</button><div id="seasonOut" class="tile" style="${rec?'':'display:none;'}">${rec?escapeHtml(rec):''}</div></div>`);
  try{const cal=await coachSeasonCalendarRequest();const el=document.getElementById('seasonPlannerCalendar');if(el)el.textContent=coachCalendarSummary(cal)}catch(e){const el=document.getElementById('seasonPlannerCalendar');if(el)el.textContent=e.message}
  let nextMeet=null;try{const now=new Date().toISOString(),rows=await sbRest(`coach_calendar_events?select=id,title,starts_at,location&event_type=eq.meet&starts_at=gte.${encodeURIComponent(now)}&order=starts_at.asc&limit=1`);nextMeet=rows?.[0]||null;const el=document.getElementById('seasonPlannerNextMeet');if(el)el.textContent=nextMeet?`${nextMeet.title} · ${new Date(nextMeet.starts_at).toLocaleString()}${nextMeet.location?' · '+nextMeet.location:''}`:'No upcoming meet is scheduled yet.'}catch(e){const el=document.getElementById('seasonPlannerNextMeet');if(el)el.textContent='Meet schedule unavailable: '+e.message}
  document.getElementById('genSeason').onclick=()=>{const goal=document.getElementById('seasonGoal')?.value.trim()||'Protect speed quality while preparing for the next meet.',out=document.getElementById('seasonOut'),cal=coachSeasonCalendar,calendar=cal?coachCalendarSummary(cal):'MW season calendar',meet=nextMeet?` Next meet: ${nextMeet.title} on ${new Date(nextMeet.starts_at).toLocaleDateString()}.`:'';const text=`Recommendation: use ${calendar} as the scheduling reference.${meet} Keep the current phase intent intact, protect high-intensity quality, and review attendance/readiness before any progression. Coach approval is required before changing official program state. Goal: ${goal}`;mwStore('seasonRecommendation',text);if(out){out.style.display='block';out.textContent=text}}
}
async function adjustmentPage(){let status=mwLoad('seasonAdjustment','Pending coach review');pageBase('AI Season Adjustment','Detect → Analyze → Recommend → Coach Approves → System Executes.',`<div class="tile"><h3>Live Athlete Review</h3><div id="adjustLive"><p>Reviewing assigned athlete training and performance signals…</p></div><p><b>Status:</b> <span id="adjustStatus">${escapeHtml(status)}</span></p><div id="adjustActions" style="display:none;gap:10px;flex-wrap:wrap;margin-top:12px"><button class="action" id="approveAdjustment">Approve for Review</button><button class="back" id="dismissAdjustment">Dismiss</button></div></div>`);
  let recommendation=null;const live=document.getElementById('adjustLive'),actions=document.getElementById('adjustActions'),statusEl=document.getElementById('adjustStatus');
  try{const [roster,perf]=await Promise.all([fetchCoachRoster(),fetchCoachPerformance().catch(()=>({athletes:[]}))]),athletes=roster.athletes||[],pm=new Map((perf.athletes||[]).map(x=>[x.athlete_id,x])),candidates=[];
    for(const a of athletes){const classified=athleteStatusClassify({...a,performance:pm.get(a.id)});if(classified.level!=='ontrack')candidates.push({a,classified})}
    candidates.sort((x,y)=>(x.classified.level==='attention'?0:1)-(y.classified.level==='attention'?0:1));
    const pick=candidates[0];
    if(pick){recommendation={athleteId:pick.a.id,name:pick.a.name,level:pick.classified.level,reasons:pick.classified.reasons};if(live)live.innerHTML=`<p><b>${escapeHtml(pick.a.name)}</b> · ${escapeHtml(athleteStatusLabel(pick.classified.level))}</p><p>${pick.classified.reasons.map(escapeHtml).join(' · ')}</p><p><small>Recommendation: review this athlete's attendance, recent completion, and performance context before changing progression. MW will not change the athlete's official program state from this screen.</small></p>`;if(actions)actions.style.display='flex'}else{if(live)live.innerHTML='<p><b>No adjustment signal is active.</b></p><p>Assigned athlete activity and available performance data do not currently produce a review flag.</p>';if(statusEl)statusEl.textContent='No pending adjustment'}
  }catch(e){if(live)live.innerHTML=`<p><b>Live review unavailable.</b></p><p>${escapeHtml(e.message)}</p>`;if(statusEl)statusEl.textContent='Could not evaluate live data'}
  const approve=document.getElementById('approveAdjustment'),dismiss=document.getElementById('dismissAdjustment');
  if(approve)approve.onclick=()=>{if(!recommendation)return;status=`Reviewed by coach — ${recommendation.name}; no automatic program change applied`;mwStore('seasonAdjustment',status);if(statusEl)statusEl.textContent=status};
  if(dismiss)dismiss.onclick=()=>{status='Dismissed by coach';mwStore('seasonAdjustment',status);if(statusEl)statusEl.textContent=status}
}
function insightsPage(){const items=[['Training Load','Athlete workload is in optimal range.'],['Performance Trend','Sprinters showing a 3.2% improvement.'],['Meet Readiness','8 athletes are on track for PRs.'],['Attendance','Team attendance is currently 91%.']];pageBase('AI Insights','Performance, workload and meet-readiness signals.',`<div class="panel-grid">${items.map((x,i)=>`<div class="tile"><h3>${x[0]}</h3><p>${x[1]}</p><button class="action insight-open" data-i="${i}">Review Insight</button></div>`).join('')}</div>`);document.querySelectorAll('.insight-open').forEach(b=>b.onclick=()=>{const x=items[+b.dataset.i];mwModal(x[0],`<div class="tile"><p>${x[1]}</p><p><b>Coach action:</b> Review supporting athlete data before changing training or progression.</p></div>`)})}
function mwTrackPage(){pageBase('MW Track Program','41-week progressive sprint program.',`<div class="panel-grid">${Array.from({length:41},(_,i)=>i+1).map(w=>`<div class="tile"><h3>Week ${w}</h3><p>${w===12?'Acceleration Development':'MW progressive sprint development'}</p><button class="action week-open" data-week="${w}">Open Week</button></div>`).join('')}</div>`);document.querySelectorAll('.week-open').forEach(b=>b.onclick=()=>mwModal(`MW Track Program · Week ${b.dataset.week}`,`<div class="tile"><h3>Week ${b.dataset.week}</h3><p>Open the coach-authored MW week, review daily sessions, and track completion. This interface is ready for the full 41-week dataset connection.</p></div>`))}
function strengthPage(){pageBase('Strength & Power','MW weight-room program synchronized to the sprint plan.',`<div class="panel-grid">${Array.from({length:41},(_,i)=>i+1).map(w=>`<div class="tile"><h3>Week ${w}</h3><p>Synchronized Strength & Power session.</p><button class="action strength-open" data-week="${w}">Open Session</button></div>`).join('')}</div>`);document.querySelectorAll('.strength-open').forEach(b=>b.onclick=()=>mwModal(`Strength & Power · Week ${b.dataset.week}`,`<div class="tile"><h3>Week ${b.dataset.week}</h3><p>Weight-room session detail workspace. Load calculations, lift prescriptions and athlete completion can be connected to the synchronized strength dataset.</p></div>`))}
function schoolPage(){const lessons=['Sprint Mechanics','Block Starts','Competition Warm-Up','Drill Library'];pageBase('Sprint School','Technique & education.',`<div class="panel-grid">${lessons.map(x=>`<div class="tile"><h3>${x}</h3><p>Use Coach MW to teach and review this MW Sprint School topic with your live coaching context.</p><button class="action lesson-open" data-lesson="${x}">Open with Coach MW</button></div>`).join('')}</div>`);document.querySelectorAll('.lesson-open').forEach(b=>b.onclick=()=>{sessionStorage.setItem('mwCoachDraftPrompt',`Teach me the MW Dynasty Sprint School lesson on ${b.dataset.lesson}. Give me the key coaching points, what to watch for in my athletes, common errors, and how I should teach it during practice. Use MW methodology and my coach context.`);openPage('coachmw')})}
function racePage(){const lessons=['100m Race Strategy','200m Race Strategy','400m Race Strategy','Block Start Strategy'];pageBase('Race Strategy','100m · 200m · 400m blueprints.',`<div class="panel-grid">${lessons.map(x=>`<div class="tile"><h3>${x}</h3><p>Open this race topic in Coach MW for an MW-specific coaching review.</p><button class="action race-open" data-race="${x}">Review with Coach MW</button></div>`).join('')}</div>`);document.querySelectorAll('.race-open').forEach(b=>b.onclick=()=>{sessionStorage.setItem('mwCoachDraftPrompt',`Walk me through the MW Dynasty ${b.dataset.race}. Explain the race model, key cues, common mistakes, and how I should coach it for my athletes. Use MW methodology and my coach context.`);openPage('coachmw')})}
function bindPageActions(){document.querySelectorAll('[data-toast]').forEach(b=>b.onclick=()=>{const msg=b.dataset.toast||'Action opened';mwModal('Coach Workspace',`<div class="tile"><h3>${escapeHtml(msg)}</h3><p>This action now opens a real workspace instead of a temporary toast-only placeholder.</p></div>`)})}


async function coachAdminRequest(method='GET',body=null){
  const token=mwSessionToken();if(!token)throw new Error('Founder session required.');
  const r=await fetch(`${SUPABASE_URL}/functions/v1/mw-coach-applications-admin`,{method,headers:{apikey:SUPABASE_KEY,Authorization:`Bearer ${token}`,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});
  const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||'Coach application request failed.');return d;
}
async function coachApplicationsPage(){
  if(!accountAccess.isFounder){toast('Founder access required');return dashboard()}
  pageBase('Coach Applications','Review only the applications MW Dynasty could not verify automatically.',`<div class="founder-app-head"><div><b>Coach Verification Center</b><p>Strong matches are verified automatically. Unclear applications come here for a human decision. Membership and payment happen after verification.</p></div><button class="back" id="refreshCoachApps">Refresh</button></div><div id="coachAppsState" class="tile">Loading applications…</div><div id="coachAppsList" class="founder-app-list"></div>`);
  const verificationLabel=a=>a.verification_status==='auto_approved'?'Auto-Verified':a.verification_status==='approved'?'Verified':a.verification_status==='needs_review'?'Needs Review':a.verification_status==='denied'?'Denied':'Pending';
  const verificationClass=a=>a.verification_status==='auto_approved'||a.verification_status==='approved'?'approved':a.verification_status==='denied'?'rejected':'pending';
  const evidenceHTML=a=>{
    const e=a.verification_evidence||{},p=e.page_check||{};
    const signals=[
      ['Institutional domain',e.institutional_domain===true?'Matched':e.institutional_domain===false?'Not confirmed':'—'],
      ['Name on source',p.nameMatch===true?'Matched':p.checked?'Not confirmed':'Not checked'],
      ['Coaching role',p.coachMatch===true?'Matched':p.checked?'Not confirmed':'Not checked'],
      ['Organization',p.orgMatch===true?'Matched':p.checked?'Not confirmed':'Not checked']
    ];
    return `<div class="founder-app-meta">${signals.map(([k,v])=>`<span><small>${escapeHtml(k)}</small><br><b>${escapeHtml(v)}</b></span>`).join('')}</div>`;
  };
  const load=async()=>{
    const state=document.getElementById('coachAppsState'),list=document.getElementById('coachAppsList');state.style.display='block';state.textContent='Loading applications…';list.innerHTML='';
    try{
      const d=await coachAdminRequest(),apps=d.applications||[],needs=apps.filter(a=>a.verification_status==='needs_review'&&a.status==='pending'),verified=apps.filter(a=>['auto_approved','approved'].includes(a.verification_status));
      state.innerHTML=apps.length?`<b>${needs.length} need${needs.length===1?'s':''} your review</b> · ${verified.length} verified · ${apps.length} total`:'No coach applications yet.';
      list.innerHTML=apps.map(a=>{
        const needsReview=a.verification_status==='needs_review'&&a.status==='pending';
        const source=a.verification_detail||'No verification source provided';
        const reason=a.decision_reason||a.review_notes||'Verification decision pending.';
        const decision=a.decision_mode==='automatic'?'Automatic':a.decision_mode==='manual'?'Manual':'Awaiting review';
        return `<article class="founder-app-card">
          <div class="founder-app-top"><div><span class="founder-status ${verificationClass(a)}">${escapeHtml(verificationLabel(a))}</span><h3>${escapeHtml(a.first_name)} ${escapeHtml(a.last_name)}</h3><p>${escapeHtml(a.email)}${a.organization?' · '+escapeHtml(a.organization):''}</p></div><small>${new Date(a.created_at).toLocaleDateString()}</small></div>
          <div class="founder-app-meta"><span>${escapeHtml(a.coach_title||a.coaching_level||'Coach role not provided')}</span><span>${escapeHtml(a.organization||'Organization not provided')}</span><span>${a.years_coaching??'—'} years</span><span>${a.athlete_count??'—'} athletes</span><span>${escapeHtml([a.city,a.state].filter(Boolean).join(', ')||'Location not provided')}</span></div>
          <div class="tile" style="margin-top:12px"><div class="eyebrow">VERIFICATION EVIDENCE</div><p><b>${escapeHtml(a.verification_method||'Verification source')}</b><br><small>${escapeHtml(source)}</small></p>${evidenceHTML(a)}<p><b>MW decision:</b> ${escapeHtml(reason)}</p><small>${escapeHtml(decision)} decision${a.verification_checked_at?' · checked '+new Date(a.verification_checked_at).toLocaleString():''}</small></div>
          ${a.reason?`<p class="founder-reason">${escapeHtml(a.reason)}</p>`:''}
          ${needsReview?`<div class="founder-review"><label>Founder Notes<textarea rows="2" data-notes="${a.id}" placeholder="Optional internal review notes"></textarea></label><div class="founder-actions"><button class="action" data-approve="${a.id}">Approve Coach</button><button class="back founder-reject" data-reject="${a.id}">Deny</button></div><small>Approval verifies the person and sends secure account setup. The coach chooses membership and sponsored-athlete seats next; Coach app access stays locked until payment is confirmed.</small></div>`:`<div class="founder-reviewed"><b>${escapeHtml(verificationLabel(a))}</b><span>${a.payment_status==='paid'?'Payment confirmed':a.payment_status==='ready'?'Membership + payment unlocked':a.payment_status==='checkout_started'?'Checkout started':a.payment_status==='failed'?'Payment failed':'Payment locked'}${a.invited_at?' · setup sent '+new Date(a.invited_at).toLocaleDateString():''}</span></div>`}
        </article>`;
      }).join('');
      bindCoachApplicationActions(load);
    }catch(e){state.textContent=e.message}
  };
  document.getElementById('refreshCoachApps').onclick=load;load();
}
function bindCoachApplicationActions(reload){
  document.querySelectorAll('[data-approve]').forEach(b=>b.onclick=async()=>{
    const id=b.dataset.approve,notes=document.querySelector(`[data-notes="${id}"]`)?.value||'';b.disabled=true;b.textContent='Approving…';
    try{const d=await coachAdminRequest('POST',{id,action:'approve',review_notes:notes});toast(d.message||'Coach verified. Secure setup sent.');await reload()}catch(e){toast(e.message);b.disabled=false;b.textContent='Approve Coach'}
  });
  document.querySelectorAll('[data-reject]').forEach(b=>b.onclick=async()=>{
    const id=b.dataset.reject,reason=prompt('Why is this Coach application being denied?')||'';if(!reason.trim())return;b.disabled=true;
    try{await coachAdminRequest('POST',{id,action:'reject',rejection_reason:reason,review_notes:document.querySelector(`[data-notes="${id}"]`)?.value||''});toast('Coach application denied');await reload()}catch(e){toast(e.message);b.disabled=false}
  });
}

// === V12.0 CONNECTED COACH OPERATING SYSTEM ===
async function sbRest(path,{method='GET',body=null,prefer='return=representation'}={}){
  const token=mwSessionToken();if(!token)throw new Error('Coach session expired. Sign in again.');
  const r=await fetch(`${SUPABASE_URL}/rest/v1/${path}`,{method,headers:{apikey:SUPABASE_KEY,Authorization:`Bearer ${token}`,...(body?{'Content-Type':'application/json'}:{}),...(prefer?{Prefer:prefer}:{})},body:body?JSON.stringify(body):undefined});
  const d=await r.json().catch(()=>null);if(!r.ok)throw new Error(d?.message||d?.hint||`MW data request failed (${r.status})`);return d;
}
async function logCoachAction(action_type,entity_type=null,entity_id=null,detail={}){try{const u=await mwCurrentUser();if(u?.id)await sbRest('coach_activity_log',{method:'POST',body:{coach_user_id:u.id,action_type,entity_type,entity_id,detail}})}catch{}}
async function liveGroups(){return await sbRest('coach_groups?select=id,name,event_group,description,archived,created_at&archived=eq.false&order=created_at.asc')||[]}
async function liveGroupMembers(groupId){return await sbRest(`coach_group_members?select=id,athlete_id,created_at&group_id=eq.${encodeURIComponent(groupId)}&order=created_at.asc`)||[]}
async function teamsPage(){
  pageBase('Teams / Groups','Create real coaching groups and organize only athletes you are authorized to manage.',`<div style="display:flex;justify-content:flex-end;margin-bottom:14px"><button class="action" id="newGroup">+ Create Group</button></div><div id="groupsLive" class="panel-grid"><div class="tile">Loading live groups…</div></div>`);
  document.getElementById('newGroup').onclick=createGroupModal;const wrap=document.getElementById('groupsLive');
  try{const groups=await liveGroups();if(!groups.length){wrap.innerHTML='<div class="tile"><h3>No groups yet</h3><p>Create your first squad, event group, or relay unit.</p></div>';return}const counts=await Promise.all(groups.map(g=>liveGroupMembers(g.id).then(x=>x.length).catch(()=>0)));wrap.innerHTML=groups.map((g,i)=>`<div class="tile"><h3>${escapeHtml(g.name)}</h3><p>${escapeHtml(g.event_group||'General')} · ${counts[i]} athlete${counts[i]===1?'':'s'}</p><p>${escapeHtml(g.description||'Coach-managed MW group')}</p><button class="action group-open" data-id="${g.id}" style="margin-top:12px">Open Group</button></div>`).join('');wrap.querySelectorAll('.group-open').forEach(b=>b.onclick=()=>groupWorkspaceLive(b.dataset.id));}catch(e){wrap.innerHTML=`<div class="tile"><h3>Groups unavailable</h3><p>${escapeHtml(e.message)}</p></div>`}
}
function createGroupModal(){mwModal('Create Team / Group',`<div class="form"><label>Group Name<input id="groupName" placeholder="100m / 200m Group"></label><label>Event Group<input id="groupEvent" placeholder="Sprints, 400m, Relays..."></label><label>Description<textarea id="groupDesc" rows="3"></textarea></label><button class="action" id="saveGroup">Create Group</button></div>`);document.getElementById('saveGroup').onclick=async()=>{const name=groupName.value.trim();if(!name)return toast('Group name required');const u=await mwCurrentUser();try{const d=await sbRest('coach_groups',{method:'POST',body:{coach_user_id:u.id,name,event_group:groupEvent.value.trim()||null,description:groupDesc.value.trim()||null,archived:false}});await logCoachAction('group_created','coach_group',d?.[0]?.id,{name});document.getElementById('mwModal')?.remove();teamsPage();toast('Group created')}catch(e){toast(e.message)}}}
async function groupWorkspaceLive(id){
  try{const [groups,members,roster]=await Promise.all([sbRest(`coach_groups?select=*&id=eq.${encodeURIComponent(id)}&limit=1`),liveGroupMembers(id),fetchCoachRoster()]);const g=groups?.[0];if(!g)throw new Error('Group not found');const assigned=roster.athletes||[],memberIds=new Set(members.map(m=>m.athlete_id));mwModal(g.name,`<div class="tile"><h3>${escapeHtml(g.event_group||'Team Group')}</h3><p>${escapeHtml(g.description||'Manage this group roster.')}</p></div><div class="form" style="margin-top:12px"><label>Add Assigned Athlete<select id="groupAthlete"><option value="">Select athlete</option>${assigned.filter(a=>!memberIds.has(a.id)).map(a=>`<option value="${a.id}">${escapeHtml(a.name)}</option>`).join('')}</select></label><button class="action" id="addGroupAthlete">Add Athlete</button></div><div class="list" style="margin-top:12px">${assigned.filter(a=>memberIds.has(a.id)).map(a=>`<div class="row"><span><b>${escapeHtml(a.name)}</b><br><small>${escapeHtml(a.event||'Events not set')}</small></span><button class="back remove-member" data-athlete="${a.id}">Remove</button></div>`).join('')||'<div class="tile">No athletes in this group yet.</div>'}</div><div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:14px"><button class="action" id="messageGroup">Message Group</button><button class="back" id="groupAttendance">Take Attendance</button></div>`);document.getElementById('addGroupAthlete').onclick=async()=>{const aid=groupAthlete.value;if(!aid)return toast('Select an athlete');const u=await mwCurrentUser();try{await sbRest('coach_group_members',{method:'POST',body:{group_id:id,athlete_id:aid,added_by:u.id}});await logCoachAction('athlete_added_to_group','coach_group',id,{athlete_id:aid});document.getElementById('mwModal')?.remove();groupWorkspaceLive(id)}catch(e){toast(e.message)}};document.querySelectorAll('.remove-member').forEach(b=>b.onclick=async()=>{try{await sbRest(`coach_group_members?group_id=eq.${encodeURIComponent(id)}&athlete_id=eq.${encodeURIComponent(b.dataset.athlete)}`,{method:'DELETE',prefer:'return=minimal'});document.getElementById('mwModal')?.remove();groupWorkspaceLive(id)}catch(e){toast(e.message)}});messageGroup.onclick=()=>{document.getElementById('mwModal')?.remove();messagesPage(id)};groupAttendance.onclick=()=>{document.getElementById('mwModal')?.remove();attendancePage()};}catch(e){toast(e.message)}
}
async function programsPage(){
  if(experience==='performance')return mwTrackPage();
  pageBase('My Program','Build, upload, save and manage your own coaching program in the MW workspace.',`<div style="display:flex;justify-content:flex-end;gap:10px;flex-wrap:wrap;margin-bottom:14px"><button class="back" id="uploadProgram">Upload PDF / Word / Excel</button><button class="action" id="newProgram">+ New Program</button></div><div id="programLive" class="list"><div class="tile">Loading programs…</div></div>`);
  document.getElementById('newProgram').onclick=()=>programEditor();document.getElementById('uploadProgram').onclick=()=>programEditor(null,true);const wrap=document.getElementById('programLive');
  try{const rows=await sbRest('coach_programs?select=id,name,program_type,status,content,updated_at&order=updated_at.desc')||[];wrap.innerHTML=rows.map(x=>`<div class="row"><span><b>${escapeHtml(x.name)}</b><br><small>${escapeHtml(x.program_type||'track')} · ${escapeHtml(x.status||'draft')} · updated ${fmtDate(x.updated_at)}${x.content?.source_file?' · imported from '+escapeHtml(x.content.source_file):''}</small></span><button class="action program-open" data-id="${x.id}">Open</button></div>`).join('')||'<div class="tile">No coach-authored programs yet.</div>';wrap.querySelectorAll('.program-open').forEach(b=>b.onclick=()=>programEditor(b.dataset.id));}catch(e){wrap.innerHTML=`<div class="tile">${escapeHtml(e.message)}</div>`}
}
function readFileBase64(file){return new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result||'').split(',')[1]||'');r.onerror=()=>reject(new Error('Could not read that file.'));r.readAsDataURL(file)})}
async function importCoachProgramFile(modal){
  const file=modal.querySelector('#cpFile')?.files?.[0],btn=modal.querySelector('#importCP'),state=modal.querySelector('#cpImportState');if(!file)return toast('Choose a PDF, Word, Excel, CSV, or TXT file first.');if(file.size>3*1024*1024)return toast('Keep the program file under 3 MB.');
  btn.disabled=true;btn.textContent='Reading & Converting…';state.textContent='MW is reading your program. You will review it before saving.';
  try{const dataBase64=await readFileBase64(file),r=await fetch('/api/coach/program-import',{method:'POST',headers:{Authorization:`Bearer ${mwSessionToken()}`,'Content-Type':'application/json'},body:JSON.stringify({fileName:file.name,mimeType:file.type,dataBase64})}),d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||'Program import failed.');if(!modal.querySelector('#cpName').value.trim())modal.querySelector('#cpName').value=d.suggestedName||file.name;modal.querySelector('#cpType').value=d.suggestedType||'track';modal.querySelector('#cpContent').value=d.programText||'';modal.dataset.sourceFile=file.name;state.innerHTML=`<b>✓ Program converted.</b><br>Review every week, day, rep, set, distance and recovery before saving.${d.warning?`<br><small>${escapeHtml(d.warning)}</small>`:''}`;}catch(e){state.innerHTML=`<b>Import failed.</b><br>${escapeHtml(e.message)}`}finally{btn.disabled=false;btn.textContent='Read & Convert File'}
}
async function programEditor(id=null,openUploader=false){
  let row=null;if(id){try{row=(await sbRest(`coach_programs?select=*&id=eq.${encodeURIComponent(id)}&limit=1`))?.[0]}catch(e){return toast(e.message)}}const content=row?.content||{};
  const modal=mwModal(row?'Edit Program':'New Program',`<div class="form"><div class="tile"><h3>Import Existing Program</h3><p>Upload PDF, Word (.docx), Excel, CSV or TXT. MW will convert the file into editable text. Nothing is published until you review and save it.</p><input id="cpFile" type="file" accept=".pdf,.docx,.xlsx,.xls,.csv,.txt,text/plain,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"><button class="back" id="importCP" type="button" style="margin-top:10px">Read & Convert File</button><div id="cpImportState" style="margin-top:10px;color:#adbdc8"></div></div><label>Name<input id="cpName" value="${escapeHtml(row?.name||'')}"></label><label>Type<select id="cpType"><option value="track">Track</option><option value="strength">Strength</option><option value="combined">Combined</option></select></label><label>Status<select id="cpStatus"><option value="draft">Draft</option><option value="active">Active</option><option value="archived">Archived</option></select></label><label>Program Content<textarea id="cpContent" rows="14" placeholder="Week / Day / Session structure…">${escapeHtml(content.text||'')}</textarea></label><div class="tile"><b>Coach Review Required</b><p>MW never silently changes your prescription. Verify all workouts before making the program active.</p></div><button class="action" id="saveCP">Save Program</button></div>`);
  modal.dataset.sourceFile=content.source_file||'';modal.querySelector('#cpType').value=row?.program_type||'track';modal.querySelector('#cpStatus').value=row?.status||'draft';modal.querySelector('#importCP').onclick=()=>importCoachProgramFile(modal);if(openUploader)setTimeout(()=>modal.querySelector('#cpFile')?.click(),80);
  modal.querySelector('#saveCP').onclick=async()=>{const u=await mwCurrentUser(),body={coach_user_id:u.id,name:modal.querySelector('#cpName').value.trim(),program_type:modal.querySelector('#cpType').value,status:modal.querySelector('#cpStatus').value,content:{text:modal.querySelector('#cpContent').value,updated_from:`MW Coach V${MW_APP_VERSION}`,source_file:modal.dataset.sourceFile||null,review_required:false}};if(!body.name)return toast('Program name required');if(!body.content.text.trim())return toast('Program content is required');try{const d=id?await sbRest(`coach_programs?id=eq.${encodeURIComponent(id)}`,{method:'PATCH',body}):await sbRest('coach_programs',{method:'POST',body});await logCoachAction(id?'program_updated':'program_created','coach_program',d?.[0]?.id||id,{name:body.name,source_file:body.content.source_file});modal.remove();programsPage();toast('Program synced')}catch(e){toast(e.message)}};
}
const MW_SCHOOL_CONSTRAINT_TYPES=new Set(['school_break','exam_week','holiday','facility_closure','travel']);
function coachConstraintLabel(type){return ({school_break:'School Break',exam_week:'Exam Week',holiday:'Holiday',facility_closure:'Facility Closure',travel:'Travel / School Trip'})[type]||'Schedule Constraint'}
function coachConstraintImpactLabel(impact){return ({no_practice:'No Practice',reduced_load:'Reduced Load',awareness_only:'Awareness Only',normal:'Normal Schedule'})[impact]||'Awareness Only'}
function localDateValue(value){if(!value)return'';const d=new Date(value);if(Number.isNaN(d.getTime()))return'';return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,10)}
function coachDateRange(e){const start=new Date(e.starts_at),end=e.ends_at?new Date(e.ends_at):null,s=start.toLocaleDateString();return end&&end.toDateString()!==start.toDateString()?`${s} – ${end.toLocaleDateString()}`:s}
async function calendarPage(){
  pageBase('Calendar','Build the season around your school calendar, practices, meets, exams, breaks, travel, and facility availability.',`
    <section class="school-calendar-hero">
      <div><span class="status-kicker">SCHOOL CALENDAR</span><h2>Plan around real life.</h2><p>Add breaks, exam weeks, holidays, travel, and facility closures so MW can account for them when helping you plan training.</p></div>
      <button class="action" id="addSchoolConstraint">+ Add School Constraint</button>
    </section>
    <div class="panel-grid school-calendar-summary" style="margin-top:14px">
      <div class="tile"><h3>No Practice</h3><b id="noPracticeCount">—</b><p>Dates MW should keep clear.</p></div>
      <div class="tile"><h3>Reduced Load</h3><b id="reducedLoadCount">—</b><p>Exam or high-stress periods.</p></div>
    </div>
    <section class="section" style="margin-top:14px">
      <div class="section-head"><div><span class="status-kicker">SCHOOL & AVAILABILITY</span><h2>Schedule Constraints</h2></div><button class="link-btn" id="addSchoolConstraint2">+ Add</button></div>
      <div class="list" id="schoolConstraintList" style="padding:14px"><div class="tile">Loading school calendar…</div></div>
    </section>
    <section class="section" style="margin-top:14px">
      <div class="section-head"><div><span class="status-kicker">TEAM SCHEDULE</span><h2>Practices, Meets & Testing</h2></div><button class="link-btn" id="addCalendar">+ Add Event</button></div>
      <div class="list" id="calLive" style="padding:14px"><div class="tile">Loading team events…</div></div>
    </section>`);
  const openConstraint=()=>schoolConstraintModal();document.getElementById('addSchoolConstraint').onclick=openConstraint;document.getElementById('addSchoolConstraint2').onclick=openConstraint;document.getElementById('addCalendar').onclick=()=>calendarEventModal();
  try{
    const rows=await sbRest('coach_calendar_events?select=id,title,event_type,starts_at,ends_at,location,notes,registration_status,training_impact&order=starts_at.asc')||[];
    const constraints=rows.filter(e=>MW_SCHOOL_CONSTRAINT_TYPES.has(e.event_type)),events=rows.filter(e=>!MW_SCHOOL_CONSTRAINT_TYPES.has(e.event_type));
    document.getElementById('noPracticeCount').textContent=constraints.filter(e=>e.training_impact==='no_practice').length;
    document.getElementById('reducedLoadCount').textContent=constraints.filter(e=>e.training_impact==='reduced_load').length;
    schoolConstraintList.innerHTML=constraints.map(e=>`<div class="row school-constraint-row"><span><b>${escapeHtml(e.title)}</b><br><small>${escapeHtml(coachConstraintLabel(e.event_type))} · ${escapeHtml(coachDateRange(e))} · <strong>${escapeHtml(coachConstraintImpactLabel(e.training_impact))}</strong></small>${e.notes?`<br><small>${escapeHtml(e.notes)}</small>`:''}</span><button class="action constraint-live" data-id="${e.id}">Edit</button></div>`).join('')||'<div class="tile"><h3>No school constraints yet</h3><p>Add exam weeks, school breaks, holidays, travel, or facility closures here.</p></div>';
    schoolConstraintList.querySelectorAll('.constraint-live').forEach(b=>b.onclick=()=>schoolConstraintModal(b.dataset.id));
    calLive.innerHTML=events.map(e=>`<div class="row"><span><b>${escapeHtml(e.title)}</b><br><small>${escapeHtml(e.event_type||'event')} · ${new Date(e.starts_at).toLocaleString()}${e.location?' · '+escapeHtml(e.location):''}</small></span><button class="action cal-live" data-id="${e.id}">Open</button></div>`).join('')||'<div class="tile">No practices, meets, or testing events scheduled yet.</div>';
    calLive.querySelectorAll('.cal-live').forEach(b=>b.onclick=()=>calendarEventModal(b.dataset.id));
  }catch(e){schoolConstraintList.innerHTML=`<div class="tile">${escapeHtml(e.message)}</div>`;calLive.innerHTML=`<div class="tile">${escapeHtml(e.message)}</div>`}
}
async function schoolConstraintModal(id=null){
  let row=null;if(id)row=(await sbRest(`coach_calendar_events?select=*&id=eq.${encodeURIComponent(id)}&limit=1`))?.[0];
  const start=localDateValue(row?.starts_at),end=localDateValue(row?.ends_at||row?.starts_at);
  const modal=mwModal(row?'Edit School Constraint':'Add School Constraint',`<div class="form">
    <label>What is happening?<select id="scType"><option value="school_break">School Break</option><option value="exam_week">Exam Week</option><option value="holiday">Holiday</option><option value="facility_closure">Facility Closure</option><option value="travel">Travel / School Trip</option></select></label>
    <label>Name<input id="scTitle" maxlength="120" placeholder="Example: Fall Break" value="${escapeHtml(row?.title||'')}"></label>
    <div class="form-grid"><label>Start Date<input id="scStart" type="date" value="${start}"></label><label>End Date<input id="scEnd" type="date" value="${end}"></label></div>
    <label>Training Impact<select id="scImpact"><option value="no_practice">No Practice — keep these dates clear</option><option value="reduced_load">Reduced Load — lighter / simplified schedule</option><option value="awareness_only">Awareness Only — coach decides day by day</option></select></label>
    <label>Coach Notes<textarea id="scNotes" rows="3" placeholder="Optional details for Coach MW and season planning">${escapeHtml(row?.notes||'')}</textarea></label>
    <div class="tile"><b>How MW uses this</b><p>No Practice dates are treated as unavailable. Reduced Load periods are surfaced to Coach MW and season planning so recommendations can protect recovery and school demands. The coach remains in control of official program changes.</p></div>
    <button class="action" id="saveSC">Save School Calendar</button>
    ${row?'<button class="back" id="deleteSC" type="button">Delete Constraint</button>':''}
  </div>`);
  modal.querySelector('#scType').value=MW_SCHOOL_CONSTRAINT_TYPES.has(row?.event_type)?row.event_type:'school_break';
  modal.querySelector('#scImpact').value=['no_practice','reduced_load','awareness_only'].includes(row?.training_impact)?row.training_impact:'no_practice';
  modal.querySelector('#saveSC').onclick=async()=>{
    const title=modal.querySelector('#scTitle').value.trim(),startDate=modal.querySelector('#scStart').value,endDate=modal.querySelector('#scEnd').value||startDate;
    if(!title||!startDate)return toast('Name and start date are required');if(endDate<startDate)return toast('End date cannot be before start date');
    const u=await mwCurrentUser(),body={coach_user_id:u.id,title,event_type:modal.querySelector('#scType').value,starts_at:new Date(startDate+'T00:00:00').toISOString(),ends_at:new Date(endDate+'T23:59:59').toISOString(),location:null,notes:modal.querySelector('#scNotes').value.trim()||null,registration_status:null,training_impact:modal.querySelector('#scImpact').value};
    try{const d=id?await sbRest(`coach_calendar_events?id=eq.${encodeURIComponent(id)}`,{method:'PATCH',body}):await sbRest('coach_calendar_events',{method:'POST',body});await logCoachAction(id?'school_calendar_updated':'school_calendar_created','calendar_event',d?.[0]?.id||id,{title:body.title,type:body.event_type,impact:body.training_impact,start:startDate,end:endDate});modal.remove();calendarPage();toast('School calendar saved')}catch(e){toast(e.message)}
  };
  const del=modal.querySelector('#deleteSC');if(del)del.onclick=async()=>{if(!confirm('Delete this school calendar constraint?'))return;try{await sbRest(`coach_calendar_events?id=eq.${encodeURIComponent(id)}`,{method:'DELETE'});modal.remove();calendarPage();toast('Constraint deleted')}catch(e){toast(e.message)}};
}
async function calendarEventModal(id=null){
  let row=null;if(id)row=(await sbRest(`coach_calendar_events?select=*&id=eq.${encodeURIComponent(id)}&limit=1`))?.[0];const local=row?.starts_at?new Date(new Date(row.starts_at).getTime()-new Date(row.starts_at).getTimezoneOffset()*60000).toISOString().slice(0,16):'';
  const modal=mwModal(row?'Edit Event':'Add Event',`<div class="form"><label>Title<input id="ceTitle" value="${escapeHtml(row?.title||'')}"></label><label>Type<select id="ceType"><option value="practice">Practice</option><option value="meet">Meet</option><option value="testing">Testing</option><option value="other">Other</option></select></label><label>Date / Time<input id="ceStart" type="datetime-local" value="${local}"></label><label>Location<input id="ceLoc" value="${escapeHtml(row?.location||'')}"></label><label>Notes<textarea id="ceNotes" rows="3">${escapeHtml(row?.notes||'')}</textarea></label><button class="action" id="saveCE">Save Event</button></div>`);
  modal.querySelector('#ceType').value=['practice','meet','testing','other'].includes(row?.event_type)?row.event_type:'practice';
  modal.querySelector('#saveCE').onclick=async()=>{const title=modal.querySelector('#ceTitle').value.trim(),startValue=modal.querySelector('#ceStart').value;if(!title||!startValue)return toast('Title and date required');const u=await mwCurrentUser(),body={coach_user_id:u.id,title,event_type:modal.querySelector('#ceType').value,starts_at:new Date(startValue).toISOString(),ends_at:null,location:modal.querySelector('#ceLoc').value.trim()||null,notes:modal.querySelector('#ceNotes').value.trim()||null,registration_status:row?.registration_status||null,training_impact:'normal'};try{const d=id?await sbRest(`coach_calendar_events?id=eq.${encodeURIComponent(id)}`,{method:'PATCH',body}):await sbRest('coach_calendar_events',{method:'POST',body});await logCoachAction(id?'calendar_updated':'calendar_created','calendar_event',d?.[0]?.id||id,{title:body.title,type:body.event_type});modal.remove();calendarPage()}catch(e){toast(e.message)}};
}
async function meetsPage(){pageBase('Meets','Meet schedule pulled from your live MW calendar.',`<div id="meetLive" class="list"><div class="tile">Loading meets…</div></div><button class="action" id="newMeet" style="margin-top:14px">+ Add Meet</button>`);newMeet.onclick=()=>calendarEventModal();try{const rows=await sbRest('coach_calendar_events?select=id,title,starts_at,location,registration_status,notes&event_type=eq.meet&order=starts_at.asc')||[];meetLive.innerHTML=rows.map(e=>`<div class="row"><span><b>${escapeHtml(e.title)}</b><br><small>${new Date(e.starts_at).toLocaleDateString()} · ${escapeHtml(e.location||'Location TBD')}</small></span><span class="status">${escapeHtml(e.registration_status||'Planned')}</span></div>`).join('')||'<div class="tile">No meets scheduled yet.</div>'}catch(e){meetLive.innerHTML=`<div class="tile">${escapeHtml(e.message)}</div>`}}
async function messagesPage(preselectGroup=null){
  if(window.__mwCoachMessagePoll){clearInterval(window.__mwCoachMessagePoll);window.__mwCoachMessagePoll=null}
  pageBase('Messages','Talk to athletes without digging through separate communication tools.',`
    <div class="mw-message-head"><div><span class="status-kicker">COACH COMMUNICATION</span><h2>Conversations</h2></div><button class="back" id="mwAnnouncementShortcut" type="button">+ Announcement</button></div>
    <div class="mw-msg-tabs"><button class="back active" id="mwDirectTab" type="button">ATHLETES</button><button class="back" id="mwAnnouncementTab" type="button">ANNOUNCEMENTS</button></div>
    <div id="mwDirectMessages" class="mw-message-layout">
      <section class="mw-conversation-pane">
        <div class="mw-message-search"><span>⌕</span><input id="mwMessageSearch" autocomplete="off" placeholder="Search athlete conversations"></div>
        <div id="mwCoachInbox" class="mw-conversation-list"><div class="tile">Loading conversations…</div></div>
      </section>
      <section class="mw-thread-pane" id="mwCoachThreadPane">
        <div class="mw-thread-empty" id="mwCoachThreadEmpty"><div class="mw-thread-empty-icon">💬</div><h3>Select an athlete</h3><p>Choose a conversation to view the complete coach ↔ athlete message thread.</p></div>
        <div id="mwCoachThread" hidden>
          <div class="mw-thread-head"><button class="back mw-thread-mobile-back" id="mwCoachThreadBack" type="button">← Messages</button><div><h3 id="mwCoachThreadName">Athlete</h3><small id="mwCoachThreadStatus">MW Athlete</small></div></div>
          <div id="mwCoachThreadList" class="mw-thread-list"></div>
          <div class="mw-thread-compose"><textarea id="mwCoachThreadText" rows="2" placeholder="Message athlete…"></textarea><button class="action" id="mwCoachThreadSend" type="button">Send</button></div>
          <div id="mwCoachThreadState" class="mw-thread-state"></div>
        </div>
      </section>
    </div>
    <div id="mwAnnouncementMessages" hidden>
      <div class="form mw-announcement-compose"><label>Audience<select id="msgAudience"><option value="all_assigned">All Assigned Athletes</option><option value="group">Group</option></select></label><label id="msgTargetWrap" style="display:none">Group<select id="msgTarget"></select></label><label>Announcement<textarea id="msgText" rows="4" placeholder="Team or group announcement…"></textarea></label><button class="action" id="sendMsg">Send Announcement</button></div>
      <div class="list" id="msgHistory" style="margin-top:16px"><div class="tile">Loading announcements…</div></div>
    </div>`);

  let groups=[],roster=[],coachMessages=[],athleteReplies=[],selectedAthleteId=null,activeMode=preselectGroup?'announcements':'direct';
  const directWrap=document.getElementById('mwDirectMessages'),announceWrap=document.getElementById('mwAnnouncementMessages'),directTab=document.getElementById('mwDirectTab'),announceTab=document.getElementById('mwAnnouncementTab');
  const esc=escapeHtml;
  const initials=name=>String(name||'A').split(/\s+/).filter(Boolean).slice(0,2).map(x=>x[0]?.toUpperCase()).join('')||'A';
  const fmtTime=v=>{if(!v)return '';const d=new Date(v),today=new Date();return d.toDateString()===today.toDateString()?d.toLocaleTimeString([],{hour:'numeric',minute:'2-digit'}):d.toLocaleDateString([],{month:'short',day:'numeric'})};
  const setMode=mode=>{activeMode=mode;const direct=mode==='direct';directWrap.hidden=!direct;announceWrap.hidden=direct;directTab.classList.toggle('active',direct);announceTab.classList.toggle('active',!direct)};
  directTab.onclick=()=>setMode('direct');announceTab.onclick=()=>setMode('announcements');const announcementShortcut=document.getElementById('mwAnnouncementShortcut');if(announcementShortcut)announcementShortcut.onclick=()=>setMode('announcements');setMode(activeMode);

  try{[groups,roster]=await Promise.all([liveGroups(),fetchCoachRoster().then(d=>d.athletes||[])]);}catch(e){toast(e.message)}

  const syncAnnouncementTarget=()=>{const type=msgAudience.value;msgTargetWrap.style.display=type==='group'?'block':'none';msgTarget.innerHTML=groups.map(g=>`<option value="${g.id}">${esc(g.name)}</option>`).join('');if(preselectGroup&&type==='group')msgTarget.value=preselectGroup};
  msgAudience.onchange=syncAnnouncementTarget;if(preselectGroup){msgAudience.value='group'}syncAnnouncementTarget();

  function directCoachMessagesFor(aid){
    const replies=athleteReplies.filter(r=>r.athlete_id===aid),replyParentIds=new Set(replies.map(r=>r.in_reply_to).filter(Boolean));
    return coachMessages.filter(m=>(m.audience_type==='athlete'&&m.athlete_id===aid)||replyParentIds.has(m.id));
  }
  function mergedThread(aid){
    return [...directCoachMessagesFor(aid).map(x=>({...x,kind:'coach'})),...athleteReplies.filter(r=>r.athlete_id===aid).map(x=>({...x,kind:'athlete'}))].sort((a,b)=>new Date(a.created_at)-new Date(b.created_at));
  }
  function inboxSummary(a){
    const thread=mergedThread(a.id),last=thread[thread.length-1],unread=athleteReplies.filter(r=>r.athlete_id===a.id&&!r.coach_read_at).length;
    return {last,unread};
  }
  function renderInbox(){
    const wrap=document.getElementById('mwCoachInbox'),q=String(document.getElementById('mwMessageSearch')?.value||'').trim().toLowerCase();
    const rows=roster.filter(a=>!q||String(a.name||'').toLowerCase().includes(q)).map(a=>({a,...inboxSummary(a)})).sort((x,y)=>new Date(y.last?.created_at||0)-new Date(x.last?.created_at||0));
    wrap.innerHTML=rows.length?rows.map(({a,last,unread})=>`<button class="mw-conversation-row ${selectedAthleteId===a.id?'active':''}" data-athlete-thread="${esc(a.id)}"><span class="mw-conversation-avatar">${esc(initials(a.name))}</span><span class="mw-conversation-copy"><span class="mw-conversation-top"><b>${esc(a.name||'Athlete')}</b><small>${fmtTime(last?.created_at)}</small></span><span class="mw-conversation-preview">${esc(last?.body||'Start a conversation')}</span></span>${unread?`<span class="mw-unread-dot" title="${unread} unread"></span>`:''}</button>`).join(''):'<div class="tile">No athlete conversations found.</div>';
    wrap.querySelectorAll('[data-athlete-thread]').forEach(b=>b.onclick=()=>openAthleteThread(b.dataset.athleteThread));
  }
  function renderThread(){
    const pane=document.getElementById('mwCoachThread'),empty=document.getElementById('mwCoachThreadEmpty'),aid=selectedAthleteId,a=roster.find(x=>x.id===aid);if(!aid||!a){pane.hidden=true;empty.hidden=false;return}
    empty.hidden=true;pane.hidden=false;document.getElementById('mwCoachThreadName').textContent=a.name||'Athlete';document.getElementById('mwCoachThreadStatus').textContent=a.event||'MW Athlete';
    const rows=mergedThread(aid),wrap=document.getElementById('mwCoachThreadList');wrap.innerHTML=rows.length?rows.map(x=>`<article class="mw-thread-bubble ${x.kind}"><div>${esc(x.body)}</div><small>${x.kind==='coach'?'You':'Athlete'} · ${new Date(x.created_at).toLocaleString()}</small></article>`).join(''):'<div class="mw-thread-empty-inline">No messages yet. Send the first message below.</div>';wrap.scrollTop=wrap.scrollHeight;
  }
  async function markThreadRead(aid){
    const ids=athleteReplies.filter(r=>r.athlete_id===aid&&!r.coach_read_at).map(r=>r.id);if(!ids.length)return;
    try{await sbRest(`athlete_coach_replies?id=in.(${ids.join(',')})`,{method:'PATCH',body:{coach_read_at:new Date().toISOString()},prefer:'return=minimal'});athleteReplies.forEach(r=>{if(ids.includes(r.id))r.coach_read_at=new Date().toISOString()})}catch{}
  }
  async function openAthleteThread(aid){selectedAthleteId=aid;renderInbox();renderThread();await markThreadRead(aid);renderInbox();document.getElementById('mwCoachThreadPane')?.classList.add('thread-open')}
  document.getElementById('mwCoachThreadBack').onclick=()=>document.getElementById('mwCoachThreadPane')?.classList.remove('thread-open');
  document.getElementById('mwMessageSearch').oninput=renderInbox;
  document.getElementById('mwCoachThreadSend').onclick=async()=>{const box=document.getElementById('mwCoachThreadText'),state=document.getElementById('mwCoachThreadState'),body=box.value.trim();if(!selectedAthleteId)return toast('Select an athlete');if(!body)return;const u=await mwCurrentUser(),btn=document.getElementById('mwCoachThreadSend');btn.disabled=true;state.textContent='Sending…';try{const d=await sbRest('coach_messages',{method:'POST',body:{coach_user_id:u.id,audience_type:'athlete',body,group_id:null,athlete_id:selectedAthleteId}});await logCoachAction('message_sent','coach_message',d?.[0]?.id,{audience:'athlete',athlete_id:selectedAthleteId});box.value='';state.textContent='';await loadAll();renderThread()}catch(e){state.textContent=e.message}finally{btn.disabled=false}};

  async function loadAnnouncements(){
    const rows=coachMessages.filter(m=>m.audience_type!=='athlete').sort((a,b)=>new Date(b.created_at)-new Date(a.created_at));
    msgHistory.innerHTML=rows.map(m=>`<div class="row"><span><b>${esc(m.audience_type==='group'?'Group Announcement':'All Assigned Athletes')}</b><br>${esc(m.body)}</span><small>${new Date(m.created_at).toLocaleString()}</small></div>`).join('')||'<div class="tile">No team or group announcements yet.</div>';
  }
  sendMsg.onclick=async()=>{const body=msgText.value.trim();if(!body)return toast('Write an announcement first');const u=await mwCurrentUser(),type=msgAudience.value,payload={coach_user_id:u.id,audience_type:type,body,group_id:type==='group'?msgTarget.value:null,athlete_id:null};try{const d=await sbRest('coach_messages',{method:'POST',body:payload});await logCoachAction('message_sent','coach_message',d?.[0]?.id,{audience:type});msgText.value='';await loadAll();toast('Announcement sent')}catch(e){toast(e.message)}};

  async function loadAll(){
    try{[coachMessages,athleteReplies]=await Promise.all([sbRest('coach_messages?select=id,athlete_id,group_id,audience_type,body,created_at&order=created_at.asc&limit=300'),sbRest('athlete_coach_replies?select=id,athlete_id,coach_user_id,in_reply_to,body,created_at,coach_read_at&order=created_at.asc&limit=300')]);coachMessages=coachMessages||[];athleteReplies=athleteReplies||[];renderInbox();renderThread();loadAnnouncements()}catch(e){document.getElementById('mwCoachInbox').innerHTML=`<div class="tile">${esc(e.message)}</div>`}
  }
  await loadAll();
  window.__mwCoachMessagePoll=setInterval(()=>{if(document.getElementById('mwCoachInbox'))loadAll()},12000);
}

async function activityPage(){pageBase('Activity Log','A real audit trail of coach actions in MW Dynasty.',`<div id="activityLive" class="list"><div class="tile">Loading activity…</div></div>`);try{const rows=await sbRest('coach_activity_log?select=id,action_type,entity_type,detail,created_at&order=created_at.desc&limit=50')||[];activityLive.innerHTML=rows.map(a=>`<div class="row"><span><b>${escapeHtml(a.action_type.replaceAll('_',' '))}</b><br><small>${escapeHtml(a.entity_type||'MW Coach')} ${a.detail?.name?'· '+escapeHtml(a.detail.name):''}</small></span><small>${new Date(a.created_at).toLocaleString()}</small></div>`).join('')||'<div class="tile">Activity will appear as you use the connected coach workspace.</div>'}catch(e){activityLive.innerHTML=`<div class="tile">${escapeHtml(e.message)}</div>`}}
async function taskBoardPage(){pageBase('Coach Task Board','Live priorities generated from athlete performance, program state and training activity.',`<div id="taskLive" class="list"><div class="tile">Analyzing assigned athletes…</div></div>`);try{const [d,p]=await Promise.all([fetchCoachRoster(),fetchCoachPerformance().catch(()=>({athletes:[]}))]),a=d.athletes||[],pm=new Map((p.athletes||[]).map(x=>[x.athlete_id,x])),tasks=[];for(const x of a){const perf=pm.get(x.id);for(const f of (perf?.flags||[]))tasks.push({n:x.name,d:f.message,p:f.level==='attention'?'Review Now':'Watch'});if(!x.last_completed_workout_at)tasks.push({n:x.name,d:'No completed workout is currently recorded. Review training status.',p:'Review'});else{const days=(Date.now()-new Date(x.last_completed_workout_at).getTime())/86400000;if(days>7)tasks.push({n:x.name,d:`Last recorded workout was ${Math.floor(days)} days ago. Check attendance and readiness.`,p:'High'});}if((x.prs||[]).length===0)tasks.push({n:x.name,d:'No PRs are recorded. Add verified marks to unlock individualized pacing.',p:'Setup'});}taskLive.innerHTML=tasks.map(t=>`<div class="row"><span><b>${escapeHtml(t.n)}</b><br>${escapeHtml(t.d)}</span><span class="status">${t.p}</span></div>`).join('')||'<div class="tile"><h3>No urgent athlete tasks detected</h3><p>No performance review flags, basic data gaps, or inactivity signals are active right now.</p></div>'}catch(e){taskLive.innerHTML=`<div class="tile">${escapeHtml(e.message)}</div>`}}
async function insightsPage(){
  pageBase('Performance Intelligence','Live coaching intelligence from your assigned athletes.',`<div id="insightLive" class="panel-grid"><div class="tile">Analyzing recorded performance…</div></div><div id="athletePerformanceLive" class="list" style="margin-top:16px"></div>`);
  try{
    const [d,p]=await Promise.all([fetchCoachRoster(),fetchCoachPerformance()]),a=d.athletes||[],pm=new Map((p.athletes||[]).map(x=>[x.athlete_id,x])),s=p.summary||{},rep=p.rep_tracking_enabled!==false;
    if(!rep){
      insightLive.innerHTML=`<div class="tile mw-upgrade-teaser"><div class="mw-upgrade-lock">🔒</div><div><div class="eyebrow">MW SPRINT PERFORMANCE</div><h3>Rep-by-Rep Sprint Tracking</h3><p>Track every rep, pace execution, consistency and late-session drop-off inside the complete MW Sprint Performance System.</p><button class="action" id="upgradeRepTracking">Upgrade to MW Sprint Performance</button></div></div><div class="tile"><h3>Strength Intelligence</h3><p><b>${s.athletes_with_strength_data||0}</b> of ${a.length} athletes have strength data connected.</p><small>Coach Intelligence continues to analyze available strength and training signals.</small></div>`;
      document.getElementById('upgradeRepTracking').onclick=membershipPage;
      athletePerformanceLive.innerHTML=a.map(x=>{const q=pm.get(x.id),flags=q?.flags||[],flag=flags[0];return `<button class="row" data-athlete-id="${escapeHtml(x.id)}" style="width:100%;text-align:left"><span><b>${escapeHtml(x.name)}</b><br><small>${q?.strength?.session_count?`${q.strength.session_count} strength session${q.strength.session_count===1?'':'s'} recorded`:'No strength session data yet'}</small><br><small>${escapeHtml(flag?.message||'Training status available for coach review')}</small></span><span class="status">INTELLIGENCE</span></button>`}).join('')||'<div class="tile">No assigned athletes yet.</div>';
    }else{
      insightLive.innerHTML=`<div class="tile"><h3>Pace Check-Ins</h3><p><b>${s.athletes_with_sprint_data||0}</b> of ${a.length} athletes</p><small>Quick check-ins or detailed Sprint Pace AI results</small></div><div class="tile"><h3>Pace Execution</h3><p><b>${s.average_latest_execution_pct==null?'—':s.average_latest_execution_pct+'%'}</b></p><small>Roster average across latest pace check-ins</small></div><div class="tile"><h3>Coach Review</h3><p><b>${s.review_flags||0}</b> review · <b>${s.watch_flags||0}</b> watch</p><small>Signals for coach judgment, not automatic changes</small></div><div class="tile"><h3>Strength Data</h3><p><b>${s.athletes_with_strength_data||0}</b> of ${a.length} athletes</p><small>Quick strength check-ins or detailed set logs</small></div>`;
      athletePerformanceLive.innerHTML=a.map(x=>{const q=pm.get(x.id),latest=q?.sprint?.latest,flag=q?.flags?.[0];return `<button class="row" data-athlete-id="${escapeHtml(x.id)}" style="width:100%;text-align:left"><span><b>${escapeHtml(x.name)}</b><br><small>${latest?`Week ${latest.program_week} · Day ${latest.program_day} · ${latest.source==='quick_checkin'?`${latest.pace_reps_hit}/${latest.pace_reps_total} on pace`:`${latest.rep_count} timed reps`}`:'No pace check-in yet'}${q?.strength?.session_count?` · ${q.strength.session_count} strength session${q.strength.session_count===1?'':'s'}`:''}</small><br><small>${escapeHtml(flag?.message||latest?.reason||'Awaiting performance data')}</small></span><span class="status">${latest?.execution_score_pct==null?'—':latest.execution_score_pct+'%'}</span></button>`}).join('')||'<div class="tile">No assigned athletes yet.</div>';
    }
    athletePerformanceLive.querySelectorAll('[data-athlete-id]').forEach(b=>b.onclick=()=>athleteDetail(b.dataset.athleteId));
  }catch(e){insightLive.innerHTML=`<div class="tile"><h3>Performance intelligence unavailable</h3><p>${escapeHtml(e.message)}</p></div>`}
}

async function pacingPage(){pageBase('Pacing Tools','Choose a live athlete PR and calculate individualized training targets.',`<div class="form"><label>Athlete<select id="paceAthlete"></select></label><label>PR<select id="pacePr"></select></label><label>Rep Distance<input id="rd" type="number" value="150"></label><label>Intensity %<input id="pi" type="number" value="90" min="50" max="100"></label><button class="action" id="calc">Calculate Target</button><div id="paceout" class="tile">Loading athlete PRs…</div></div>`);try{const a=(await fetchCoachRoster()).athletes||[];paceAthlete.innerHTML=a.map((x,i)=>`<option value="${i}">${escapeHtml(x.name)}</option>`).join('');const sync=()=>{const x=a[+paceAthlete.value],prs=x?.prs||[];pacePr.innerHTML=prs.map((p,i)=>`<option value="${i}">${escapeHtml(p.event)} — ${Number(p.time_seconds).toFixed(2)}s</option>`).join('');paceout.textContent=prs.length?'Select distance and intensity.':'This athlete needs a recorded PR first.'};paceAthlete.onchange=sync;sync();calc.onclick=()=>{const x=a[+paceAthlete.value],p=x?.prs?.[+pacePr.value];if(!p)return toast('Select an athlete with a PR');const base=Number(String(p.event).replace(/[^0-9.]/g,'')),pr=Number(p.time_seconds),dist=+rd.value,int=+pi.value;if(!(base>0&&pr>0&&dist>0&&int>=50&&int<=100))return toast('Check pacing inputs');const t=dist/((base/pr)*(int/100));paceout.innerHTML=`<b>${escapeHtml(x.name)}</b><br>${dist}m at ${int}% → <b>${t.toFixed(2)}s</b><br><small>Based on ${escapeHtml(p.event)} PR of ${pr.toFixed(2)}s</small>`}}catch(e){paceout.textContent=e.message}}
const MW_FIELD_CIRCUIT_REFERENCE={
  structure:'2 sets · 2 full-circuit reps per set · 4 full circuits total · 8 × 100m sprints',
  steps:[
    '100m sprint',
    '30 sec walk / rest through the first half of the end zone',
    'Bear crawl through the second half of the end zone',
    '15 sec rest at the corner',
    '100m sprint back',
    '30 sec walk / rest through the first half of the end zone',
    'High knees through the second half of the end zone',
    '15 sec rest at the corner'
  ]
};
function mwDetailLine(label,value){return value?`<div class="mw-detail-line"><span>${escapeHtml(label)}</span><b>${escapeHtml(value)}</b></div>`:''}
function mwOrdered(items){return Array.isArray(items)&&items.length?`<ol class="mw-order-list">${items.map(x=>`<li>${escapeHtml(x)}</li>`).join('')}</ol>`:''}
function mwCueList(items){return Array.isArray(items)&&items.length?`<div class="mw-cues">${items.map(x=>`<span>✓ ${escapeHtml(x)}</span>`).join('')}</div>`:''}
function renderTrackSession(s){
  const genericCircuit=s.title==='General Sprint Circuit'&&!s.circuit;
  const circuit=genericCircuit?MW_FIELD_CIRCUIT_REFERENCE.steps:s.circuit;
  const structure=genericCircuit?MW_FIELD_CIRCUIT_REFERENCE.structure:s.structure;
  return `<section class="mw-session-card">
    <div class="mw-session-top"><div><small>DAY ${escapeHtml(s.day)}</small><h3>${escapeHtml(s.title||s.focus||'Session')}</h3></div>${s.intensity?`<span class="mw-chip">${escapeHtml(s.intensity)}</span>`:''}</div>
    ${mwDetailLine('Focus',s.focus)}
    ${mwDetailLine('Work',s.work)}
    ${mwDetailLine('Setup',s.setup)}
    ${mwDetailLine('Structure',structure)}
    ${Array.isArray(s.sequence)&&s.sequence.length?`<div class="mw-detail-block"><b>Sequence</b>${mwOrdered(s.sequence)}</div>`:''}
    ${Array.isArray(circuit)&&circuit.length?`<div class="mw-detail-block mw-circuit-block"><b>${genericCircuit?'General Sprint Circuit · MW Field Circuit Reference':'Circuit · Exact Movement Order'}</b>${genericCircuit?`<p class="mw-reference-note">Coach reference: use this visual to understand the MW field-circuit flow. The weekly session card remains the source for the prescribed volume and intensity.</p>`:''}${mwOrdered(circuit)}${genericCircuit?`<img class="mw-circuit-img" src="mw-field-circuit-reference.png" alt="MW Field Circuit training diagram">`:''}</div>`:''}
    ${mwDetailLine('Recovery',s.recovery)}
    ${mwCueList(s.cues)}
  </section>`;
}
function mwStrengthDayLabel(code){
  return ({MON:'MONDAY',TUE:'TUESDAY',WED:'WEDNESDAY',THU:'THURSDAY',FRI:'FRIDAY',SAT:'SATURDAY',SUN:'SUNDAY'})[code]||code||'SESSION';
}
function mwStrengthGroups(sections){
  const groups=[];
  (sections||[]).forEach(sec=>{
    const raw=String(sec.title||'Session');
    const m=raw.match(/^(MON|TUE|WED|THU|FRI|SAT|SUN)\s*-\s*(.*)$/i);
    const code=(m?.[1]||'SESSION').toUpperCase();
    const title=m?.[2]||raw;
    let g=groups.find(x=>x.code===code);
    if(!g){g={code,label:mwStrengthDayLabel(code),blocks:[]};groups.push(g)}
    g.blocks.push({title,entries:sec.entries||[]});
  });
  return groups;
}
function renderStrengthWeek(x,week){
  const groups=mwStrengthGroups(x.sections||[]);
  return `<div class="mw-strength-week mw-strength-readable">
    <div class="mw-week-banner"><small>MW STRENGTH & POWER · ${escapeHtml(x.tierLabel||'FOUNDATION')}</small><h3>${escapeHtml(x.title||`Week ${week}`)}</h3>${x.phaseName?`<p>${escapeHtml(x.phaseName)}</p>`:''}<div class="mw-week-guide">Exercise <span>•</span> Prescription <span>•</span> Circuits <span>•</span> Coach note</div></div>
    ${x.tierGuidance?`<section class="mw-coach-note"><b>${escapeHtml(x.tierLabel||'')} TIER RULES</b><p>${escapeHtml(x.tierGuidance.volume||'')} ${escapeHtml(x.tierGuidance.effort||'')} ${escapeHtml(x.tierGuidance.loading||'')} ${escapeHtml(x.tierGuidance.priority||'')}</p></section>`:''}
    ${groups.map((g,gi)=>`<details class="mw-day-card" ${gi===0?'open':''}>
      <summary><span><small>TRAINING DAY</small><b>${escapeHtml(g.label)}</b></span><span class="mw-day-toggle">⌄</span></summary>
      <div class="mw-day-body">${g.blocks.map(block=>`<section class="mw-strength-block">
        <div class="mw-strength-block-title">${escapeHtml(block.title)}</div>
        <div class="mw-strength-table"><div class="mw-strength-head"><span>EXERCISE</span><span>PRESCRIPTION</span></div>
        ${(block.entries||[]).map(row=>`<div class="mw-lift-row"><b>${escapeHtml(row?.[0]||'')}</b><span>${escapeHtml(row?.[1]||'')}</span></div>`).join('')}</div>
      </section>`).join('')}</div>
    </details>`).join('')}
    ${x.coachNote?`<section class="mw-coach-note"><b>COACH MW NOTE</b><p>${escapeHtml(x.coachNote)}</p></section>`:''}
  </div>`;
}
async function mwProgramWeek(week,kind='track'){
  try{
    const token=mwSessionToken();
    const r=await fetch(`/api/coach/program?week=${week}`,{headers:{Authorization:`Bearer ${token}`}});
    const d=await r.json();
    if(!r.ok)throw new Error(d.error||'Program unavailable');
    const x=kind==='strength'?d.strength:d.track;
    if(!x)return mwModal(`${kind==='strength'?'Strength & Power':'MW Track Program'} · Week ${week}`,'<div class="tile">No verified prescription is connected for this week.</div>');
    const body=kind==='strength'?renderStrengthWeek(x,week):`<div class="mw-track-week"><div class="mw-week-banner"><small>MW TRACK PROGRAM</small><h3>Week ${week} · ${escapeHtml(x.phaseName||'MW Sprint Development')}</h3></div>${(x.sessions||[]).map(renderTrackSession).join('')}</div>`;
    mwModal(`${kind==='strength'?'Strength & Power':'MW Track Program'} · Week ${week}`,body);
  }catch(e){toast(e.message)}
}
function mwTrackPage(){pageBase('MW Track Program','Protected 41-week MW training system — every session opens with the full prescription, recovery, cues and circuit order.',`<div class="panel-grid">${Array.from({length:41},(_,i)=>i+1).map(w=>`<div class="tile"><h3>Week ${w}</h3><p>MW progressive sprint development</p><button class="action mw-week" data-week="${w}">Open Week</button></div>`).join('')}</div>`);document.querySelectorAll('.mw-week').forEach(b=>b.onclick=()=>mwProgramWeek(+b.dataset.week,'track'))}
function strengthPage(){pageBase('Strength & Power','The complete MW weight-room plan — organized by training day, lift, prescription, circuits and Coach MW notes.',`<div class="panel-grid">${Array.from({length:41},(_,i)=>i+1).map(w=>`<div class="tile"><h3>Week ${w}</h3><p>MW Strength & Power</p><button class="action mw-strength" data-week="${w}">Open Week</button></div>`).join('')}</div>`);document.querySelectorAll('.mw-strength').forEach(b=>b.onclick=()=>mwProgramWeek(+b.dataset.week,'strength'))}

window.addEventListener('mw:session-refreshed',e=>{if(e?.detail?.key===SESSION_KEY&&e.detail.session)authSession=e.detail.session});
window.addEventListener('online',()=>{if(readStoredSession()&&!document.querySelector('.app'))setTimeout(()=>initAuth(),220)});
initAuth();
