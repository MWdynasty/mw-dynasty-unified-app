Warning: truncated output (original token count: 84340)
Total output lines: 2745

const app=document.getElementById('app');
const MW_QA_PREVIEW=location.hostname.includes('-git-f-bc0584-');
const SUPABASE_URL=MW_QA_PREVIEW?'https://nktemtmsfhjcgjvkavrm.supabase.co':'https://keqgunlfwhjgcsurynef.supabase.co';
const SUPABASE_KEY=MW_QA_PREVIEW?'sb_publishable_I6p9Atq2zd_-1vA85PjAtA_FILbwc99':'sb_publishable_JWCLQzrdWA_ZmvbpV5urVg_rcT6NECm';
const SESSION_KEY='mwCoachSupabaseSession';
const MW_APP_VERSION='3.0.16';
const MW_IOS_BUILD='13';
let authSession=null;
let accountAccess={role:null,tier:null,isFounder:false,firstName:'',lastName:'',organization:'',coachTitle:'',email:'',features:{}};
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
 core:[['dashboard','⌂','Home'],['athletes','♟','Team'],['train','🏃','Train'],['calendar','📅','Calendar'],['messages','✉','Messages'],['account','⚙','Profile']],
 intelligence:[['dashboard','⌂','Home'],['athletes','♟','Team'],['train','🏃','Train'],['coachmw','MW','Coach MW'],['calendar','📅','Calendar'],['messages','✉','Messages'],['account','⚙','Profile']],
 performance:[['dashboard','⌂','Home'],['athletes','♟','Team'],['train','🏃','Train'],['coachmw','MW','Coach MW'],['calendar','📅','Calendar'],['messages','✉','Messages'],['account','⚙','Profile']]
};
function sideNav(){
  const items=[...nav[experience]];
  const artById={dashboard:'mwNavHome',athletes:'mwNavProfile',train:'mwNavTrain',programs:'mwNavTrain',coachmw:'mwNavCoach',messages:'mwNavProgram',account:'mwNavCoach'};
  return items.map(([id,ic,label],idx)=>{
    const divider=(experience!=='core'&&id==='calendar')|| (experience==='core'&&id==='calendar');
    const icon=id==='calendar'
      ?'<span class="nav-icon mwCalendarNav" aria-hidden="true">📅</span>'
      :`<span class="nav-icon mwNavArt ${artById[id]||''}" aria-hidden="true"></span>`;
    return `${divider?'<span class="side-nav-divider" aria-hidden="true"></span>':''}<button class="nav-btn ${id==='dashboard'?'active':''}" data-page="${id}">${icon}<span>${label}</span></button>`;
  }).join('');
}
function mobileCoachNav(activePage){
  const active=String(activePage||history.state?.mwCoachPage||'dashboard');
  const trainPages=new Set(['train','practice','programs','mwtrack','strength','pacing','grouppacing']);
  const shownActive=trainPages.has(active)?'train':active;
  const items=experience==='core'
    ?[
      ['dashboard','mwNavHome','HOME'],
      ['athletes','mwNavProfile','TEAM'],
      ['train','mwNavTrain','TRAIN'],
      ['messages','mwNavProgram','MESSAGES']
    ]
    :[
      ['dashboard','mwNavHome','HOME'],
      ['athletes','mwNavProfile','TEAM'],
      ['train','mwNavTrain','TRAIN'],
      ['coachmw','mwNavCoach','COACH MW']
    ];
  const primaryIds=new Set(items.map(x=>x[0]));
  const menuActive=!primaryIds.has(shownActive);
  return `<nav class="coach-mobile-nav mwDepthNav mwImageNav" aria-label="Coach navigation">
    ${items.map(([id,art,label])=>`<button type="button" class="${shownActive===id?'active':''}" data-page="${id}" aria-label="${label}"><b class="mwNavArt ${art}" aria-hidden="true"></b><span>${label}</span></button>`).join('')}
    <button type="button" class="${menuActive?'active':''}" data-page="more" aria-label="Menu"><b class="mwNavArt coachMobileMenuArt" aria-hidden="true"><img src="/assets/4480BE43-D4E2-4998-9CF0-06F69489F085.PNG" alt="" draggable="false"></b><span>MENU</span></button>
  </nav>`;
}
function shell(content){const p=PLANS[experience],coachName=[accountAccess.firstName,accountAccess.lastName].filter(Boolean).join(' ')||'MW Coach',defaultRole=accountAccess.isFounder?'Founder / Coach':accountAccess.role==='admin'?'MW Administrator':'Coach',coachRole=accountAccess.coachTitle||defaultRole,coachMeta=[coachRole,accountAccess.organization].filter(Boolean).join(' · '),profileNudge=accountAccess.role==='coach'&&(!accountAccess.organization||!accountAccess.coachTitle)?`<div class="tile mw-profile-nudge"><div><div class="eyebrow">COACH PROFILE</div><b>Complete your coaching identity</b><p>Add your school / organization and coaching title so athletes know exactly who is coaching them.</p></div><button class="action" data-page="account">Complete Profile</button></div>`:'';app.innerHTML=`<div class="app ${p.theme}"><div class="top-ribbon"><span>THREE PLATFORMS. ONE ECOSYSTEM.</span><span>${experience==='performance'?'SAME FOUNDATION. DIFFERENT POWER.':'GREATER ATHLETES. BETTER COACHES. A STRONGER FUTURE.'}</span></div><div class="frame"><header class="brand-head"><div class="brand-title">${p.title}</div><div class="brand-tag">${p.tag}</div><div class="brand-sub">${p.sub}</div></header><div class="workspace"><aside class="sidebar"><div class="side-brand-row"><div class="side-logo"><span class="mw-mark">MW</span><span>${p.side.replace('\n','<br>')}</span></div><button class="mobile-menu" id="mobileMenu" type="button" aria-expanded="false" aria-controls="sideNav">Menu</button></div><nav class="side-nav" id="sideNav">${sideNav()}</nav><div class="side-account"><button class="coach-row coach-profile-entry" data-page="account" type="button" aria-label="Open Coach profile"><span class="avatar coach-initials" aria-hidden="true">${escapeHtml(((accountAccess.firstName?.[0]||'M')+(accountAccess.lastName?.[0]||'W')).toUpperCase())}</span><span class="coach-profile-copy"><span class="coach-name">${escapeHtml(coachName)}</span><span class="coach-role">${escapeHtml(coachMeta)}</span></span></button><button class="signout" id="signout">Sign Out</button></div></aside><main class="main">${profileNudge}${content}</main></div><footer class="footer"><div class="footer-brand">MW DYNASTY</div><div class="footer-mid">GREATER ATHLETES. BETTER COACHES. A STRONGER FUTURE.</div><div class="footer-right">${p.footer}</div></footer></div>${mobileCoachNav('dashboard')}</div>`; bindGlobal();hydrateLiveAthleteCount();}
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
  const perf=a?.performance||null,perfFlags=Array.isArray(perf?.flags)?perf.flags:[],latest=perf?.sprint?.latest||null,latestWorkout=a?.latest_workout||null;
  if(perfFlags.some(f=>f.level==='attention')){level='attention';reasons.push(perfFlags.find(f=>f.level==='attention')?.message||'Performance execution needs review')}
  else if(perfFlags.some(f=>f.level==='watch')){level='watch';reasons.push(perfFlags.find(f=>f.level==='watch')?.message||'Performance trend worth watching')}
  else if(latest?.execution_score_pct!=null){reasons.push(`${latest.execution_score_pct}% pace execution in latest check-in`)}
  else if(Number(latestWorkout?.pace_reps_total)>0){
    const hit=Math.max(0,Number(latestWorkout.pace_reps_hit||0)),total=Number(latestWorkout.pace_reps_total),pct=hit/total*100;
    if(pct<50)level='attention';else if(pct<80)level='watch';
    reasons.push(`${hit}/${total} reps were on target pace`);
  }
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
    const cards=ordered.slice(0,12).map(a=>{const level=a._status.level;const reason=a._status.reasons[0];const event=a.event||a.primary_event||'Event not set';const week=Number(a.current_week||1),lw=a.latest_workout||null,acc=a.performance?.sprint?.latest?.execution_score_pct;const paceTotal=Number(lw?.pace_reps_total||0),paceHit=Math.max(0,Number(lw?.pace_reps_hit||0));const liveWorkout=lw?`W${Number(lw.program_week)||week} · D${Number(lw.program_day)||1}${paceTotal>0?` · ${paceHit}/${paceTotal} on pace`:''}`:null;return `<button class="athlete-status-card ${level}" data-athlete-id="${escapeHtml(a.id)}"><div class="athlete-status-top"><span class="status-pill ${level}"><span class="status-dot"></span>${athleteStatusLabel(level)}</span><span class="athlete-status-week">WEEK ${week}</span></div><h3>${escapeHtml(a.name||'Athlete')}</h3><p>${escapeHtml(event)}</p><div class="athlete-status-reason">${escapeHtml(reason)}</div><div class="athlete-status-foot"><span>${liveWorkout?escapeHtml(liveWorkout):acc!=null?`Pace execution ${acc}%`:a.last_completed_workout_at?`Last workout ${escapeHtml(fmtDate(a.last_completed_workout_at))}`:'No performance data yet'}</span><span>Open →</span></div></button>`}).join('');
    el.innerHTML=summary+(cards?`<div class="athlete-status-grid">${cards}</div>`:`<div class="tile"><h3>No athletes connected yet</h3><p>Connect athletes to activate roster intelligence.</p></div>`);
    el.querySelectorAll('[data-athlete-id]').forEach(b=>b.onclick=()=>athleteDetail(b.dataset.athleteId));
  }catch(e){el.innerHTML=`<div class="tile"><h3>Status board unavailable</h3><p>${escapeHtml(e.message)}</p></div>`}
}
function coachPhaseName(phase){return ({1:'Foundation',2:'Strength & Speed Development',3:'Power / Pre-Competition',4:'Competition',5:'Peak / Championship'})[Number(phase)]||'MW Progression'}
function coachTrainingYearShell(){return `<button type="button" class="coach-training-year-card" data-page="account"><span class="coach-training-year-icon">▣</span><span class="coach-training-year-copy"><small id="coachTrainingYearLabel">MW TRAINING YEAR</small><b id="coachTrainingYearMain">Loading your training calendar…</b><span id="coachTrainingYearSub">Standard calendar + coach-controlled placement</span></span><span class="coach-training-year-arrow">→</span></button>`}
async function hydrateCoachTrainingYearCard(){
  const label=document.getElementById('coachTrainingYearLabel'),main=document.getElementById('coachTrainingYearMain'),sub=document.getElementById('coachTrainingYearSub');if(!main)return;
  try{
    const cal=await coachSeasonCalendarRequest(),total=Number(cal?.seasonLengthWeeks||41),custom=cal?.mode==='custom'||!!cal?.coachingLevel;
    if(label)label.textContent=custom?'COACH TRAINING CALENDAR':'MW STANDARD TRAINING YEAR';
    if(cal?.status==='active')main.textContent=`Week ${cal.week} of ${total} · ${coachPhaseName(cal.phase)}`;
    else if(cal?.status==='preseason')main.textContent=`Preseason · ${total}-week calendar begins ${cal.startDate||'on your saved start date'}`;
    else main.textContent=`Training calendar complete · ${total} weeks`;
    const meta=[cal?.coachingLevel?mwCoachLevelLabel(cal.coachingLevel):null,cal?.competitionState||null,cal?.seasonType?String(cal.seasonType).replace(/^./,x=>x.toUpperCase()):null].filter(Boolean).join(' · ');
    if(sub)sub.textContent=meta?meta+' · '+mwCalendarSourceLabel(cal.calendarSource||cal.source):(custom?'Assigned athletes inherit your coach calendar and placement.':'Open Profile to set your state and generate estimated season dates.');
  }catch(e){main.textContent='Training calendar unavailable';if(sub)sub.textContent='Open Profile to review the MW training-year setting.'}
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

function coachTrainingDayFromCalendar(calendar){
  const c=calendar||{};
  if(c.status==='preseason')return 1;
  if(!c.startDate){
    const dow=new Date().getDay();
    return dow===0?7:dow;
  }
  const [y,m,d]=String(c.startDate).split('-').map(Number);
  if(!(y&&m&&d))return 1;
  const now=new Date();
  const todayUTC=Date.UTC(now.getFullYear(),now.getMonth(),now.getDate());
  const startUTC=Date.UTC(y,m-1,d);
  const diff=Math.floor((todayUTC-startUTC)/86400000);
  if(diff<0)return 1;
  return ((diff%7)+7)%7+1;
}
function coachSessionDayNumber(value){
  const n=Number(value);
  if(Number.isFinite(n)&&n>=1&&n<=7)return n;
  const s=String(value||'').trim().toUpperCase();
  const match=s.match(/\d+/);if(match){const x=Number(match[0]);if(x>=1&&x<=7)return x}
  const map={MON:1,MONDAY:1,TUE:2,TUESDAY:2,WED:3,WEDNESDAY:3,THU:4,THURSDAY:4,FRI:5,FRIDAY:5,SAT:6,SATURDAY:6,SUN:7,SUNDAY:7};
  return map[s]||null;
}
function coachTrainingDayLabel(day){
  return ['','DAY 1','DAY 2','DAY 3','DAY 4','DAY 5','DAY 6','DAY 7'][Number(day)||1]||'TODAY';
}
function coachStrengthDayCode(day){
  return ['','MON','TUE','WED','THU','FRI','SAT','SUN'][Number(day)||1]||'MON';
}
async function coachSeasonCalendarRequest(){return coachCurrentCalendar()}
async function coachCurrentCalendar(){
  const token=mwSessionToken();if(!token)throw new Error('Coach session expired. Sign in again.');
  const r=await fetch('/api/season-calendar',{headers:{Authorization:'Bearer '+token},cache:'no-store'});
  const d=await r.json().catch(()=>({}));
  if(!r.ok)throw new Error(d.error||'Training calendar unavailable');
  return d.calendar||{};
}
async function coachProgramData(week,eventGroup='100_200',trackTier='performance',strengthTier=trackTier){
  const token=mwSessionToken();if(!token)throw new Error('Coach session expired. Sign in again.');
  const qs=new URLSearchParams({week:String(week||1),trackTier:String(trackTier||'performance'),strengthTier:String(strengthTier||trackTier||'performance'),eventGroup:String(eventGroup||'100_200')});
  const r=await fetch('/api/coach/program?'+qs.toString(),{headers:{Authorization:'Bearer '+token},cache:'no-store'});
  const d=await r.json().catch(()=>({}));
  if(!r.ok)throw new Error(d.error||'Today’s MW training could not be loaded');
  return d;
}
function coachPracticeTier(a){
  const direct=String(a?.track_tier||'').toLowerCase();if(['foundation','development','performance'].includes(direct))return direct;
  const x=String(a?.experience_level||'').toLowerCase();
  if(/advanced|elite|professional|\bpro\b/.test(x))return 'performance';
  if(/intermediate|trained/.test(x))return 'development';
  return 'foundation';
}
function coachPracticeStrengthTier(a){
  const direct=String(a?.strength_tier||'').toLowerCase();return ['foundation','development','performance'].includes(direct)?direct:coachPracticeTier(a)
}
function coachPracticeEventGroup(a){
  const primary=String(a?.primary_event||a?.event||'').toLowerCase();
  return /400/.test(primary)&&!/100|200/.test(primary)?'400':'100_200'
}
function coachTodaySessionHTML(session,label,week,day){
  if(!session)return `<article class="coach-today-session empty"><div class="coach-today-session-top"><span>${escapeHtml(label)}</span><b>WEEK ${week} · ${escapeHtml(coachTrainingDayLabel(day))}</b></div><h3>No sprint session is prescribed for this training day.</h3><p>Use recovery, meet, travel, or schedule context as appropriate. Open the full week if you need another training day.</p></article>`;
  const work=session.prescribedWork||session.work||session.structure||'Follow the MW prescription.';
  const recovery=session.recovery||'As prescribed';
  const warm=session.warmup||'MW warm-up';
  return `<article class="coach-today-session">
    <div class="coach-today-session-top"><span>${escapeHtml(label)}</span><b>WEEK ${week} · ${escapeHtml(coachTrainingDayLabel(day))}</b></div>
    <h3>${escapeHtml(session.title||session.focus||'Today’s Sprint Session')}</h3>
    ${session.focus?`<p class="coach-today-focus">${escapeHtml(session.focus)}</p>`:''}
    <div class="coach-today-prescription"><span>WARM-UP</span><b>${escapeHtml(warm)}</b></div>
    <div class="coach-today-prescription coach-today-work"><span>WORK</span><b>${escapeHtml(work)}</b></div>
    <div class="coach-today-prescription"><span>RECOVERY</span><b>${escapeHtml(recovery)}</b></div>
    ${Array.isArray(session.cues)&&session.cues.length?`<div class="coach-today-cues">${session.cues.slice(0,4).map(x=>`<span>✓ ${escapeHtml(x)}</span>`).join('')}</div>`:''}
  </article>`;
}
function coachTodayStrengthHTML(strength,week,day){
  const code=coachStrengthDayCode(day);
  const sections=(strength?.sections||[]).filter(sec=>String(sec.title||'').toUpperCase().startsWith(code+' -'));
  if(!sections.length)return `<article class="coach-today-session strength empty"><div class="coach-today-session-top"><span>STRENGTH & POWER</span><b>WEEK ${week} · ${escapeHtml(coachTrainingDayLabel(day))}</b></div><h3>No weight-room session is prescribed today.</h3></article>`;
  return `<article class="coach-today-session strength"><div class="coach-today-session-top"><span>STRENGTH & POWER</span><b>WEEK ${week} · ${escapeHtml(coachTrainingDayLabel(day))}</b></div><h3>Today’s Weight Room</h3><div class="coach-today-strength-list">${sections.map(sec=>`<div><b>${escapeHtml(String(sec.title||'').replace(/^\w+\s*-\s*/i,''))}</b>${(sec.entries||[]).slice(0,8).map(row=>`<span>${escapeHtml(row?.[0]||'')} <em>${escapeHtml(row?.[1]||'')}</em></span>`).join('')}</div>`).join('')}</div></article>`;
}
async function hydrateCoachTodayPractice(targetId='coachTodayPractice',options={}){
  const el=document.getElementById(targetId);if(!el)return;
  const practiceOnly=options.practiceMode===true;
  if(experience!=='performance'){
    el.innerHTML=`<article class="coach-today-session"><div class="coach-today-session-top"><span>TODAY’S PRACTICE</span><b>${experience==='intelligence'?'YOUR PROGRAM + MW INTELLIGENCE':'YOUR PROGRAM'}</b></div><h3>Open today’s coaching program.</h3><p>Your Train tab keeps Practice Mode and the performance tools beside your program so you can run the session from one place.</p>${practiceOnly?'':'<button class="action" data-page="programs">OPEN MY PROGRAM</button>'}</article>`;
    bindPageNavigation(el);return;
  }
  el.innerHTML='<div class="tile">Loading today’s MW practice…</div>';
  try{
    const [calendar,rosterData]=await Promise.all([coachCurrentCalendar(),fetchCoachRoster().catch(()=>({athletes:[]}))]);
    const calendarWeek=Math.max(1,Math.min(41,Number(calendar.week)||1)),calendarDay=coachTrainingDayFromCalendar(calendar),roster=Array.isArray(rosterData?.athletes)?rosterData.athletes:[];
    const calendarLabel=calendar.status==='preseason'?'PRESEASON':calendar.status==='offseason'?'OFFSEASON':`WEEK ${calendarWeek} · ${coachPhaseName(calendar.phase)}`;
    let sessionCards='',strengthCard='';
    if(roster.length){
      const groups=new Map();
      for(const a of roster){
        const week=Math.max(1,Math.min(41,Number(a.current_week)||calendarWeek)),sourceWeek=Math.max(1,Math.min(41,Number(a.source_week)||week)),day=Math.max(1,Math.min(7,Number(a.current_day)||calendarDay)),trackTier=coachPracticeTier(a),strengthTier=coachPracticeStrengthTier(a),eventGroup=coachPracticeEventGroup(a);
        const key=[week,sourceWeek,day,trackTier,strengthTier,eventGroup].join('|');
        if(!groups.has(key))groups.set(key,{week,sourceWeek,day,trackTier,strengthTier,eventGroup,athletes:[]});
        groups.get(key).athletes.push(a);
      }
      const cohorts=await Promise.all([...groups.values()].map(async g=>({...g,program:await coachProgramData(g.sourceWeek,g.eventGroup,g.trackTier,g.strengthTier)})));
      sessionCards=cohorts.map(g=>{
        const session=(g.program.track?.sessions||[]).find(s=>coachSessionDayNumber(s.day)===g.day)||null;
        const names=g.athletes.slice(0,3).map(a=>a.name).filter(Boolean).join(', ')+(g.athletes.length>3?` +${g.athletes.length-3}`:'');
        const label=`${g.eventGroup==='400'?'400M':'100M / 200M'} · ${g.trackTier.toUpperCase()}${names?' · '+names:''}`;
        return coachTodaySessionHTML(session,label,g.week,g.day);
      }).join('');
      const first=cohorts[0];if(first)strengthCard=coachTodayStrengthHTML(first.program.strength,first.week,first.day);
    }else if(practiceOnly){
      sessionCards='<article class="coach-today-session empty"><div class="coach-today-session-top"><span>ATHLETE-SYNCED PRACTICE</span><b>NO ASSIGNED ATHLETES</b></div><h3>No athlete workout is shown until an athlete is assigned.</h3><p>This prevents Practice Mode from showing a generic 200m prescription when an athlete’s actual MW prescription is different. Assign an athlete and MW will load that athlete’s exact season week, mapped source week, tier, event group, and PR-based pace target.</p></article>';
      strengthCard='';
    }else{
      const [short,long]=await Promise.all([coachProgramData(calendarWeek,'100_200'),coachProgramData(calendarWeek,'400')]);
      const shortSession=(short.track?.sessions||[]).find(s=>coachSessionDayNumber(s.day)===calendarDay)||null;
      const longSession=(long.track?.sessions||[]).find(s=>coachSessionDayNumber(s.day)===calendarDay)||null;
      sessionCards=coachTodaySessionHTML(shortSession,'100M / 200M GROUP',calendarWeek,calendarDay)+coachTodaySessionHTML(longSession,'400M GROUP',calendarWeek,calendarDay);
      strengthCard=coachTodayStrengthHTML(short.strength,calendarWeek,calendarDay);
    }
    el.innerHTML=`
      <div class="coach-today-banner"><div><span class="status-kicker">${practiceOnly?'LIVE PRACTICE':'TODAY’S PRACTICE'}</span><h2>${practiceOnly?'Today only. No week browsing.':'Your practice is ready.'}</h2><p>${escapeHtml(calendarLabel)} · ${escapeHtml(coachTrainingDayLabel(calendarDay))}${roster.length?' · ATHLETE PRESCRIPTIONS SYNCED':''}</p></div>${practiceOnly?'':'<button class="action" data-page="practice">START PRACTICE MODE</button>'}</div>
      <div class="coach-today-event-grid">${sessionCards}</div>
      ${strengthCard}
      ${practiceOnly?'':`<div class="coach-today-actions"><button class="back" data-page="mwtrack">OPEN FULL MW WEEK</button><button class="back" data-page="pacing">OPEN PACE AI</button></div>`}`;
    bindPageNavigation(el);
  }catch(e){
    el.innerHTML=`<div class="tile"><h3>Today’s practice could not load.</h3><p>${escapeHtml(e.message)}</p>${practiceOnly?'':'<button class="action" data-page="mwtrack">Open MW Track Program</button>'}</div>`;
    bindPageNavigation(el);
  }
}
async function coachTrainPage(){
  pageBase('Train','Today’s practice, Practice Mode, Sprint Pace AI, Group Pace AI and Distance Pacer in one place.',`
    <section id="coachTodayPractice" class="coach-today-practice"><div class="tile">Loading today’s practice…</div></section>
    <section class="coach-train-tools">
      <div class="coach-train-tools-head"><span class="status-kicker">PRACTICE TOOLS</span><h2>Run practice from here.</h2><p>You should not have to hunt through the Coach app while athletes are standing on the track.</p></div>
      <div class="coach-train-tool-grid coach-train-tool-grid-three">
        <button class="coach-train-tool" data-page="pacing"><b>⚡ SPRINT PACE AI</b><span>Calculate an individual athlete’s training target from their PR.</span><em>OPEN →</em></button>
        <button class="coach-train-tool" data-page="grouppacing"><b>👥 GROUP PACE AI</b><span>Split Boys / Girls first, then build groups from athletes with close PRs.</span><em>BUILD GROUPS →</em></button>
        <button class="coach-train-tool" id="coachTrainDistance"><b>◎ DISTANCE PACER</b><span>Measure the exact rep distance on a track, football field or open surface.</span><em>OPEN →</em></button>
      </div>
    </section>`);
  document.getElementById('coachTrainDistance').onclick=()=>{location.href='/distance-pacer/?coach=1'};
  hydrateCoachTodayPractice('coachTodayPractice');
}
function groupPacingPage(){
  pacingPage();
  setTimeout(()=>document.getElementById('coachGroupPaceAI')?.scrollIntoView({behavior:'smooth',block:'start'}),120);
}

function coachPracticeWorkoutComplete(a){
  const w=a?.latest_workout||null;
  return !!(w&&String(w.completion_status||'')==='completed'&&MWWorkoutIdentity.matches({...w,athlete_id:a.id},coachPracticeIdentity(a)));
}
function coachPracticeIdentity(a,week=a.current_week||1,day=a.current_day||1){
  return MWWorkoutIdentity.create({athleteId:a.id,seasonPlanId:a.season_plan_id||null,workoutCycleId:a.workout_cycle_id||null,week,day,sessionId:'track'});
}
function coachPracticeCompletionLabel(a){
  const w=a?.latest_workout||null,total=Number(w?.pace_reps_total||0),hit=Math.max(0,Number(w?.pace_reps_hit||0));
  return total>0?`WORKOUT COMPLETE · ${hit}/${total} ON PACE`:'WORKOUT COMPLETE';
}
async function practiceModePage(){
  pageBase('Practice Mode','See today’s practice first, then run groups, capture finish times, and save the session without leaving the track.',`
    <section id="practiceTodayPlan" class="coach-today-practice practice-inline"><div class="tile">Loading today’s practice…</div></section>
    <section class="practice-live-cockpit" aria-label="Live practice timing">
      <div class="practice-live-heading">
        <div><span class="status-kicker">LIVE REP</span><h3>Start → Tap Finish → Recover</h3><p>Keep the live controls together while athletes are moving.</p></div>
        <b id="practiceRepLabel">REP 1</b>
      </div>
      <div class="practice-group-tabs practice-live-group-tabs" id="practiceGroupTabs"><button class="active" data-practice-group="all">ALL</button><button data-practice-group="boys">BOYS</button><button data-practice-group="girls">GIRLS</button></div>
      <div class="practice-timing-clocks practice-live-clocks">
        <div class="practice-mode-head practice-live-clock-card"><div><span class="status-kicker">GROUP TIMING</span><h2 id="practiceClock">00.00</h2><small id="practiceClockState">Ready for Rep 1</small></div><div class="practice-timer-actions"><button class="action" id="practiceTimerStart">START REP</button><button class="back" id="practiceTimerReset" aria-label="Reset rep timer">RESET REP</button></div></div>
        <section id="practiceRest" class="mwRestTimer practice-live-rest-card" aria-label="Rest timer">
          <span class="mwRestLabel">REST TIME</span><strong data-rest-clock role="timer" aria-label="Elapsed rest time" aria-live="off">00:00</strong>
          <span data-rest-status role="status">READY BETWEEN REPS</span>
          <div class="mwRestActions"><button type="button" data-rest-toggle>START REST</button><button type="button" data-rest-reset aria-label="Reset rest timer">RESET</button></div>
        </section>
      </div>
      <div class="practice-live-finish">
        <div class="practice-finish-head"><div><span class="status-kicker">FINISH LINE</span><h3>Tap athletes as they cross</h3><p>No scrolling through setup controls during the rep.</p></div></div>
        <div id="practiceTimingRoster" class="practice-timing-grid"><div class="row">Loading athletes…</div></div>
        <div class="practice-next-actions"><button class="action" id="practiceNextRep" disabled>NEXT REP</button><button class="back" id="practiceFinishSession" disabled>FINISH & SAVE</button></div>
        <div id="practiceTimingState"></div>
      </div>
    </section>
    <details class="practice-drawer practice-secondary-drawer" id="practiceMoreControls">
      <summary><span>MORE REP CONTROLS</span><small>Undo · False Start · DNF · Manual · Retry</small></summary>
      <div class="practice-retry-actions"><button class="back" id="practiceUndoFinish" disabled>UNDO LAST FINISH</button><button class="back" id="practiceFalseStart">FALSE START / RESTART</button><button class="back" id="practiceDNF">DNF</button><button class="back" id="practiceManualTime">MANUAL TIME</button><button class="back" id="practiceRetryRep" disabled>RETRY LAST REP</button></div>
    </details>
    <details class="practice-drawer practice-setup-drawer" id="practiceSetup">
      <summary><span>PRACTICE SETUP</span><small>Group · Pace targets · Track lanes</small></summary>
      <div class="practice-setup-body">
        <div class="practice-group-tools"><label>Group<select id="practiceEventGroup"><option value="All Sprinters">All Sprinters</option><option value="100 / 200">100 / 200</option><option value="400">400</option><option value="Development">Development</option><option value="Varsity">Varsity</option><option value="Relays">Relays</option></select></label><label>Manual Target Override — Fast<input id="practiceTargetMin" type="number" min=".01" step=".01" inputmode="decimal" placeholder="Auto from Pace AI"></label><label>Manual Target Override — Slow<input id="practiceTargetMax" type="number" min=".01" step=".01" inputmode="decimal" placeholder="Auto from Pace AI"></label><label>Track Lanes<select id="practiceLaneCount"><option value="1">1</option><option value="2">2</option><option value="3">3</option><option value="4">4</option><option value="5">5</option><option value="6">6</option><option value="7">7</option><option value="8" selected>8</option><option value="9">9</option></select></label></div>
        <small>MW Pace AI loads each athlete’s recommended target from today’s prescription + live PRs. Open this setup only when you need to change the group, targets or lane count.</small>
      </div>
    </details>
    <div class="panel-grid" style="margin-top:14px"><button class="tile practice-launch mw-coach-launch" id="practiceCoachMW" ${experience==='core'?'style="display:none"':''}><h3><span class="mw-coach-crest" aria-hidden="true">MW</span> Coach MW</h3><p>Ask a quick coaching question without leaving Practice Mode.</p><b>OPEN →</b></button></div>
    <div class="tile" style="margin-top:14px"><div style="display:flex;justify-content:space-between;gap:12px;align-items:center;flex-wrap:wrap"><div><h3>Quick Attendance</h3><p>Set status and save once.</p></div><b id="practiceAttendanceCount">Loading…</b></div><div class="list" id="practiceRoster" style="margin-top:10px"><div class="row">Loading assigned athletes…</div></div><button class="action" id="practiceSaveAttendance" style="margin-top:14px" disabled>Save Practice Attendance</button><div id="practiceAttendanceState" style="margin-top:10px"></div></div>
  `);
  hydrateCoachTodayPractice('practiceTodayPlan',{practiceMode:true});
  const ai=document.getElementById('practiceCoachMW');if(ai)ai.onclick=()=>openPage('coachmw');
  const clock=document.getElementById('practiceClock'),clockState=document.getElementById('practiceClockState'),startBtn=document.getElementById('practiceTimerStart'),resetBtn=document.getElementById('practiceTimerReset'),nextBtn=document.getElementById('practiceNextRep'),finishBtn=document.getElementById('practiceFinishSession'),timingRoster=document.getElementById('practiceTimingRoster'),timingState=document.getElementById('practiceTimingState'),repLabel=document.getElementById('practiceRepLabel'),targetMinInput=document.getElementById('practiceTargetMin'),targetMaxInput=document.getElementById('practiceTargetMax'),eventGroup=document.getElementById('practiceEventGroup'),laneCountInput=document.getElementById('practiceLaneCount'),undoFinishBtn=document.getElementById('practiceUndoFinish'),falseStartBtn=document.getElementById('practiceFalseStart'),dnfBtn=document.getElementById('practiceDNF'),manualTimeBtn=document.getElementById('practiceManualTime');
  const restTimer=window.MWPracticeRestTimer.mount(document.getElementById('practiceRest')),retryBtn=document.getElementById('practiceRetryRep');
  let rep=1,repStart=0,repElapsed=0,repFinished=false,retryingRep=false,repRestSeconds=null,repAthleteIds=[],tick=null,activeGroup='all',athletes=[],repResults=[],sessionResults=[],saving=false;
  const newPracticeSessionId=()=>globalThis.crypto?.randomUUID?.()||`${Date.now()}-${Math.random().toString(16).slice(2)}`;
  let practiceSessionId=newPracticeSessionId(),practiceSessionDate=null;
  const sexGroups={},practiceTargets={},practicePlans={};
  const elapsedRep=()=>repElapsed+(repStart?performance.now()-repStart:0);
  const fmt=t=>(t/1000).toFixed(2),paintClock=()=>{if(!clock)return;clock.textContent=fmt(elapsedRep())};
  const stopTick=()=>{if(tick){cancelAnimationFrame(tick);tick=null}},loop=()=>{if(!clock.isConnected){stopTick();restTimer.destroy();return}paintClock();if(repStart)tick=requestAnimationFrame(loop)};
  const finishTimingRep=()=>{repElapsed=elapsedRep();stopTick();repStart=0;repFinished=true;paintClock();startBtn.disabled=true;clockState.textContent=`Rep ${rep} finished · Recover`;restTimer.setDisabled(false);restTimer.restart()};
  const visible=()=>athletes.filter(a=>activeGroup==='all'||sexGroups[a.id]===activeGroup).slice(0,Math.max(1,Math.min(9,Number(laneCountInput?.value)||8)));
  const prescribedRepLimit=(athleteId)=>Math.max(0,Number(practicePlans[athleteId]?.reps)||0);
  const athleteEligibleForRep=(a,repNumber=rep)=>{
    if(coachPracticeWorkoutComplete(a)||practicePlans[a.id]?.error)return false;
    const limit=prescribedRepLimit(a.id);
    return !(limit>0)||Number(repNumber)<=limit;
  };
  const timable=()=>visible().filter(a=>athleteEligibleForRep(a));
  const groupMaxPrescribedReps=()=>{
    const limits=visible().filter(a=>!coachPracticeWorkoutComplete(a)).map(a=>prescribedRepLimit(a.id)).filter(x=>x>0);
    return limits.length?Math.max(...limits):null;
  };
  const canAdvanceRep=()=>{
    const max=groupMaxPrescribedReps();
    return max==null||rep<max;
  };
  const syncPracticeAvailability=()=>{
    const list=visible(),open=timable(),max=groupMaxPrescribedReps();
    if(!repStart&&!repElapsed&&!repResults.length){
      startBtn.disabled=!open.length;
      clockState.textContent=open.length?`Ready for Rep ${rep}`:list.some(a=>!coachPracticeWorkoutComplete(a))&&max!=null&&rep>max?'Prescription complete · Save session':'Current workout already completed for this group';
    }
    return open;
  };
  const targetFor=(athleteId)=>{
    const manualFast=Number(targetMinInput?.value),manualSlow=Number(targetMaxInput?.value);
    if(manualFast>0&&manualSlow>0&&manualFast<=manualSlow)return {target:(manualFast+manualSlow)/2,fast:manualFast,slow:manualSlow,source:'manual'};
    const auto=practiceTargets[athleteId],target=Number(auto?.target||0);
    if(target>0)return {target,fast:target*.99,slow:target*1.01,source:'pace_ai',distance:auto.distance,intensityPct:auto.intensityPct};
    return {target:null,fast:null,slow:null,source:null}
  };
  const practiceIntent=(athleteId)=>S…64340 tokens truncated…>${escapeHtml(e.registration_status||'Planned')}</span><button class="back meet-edit" data-id="${e.id}" style="margin-left:8px">Edit</button></span></div>`).join('')||'<div class="tile">No meets scheduled yet.</div>';meetLive.querySelectorAll('.meet-edit').forEach(b=>b.onclick=()=>calendarEventModal(b.dataset.id))}catch(e){meetLive.innerHTML=`<div class="tile">${escapeHtml(e.message)}</div>`}}
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

function mwCoachPaceTarget(event,timeSeconds,repDistance,intensityPct){
  const base=Number(String(event||'').replace(/[^0-9.]/g,''));
  const pr=Number(timeSeconds),dist=Number(repDistance),intensity=Number(intensityPct);
  if(!(base>0&&pr>0&&dist>0&&intensity>=50&&intensity<=100))return null;
  return dist/((base/pr)*(intensity/100));
}
function mwCoachPracticePrescription(session){
  const raw=String(session?.prescribedWork||session?.work||session?.structure||'');
  const rep=raw.match(/(\d+)\s*[x×]\s*(\d+)\s*m\b/i);
  const pct=(raw+' '+String(session?.intensity||'')).match(/(?:@|at)?\s*(\d{2,3})(?:\s*[–-]\s*(\d{2,3}))?\s*%/i);
  return {reps:rep?Number(rep[1]):null,distance:rep?Number(rep[2]):null,intensityPct:pct?Number(pct[2]||pct[1]):null,raw}
}
function mwCoachPracticeRecommendedTarget(athlete,distance,intensityPct){
  const dist=Number(distance),intensity=Number(intensityPct)/100;
  if(!(dist>0&&intensity>0&&intensity<=1))return null;
  const pr=(event)=>Number(mwCoachEventPr(athlete,event)?.time_seconds||0);
  const t100=pr('100m'),t200=pr('200m'),t400=pr('400m');
  if(t100>0&&t200>0&&t400>0){
    const exponent=(d1,t1,d2,t2)=>Math.log(t2/t1)/Math.log(d2/d1);
    const e12=exponent(100,t100,200,t200),e24=exponent(200,t200,400,t400);let estimate;
    if(dist<100)estimate=t100*Math.pow(dist/100,e12);
    else if(dist===100)estimate=t100;
    else if(dist<=150)estimate=t200*Math.pow(dist/200,e12);
    else if(dist<200)estimate=t200*Math.pow(dist/200,e12);
    else if(dist===200)estimate=t200;
    else if(dist<300)estimate=t200*Math.pow(dist/200,e24);
    else if(dist===300)estimate=t400*Math.pow(dist/400,e24);
    else if(dist<400)estimate=t400*Math.pow(dist/400,e24);
    else if(dist===400)estimate=t400;
    else estimate=t400*Math.pow(dist/400,e24);
    const target=estimate/intensity;
    if(Number.isFinite(target)&&target>0)return target;
  }
  const fallbackEvents=/400/.test(String(athlete?.primary_event||athlete?.event||''))?['400m','200m','100m']:['200m','100m','400m'];
  for(const event of fallbackEvents){const p=mwCoachEventPr(athlete,event);if(p){const target=mwCoachPaceTarget(event,p.time_seconds,dist,intensityPct);if(target)return target}}
  return null
}
function mwCoachEventPr(athlete,event){
  const needle=String(event||'').replace(/[^0-9]/g,'');
  return (athlete?.prs||[]).find(p=>String(p.event||'').replace(/[^0-9]/g,'')===needle)||null;
}
function mwCoachClusterByPr(rows,tolerancePct=3,maxSize=6){
  const tol=Math.max(.25,Math.min(10,Number(tolerancePct)||3))/100;
  const cap=Math.max(2,Math.min(12,Number(maxSize)||6));
  const sorted=[...rows].sort((a,b)=>a.pr-b.pr),groups=[];
  for(const row of sorted){
    let g=groups[groups.length-1];
    const avg=g?.length?g.reduce((s,x)=>s+x.pr,0)/g.length:0;
    const close=!!g&&g.length<cap&&Math.abs(row.pr-avg)/avg<=tol;
    if(!close){g=[];groups.push(g)}
    g.push(row);
  }
  return groups;
}
async function pacingPage(){
  pageBase('Pacing Tools','Sprint Pace AI + Distance Pacer + automatic PR-based practice groups.',`
  <div class="coach-pacer-hub">
    <article class="coach-pacer-card">
      <div><span class="eyebrow">⚡ SPRINT PACE AI</span><h3>Individual + Group Pace Intelligence</h3><p>Use live athlete PRs to calculate targets and build boys/girls practice groups with similar speed.</p></div>
      <button class="action" id="jumpSprintPace">OPEN SPRINT PACE AI</button>
    </article>
    <article class="coach-pacer-card">
      <div><span class="eyebrow">◎ DISTANCE PACER</span><h3>Measure the Rep Anywhere</h3><p>Track, football field or open field — measure the exact distance your group needs to run.</p></div>
      <button class="action" id="openCoachDistancePacer">OPEN DISTANCE PACER</button>
    </article>
  </div>

  <section class="coach-pace-section" id="coachSprintPace">
    <div class="coach-pace-section-head"><div><span class="eyebrow">INDIVIDUAL PACE AI</span><h2>Calculate one athlete.</h2><p>Choose the athlete and PR, then MW calculates the target for the rep.</p></div></div>
    <div class="form coach-pace-grid">
      <label>Athlete<select id="paceAthlete"></select></label>
      <label>PR<select id="pacePr"></select></label>
      <label>Rep Distance<input id="rd" type="number" value="150" min="10" max="1000"></label>
      <label>Intensity %<input id="pi" type="number" value="90" min="50" max="100"></label>
      <button class="action coach-pace-span" id="calc">CALCULATE INDIVIDUAL TARGET</button>
      <div id="paceout" class="tile coach-pace-span">Loading athlete PRs…</div>
    </div>
  </section>

  <section class="coach-pace-section" id="coachGroupPaceAI">
    <div class="coach-pace-section-head">
      <div><span class="eyebrow">MW GROUP PACE AI</span><h2>Build today’s running groups.</h2><p>MW separates competition divisions first, then groups athletes whose PRs are close enough to train together.</p></div>
      <span class="coach-ai-badge">AI GROUPING</span>
    </div>
    <div class="form coach-group-controls">
      <label>Event<select id="groupPaceEvent"><option value="100m">100m</option><option value="200m">200m</option><option value="400m">400m</option></select></label>
      <label>Rep Distance<input id="groupPaceDistance" type="number" min="10" max="1000" value="150"></label>
      <label>Intensity %<input id="groupPaceIntensity" type="number" min="50" max="100" value="90"></label>
      <label>PR Closeness<select id="groupPaceTolerance"><option value="1">Very tight · 1%</option><option value="2">Tight · 2%</option><option value="3" selected>Balanced · 3%</option><option value="5">Broad · 5%</option></select></label>
      <label>Max per group<select id="groupPaceMax"><option value="4">4 athletes</option><option value="5">5 athletes</option><option value="6" selected>6 athletes</option><option value="8">8 athletes</option></select></label>
      <button class="action coach-pace-span" id="buildPaceGroups">BUILD BOYS + GIRLS PACE GROUPS</button>
    </div>

    <div class="coach-division-panel">
      <div class="coach-division-head"><div><b>Competition Division</b><span>MW never guesses from an athlete’s name. Set Boys, Girls, or Open once and the pace groups will use it automatically.</span></div></div>
      <div id="paceDivisionRoster" class="coach-division-roster"><div class="tile">Loading roster…</div></div>
    </div>

    <div id="groupPaceResults" class="coach-group-results">
      <div class="tile"><b>Ready when your roster is.</b><p>Choose an event, confirm divisions, then build the practice groups.</p></div>
    </div>
  </section>`);

  document.getElementById('jumpSprintPace')?.addEventListener('click',()=>document.getElementById('coachSprintPace')?.scrollIntoView({behavior:'smooth',block:'start'}));
  document.getElementById('openCoachDistancePacer')?.addEventListener('click',()=>{location.href='/distance-pacer/?coach=1'});

  const paceout=document.getElementById('paceout'),divisionWrap=document.getElementById('paceDivisionRoster'),results=document.getElementById('groupPaceResults');
  let athletes=[];
  try{
    athletes=(await fetchCoachRoster()).athletes||[];
  }catch(e){
    paceout.textContent=e.message;
    divisionWrap.innerHTML=`<div class="tile"><h3>Roster unavailable</h3><p>${escapeHtml(e.message)}</p></div>`;
    results.innerHTML=`<div class="tile"><h3>Group Pace AI unavailable</h3><p>${escapeHtml(e.message)}</p></div>`;
    return;
  }

  const paceAthlete=document.getElementById('paceAthlete'),pacePr=document.getElementById('pacePr');
  paceAthlete.innerHTML=athletes.length?athletes.map((x,i)=>`<option value="${i}">${escapeHtml(x.name)}</option>`).join(''):'<option value="">No athletes assigned</option>';
  const syncIndividual=()=>{
    const x=athletes[Number(paceAthlete.value)],prs=x?.prs||[];
    pacePr.innerHTML=prs.length?prs.map((p,i)=>`<option value="${i}">${escapeHtml(p.event)} — ${Number(p.time_seconds).toFixed(2)}s</option>`).join(''):'<option value="">No PR recorded</option>';
    paceout.innerHTML=prs.length?'<b>Ready.</b><br><small>Select distance and intensity, then calculate.</small>':'This athlete needs a recorded PR first.';
  };
  paceAthlete.onchange=syncIndividual;syncIndividual();
  document.getElementById('calc').onclick=()=>{
    const x=athletes[Number(paceAthlete.value)],p=x?.prs?.[Number(pacePr.value)];
    if(!p)return toast('Select an athlete with a PR');
    const dist=Number(document.getElementById('rd').value),intensity=Number(document.getElementById('pi').value),target=mwCoachPaceTarget(p.event,p.time_seconds,dist,intensity);
    if(!target)return toast('Check pacing inputs');
    paceout.innerHTML=`<b>${escapeHtml(x.name)}</b><br><strong style="font-size:28px;color:var(--accent)">${target.toFixed(2)}s</strong> for ${dist}m at ${intensity}%<br><small>Based on ${escapeHtml(p.event)} PR of ${Number(p.time_seconds).toFixed(2)}s.</small>`;
  };

  const divisionLabel=v=>v==='boys'?'Boys':v==='girls'?'Girls':v==='open'?'Open':'Not set';
  function renderDivisionRoster(){
    const event=document.getElementById('groupPaceEvent')?.value||'100m';
    if(!athletes.length){divisionWrap.innerHTML='<div class="tile">No assigned athletes yet.</div>';return}
    divisionWrap.innerHTML=athletes.map(a=>{
      const pr=mwCoachEventPr(a,event);
      const division=a.competition_division||'';
      return `<div class="coach-division-row">
        <span><b>${escapeHtml(a.name)}</b><small>${pr?`${escapeHtml(event)} PR · ${Number(pr.time_seconds).toFixed(2)}s`:'No '+escapeHtml(event)+' PR recorded'}</small></span>
        <select data-pace-division="${escapeHtml(a.id)}" aria-label="Competition division for ${escapeHtml(a.name)}">
          <option value="" ${!division?'selected':''}>Choose division</option>
          <option value="boys" ${division==='boys'?'selected':''}>Boys</option>
          <option value="girls" ${division==='girls'?'selected':''}>Girls</option>
          <option value="open" ${division==='open'?'selected':''}>Open</option>
        </select>
      </div>`;
    }).join('');
    divisionWrap.querySelectorAll('[data-pace-division]').forEach(sel=>sel.onchange=async()=>{
      const athlete=athletes.find(a=>a.id===sel.dataset.paceDivision),value=sel.value;
      if(!athlete||!value){return}
      sel.disabled=true;
      try{
        const r=await fetch(SUPABASE_URL+'/rest/v1/rpc/mw_coach_set_competition_division',{method:'POST',headers:{apikey:SUPABASE_KEY,Authorization:'Bearer '+mwSessionToken(),'Content-Type':'application/json'},body:JSON.stringify({p_athlete_id:athlete.id,p_division:value})});
        const d=await r.json().catch(()=>({}));
        if(!r.ok)throw new Error(d.message||d.hint||'Division could not be saved');
        athlete.competition_division=value;toast(athlete.name+' → '+divisionLabel(value));
      }catch(e){toast(e.message);sel.value=athlete.competition_division||''}finally{sel.disabled=false}
    });
  }
  document.getElementById('groupPaceEvent').onchange=()=>{renderDivisionRoster();results.innerHTML='<div class="tile"><b>Event changed.</b><p>Build the groups again using the new PR event.</p></div>'};
  renderDivisionRoster();

  document.getElementById('buildPaceGroups').onclick=()=>{
    const event=document.getElementById('groupPaceEvent').value;
    const dist=Number(document.getElementById('groupPaceDistance').value);
    const intensity=Number(document.getElementById('groupPaceIntensity').value);
    const tolerance=Number(document.getElementById('groupPaceTolerance').value);
    const maxSize=Number(document.getElementById('groupPaceMax').value);
    const usable=[],missingDivision=[],missingPr=[];
    for(const a of athletes){
      if(!a.competition_division){missingDivision.push(a);continue}
      const p=mwCoachEventPr(a,event);
      if(!p){missingPr.push(a);continue}
      const target=mwCoachPaceTarget(event,p.time_seconds,dist,intensity);
      if(!target)continue;
      usable.push({athlete:a,division:a.competition_division,pr:Number(p.time_seconds),target});
    }
    const sections=[];
    for(const [division,title] of [['boys','BOYS'],['girls','GIRLS'],['open','OPEN']]){
      const rows=usable.filter(x=>x.division===division);
      if(!rows.length)continue;
      const groups=mwCoachClusterByPr(rows,tolerance,maxSize);
      sections.push(`<section class="coach-pace-division-result"><div class="coach-pace-result-title"><b>${title}</b><span>${rows.length} athlete${rows.length===1?'':'s'} · ${event}</span></div>
        <div class="coach-pace-group-grid">${groups.map((g,i)=>{
          const prs=g.map(x=>x.pr),targets=g.map(x=>x.target),minPr=Math.min(...prs),maxPr=Math.max(...prs),minT=Math.min(...targets),maxT=Math.max(...targets);
          return `<article class="coach-pace-group-card"><div class="coach-pace-group-head"><span>GROUP ${i+1}</span><b>${minT.toFixed(2)}–${maxT.toFixed(2)}s</b></div><small>${dist}m @ ${intensity}% · PR range ${minPr.toFixed(2)}–${maxPr.toFixed(2)}s</small><div class="coach-pace-athletes">${g.map(x=>`<div><b>${escapeHtml(x.athlete.name)}</b><span>PR ${x.pr.toFixed(2)} · Target ${x.target.toFixed(2)}s</span></div>`).join('')}</div></article>`;
        }).join('')}</div></section>`);
    }
    if(!sections.length){
      results.innerHTML='<div class="tile"><h3>No pace groups could be built yet.</h3><p>Set competition divisions and make sure athletes have a PR for the selected event.</p></div>';
      return;
    }
    const issues=[
      missingDivision.length?`<div><b>Division needed:</b> ${missingDivision.map(x=>escapeHtml(x.name)).join(', ')}</div>`:'',
      missingPr.length?`<div><b>${escapeHtml(event)} PR needed:</b> ${missingPr.map(x=>escapeHtml(x.name)).join(', ')}</div>`:''
    ].filter(Boolean).join('');
    results.innerHTML=`<div class="coach-group-summary"><b>MW GROUPING COMPLETE</b><span>Separated by competition division first, then clustered within ${tolerance}% PR closeness. Max ${maxSize} athletes per group.</span></div>${sections.join('')}${issues?`<div class="coach-group-issues">${issues}</div>`:''}`;
  };
}
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
    ${mwDetailLine('Warm-Up',s.warmup)}
    ${mwDetailLine('Daily Wickets',s.wickets?[s.wickets.type,s.wickets.passes?`${s.wickets.passes} passes`:'',s.wickets.spacing,s.wickets.intent].filter(Boolean).join(' · '):'')}
    ${mwDetailLine('Work',s.prescribedWork||s.work)}
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
async function mwProgramWeek(week,kind='track',eventGroup='100_200'){
  try{
    const token=mwSessionToken();
    const qs=new URLSearchParams({week:String(week),trackTier:'performance',strengthTier:'performance',eventGroup:String(eventGroup||'100_200')});
    const r=await fetch('/api/coach/program?'+qs.toString(),{headers:{Authorization:`Bearer ${token}`}});
    const d=await r.json();
    if(!r.ok)throw new Error(d.error||'Program unavailable');
    const x=kind==='strength'?d.strength:d.track;
    if(!x)return mwModal(`${kind==='strength'?'Strength & Power':'MW Track Program'} · Week ${week}`,'<div class="tile">No verified prescription is connected for this week.</div>');
    const branchControls=kind==='track'?'<div style="display:flex;gap:8px;flex-wrap:wrap;margin:0 0 12px"><button class="action mw-event-branch" data-event="100_200">100m / 200m</button><button class="back mw-event-branch" data-event="400">400m</button></div>':'';
    const body=kind==='strength'?renderStrengthWeek(x,week):`<div class="mw-track-week">${branchControls}<div class="mw-week-banner"><small>MW TRACK PROGRAM · ${escapeHtml(d.eventLabel||x.eventLabel||'100m / 200m')}</small><h3>Week ${week} · ${escapeHtml(x.phaseName||'MW Sprint Development')}</h3><p>${escapeHtml(x.objective||'')}</p></div>${(x.sessions||[]).map(renderTrackSession).join('')}</div>`;
    mwModal(`${kind==='strength'?'Strength & Power':'MW Track Program'} · Week ${week}`,body);
    if(kind==='track')document.querySelectorAll('.mw-event-branch').forEach(b=>b.onclick=()=>{document.getElementById('mwModal')?.remove();mwProgramWeek(week,'track',b.dataset.event)});
  }catch(e){toast(e.message)}
}
async function mwTrackPage(){
  let cal={week:1,status:'active'};
  try{cal=await coachCurrentCalendar()}catch{}
  const current=Math.max(1,Math.min(41,Number(cal.week)||1)),founder=!!accountAccess.isFounder;
  const cards=Array.from({length:41},(_,i)=>i+1).map(w=>{
    let access='upcoming',label='🔒 UPCOMING',desc='Unlocks when this training week arrives';
    if(founder){access='open';label='FOUNDER PREVIEW';desc='Founder access · full program preview'}
    else if(w===current){access='open';label='CURRENT WEEK';desc='Full coaching access'}
    else if(w===current-1){access='review';label='REVIEW WINDOW';desc='Previous week · 7-day review access'}
    else if(w<current-1){access='archived';label='🔒 ARCHIVED';desc='Results remain available in athlete progression'}
    return `<div class="tile mw-access-${access}"><h3>Week ${w}</h3><p>${desc}</p>${access==='open'||access==='review'?`<button class="action mw-week" data-week="${w}">${access==='review'?'Review Week':'Open Week'}</button>`:`<button class="back" type="button" disabled>${label}</button>`}</div>`;
  }).join('');
  pageBase('MW Track Program','Your season timeline controls access. Current week is open, the previous week has a 7-day review window, older weeks archive, and future weeks unlock automatically.',`<div class="panel-grid">${cards}</div>`);
  document.querySelectorAll('.mw-week').forEach(b=>b.onclick=()=>mwProgramWeek(+b.dataset.week,'track'));
}
function strengthPage(){pageBase('Strength & Power','The complete MW weight-room plan — organized by training day, lift, prescription, circuits and Coach MW notes.',`<div class="panel-grid">${Array.from({length:41},(_,i)=>i+1).map(w=>`<div class="tile"><h3>Week ${w}</h3><p>MW Strength & Power</p><button class="action mw-strength" data-week="${w}">Open Week</button></div>`).join('')}</div>`);document.querySelectorAll('.mw-strength').forEach(b=>b.onclick=()=>mwProgramWeek(+b.dataset.week,'strength'))}

window.addEventListener('mw:session-refreshed',e=>{if(e?.detail?.key===SESSION_KEY&&e.detail.session)authSession=e.detail.session});
window.addEventListener('online',()=>{if(readStoredSession()&&!document.querySelector('.app'))setTimeout(()=>initAuth(),220)});
initAuth();
