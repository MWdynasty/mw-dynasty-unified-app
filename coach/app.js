const app=document.getElementById('app');
const SUPABASE_URL='https://keqgunlfwhjgcsurynef.supabase.co';
const SUPABASE_KEY='sb_publishable_JWCLQzrdWA_ZmvbpV5urVg_rcT6NECm';
const SESSION_KEY='mwCoachSupabaseSession';
let authSession=null;
let accountAccess={role:null,tier:null,isFounder:false};

const PLANS={
 core:{name:'MW Coach Core',theme:'',title:'MW COACH CORE',tag:'MANAGE. ORGANIZE. COACH.',sub:'Bring Your Own Program — Built for Coaches.',side:'COACH\nCORE',footer:'BUILD\nDEVELOP\nCOMPETE'},
 intelligence:{name:'MW Coach Intelligence',theme:'blue',title:'MW COACH INTELLIGENCE',tag:'YOUR PROGRAM. AMPLIFIED.',sub:'Bring Your Own Program + Full AI Intelligence.',side:'COACH\nINTELLIGENCE',footer:'DATA\nINTELLIGENCE\nRESULTS'},
 performance:{name:'MW Sprint Performance System',theme:'gold',title:'MW SPRINT PERFORMANCE SYSTEM',tag:'PROVEN SPEED. A STRONGER FUTURE.',sub:'Complete MW System + Full AI Intelligence.',side:'PERFORMANCE\nSYSTEM',footer:'SPEED\nINTELLIGENCE\nLEGACY'}
};
let experience='core';
const nav={
 core:[['dashboard','⌂','Dashboard'],['athletes','♟','Athletes'],['teams','♟','Teams'],['programs','✉','Programs'],['calendar','▣','Calendar'],['meets','SP','Meets'],['attendance','✓','Attendance'],['messages','✉','Messages'],['activity','◔','Activity Log'],['account','♟','Account'],['support','?','Help & Support']],
 intelligence:[['dashboard','⌂','Dashboard'],['athletes','♟','Athletes'],['teams','♟','Teams'],['programs','✉','My Program'],['taskboard','☷','AI Task Board'],['season','☷','AI Season Planner'],['adjustment','☷','AI Season Adjustment'],['coachmw','☻','Coach MW AI'],['insights','▱','AI Insights'],['calendar','▣','Calendar'],['meets','SP','Meets'],['attendance','✓','Attendance'],['messages','✉','Messages'],['activity','◔','Activity Log'],['account','♟','Account'],['support','?','Help & Support']],
 performance:[['dashboard','⌂','Dashboard'],['mwtrack','🏃','MW Track Program'],['strength','🏋','Strength & Power'],['school','▤','Sprint School'],['race','◎','Race Strategy'],['pacing','◷','Pacing Tools'],['athletes','♟','Athletes'],['teams','♟','Teams'],['taskboard','☑','AI Task Board'],['season','☷','AI Season Planner'],['adjustment','☷','AI Season Adjustment'],['coachmw','☻','Coach MW AI'],['insights','▱','AI Insights'],['calendar','▣','Calendar'],['meets','SP','Meets'],['attendance','✓','Attendance'],['messages','✉','Messages'],['activity','◔','Activity Log'],['account','♟','Account'],['support','?','Help & Support']]
};
function sideNav(){const items=[...nav[experience]];if(accountAccess.isFounder)items.splice(1,0,['coachapps','✓','Coach Applications']);return items.map(([id,ic,label])=>`<button class="nav-btn ${id==='dashboard'?'active':''}" data-page="${id}"><span class="nav-icon">${ic}</span><span>${label}</span></button>`).join('')}
function shell(content){const p=PLANS[experience];app.innerHTML=`<div class="app ${p.theme}"><div class="top-ribbon"><span>THREE PLATFORMS. ONE ECOSYSTEM.</span><span>${experience==='performance'?'SAME FOUNDATION. DIFFERENT POWER.':'GREATER ATHLETES. BETTER COACHES. A STRONGER FUTURE.'}</span></div><div class="frame"><header class="brand-head"><div class="brand-title">${p.title}</div><div class="brand-tag">${p.tag}</div><div class="brand-sub">${p.sub}</div></header><div class="workspace"><aside class="sidebar"><div class="side-brand-row"><div class="side-logo"><span class="mw-mark">MW</span><span>${p.side.replace('\n','<br>')}</span></div><button class="mobile-menu" id="mobileMenu" type="button" aria-expanded="false" aria-controls="sideNav">Menu</button></div><nav class="side-nav" id="sideNav">${sideNav()}</nav><div class="side-account"><div class="coach-row"><img class="avatar" src="coach-mw-reference.jpg" alt="Coach Williams"><div><div class="coach-name">Coach Williams</div><div class="coach-role">Head Coach</div></div></div><button class="signout" id="signout">Sign Out</button></div></aside><main class="main">${content}</main></div><footer class="footer"><div class="footer-brand">MW DYNASTY</div><div class="footer-mid">GREATER ATHLETES. BETTER COACHES. A STRONGER FUTURE.</div><div class="footer-right">${p.footer}</div></footer></div></div>`; bindGlobal();hydrateLiveAthleteCount();}
function topbar(placeholder){return `<div class="topbar"><label class="search">⌕<input id="dashSearch" placeholder="${placeholder}"></label><button class="icon-btn" type="button" aria-label="Notifications" data-toast="No new notifications">🔔</button><img class="avatar" src="coach-mw-reference.jpg" alt="Coach Williams"></div>`}
function stats(items){return `<div class="stats">${items.map(([n,l])=>`<button class="stat" data-stat="${l}"><b>${n}</b><span>${l}</span></button>`).join('')}</div>`}
function athleteStatusClassify(a){
  const now=Date.now();
  const last=a?.last_completed_workout_at?new Date(a.last_completed_workout_at).getTime():0;
  const days=last?Math.max(0,(now-last)/86400000):null;
  const hasPr=Array.isArray(a?.prs)&&a.prs.length>0;
  const explicit=String(a?.status||'').toLowerCase();
  const reasons=[];
  let level='ontrack';
  if(days!==null&&days>14){level='attention';reasons.push(`No recorded workout in ${Math.floor(days)} days`)}
  else if(days===null){level='watch';reasons.push('No completed workout recorded yet')}
  else if(days>7){level='watch';reasons.push(`Last workout ${Math.floor(days)} days ago`)}
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
    const d=await fetchCoachRoster(),athletes=Array.isArray(d.athletes)?d.athletes:[];
    const groups={ontrack:[],watch:[],attention:[]};
    for(const a of athletes){const c=athleteStatusClassify(a);groups[c.level].push({...a,_status:c})}
    const summary=`<div class="status-summary"><div class="status-summary-card ontrack"><span class="status-dot"></span><b>${groups.ontrack.length}</b><small>On Track</small></div><div class="status-summary-card watch"><span class="status-dot"></span><b>${groups.watch.length}</b><small>Watch</small></div><div class="status-summary-card attention"><span class="status-dot"></span><b>${groups.attention.length}</b><small>Needs Attention</small></div></div>`;
    const ordered=[...groups.attention,...groups.watch,...groups.ontrack];
    const cards=ordered.slice(0,12).map(a=>{const level=a._status.level;const reason=a._status.reasons[0];const event=a.event||a.primary_event||'Event not set';const week=Number(a.current_week||1);return `<button class="athlete-status-card ${level}" data-athlete-id="${escapeHtml(a.id)}"><div class="athlete-status-top"><span class="status-pill ${level}"><span class="status-dot"></span>${athleteStatusLabel(level)}</span><span class="athlete-status-week">WEEK ${week}</span></div><h3>${escapeHtml(a.name||'Athlete')}</h3><p>${escapeHtml(event)}</p><div class="athlete-status-reason">${escapeHtml(reason)}</div><div class="athlete-status-foot"><span>${a.last_completed_workout_at?`Last workout ${escapeHtml(fmtDate(a.last_completed_workout_at))}`:'No workout recorded'}</span><span>Open →</span></div></button>`}).join('');
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
function coreDashboard(){shell(`${topbar('Search athletes, teams, or meets...')}<section class=\"mw-coach-dashboard-visual\"><img src=\"/assets/mw-coach-dashboard-v23.jpg\" alt=\"MW Dynasty Coach Performance Hub\"></section>${stats([['28','Athletes'],['4','Teams'],['3','Upcoming Meets'],['91%','Attendance']])}${coachTrainingYearShell()}<section class="section"><div class="section-head"><h2>Upcoming Meets</h2><button class="link-btn" data-page="meets">View All →</button></div><div class="meet-row"><div class="meet-date">APR 12</div><div><div class="meet-name">Spring Invitational</div><div class="meet-place">Huntsville, AL</div></div><span class="status">Registered</span></div><div class="meet-row"><div class="meet-date">APR 19</div><div><div class="meet-name">County Championship</div><div class="meet-place">Birmingham, AL</div></div><span class="status">Registered</span></div><div class="meet-row"><div class="meet-date">MAY 3</div><div><div class="meet-name">State Qualifier</div><div class="meet-place">Montgomery, AL</div></div><span class="status dim">Not Registered</span></div></section><div class="two-col"><section class="mini-card"><h3>Team Announcements</h3><div class="announcement"><div class="announce-icon">🏃</div><div>Practice at 4:00 PM today.<br>Bring spikes.<div class="meet-place" style="margin-top:10px">2 hours ago</div></div></div></section><section class="mini-card"><h3>Recent Activity</h3><div class="activity-row"><img src="coach-mw-reference.jpg" alt="Azel Johnson"><div><b>Azel Johnson</b><div>Added to team</div><div class="meet-place">3 hours ago</div></div></div><div style="text-align:right;margin-top:14px"><button class="link-btn" data-page="activity">View All Activity →</button></div></section></div><section class="section"><div class="section-head"><h2>Quick Actions</h2></div><div class="quick-grid"><button class="quick" data-page="athletes"><span class="bigicon">▣</span>Add Athlete</button><button class="quick" data-page="attendance"><span class="bigicon">▦</span>Take Attendance</button><button class="quick" data-page="programs"><span class="bigicon">⚙</span>Create Workout</button><button class="quick" data-page="messages"><span class="bigicon">💬</span>Message Team</button></div></section>`)}
function intelligenceDashboard(){shell(`${topbar('Search athletes, programs, or insights...')}<section class=\"mw-coach-dashboard-visual\"><img src=\"/assets/mw-coach-dashboard-v23.jpg\" alt=\"MW Dynasty Coach Performance Hub\"></section>${stats([['28','Athletes'],['4','Teams'],['12','Active Workouts'],['91%','Attendance']])}${coachTrainingYearShell()}${athleteStatusBoardShell()}<section class="section"><div class="section-head"><h2>AI Command Center</h2><button class="link-btn" data-page="taskboard">View All →</button></div><div class="ai-grid"><button class="ai-card" data-page="taskboard"><span class="ai-icon">🧠</span><span><h3>AI Task Board</h3><p>Daily coaching tasks<br>and priorities</p></span></button><button class="ai-card" data-page="season"><span class="ai-icon">▣</span><span><h3>AI Season Planner</h3><p>Build and optimize<br>your season</p></span></button><button class="ai-card" data-page="adjustment"><span class="ai-icon">☷</span><span><h3>AI Season Adjustment</h3><p>Make data-driven<br>adjustments</p></span></button><button class="ai-card" data-page="coachmw"><span class="ai-icon">💬</span><span><h3>Coach MW AI</h3><p>Your coaching<br>assistant, always on</p></span></button></div></section><section class="section"><div class="section-head"><h2>Recent AI Insights</h2><button class="link-btn" data-page="insights">View All →</button></div><div class="insight-list"><div class="insight"><span class="insight-symbol" style="color:#13d88d">⬆</span><div><h4>Training Load</h4><p>Athlete workload is in optimal range.</p></div><span>2h ago</span></div><div class="insight"><span class="insight-symbol" style="color:#159bff">▥</span><div><h4>Performance Trend</h4><p>Sprinters showing a 3.2% improvement.</p></div><span>4h ago</span></div><div class="insight"><span class="insight-symbol" style="color:#e3b51d">🏆</span><div><h4>Meet Readiness</h4><p>8 athletes are on track for PRs.</p></div><span>6h ago</span></div></div></section><section class="section"><div class="section-head"><h2>Quick Actions</h2></div><div class="quick-grid"><button class="quick" data-page="programs"><span class="bigicon">⇧</span>Upload Program</button><button class="quick" data-page="season"><span class="bigicon">⚙</span>Generate Plan (AI)</button><button class="quick" data-page="coachmw"><span class="bigicon">💬</span>Ask Coach MW</button><button class="quick" data-page="insights"><span class="bigicon">▥</span>View Insights</button></div></section>`)}
function performanceDashboard(){shell(`${topbar('Search workouts, athletes, or tools...')}<section class=\"mw-coach-dashboard-visual\"><img src=\"/assets/mw-coach-dashboard-v23.jpg\" alt=\"MW Dynasty Coach Performance Hub\"></section>${stats([['28','Athletes'],['4','Teams'],['41','Week Program'],['91%','Attendance']])}${coachTrainingYearShell()}${athleteStatusBoardShell()}<div class="section-head" style="padding-left:0;padding-right:0;border:0"><h2>Program Overview</h2><button class="link-btn" data-page="mwtrack">View Full Program →</button></div><section class="section" style="margin-top:0"><div class="overview"><div class="overview-bg" style="background-image:url('/coach/performance_week-hero.jpg')"></div><div class="overview-copy"><h2>MW Training Year</h2><div class="overview-sub">Open Season Planner for the live calendar position</div><div class="progress"><span></span></div><div class="overview-foot">41-week progression · Track + Strength synchronized</div><button class="action" data-page="mwtrack" style="margin-top:14px">View This Week</button></div></div></section><div class="module-grid"><button class="module" data-page="strength"><span>🏋</span><span><b>Strength & Power</b><span>Weight room program</span></span><span>→</span></button><button class="module" data-page="school"><span>🏃</span><span><b>Sprint School</b><span>Technique & education</span></span><span>→</span></button><button class="module" data-page="race"><span>🏃</span><span><b>Race Strategy</b><span>100m - 200m - 400m</span></span><span>→</span></button><button class="module" data-page="pacing"><span>◷</span><span><b>Pacing Tools</b><span>Target times & splits</span></span><span>→</span></button></div><div class="section-head" style="padding-left:0;padding-right:0;border:0"><h2>AI Coaching Hub</h2><button class="link-btn" data-page="taskboard">View All →</button></div><section class="section" style="margin-top:0"><div class="ai-hub"><button class="hub" data-page="taskboard"><span class="hub-icon">🧠</span>AI Task<br>Board</button><button class="hub" data-page="season"><span class="hub-icon">▣</span>AI Season<br>Planner</button><button class="hub" data-page="adjustment"><span class="hub-icon">☷</span>AI Season<br>Adjustment</button><button class="hub" data-page="coachmw"><span class="hub-icon">💬</span>Coach MW AI</button><button class="hub" data-page="insights"><span class="hub-icon">▥</span>AI Insights</button></div></section><section class="section"><div class="section-head"><h2>Quick Actions</h2></div><div class="quick-grid" style="grid-template-columns:repeat(5,minmax(0,1fr))"><button class="quick" data-page="mwtrack"><span class="bigicon">▣</span>View Program</button><button class="quick" data-page="season"><span class="bigicon">⚙</span>Generate Plan (AI)</button><button class="quick" data-page="coachmw"><span class="bigicon">💬</span>Ask Coach MW</button><button class="quick" data-page="pacing"><span class="bigicon">◷</span>Track Pacing</button><button class="quick" data-page="insights"><span class="bigicon">▥</span>Review Insights</button></div></section>`)}
function dashboard(){
  if(experience==='core')coreDashboard();
  else if(experience==='intelligence'){intelligenceDashboard();hydrateAthleteStatusBoard();}
  else {performanceDashboard();hydrateAthleteStatusBoard();}
  hydrateCoachTrainingYearCard();
  window.setTimeout(()=>maybeStartCoachTour(),180);
}
function pageBase(title,subtitle,body){const p=PLANS[experience];app.innerHTML=`<div class="page ${p.theme}"><div class="page-wrap"><div class="page-top"><button class="back" id="back">← Dashboard</button><div style="flex:1"><div class="eyebrow">${p.name}</div><h1>${title}</h1><div style="color:#adbdc8">${subtitle}</div></div>${accountAccess.isFounder?'<button class="switch" id="switch">Founder Preview</button>':''}</div><div class="panel">${body}</div></div></div>`;document.getElementById('back').onclick=dashboard;const sw=document.getElementById('switch');if(sw)sw.onclick=membershipPage;bindPageActions();}
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
function coachMWPage(){
  pageBase('Coach MW AI','MW intelligence in the same Dynasty experience.',`
  <div class="mw-coach-ai-banner" aria-label="Coach MW visual options">
    <div class="mw-coach-ai-portrait" style="background-image:url('/athlete/coach-mw-male-luxe.jpg')"><span><b>COACH MW</b><br>MALE</span></div>
    <div class="mw-coach-ai-portrait" style="background-image:url('/athlete/coach-mw-female-luxe.jpg')"><span><b>COACH MW</b><br>FEMALE</span></div>
  </div>
  <div class="form">
    <div class="tile"><b>Coach MW</b><p>Ask about athletes, teams, attendance, progression, pacing, race strategy, your program, or the MW system. Add a photo when visual context helps.</p></div>
    <div id="mwchat" style="display:grid;gap:10px;max-height:420px;overflow:auto"></div>
    <div style="display:grid;grid-template-columns:48px 1fr auto;gap:8px;align-items:center">
      <button class="back" id="mwattach" title="Add photo">＋</button>
      <input id="mwimage" type="file" accept="image/png,image/jpeg,image/webp" style="display:none">
      <input id="mwq" placeholder="Ask Coach MW anything...">
      <button class="action" id="askmw">Ask</button>
    </div>
    <div id="mwattachstate" style="font-size:11px;color:#d9b85f"></div>
  </div>`);
  let pendingImage='';
  const chat=document.getElementById('mwchat'), q=document.getElementById('mwq'), pick=document.getElementById('mwimage'), attach=document.getElementById('mwattach'), state=document.getElementById('mwattachstate');
  let history=[]; try{history=JSON.parse(sessionStorage.getItem('mwCoachProConversation')||'[]')}catch{}
  const render=()=>{chat.innerHTML=history.map(m=>`<div class="tile" style="${m.role==='user'?'margin-left:12%;':'margin-right:12%;'}"><b>${m.role==='user'?'Coach':'Coach MW'}</b><p style="white-space:pre-wrap">${escapeHtml(m.content)}</p></div>`).join('');chat.scrollTop=chat.scrollHeight};
  render();
  attach.onclick=()=>pick.click();
  pick.onchange=()=>{const f=pick.files?.[0];if(!f)return;if(f.size>4*1024*1024){state.textContent='Photo too large. Use 4 MB or less.';pick.value='';return}const r=new FileReader();r.onload=()=>{pendingImage=String(r.result||'');state.textContent='Photo attached.'};r.readAsDataURL(f)};
  const send=async()=>{
    const text=q.value.trim();if(!text)return toast('Type a question first');
    const userMsg={role:'user',content:text};if(pendingImage)userMsg.imageDataUrl=pendingImage;
    history.push(userMsg);q.value='';render();state.textContent='Coach MW is thinking…';
    try{
      const token=localStorage.getItem('mwCoachSupabaseSession');let access='';try{access=JSON.parse(token||'{}').access_token||''}catch{}
      const headers={'Content-Type':'application/json'};if(access)headers.Authorization='Bearer '+access;
      const r=await fetch('/api/coach/coach-mw',{method:'POST',headers,body:JSON.stringify({messages:history})});
      const d=await r.json();if(!r.ok)throw new Error(d.error||'Coach MW request failed');
      history.push({role:'assistant',content:d.answer||'I could not produce a response.'});
      history=history.slice(-40).map(m=>({role:m.role,content:m.content}));
      sessionStorage.setItem('mwCoachProConversation',JSON.stringify(history));pendingImage='';pick.value='';state.textContent='';render();
    }catch(e){state.textContent='Coach MW connection error: '+e.message}
  };
  document.getElementById('askmw').onclick=send;q.onkeydown=e=>{if(e.key==='Enter')send()};
}
function insightsPage(){pageBase('AI Insights','Performance, workload and meet-readiness signals.',`<div class="panel-grid"><div class="tile"><h3>Training Load</h3><p>Athlete workload is in optimal range.</p></div><div class="tile"><h3>Performance Trend</h3><p>Sprinters showing a 3.2% improvement.</p></div><div class="tile"><h3>Meet Readiness</h3><p>8 athletes are on track for PRs.</p></div><div class="tile"><h3>Attendance</h3><p>Team attendance is currently 91%.</p></div></div>`)}
function mwTrackPage(){pageBase('MW Track Program','41-week progressive sprint program.',`<div class="panel-grid">${[10,11,12,13].map(w=>`<div class="tile"><h3>Week ${w}</h3><p>${w===12?'Acceleration Development':'Progressive sprint development'}</p><button class="action" data-toast="Week ${w} opened" style="margin-top:10px">Open Week</button></div>`).join('')}</div>`)}
function strengthPage(){pageBase('Strength & Power','MW weight-room program synchronized to the sprint plan.',`<div class="tile"><h3>Week 12 Strength & Power</h3><p>Current synchronized weight-room plan with prescribed loading and progression.</p><button class="action" data-toast="Strength session opened" style="margin-top:12px">Open Session</button></div>`)}
function schoolPage(){pageBase('Sprint School','Technique & education.',`<div class="panel-grid">${['Sprint Mechanics','Block Starts','Competition Warm-Up','Drill Library'].map(x=>`<div class="tile"><h3>${x}</h3><p>MW Sprint School lesson.</p><button class="action" data-toast="${x} opened" style="margin-top:10px">Open Lesson</button></div>`).join('')}</div>`)}
function racePage(){pageBase('Race Strategy','100m · 200m · 400m blueprints.',`<div class="panel-grid">${['100m Race Strategy','200m Race Strategy','400m Race Strategy','Block Start Strategy'].map(x=>`<div class="tile"><h3>${x}</h3><p>MW race execution blueprint.</p><button class="action" data-toast="${x} opened" style="margin-top:10px">Open Blueprint</button></div>`).join('')}</div>`)}
function pacingPage(){pageBase('Pacing Tools','Target times & splits.',`<div class="form"><label>PR Distance<select id="pd"><option value="100">100m</option><option value="200">200m</option><option value="400">400m</option></select></label><label>PR Time<input id="pt" type="number" step="0.01" value="11.00"></label><label>Rep Distance<input id="rd" type="number" value="150"></label><label>Intensity %<input id="pi" type="number" value="90" min="50" max="100"></label><button class="action" id="calc">Calculate Target</button><div id="paceout" class="tile">Enter values and calculate.</div></div>`);document.getElementById('calc').onclick=()=>{const d=+pd.value,pr=+pt.value,rdv=+rd.value,int=+pi.value;if(!(pr>0&&rdv>0&&int>=50&&int<=100))return toast('Check the pacing inputs');const t=rdv/((d/pr)*(int/100));document.getElementById('paceout').innerHTML=`Target: <b>${t.toFixed(2)}s</b> for ${rdv}m at ${int}%`}}
let coachSeasonCalendar=null;
function coachCalendarDate(iso){if(!iso)return '—';try{return new Date(iso+'T00:00:00').toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'})}catch{return iso}}
function coachCalendarTitle(c){return c?.mode==='custom'?'Coach Custom Training Calendar':'MW Standard Training Year'}
function coachCalendarSummary(c){
  if(!c)return 'Loading season calendar…';
  if(c.status==='active')return `${coachCalendarTitle(c)} · Week ${c.week} · Phase ${c.phase} · Start ${coachCalendarDate(c.startDate)}`;
  if(c.status==='preseason')return `${coachCalendarTitle(c)} · Preseason · Week 1 begins ${coachCalendarDate(c.nextStartDate||c.startDate)}`;
  return `${coachCalendarTitle(c)} · Between 41-week cycles${c.nextStartDate?` · Next standard start ${coachCalendarDate(c.nextStartDate)}`:''}`;
}
async function coachSeasonCalendarRequest(method='GET',body=null){
  const token=mwSessionToken();if(!token)throw new Error('Coach session required');
  const r=await fetch('/api/season-calendar',{method,cache:'no-store',headers:{Authorization:`Bearer ${token}`,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});
  const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||'Season calendar unavailable');
  coachSeasonCalendar=d.calendar||null;return coachSeasonCalendar;
}
function seasonCalendarSettingsHTML(){return `<section class="section coach-season-settings"><div class="section-head"><div><div class="eyebrow">TRAINING YEAR</div><h2>Season Calendar</h2><p class="status-subcopy">The MW Standard Training Year begins the day after Labor Day. Choose Custom only when your team needs a different Week 1. Assigned athletes follow the coach calendar; independent late joiners use MW Smart Entry instead of choosing a random week.</p></div></div><div class="form"><label>Calendar<select id="coachSeasonMode"><option value="standard">MW Standard Training Year</option><option value="custom">Custom Season Start</option></select></label><label id="coachCustomStartWrap" style="display:none">Custom Week 1 Date<input id="coachCustomStart" type="date"></label><div class="tile" id="coachSeasonPreview">Loading season calendar…</div><button class="action" id="saveCoachSeason">Save Season Calendar</button></div></section>`}
async function bindSeasonCalendarSettings(){
  const mode=document.getElementById('coachSeasonMode'),wrap=document.getElementById('coachCustomStartWrap'),date=document.getElementById('coachCustomStart'),preview=document.getElementById('coachSeasonPreview'),save=document.getElementById('saveCoachSeason');
  if(!mode||!preview||!save)return;
  const sync=()=>{wrap.style.display=mode.value==='custom'?'block':'none'};mode.onchange=sync;
  try{const c=await coachSeasonCalendarRequest();mode.value=c.mode==='custom'?'custom':'standard';date.value=c.mode==='custom'?(c.startDate||''):'';sync();preview.textContent=coachCalendarSummary(c)}catch(e){preview.textContent=e.message}
  save.onclick=async()=>{save.disabled=true;save.textContent='Saving…';try{const body={mode:mode.value,startDate:mode.value==='custom'?date.value:null};const c=await coachSeasonCalendarRequest('POST',body);preview.textContent=coachCalendarSummary(c);toast('Season calendar saved')}catch(e){preview.textContent=e.message}finally{save.disabled=false;save.textContent='Save Season Calendar'}};
}
function membershipPage(){
  if(!accountAccess.isFounder)return coachAccountPage();
  const p=PLANS[experience];
  app.innerHTML=`<div class="page ${p.theme}"><div class="page-wrap"><div class="page-top"><button class="back" id="back">← Dashboard</button><div style="flex:1"><div class="eyebrow">Founder Preview</div><h1>Preview Coach Tier</h1><div style="color:#adbdc8">Founder-only preview. Coach accounts cannot change their own access tier.</div></div></div><div class="plans">${Object.entries(PLANS).map(([k,v])=>`<div class="plan ${k===experience?'current':''}"><h2>${v.name}</h2><p>${v.sub}</p><button class="action" data-plan="${k}">${k===experience?'Current Preview':'Preview Tier'}</button></div>`).join('')}</div>${seasonCalendarSettingsHTML()}<section class="section coach-tour-account-card"><div><div class="eyebrow">GUIDED TOUR</div><h2>Learn ${escapeHtml(p.name)}</h2><p>Replay the full walkthrough for this coach platform anytime.</p></div><button class="action" id="replayCoachTour">Replay Tutorial</button></section></div></div>`;
  document.getElementById('back').onclick=dashboard;
  document.querySelectorAll('[data-plan]').forEach(b=>b.onclick=()=>smoothSwitchExperience(b.dataset.plan,b));
  document.getElementById('replayCoachTour').onclick=()=>startCoachTour({force:true,mode:'full'});
  bindSeasonCalendarSettings();
}
function coachAccountPage(){
  pageBase('Account','Your MW Coach access is controlled by MW Dynasty.',`<div class="tile"><h3>${escapeHtml(PLANS[experience].name)}</h3><p>Your coach tier is assigned by MW Dynasty and cannot be changed from this device.</p></div>${seasonCalendarSettingsHTML()}<div class="tile coach-tour-account-card"><div><h3>App Tutorial</h3><p>Replay the guided walkthrough for your current coach platform.</p></div><button class="action" id="replayCoachTour">Replay Tutorial</button></div>`);
  const replay=document.getElementById('replayCoachTour');if(replay)replay.onclick=()=>startCoachTour({force:true,mode:'full'});
  bindSeasonCalendarSettings();
}
function openPage(id){const routes={dashboard,athletes:athletesPage,teams:teamsPage,programs:programsPage,calendar:calendarPage,meets:meetsPage,attendance:attendancePage,messages:messagesPage,activity:activityPage,account:membershipPage,coachapps:coachApplicationsPage,support:supportPage,taskboard:taskBoardPage,season:seasonPage,adjustment:adjustmentPage,coachmw:coachMWPage,insights:insightsPage,mwtrack:mwTrackPage,strength:strengthPage,school:schoolPage,race:racePage,pacing:pacingPage};(routes[id]||supportPage)()}
function bindGlobal(){const mm=document.getElementById('mobileMenu');const nav=document.getElementById('sideNav');if(mm&&nav){mm.addEventListener('click',()=>{const open=nav.classList.toggle('open');mm.setAttribute('aria-expanded',String(open));mm.textContent=open?'Close':'Menu';});}document.querySelectorAll('[data-page]').forEach(b=>b.addEventListener('click',()=>openPage(b.dataset.page)));document.querySelectorAll('[data-stat]').forEach(b=>b.addEventListener('click',()=>{const m={'Athletes':'athletes','Teams':'teams','Upcoming Meets':'meets','Attendance':'attendance','Active Workouts':'programs','Week Program':'mwtrack'};openPage(m[b.dataset.stat]||'dashboard')}));const s=document.getElementById('signout');if(s)s.onclick=signOut;const q=document.getElementById('dashSearch');if(q)q.addEventListener('keydown',e=>{if(e.key==='Enter'){const v=q.value.trim().toLowerCase();if(v.includes('athlete'))openPage('athletes');else if(v.includes('meet'))openPage('meets');else if(v.includes('insight'))openPage('insights');else if(v.includes('program')||v.includes('workout'))openPage(experience==='performance'?'mwtrack':'programs');else toast('Search is working — try athletes, meets, program, workouts, or insights.')}})}
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
    {icon:'✦',title:'Welcome to MW Coach Core',body:'Your command center for athletes, teams, programs, attendance, meets and communication.',hint:'A fast walkthrough of the tools you will use most.',target:null,label:'COACH CORE'},
    {icon:'📅',title:'Set the Training Year',body:'MW Standard Week 1 begins the day after Labor Day. Keep that standard calendar, or choose a Custom Season Start in Account when your team needs a different Week 1.',hint:'Assigned athletes inherit your coach calendar and placement. Independent athletes joining late use MW Smart Entry.',target:'.coach-training-year-card',label:'TRAINING YEAR'},
    {icon:'♟',title:'Manage Your Athletes',body:'Open the athlete roster to review profiles, assignments and the athletes connected to your coach account.',hint:'Athlete access stays scoped to the athletes you are authorized to coach.',target:'[data-page="athletes"]',label:'ATHLETES'},
    {icon:'✉',title:'Build Your Program',body:'Use Programs to create, save and manage your own coaching plan inside MW Dynasty.',hint:'Coach Core is built around your program and your coaching workflow.',target:'[data-page="programs"]',label:'PROGRAMS'},
    {icon:'✓',title:'Run the Day-to-Day',body:'Calendar, meets and attendance keep practices, competitions and participation organized in one place.',hint:'Your operational tools live together in the Coach navigation.',target:'[data-page="attendance"]',label:'ATTENDANCE'},
    {icon:'💬',title:'Stay Connected',body:'Use Messages to communicate with your athletes and keep important follow-up inside the platform.',hint:'Coach communication stays attached to the coaching workspace.',target:'[data-page="messages"]',label:'MESSAGES'},
    {icon:'⚙',title:'You’re Ready to Coach',body:'Your Account shows your assigned MW Coach tier. You can replay this tutorial there anytime.',hint:'MW Dynasty controls coach access; coaches cannot change their own tier.',target:'[data-page="account"]',label:'ACCOUNT'}
  ],
  intelligence:[
    {icon:'✦',title:'Welcome to MW Coach Intelligence',body:'Your coaching program stays yours — MW Intelligence adds roster monitoring, AI priorities and decision support.',hint:'AI detects and recommends. You remain the coach in control.',target:null,label:'COACH INTELLIGENCE'},
    {icon:'📅',title:'Your Team’s Training Calendar',body:'MW Standard Week 1 begins the day after Labor Day, or you can set a Custom Season Start. That calendar becomes the reference for roster monitoring and season intelligence.',hint:'Coach-assigned athletes follow your calendar and placement; independent late joiners use Smart Entry.',target:'.coach-training-year-card',label:'TRAINING YEAR'},
    {icon:'◉',title:'Know Who Needs You',body:'The Athlete Status Board separates your roster into On Track, Watch and Needs Attention, with the reason for every flag.',hint:'Start here when you need to know where your attention matters most.',target:'.athlete-status-section',label:'ATHLETE STATUS'},
    {icon:'☑',title:'AI Task Board',body:'MW turns roster signals into a prioritized coaching task list so important follow-up does not get buried.',hint:'Review the recommendation before taking action.',target:'[data-page="taskboard"]',label:'AI TASK BOARD'},
    {icon:'▣',title:'Plan the Season',body:'AI Season Planner helps organize your season around your own program, competition calendar and athlete needs.',hint:'Use it to support your plan — not replace your coaching judgment.',target:'[data-page="season"]',label:'SEASON PLANNER'},
    {icon:'☻',title:'Coach MW AI',body:'Ask Coach MW questions about athletes, workload, planning and MW coaching intelligence from one assistant.',hint:'Coach MW recommends. You approve before execution.',target:'[data-page="coachmw"]',label:'COACH MW AI'},
    {icon:'▱',title:'See the Signals',body:'AI Insights summarizes workload, PR coverage, training recency and other roster-level signals for faster review.',hint:'Use the insight as a reason to inspect the supporting athlete data.',target:'[data-page="insights"]',label:'AI INSIGHTS'},
    {icon:'⚙',title:'Intelligence Is Ready',body:'Your Account shows your assigned platform, and the complete tutorial can be replayed whenever you need it.',hint:'You stay in control of every coaching decision.',target:'[data-page="account"]',label:'ACCOUNT'}
  ],
  performance:[
    {icon:'✦',title:'Welcome to MW Sprint Performance',body:'This is the complete MW ecosystem: the 41-week sprint system, strength, education, pacing and full Coach Intelligence.',hint:'The system has the plan. Technology helps you execute it.',target:null,label:'SPRINT PERFORMANCE'},
    {icon:'📅',title:'The 41-Week Training Year',body:'The standard MW cycle begins the day after Labor Day and progresses through all 41 weeks. Coaches can set a Custom Week 1 when their team calendar requires it.',hint:'Assigned athletes inherit the coach calendar and placement. Late independent athletes use Smart Entry so track + strength begin at a prepared point.',target:'.coach-training-year-card',label:'TRAINING YEAR'},
    {icon:'◉',title:'Start With Athlete Status',body:'See who is On Track, who needs to be watched and who needs immediate coaching attention — with the reason for each flag.',hint:'Roster intelligence is built into the complete performance system.',target:'.athlete-status-section',label:'ATHLETE STATUS'},
    {icon:'🏃',title:'The 41-Week MW Track Program',body:'Open the protected MW Track Program to see the exact progressive sprint prescription, recovery, cues and circuit order.',hint:'This is the sprint-program backbone of MW Dynasty.',target:'[data-page="mwtrack"]',label:'MW TRACK PROGRAM'},
    {icon:'🏋',title:'Strength & Power',body:'The weight-room plan is synchronized with the sprint system so loading and progression support the track work.',hint:'Track and strength are designed to work as one progression.',target:'[data-page="strength"]',label:'STRENGTH & POWER'},
    {icon:'◷',title:'Individualize the Pace',body:'Pacing Tools use athlete PR data to calculate individualized target times for training reps.',hint:'Better targets help athletes execute the prescribed intent of the session.',target:'[data-page="pacing"]',label:'PACING TOOLS'},
    {icon:'☻',title:'Coach MW AI',body:'Coach MW connects the MW system, your roster and coaching intelligence so you can ask questions in context.',hint:'Detect → Analyze → Recommend → Coach Approves → Execute.',target:'[data-page="coachmw"]',label:'COACH MW AI'},
    {icon:'⚙',title:'The Complete System Is Ready',body:'Use your Account to confirm your platform access and replay this walkthrough whenever you want a refresher.',hint:'MW Sprint Performance keeps the methodology, tools and athlete intelligence in one coach workspace.',target:'[data-page="account"]',label:'ACCOUNT'}
  ]
};
const COACH_UPGRADE_TOURS={
  intelligence:[
    {icon:'⚡',title:'Coach Intelligence Is Unlocked',body:'Your platform now adds live roster intelligence and AI decision support on top of your coaching workflow.',hint:'Here are the biggest new tools.',target:null,label:'WHAT’S NEW'},
    {icon:'◉',title:'Athlete Status Board',body:'Your roster is now organized into On Track, Watch and Needs Attention so you can prioritize faster.',hint:'Every flag includes the reason MW detected it.',target:'.athlete-status-section',label:'NEW · ATHLETE STATUS'},
    {icon:'☑',title:'AI Priorities',body:'The AI Task Board turns athlete signals into daily coaching priorities for you to review.',hint:'You decide what gets approved and acted on.',target:'[data-page="taskboard"]',label:'NEW · AI TASK BOARD'},
    {icon:'☻',title:'Coach MW + Insights',body:'Coach MW AI and AI Insights give you deeper context without taking control away from the coach.',hint:'Your upgraded platform is ready.',target:'[data-page="coachmw"]',label:'NEW · COACH MW'}
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
function coachTourCompleteKey(tier=experience){return `mwCoachTourComplete:${coachTourUserKey()}:${tier}:v26`}
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
  if(step?.target?.startsWith('[data-page=')&&window.matchMedia('(max-width:820px)').matches){navEl.classList.add('open');menu.setAttribute('aria-expanded','true');menu.textContent='Close';}
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
  root.innerHTML=`<div class="coach-tour-spotlight" id="coachTourSpotlight"></div><div class="coach-tour-tag" id="coachTourTag"></div><section class="coach-tour-card" id="coachTourCard" role="dialog" aria-modal="true" aria-label="${escapeHtml(PLANS[experience].name)} tutorial"><div class="coach-tour-top"><div class="coach-tour-kicker">MW DYNASTY · ${mode==='upgrade'?'WHAT’S NEW':'GUIDED TOUR'}</div><div class="coach-tour-step" id="coachTourStep"></div></div><div class="coach-tour-lead"><div class="coach-tour-icon" id="coachTourIcon"></div><div><h2 id="coachTourTitle"></h2><p id="coachTourBody"></p></div></div><div class="coach-tour-hint" id="coachTourHint"></div><div class="coach-tour-dots" id="coachTourDots"></div><div class="coach-tour-actions"><button type="button" class="coach-tour-skip" id="coachTourSkip">SKIP</button><button type="button" class="coach-tour-back" id="coachTourBack">BACK</button><button type="button" class="coach-tour-next" id="coachTourNext">NEXT</button></div></section>`;
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
  root.querySelector('#coachTourIcon').textContent=step.icon||'✦';
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
          <div class="coach-login-mw">MW</div>
          <div class="coach-login-coach">DYNASTY</div>
          <div class="coach-login-tagline">COACH LOGIN • LEAD • DEVELOP • BUILD</div>
        </div>
        <nav class="coach-login-nav" aria-label="MW Coach values">
          <span>DISCIPLINE</span><i></i><span>DEVELOPMENT</span><i></i><span>DOMINANCE</span><i></i><span>RESOURCES</span>
        </nav>
        <div class="coach-login-mission">COACHES TODAY<br>STRONGER ATHLETES<br>BRIGHTER TOMORROW<div></div></div>
      </header>

      <div class="coach-login-content">
        <div class="coach-login-copy">
          <h1>COACH<br>DEVELOP<br>EMPOWER<br><strong>TRANSFORM</strong></h1>
          <span class="coach-login-rule"></span>
          <p>MORE THAN A PLATFORM.<br>A HIGHER STANDARD.</p>
        </div>

        <div class="coach-login-person" role="img" aria-label="Coach standing trackside"></div>

        <div class="coach-login-card-wrap">
          <div class="coach-login-card">
            <div class="coach-login-mobile-brand" aria-hidden="true"><span>MW</span> DYNASTY · COACH</div>
            <h2>Welcome Back</h2>
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
            </form>
            <div class="coach-login-divider"><span></span><b>NEW COACH?</b><span></span></div>
            <div class="coach-login-contact">Don’t have a coach account yet? <button type="button" id="contactAdmin">Create an Account</button></div>
          </div>
        </div>
      </div>

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
  const contact=document.getElementById('contactAdmin');
  if(contact)contact.addEventListener('click',renderCoachApplication);
}
function renderCoachApplication(){
  const existing=document.getElementById('coachApplyModal');if(existing)existing.remove();
  const wrap=document.createElement('div');wrap.id='coachApplyModal';wrap.className='coach-apply-modal';
  wrap.innerHTML=`<div class="coach-apply-backdrop" data-close="1"></div><section class="coach-apply-card" role="dialog" aria-modal="true" aria-labelledby="coachApplyTitle">
    <div class="coach-apply-head"><div><div class="coach-apply-kicker">MW DYNASTY</div><h2 id="coachApplyTitle">Create Your Coach Account</h2><p>Start your coach signup here. Coach access is reviewed before it is activated.</p></div><button type="button" class="coach-apply-close" data-close="1" aria-label="Close">×</button></div>
    <form id="coachApplyForm" class="coach-apply-form">
      <div class="coach-apply-two"><label>First name<input id="applyFirst" required maxlength="80"></label><label>Last name<input id="applyLast" required maxlength="80"></label></div>
      <label>Email<input id="applyEmail" type="email" required maxlength="320" autocomplete="email"></label>
      <label>School / club / organization<input id="applyOrg" maxlength="160" placeholder="Optional"></label>
      <div class="coach-apply-two"><label>City<input id="applyCity" maxlength="100"></label><label>State<input id="applyState" maxlength="80"></label></div>
      <div class="coach-apply-two"><label>Coaching level<select id="applyLevel"><option value="">Select</option><option>High School</option><option>College</option><option>Club / AAU</option><option>Private Coach</option><option>Middle School</option><option>Other</option></select></label><label>Years coaching<input id="applyYears" type="number" min="0" max="80" inputmode="numeric"></label></div>
      <label>Website or social profile<input id="applySocial" maxlength="300" placeholder="Optional"></label>
      <label>Why are you requesting MW Coach access?<textarea id="applyReason" rows="5" minlength="20" maxlength="2000" required placeholder="Tell us about who you coach and how you plan to use the platform."></textarea></label>
      <div id="coachApplyMessage" class="login-message" role="status" aria-live="polite"></div>
      <button id="coachApplySubmit" class="coach-login-submit" type="submit"><span>Continue Coach Signup</span><span>→</span></button>
    </form>
    <p class="coach-apply-foot">After review and approval, MW Dynasty will activate your coach access and send the next account-setup step.</p>
  </section>`;
  document.body.appendChild(wrap);
  wrap.querySelectorAll('[data-close="1"]').forEach(x=>x.addEventListener('click',()=>wrap.remove()));
  document.getElementById('coachApplyForm').addEventListener('submit',submitCoachApplication);
}
async function submitCoachApplication(e){
  e.preventDefault();const b=document.getElementById('coachApplySubmit'),m=document.getElementById('coachApplyMessage');
  const payload={first_name:document.getElementById('applyFirst').value.trim(),last_name:document.getElementById('applyLast').value.trim(),email:document.getElementById('applyEmail').value.trim(),organization:document.getElementById('applyOrg').value.trim(),city:document.getElementById('applyCity').value.trim(),state:document.getElementById('applyState').value.trim(),coaching_level:document.getElementById('applyLevel').value,years_coaching:document.getElementById('applyYears').value||null,website_or_social:document.getElementById('applySocial').value.trim(),reason:document.getElementById('applyReason').value.trim()};
  if(payload.reason.length<20){m.textContent='Please tell us a little more about your coaching background and intended use.';m.className='login-message show error';return}
  b.disabled=true;b.innerHTML='<span class="login-spinner"></span><span>Submitting…</span>';m.textContent='Submitting for review…';m.className='login-message show neutral';
  try{const r=await fetch(`${SUPABASE_URL}/functions/v1/mw-coach-apply`,{method:'POST',headers:{apikey:SUPABASE_KEY,'Content-Type':'application/json'},body:JSON.stringify(payload)});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||'Application could not be submitted.');m.textContent=d.message||'Application received. MW Dynasty will review your request.';m.className='login-message show success';b.innerHTML='<span>Application Submitted ✓</span>';window.setTimeout(()=>document.getElementById('coachApplyModal')?.remove(),2400)}catch(err){m.textContent=err.message;m.className='login-message show error';b.disabled=false;b.innerHTML='<span>Continue Coach Signup</span><span>→</span>'}
}
async function verifyCoachAccess(session){
  const r=await fetch('/api/coach/access',{headers:{Authorization:`Bearer ${session.access_token}`}});const d=await r.json().catch(()=>({}));
  if(!r.ok)throw new Error(r.status===403?'This login is not an approved, active MW Coach account.':(d.error||'Coach access could not be verified.'));
  accountAccess={role:d.role||null,tier:d.tier||null,isFounder:!!d.isFounder};
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
  const r=await fetch(`${SUPABASE_URL}/auth/v1/user`,{headers:{apikey:SUPABASE_KEY,Authorization:`Bearer ${session.access_token}`}});
  return r.ok;
}
function persistSession(session,remember=true){
  authSession=session;
  if(remember)localStorage.setItem(SESSION_KEY,JSON.stringify(session));else sessionStorage.setItem(SESSION_KEY,JSON.stringify(session));
}
function clearSession(){authSession=null;localStorage.removeItem(SESSION_KEY);sessionStorage.removeItem(SESSION_KEY)}
function readStoredSession(){
  try{return JSON.parse(localStorage.getItem(SESSION_KEY)||sessionStorage.getItem(SESSION_KEY)||'null')}catch{return null}
}
async function signOut(){
  const token=authSession?.access_token;
  clearSession();
  if(token){try{await fetch(`${SUPABASE_URL}/auth/v1/logout`,{method:'POST',headers:{apikey:SUPABASE_KEY,Authorization:`Bearer ${token}`}})}catch{}}
  renderLogin('You have been signed out.');
}
function bindLogin(){
  const form=document.getElementById('loginForm'),pass=document.getElementById('loginPassword'),toggle=document.getElementById('togglePassword'),forgot=document.getElementById('forgotPassword');
  toggle.addEventListener('click',()=>{const show=pass.type==='password';pass.type=show?'text':'password';toggle.textContent=show?'Hide':'Show';toggle.setAttribute('aria-label',show?'Hide password':'Show password')});
  forgot.addEventListener('click',async()=>{
    const email=document.getElementById('loginEmail').value.trim();
    if(!email)return setLoginMessage('Enter your email address first, then tap Forgot password.');
    forgot.disabled=true;forgot.textContent='Sending…';
    try{const r=await fetch(`${SUPABASE_URL}/auth/v1/recover`,{method:'POST',headers:{apikey:SUPABASE_KEY,'Content-Type':'application/json'},body:JSON.stringify({email})});if(!r.ok){const d=await r.json().catch(()=>({}));throw new Error(d.msg||d.message||'Unable to send reset email.')}setLoginMessage('Password reset email sent. Check your inbox.','success')}catch(e){setLoginMessage(e.message)}finally{forgot.disabled=false;forgot.textContent='Forgot password?'}
  });
  form.addEventListener('submit',async e=>{
    e.preventDefault();
    const email=document.getElementById('loginEmail').value.trim(),password=pass.value,remember=document.getElementById('rememberMe').checked;
    if(!email||!password)return setLoginMessage('Enter both your email address and password.');
    setLoginBusy(true);setLoginMessage('Signing you in…','neutral');
    try{const session=await supabasePasswordLogin(email,password);await verifyCoachAccess(session);persistSession(session,remember);dashboard()}catch(err){clearSession();setLoginMessage(err.message)}finally{setLoginBusy(false)}
  });
}
async function initAuth(){
  const stored=readStoredSession();
  if(stored){
    authSession=stored;
    try{if(await validateSession(stored)){await verifyCoachAccess(stored);dashboard();return}}catch{}
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
    const r=await fetch(`/api/coach/athlete?id=${encodeURIComponent(athleteId)}`,{headers:{Authorization:`Bearer ${token}`}});
    const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||'Athlete record could not be loaded.');
    const a=d.athlete||{},prs=Array.isArray(a.prs)?a.prs:[],notes=Array.isArray(a.notes)?a.notes:[];
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
      <div class="tile" style="margin-top:14px"><h3>Personal Records</h3>${prs.length?`<div class="list">${prs.map(pr=>`<div class="row"><span><b>${escapeHtml(pr.event)}</b><br><small>${pr.verified?'Verified':'Athlete entered'} · ${pr.timing_method==='fat'?'Fully automatic':pr.timing_method==='hand'?'Hand timed':'Timing unknown'}${pr.date_recorded?' · '+escapeHtml(fmtDate(pr.date_recorded)):''}</small></span><b>${escapeHtml(String(pr.time_seconds))}s</b></div>`).join('')}</div>`:'<p>No PRs recorded yet.</p>'}</div>
      <div class="tile" style="margin-top:14px"><h3>Assessment Weight-Room Maximums</h3>${a.strength_maxes?`<div class="list"><div class="row"><span>Power Clean</span><b>${a.strength_maxes.power_clean_max??'Not established'} ${a.strength_maxes.power_clean_max!=null?escapeHtml(a.strength_maxes.weight_unit||'lb'):''}</b></div><div class="row"><span>Front Squat</span><b>${a.strength_maxes.front_squat_max??'Not established'} ${a.strength_maxes.front_squat_max!=null?escapeHtml(a.strength_maxes.weight_unit||'lb'):''}</b></div><div class="row"><span>Back Squat</span><b>${a.strength_maxes.back_squat_max??'Not established'} ${a.strength_maxes.back_squat_max!=null?escapeHtml(a.strength_maxes.weight_unit||'lb'):''}</b></div><div class="row"><span>${a.strength_maxes.deadlift_type==='trap_bar'?'Trap-Bar Deadlift':'Deadlift'}</span><b>${a.strength_maxes.deadlift_max??'Not established'} ${a.strength_maxes.deadlift_max!=null?escapeHtml(a.strength_maxes.weight_unit||'lb'):''}</b></div></div>`:'<p>No lifting maximums established. Use Foundation technique loading.</p>'}</div>
      <div class="form" style="margin-top:14px"><h3>Coach-Approved Assignment</h3><label>Track Tier<select id="athTrackTier"><option value="foundation">Foundation</option><option value="development">Development</option><option value="performance">Performance</option></select></label><label>Strength Tier<select id="athStrengthTier"><option value="foundation">Foundation</option><option value="development">Development</option><option value="performance">Performance</option></select></label><label>Official Week<input id="athProgramWeek" type="number" min="1" max="41" value="${Number(a.current_week||1)}"></label><label>Reason<textarea id="athAssignmentReason" rows="3" maxlength="1000" placeholder="Why is this assignment appropriate?"></textarea></label><button class="action" id="saveAthAssignment">Approve & Sync Assignment</button><div id="athAssignmentState"></div></div>
      <div class="tile" style="margin-top:14px"><h3>Private Coach Notes</h3><div id="athleteNotes">${notes.length?notes.map(n=>`<div class="row"><span>${escapeHtml(n.note)}<br><small>${escapeHtml(fmtDate(n.created_at))}</small></span></div>`).join(''):'<p>No coach notes yet.</p>'}</div></div>
      <div class="form" style="margin-top:14px"><label>Add Private Coach Note<textarea rows="4" id="athNote" maxlength="5000" placeholder="Add a private coaching note…"></textarea></label><button class="action" id="saveAthNote">Save Note</button><div id="athNoteState"></div></div>
    </div>`;
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
  const modal=mwModal('Invite Athlete',`<div class="tile"><h3>Connect an athlete to your dashboard</h3><p>The athlete can be new to MW Dynasty or already have an account. The invitation creates the connection only after the athlete accepts it.</p></div><div class="form" style="margin-top:14px"><label>Athlete Email<input id="inviteEmail" type="email" inputmode="email" placeholder="athlete@example.com"></label><label>Invite Type<select id="inviteType"><option value="coach_invite">Coach invitation</option><option value="team_invite">Team invitation</option></select></label><button class="action" id="createInvite">Create Secure Invitation</button><div id="inviteState" class="tile" style="display:none"></div></div>`);
  document.getElementById('createInvite').onclick=async()=>{
    const email=document.getElementById('inviteEmail').value.trim().toLowerCase(),state=document.getElementById('inviteState'),btn=document.getElementById('createInvite');
    if(!email||!email.includes('@'))return toast('Enter a valid athlete email');
    btn.disabled=true;btn.textContent='Creating…';
    try{
      const user=await mwCurrentUser();const token=mwSessionToken();if(!user?.id||!token)throw new Error('Coach session expired. Sign in again.');
      const inviteToken=(crypto.randomUUID?crypto.randomUUID():Math.random().toString(36).slice(2)+Date.now().toString(36));
      const row={coach_user_id:user.id,athlete_email:email,invite_type:document.getElementById('inviteType').value,team_id:null,status:'pending',invite_token:inviteToken,expires_at:new Date(Date.now()+7*86400000).toISOString(),accepted_at:null,accepted_by:null};
      const r=await fetch(`${SUPABASE_URL}/rest/v1/coach_invitations`,{method:'POST',headers:{apikey:SUPABASE_KEY,Authorization:`Bearer ${token}`,'Content-Type':'application/json',Prefer:'return=representation'},body:JSON.stringify(row)});
      const d=await r.json().catch(()=>[]);if(!r.ok)throw new Error(d?.message||d?.hint||'Invitation could not be created');
      state.style.display='block';state.innerHTML=`<h3>Invitation Created</h3><p><b>${escapeHtml(email)}</b></p><p>Status: Pending · Expires in 7 days</p><label>Invite Code<input id="inviteCode" readonly value="${escapeHtml(inviteToken)}"></label><button class="back" id="copyInvite" type="button">Copy Invite Code</button>`;
      document.getElementById('copyInvite').onclick=async()=>{try{await navigator.clipboard.writeText(inviteToken);toast('Invite code copied')}catch{document.getElementById('inviteCode').select();document.execCommand('copy');toast('Invite code copied')}};
    }catch(e){state.style.display='block';state.innerHTML=`<h3>Invitation Error</h3><p>${escapeHtml(e.message)}</p>`}finally{btn.disabled=false;btn.textContent='Create Secure Invitation'}
  }
}
async function athletesPage(){
  pageBase('Athletes',accountAccess.role==='coach'?'Only athletes actively assigned to your coach account appear here.':'Founder/Admin athlete roster.',`<div id="athleteList" class="list"><div class="tile">Loading live MW roster…</div></div><button class="action" id="inviteAthlete" style="margin-top:14px">+ Invite Athlete</button><div id="pendingInviteWrap" style="margin-top:18px"></div>`);
  document.getElementById('inviteAthlete').onclick=inviteAthleteModal;
  const list=document.getElementById('athleteList');
  try{
    const d=await fetchCoachRoster(),athletes=Array.isArray(d.athletes)?d.athletes:[],pending=Array.isArray(d.pendingInvitations)?d.pendingInvitations:[];
    const pendingWrap=document.getElementById('pendingInviteWrap');
    if(pendingWrap&&pending.length)pendingWrap.innerHTML=`<div class="tile"><h3>Pending Athlete Invitations</h3><div class="list">${pending.map(i=>`<div class="row"><span><b>${escapeHtml(i.athlete_email)}</b><br><small>Pending · expires ${escapeHtml(fmtDate(i.expires_at))}</small></span></div>`).join('')}</div></div>`;
    if(!athletes.length){list.innerHTML=`<div class="tile"><h3>No assigned athletes yet</h3><p>${d.scope==='assigned'?'This coach account currently has no active athlete assignments. Invite an athlete, and they will appear here once the connection is accepted.':'No athlete accounts are available yet.'}</p></div>`;return}
    list.innerHTML=athletes.map(a=>`<div class="row"><span><b>${escapeHtml(a.name)}</b><br><small>${escapeHtml(a.event||'Events not set')} · Week ${Number(a.current_week||1)} · ${escapeHtml(String(a.status||'On Track'))}</small></span><button class="action athlete-open" data-athlete-id="${escapeHtml(a.id)}">Open</button></div>`).join('');
    list.querySelectorAll('.athlete-open').forEach(b=>b.onclick=()=>athleteDetail(b.dataset.athleteId));
  }catch(e){list.innerHTML=`<div class="tile"><h3>Roster unavailable</h3><p>${escapeHtml(e.message)}</p><button class="back" id="retryRoster">Try Again</button></div>`;document.getElementById('retryRoster').onclick=athletesPage}
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
function supportPage(){pageBase('Help & Support','MW Dynasty coach support.',`<div class="form"><label>Subject<input id="supportSubject" placeholder="Subject"></label><label>Request<textarea id="supportText" rows="6" placeholder="How can we help?"></textarea></label><button class="action" id="submitSupport">Submit Request</button><div id="supportState" class="tile" style="display:none"></div></div>`);document.getElementById('submitSupport').onclick=()=>{const s=supportSubject.value.trim(),t=supportText.value.trim();if(!s||!t)return toast('Complete subject and request');const all=mwLoad('supportRequests',[]);all.push({subject:s,text:t,time:new Date().toISOString(),status:'Prepared'});mwStore('supportRequests',all);supportState.style.display='block';supportState.innerHTML='<b>Request prepared.</b><p>Your request has been saved in the coach workspace. External support delivery can be connected when the support channel is configured.</p>'}}
function taskBoardPage(){let tasks=mwLoad('aiTasks',[{name:'Maya T. — Missed Training',detail:'Review workload before next high-intensity day.',status:'Review'},{name:'Tyler B. — Performance Trend',detail:'Flying 30 trend improved across three sessions.',status:'Approve'},{name:'Aaliyah R. — Meet Preparation',detail:'Competition warm-up and race-model review are due.',status:'Open'}]);pageBase('AI Task Board','Daily coaching tasks and priorities.',`<div class="list">${tasks.map((t,i)=>`<div class="row"><span><b>${escapeHtml(t.name)}</b><br>${escapeHtml(t.detail)}<br><small>Status: ${escapeHtml(t.status)}</small></span><button class="action task-open" data-i="${i}">Open Task</button></div>`).join('')}</div>`);document.querySelectorAll('.task-open').forEach(b=>b.onclick=()=>{const i=+b.dataset.i,t=tasks[i];mwModal('AI Task',`<div class="tile"><h3>${escapeHtml(t.name)}</h3><p>${escapeHtml(t.detail)}</p></div><div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:12px"><button class="action" id="approveTask">Approve</button><button class="back" id="holdTask">Hold</button></div>`);approveTask.onclick=()=>{tasks[i].status='Approved';mwStore('aiTasks',tasks);document.getElementById('mwModal')?.remove();taskBoardPage()};holdTask.onclick=()=>{tasks[i].status='Held';mwStore('aiTasks',tasks);document.getElementById('mwModal')?.remove();taskBoardPage()}})}
async function seasonPage(){const rec=mwLoad('seasonRecommendation',null);pageBase('AI Season Planner','Build and optimize the season while keeping the coach in control.',`<div class="panel-grid"><div class="tile"><h3>Training-Year Position</h3><p id="seasonPlannerCalendar">Loading MW season calendar…</p></div><div class="tile"><h3>Next Meet</h3><p>Use Calendar / Meets to connect the next competition.</p></div></div><div class="form" style="margin-top:14px"><label>Season Goal<textarea id="seasonGoal" rows="4" placeholder="What should the team be ready for?"></textarea></label><button class="action" id="genSeason">Generate Recommendation</button><div id="seasonOut" class="tile" style="${rec?'':'display:none;'}">${rec?escapeHtml(rec):''}</div></div>`);try{const c=await coachSeasonCalendarRequest();const el=document.getElementById('seasonPlannerCalendar');if(el)el.textContent=coachCalendarSummary(c)}catch(e){const el=document.getElementById('seasonPlannerCalendar');if(el)el.textContent=e.message}document.getElementById('genSeason').onclick=()=>{const goal=seasonGoal.value.trim()||'Protect speed quality while preparing for the next meet.';const c=coachSeasonCalendar;const calendar=c?coachCalendarSummary(c):'MW season calendar';const text=`Recommendation: use ${calendar} as the scheduling reference, keep the current phase intent intact, protect high-intensity quality, and review attendance/readiness before any progression. Coach approval is required before changing official program state. Goal: ${goal}`;mwStore('seasonRecommendation',text);seasonOut.style.display='block';seasonOut.textContent=text}}
function adjustmentPage(){let status=mwLoad('seasonAdjustment','Pending coach review');pageBase('AI Season Adjustment','Detect → Analyze → Recommend → Coach Approves → System Executes.',`<div class="tile"><h3>Recommended Adjustment</h3><p>Maya T. missed two sessions. Hold the next high-intensity progression until attendance and readiness are reviewed.</p><p><b>Status:</b> <span id="adjustStatus">${escapeHtml(status)}</span></p><div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:12px"><button class="action" id="approveAdjustment">Approve Adjustment</button><button class="back" id="dismissAdjustment">Dismiss</button></div></div>`);approveAdjustment.onclick=()=>{status='Approved by coach — execution still requires connected program-state action';mwStore('seasonAdjustment',status);adjustStatus.textContent=status};dismissAdjustment.onclick=()=>{status='Dismissed by coach';mwStore('seasonAdjustment',status);adjustStatus.textContent=status}}
function insightsPage(){const items=[['Training Load','Athlete workload is in optimal range.'],['Performance Trend','Sprinters showing a 3.2% improvement.'],['Meet Readiness','8 athletes are on track for PRs.'],['Attendance','Team attendance is currently 91%.']];pageBase('AI Insights','Performance, workload and meet-readiness signals.',`<div class="panel-grid">${items.map((x,i)=>`<div class="tile"><h3>${x[0]}</h3><p>${x[1]}</p><button class="action insight-open" data-i="${i}">Review Insight</button></div>`).join('')}</div>`);document.querySelectorAll('.insight-open').forEach(b=>b.onclick=()=>{const x=items[+b.dataset.i];mwModal(x[0],`<div class="tile"><p>${x[1]}</p><p><b>Coach action:</b> Review supporting athlete data before changing training or progression.</p></div>`)})}
function mwTrackPage(){pageBase('MW Track Program','41-week progressive sprint program.',`<div class="panel-grid">${Array.from({length:41},(_,i)=>i+1).map(w=>`<div class="tile"><h3>Week ${w}</h3><p>${w===12?'Acceleration Development':'MW progressive sprint development'}</p><button class="action week-open" data-week="${w}">Open Week</button></div>`).join('')}</div>`);document.querySelectorAll('.week-open').forEach(b=>b.onclick=()=>mwModal(`MW Track Program · Week ${b.dataset.week}`,`<div class="tile"><h3>Week ${b.dataset.week}</h3><p>Open the coach-authored MW week, review daily sessions, and track completion. This interface is ready for the full 41-week dataset connection.</p></div>`))}
function strengthPage(){pageBase('Strength & Power','MW weight-room program synchronized to the sprint plan.',`<div class="panel-grid">${Array.from({length:41},(_,i)=>i+1).map(w=>`<div class="tile"><h3>Week ${w}</h3><p>Synchronized Strength & Power session.</p><button class="action strength-open" data-week="${w}">Open Session</button></div>`).join('')}</div>`);document.querySelectorAll('.strength-open').forEach(b=>b.onclick=()=>mwModal(`Strength & Power · Week ${b.dataset.week}`,`<div class="tile"><h3>Week ${b.dataset.week}</h3><p>Weight-room session detail workspace. Load calculations, lift prescriptions and athlete completion can be connected to the synchronized strength dataset.</p></div>`))}
function schoolPage(){const lessons=['Sprint Mechanics','Block Starts','Competition Warm-Up','Drill Library'];pageBase('Sprint School','Technique & education.',`<div class="panel-grid">${lessons.map(x=>`<div class="tile"><h3>${x}</h3><p>MW Sprint School lesson.</p><button class="action lesson-open" data-lesson="${x}">Open Lesson</button></div>`).join('')}</div>`);document.querySelectorAll('.lesson-open').forEach(b=>b.onclick=()=>mwModal(b.dataset.lesson,`<div class="tile"><h3>${escapeHtml(b.dataset.lesson)}</h3><p>Coach-facing lesson workspace with teaching points, athlete assignment, and completion controls.</p></div><button class="action" id="assignLesson">Assign to Team</button>`))}
function racePage(){const lessons=['100m Race Strategy','200m Race Strategy','400m Race Strategy','Block Start Strategy'];pageBase('Race Strategy','100m · 200m · 400m blueprints.',`<div class="panel-grid">${lessons.map(x=>`<div class="tile"><h3>${x}</h3><p>MW race execution blueprint.</p><button class="action race-open" data-race="${x}">Open Blueprint</button></div>`).join('')}</div>`);document.querySelectorAll('.race-open').forEach(b=>b.onclick=()=>mwModal(b.dataset.race,`<div class="tile"><h3>${escapeHtml(b.dataset.race)}</h3><p>Coach-facing race blueprint workspace for teaching, review and athlete assignment.</p></div>`))}
function bindPageActions(){document.querySelectorAll('[data-toast]').forEach(b=>b.onclick=()=>{const msg=b.dataset.toast||'Action opened';mwModal('Coach Workspace',`<div class="tile"><h3>${escapeHtml(msg)}</h3><p>This action now opens a real workspace instead of a temporary toast-only placeholder.</p></div>`)})}


async function coachAdminRequest(method='GET',body=null){
  const token=mwSessionToken();if(!token)throw new Error('Founder session required.');
  const r=await fetch(`${SUPABASE_URL}/functions/v1/mw-coach-applications-admin`,{method,headers:{apikey:SUPABASE_KEY,Authorization:`Bearer ${token}`,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});
  const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||'Coach application request failed.');return d;
}
async function coachApplicationsPage(){
  if(!accountAccess.isFounder){toast('Founder access required');return dashboard()}
  pageBase('Coach Applications','Review every coach before MW Dynasty access is granted.',`<div class="founder-app-head"><div><b>Vetted Coach Access</b><p>Approve the coach, assign exactly one tier, then MW Dynasty sends the secure invitation.</p></div><button class="back" id="refreshCoachApps">Refresh</button></div><div id="coachAppsState" class="tile">Loading applications…</div><div id="coachAppsList" class="founder-app-list"></div>`);
  const load=async()=>{const state=document.getElementById('coachAppsState'),list=document.getElementById('coachAppsList');state.style.display='block';state.textContent='Loading applications…';list.innerHTML='';try{const d=await coachAdminRequest();const apps=d.applications||[];state.textContent=apps.length?`${apps.filter(a=>a.status==='pending').length} pending · ${apps.length} total application${apps.length===1?'':'s'}`:'No coach applications yet.';list.innerHTML=apps.map(a=>`<article class="founder-app-card"><div class="founder-app-top"><div><span class="founder-status ${escapeHtml(a.status)}">${escapeHtml(a.status)}</span><h3>${escapeHtml(a.first_name)} ${escapeHtml(a.last_name)}</h3><p>${escapeHtml(a.email)}${a.organization?' · '+escapeHtml(a.organization):''}</p></div><small>${new Date(a.created_at).toLocaleDateString()}</small></div><div class="founder-app-meta"><span>${escapeHtml(a.coaching_level||'Level not provided')}</span><span>${a.years_coaching??'—'} years</span><span>${escapeHtml([a.city,a.state].filter(Boolean).join(', ')||'Location not provided')}</span></div><p class="founder-reason">${escapeHtml(a.reason)}</p>${a.status==='pending'?`<div class="founder-review"><label>Coach Tier<select data-tier="${a.id}"><option value="core">MW Coach Core</option><option value="intelligence">Coach Intelligence</option><option value="mw_sprint_performance">MW Sprint Performance</option></select></label><label>Founder Notes<textarea rows="2" data-notes="${a.id}" placeholder="Optional internal review notes"></textarea></label><div class="founder-actions"><button class="action" data-approve="${a.id}">Approve + Send Invite</button><button class="back founder-reject" data-reject="${a.id}">Reject</button></div></div>`:`<div class="founder-reviewed"><b>${a.access_tier?escapeHtml(tierLabel(a.access_tier)):escapeHtml(a.status)}</b>${a.invited_at?`<span>Invitation sent ${new Date(a.invited_at).toLocaleDateString()}</span>`:''}</div>`}</article>`).join('');bindCoachApplicationActions(load)}catch(e){state.textContent=e.message}};document.getElementById('refreshCoachApps').onclick=load;load();
}
function tierLabel(t){return ({core:'MW Coach Core',intelligence:'Coach Intelligence',mw_sprint_performance:'MW Sprint Performance'})[t]||t}
function bindCoachApplicationActions(reload){
  document.querySelectorAll('[data-approve]').forEach(b=>b.onclick=async()=>{const id=b.dataset.approve,tier=document.querySelector(`[data-tier="${id}"]`).value,notes=document.querySelector(`[data-notes="${id}"]`).value;b.disabled=true;b.textContent='Approving…';try{const d=await coachAdminRequest('POST',{id,action:'approve',access_tier:tier,review_notes:notes});toast(d.message||'Coach approved and invitation sent');await reload()}catch(e){toast(e.message);b.disabled=false;b.textContent='Approve + Send Invite'}});
  document.querySelectorAll('[data-reject]').forEach(b=>b.onclick=async()=>{const id=b.dataset.reject;const reason=prompt('Reason for rejecting this coach application?')||'';if(!reason.trim())return; b.disabled=true;try{await coachAdminRequest('POST',{id,action:'reject',rejection_reason:reason,review_notes:document.querySelector(`[data-notes="${id}"]`)?.value||''});toast('Coach application rejected');await reload()}catch(e){toast(e.message);b.disabled=false}})
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
  if(experience==='performance')return mwTrackPage();pageBase('My Program','Build, save and manage your own coaching program in the MW workspace.',`<div style="display:flex;justify-content:flex-end;margin-bottom:14px"><button class="action" id="newProgram">+ New Program</button></div><div id="programLive" class="list"><div class="tile">Loading programs…</div></div>`);newProgram.onclick=()=>programEditor();const wrap=programLive;try{const rows=await sbRest('coach_programs?select=id,name,program_type,status,content,updated_at&order=updated_at.desc')||[];wrap.innerHTML=rows.map(x=>`<div class="row"><span><b>${escapeHtml(x.name)}</b><br><small>${escapeHtml(x.program_type||'track')} · ${escapeHtml(x.status||'draft')} · updated ${fmtDate(x.updated_at)}</small></span><button class="action program-open" data-id="${x.id}">Open</button></div>`).join('')||'<div class="tile">No coach-authored programs yet.</div>';wrap.querySelectorAll('.program-open').forEach(b=>b.onclick=()=>programEditor(b.dataset.id));}catch(e){wrap.innerHTML=`<div class="tile">${escapeHtml(e.message)}</div>`}
}
async function programEditor(id=null){let row=null;if(id){try{row=(await sbRest(`coach_programs?select=*&id=eq.${encodeURIComponent(id)}&limit=1`))?.[0]}catch(e){return toast(e.message)}}const content=row?.content||{};mwModal(row?'Edit Program':'New Program',`<div class="form"><label>Name<input id="cpName" value="${escapeHtml(row?.name||'')}"></label><label>Type<select id="cpType"><option value="track">Track</option><option value="strength">Strength</option><option value="combined">Combined</option></select></label><label>Status<select id="cpStatus"><option value="draft">Draft</option><option value="active">Active</option><option value="archived">Archived</option></select></label><label>Program Content<textarea id="cpContent" rows="12" placeholder="Week / Day / Session structure…">${escapeHtml(content.text||'')}</textarea></label><button class="action" id="saveCP">Save Program</button></div>`);cpType.value=row?.program_type||'track';cpStatus.value=row?.status||'draft';saveCP.onclick=async()=>{const u=await mwCurrentUser(),body={coach_user_id:u.id,name:cpName.value.trim(),program_type:cpType.value,status:cpStatus.value,content:{text:cpContent.value,updated_from:'MW Coach V12'}};if(!body.name)return toast('Program name required');try{const d=id?await sbRest(`coach_programs?id=eq.${encodeURIComponent(id)}`,{method:'PATCH',body}):await sbRest('coach_programs',{method:'POST',body});await logCoachAction(id?'program_updated':'program_created','coach_program',d?.[0]?.id||id,{name:body.name});document.getElementById('mwModal')?.remove();programsPage();toast('Program synced')}catch(e){toast(e.message)}}}
async function calendarPage(){pageBase('Calendar','Live practices, meets and team events synced to your coach account.',`<button class="action" id="addCalendar">+ Add Event</button><div class="list" id="calLive" style="margin-top:14px"><div class="tile">Loading events…</div></div>`);addCalendar.onclick=calendarEventModal;try{const rows=await sbRest('coach_calendar_events?select=id,title,event_type,starts_at,location,notes,registration_status&order=starts_at.asc')||[];calLive.innerHTML=rows.map(e=>`<div class="row"><span><b>${escapeHtml(e.title)}</b><br><small>${escapeHtml(e.event_type||'event')} · ${new Date(e.starts_at).toLocaleString()}${e.location?' · '+escapeHtml(e.location):''}</small></span><button class="action cal-live" data-id="${e.id}">Open</button></div>`).join('')||'<div class="tile">No events scheduled yet.</div>';calLive.querySelectorAll('.cal-live').forEach(b=>b.onclick=()=>calendarEventModal(b.dataset.id));}catch(e){calLive.innerHTML=`<div class="tile">${escapeHtml(e.message)}</div>`}}
async function calendarEventModal(id=null){let row=null;if(id)row=(await sbRest(`coach_calendar_events?select=*&id=eq.${encodeURIComponent(id)}&limit=1`))?.[0];const local=row?.starts_at?new Date(row.starts_at).toISOString().slice(0,16):'';mwModal(row?'Edit Event':'Add Event',`<div class="form"><label>Title<input id="ceTitle" value="${escapeHtml(row?.title||'')}"></label><label>Type<select id="ceType"><option value="practice">Practice</option><option value="meet">Meet</option><option value="testing">Testing</option><option value="other">Other</option></select></label><label>Date / Time<input id="ceStart" type="datetime-local" value="${local}"></label><label>Location<input id="ceLoc" value="${escapeHtml(row?.location||'')}"></label><label>Notes<textarea id="ceNotes" rows="3">${escapeHtml(row?.notes||'')}</textarea></label><button class="action" id="saveCE">Save Event</button></div>`);ceType.value=row?.event_type||'practice';saveCE.onclick=async()=>{const u=await mwCurrentUser(),body={coach_user_id:u.id,title:ceTitle.value.trim(),event_type:ceType.value,starts_at:new Date(ceStart.value).toISOString(),location:ceLoc.value.trim()||null,notes:ceNotes.value.trim()||null,registration_status:row?.registration_status||null};if(!body.title||!ceStart.value)return toast('Title and date required');try{const d=id?await sbRest(`coach_calendar_events?id=eq.${encodeURIComponent(id)}`,{method:'PATCH',body}):await sbRest('coach_calendar_events',{method:'POST',body});await logCoachAction(id?'calendar_updated':'calendar_created','calendar_event',d?.[0]?.id||id,{title:body.title,type:body.event_type});document.getElementById('mwModal')?.remove();calendarPage()}catch(e){toast(e.message)}}}
async function meetsPage(){pageBase('Meets','Meet schedule pulled from your live MW calendar.',`<div id="meetLive" class="list"><div class="tile">Loading meets…</div></div><button class="action" id="newMeet" style="margin-top:14px">+ Add Meet</button>`);newMeet.onclick=()=>calendarEventModal();try{const rows=await sbRest('coach_calendar_events?select=id,title,starts_at,location,registration_status,notes&event_type=eq.meet&order=starts_at.asc')||[];meetLive.innerHTML=rows.map(e=>`<div class="row"><span><b>${escapeHtml(e.title)}</b><br><small>${new Date(e.starts_at).toLocaleDateString()} · ${escapeHtml(e.location||'Location TBD')}</small></span><span class="status">${escapeHtml(e.registration_status||'Planned')}</span></div>`).join('')||'<div class="tile">No meets scheduled yet.</div>'}catch(e){meetLive.innerHTML=`<div class="tile">${escapeHtml(e.message)}</div>`}}
async function messagesPage(preselectGroup=null){pageBase('Messages','Send and retain coach communications in the MW backend.',`<div class="form"><label>Audience<select id="msgAudience"><option value="all_assigned">All Assigned Athletes</option><option value="group">Group</option><option value="athlete">Individual Athlete</option></select></label><label id="msgTargetWrap" style="display:none">Target<select id="msgTarget"></select></label><label>Message<textarea id="msgText" rows="5" placeholder="Message..."></textarea></label><button class="action" id="sendMsg">Send Message</button></div><div class="list" id="msgHistory" style="margin-top:16px"><div class="tile">Loading message history…</div></div>`);let groups=[],roster=[];try{[groups,roster]=await Promise.all([liveGroups(),fetchCoachRoster().then(d=>d.athletes||[])]);}catch{}const syncTarget=()=>{const type=msgAudience.value;msgTargetWrap.style.display=type==='all_assigned'?'none':'block';msgTarget.innerHTML=type==='group'?groups.map(g=>`<option value="${g.id}">${escapeHtml(g.name)}</option>`).join(''):roster.map(a=>`<option value="${a.id}">${escapeHtml(a.name)}</option>`).join('');if(preselectGroup&&type==='group')msgTarget.value=preselectGroup};msgAudience.onchange=syncTarget;if(preselectGroup){msgAudience.value='group'}syncTarget();const load=async()=>{try{const rows=await sbRest('coach_messages?select=id,audience_type,body,created_at&order=created_at.desc&limit=25')||[];msgHistory.innerHTML=rows.map(m=>`<div class="row"><span><b>${escapeHtml(m.audience_type.replaceAll('_',' '))}</b><br>${escapeHtml(m.body)}</span><small>${new Date(m.created_at).toLocaleString()}</small></div>`).join('')||'<div class="tile">No messages yet.</div>'}catch(e){msgHistory.innerHTML=`<div class="tile">${escapeHtml(e.message)}</div>`}};await load();sendMsg.onclick=async()=>{const body=msgText.value.trim();if(!body)return toast('Write a message first');const u=await mwCurrentUser(),type=msgAudience.value,payload={coach_user_id:u.id,audience_type:type,body,group_id:type==='group'?msgTarget.value:null,athlete_id:type==='athlete'?msgTarget.value:null};try{const d=await sbRest('coach_messages',{method:'POST',body:payload});await logCoachAction('message_sent','coach_message',d?.[0]?.id,{audience:type});msgText.value='';await load();toast('Message synced')}catch(e){toast(e.message)}}}
async function activityPage(){pageBase('Activity Log','A real audit trail of coach actions in MW Dynasty.',`<div id="activityLive" class="list"><div class="tile">Loading activity…</div></div>`);try{const rows=await sbRest('coach_activity_log?select=id,action_type,entity_type,detail,created_at&order=created_at.desc&limit=50')||[];activityLive.innerHTML=rows.map(a=>`<div class="row"><span><b>${escapeHtml(a.action_type.replaceAll('_',' '))}</b><br><small>${escapeHtml(a.entity_type||'MW Coach')} ${a.detail?.name?'· '+escapeHtml(a.detail.name):''}</small></span><small>${new Date(a.created_at).toLocaleString()}</small></div>`).join('')||'<div class="tile">Activity will appear as you use the connected coach workspace.</div>'}catch(e){activityLive.innerHTML=`<div class="tile">${escapeHtml(e.message)}</div>`}}
async function taskBoardPage(){pageBase('Coach Task Board','Live priorities generated from assigned-athlete program state and training activity.',`<div id="taskLive" class="list"><div class="tile">Analyzing assigned athletes…</div></div>`);try{const d=await fetchCoachRoster(),a=d.athletes||[];const tasks=[];for(const x of a){if(!x.last_completed_workout_at)tasks.push({n:x.name,d:'No completed workout is currently recorded. Review training status.',p:'Review'});else{const days=(Date.now()-new Date(x.last_completed_workout_at).getTime())/86400000;if(days>7)tasks.push({n:x.name,d:`Last recorded workout was ${Math.floor(days)} days ago. Check attendance and readiness.`,p:'High'});}if((x.prs||[]).length===0)tasks.push({n:x.name,d:'No PRs are recorded. Add verified marks to unlock individualized pacing.',p:'Setup'});}taskLive.innerHTML=tasks.map(t=>`<div class="row"><span><b>${escapeHtml(t.n)}</b><br>${escapeHtml(t.d)}</span><span class="status">${t.p}</span></div>`).join('')||'<div class="tile"><h3>No urgent athlete tasks detected</h3><p>The assigned roster has no basic data gaps or inactivity flags right now.</p></div>'}catch(e){taskLive.innerHTML=`<div class="tile">${escapeHtml(e.message)}</div>`}}
async function insightsPage(){pageBase('AI Insights','Live roster signals before Coach MW makes recommendations.',`<div id="insightLive" class="panel-grid"><div class="tile">Analyzing roster…</div></div>`);try{const d=await fetchCoachRoster(),a=d.athletes||[],withPr=a.filter(x=>(x.prs||[]).length).length,recent=a.filter(x=>x.last_completed_workout_at&&(Date.now()-new Date(x.last_completed_workout_at))/86400000<=7).length;insightLive.innerHTML=`<div class="tile"><h3>Roster</h3><p>${a.length} authorized athlete${a.length===1?'':'s'} connected.</p></div><div class="tile"><h3>PR Coverage</h3><p>${withPr} of ${a.length} athletes have pacing-ready PR data.</p></div><div class="tile"><h3>Recent Training</h3><p>${recent} athletes have a workout recorded in the last 7 days.</p></div><div class="tile"><h3>Program Position</h3><p>${a.length?`Average current week: ${(a.reduce((s,x)=>s+Number(x.current_week||1),0)/a.length).toFixed(1)}`:'No athlete program state yet.'}</p></div>`}catch(e){insightLive.innerHTML=`<div class="tile">${escapeHtml(e.message)}</div>`}}
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

initAuth();
