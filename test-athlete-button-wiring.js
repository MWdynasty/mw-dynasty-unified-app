const fs=require('fs');
const assert=require('assert');

// Auth controls now come from the same component used by Coach.
const html=fs.readFileSync('athlete/index.html','utf8')+fs.readFileSync('assets/mw-performance-progression.js','utf8')+require('./assets/mw-signin-v3.js').render('athlete');
const adaptiveLayout=fs.readFileSync('assets/mw-adaptive-tools-layout.js','utf8');
const buttons=[...html.matchAll(/<button\b([^>]*)>/gi)].map((m,i)=>({i,attrs:m[1],tag:m[0]}));

function attr(tag,name){
  const m=tag.match(new RegExp('\\b'+name+'\\s*=\\s*"([^"]*)"','i')) || tag.match(new RegExp("\\b"+name+"\\s*=\\s*'([^']*)'",'i'));
  return m?m[1]:null;
}
function hasAttr(tag,name){return new RegExp('\\b'+name+'(?:\\s*=|\\b)','i').test(tag)}
function textNearButton(index){
  const start=html.indexOf(buttons[index].tag);
  const end=html.indexOf('</button>',start);
  return end>=0?html.slice(start,end+9).replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim():'';
}
function escRegex(s){return String(s).replace(/[.*+?^$()|[\]\\{}]/g,'\\$&')}

assert(buttons.length>=100,'Athlete UI unexpectedly lost a large number of buttons');

const idButtons=buttons.filter(b=>attr(b.tag,'id'));
const ids=idButtons.map(b=>attr(b.tag,'id'));
const dupes=ids.filter((id,i)=>ids.indexOf(id)!==i);
assert.deepStrictEqual([...new Set(dupes)],[],'Duplicate static button IDs are not allowed');

const genericFamilies=[
  'data-open','data-open-settings','data-v','data-delete-cancel','data-delete-confirm','data-practice-coach','data-submit-checkin',
  'data-athlete-search-open','data-coach-thread','data-mw-notification','data-resume-strength',
  'data-sday','data-adjust-strength','data-feel','data-session','data-finish-previous','data-q','data-mw-target','data-rest-toggle','data-rest-reset','data-practice-adjust','data-mw-development'
];

const directIds=[
  'mwTogglePassword','mwForgotPassword','mwAuthLogin','mwSavePassword','mwAthleteNotificationBell',
  'mwAthleteThreadBack','mwSendReply','mwAthleteMarkNotificationsRead','clearChat','mic','go',
  'openEntry','encourageMe','faithTalk','mwEditSeasonDates','saveSeasonDatesOnly','assess','backCoach','mwPracticeLaunch',
  'askStrength','saveStrengthPerformance','finishStrengthAsPrescribed','finishStrengthModified',
  'save','coachInviteReview','coachInviteAccept','saveLiftMaxes','profileEntry','mwContinueSelfPay',
  'mwAISharingSettings','helpCenterBtn','reportIssueBtn','privacyBtn','termsBtn','deleteAccountBtn','mwDiagnosticsSend',
  'saveSettings','replayTour','mwSignOut','tourSkip','tourBack','tourNext','qsSkip','qsBack','qsNext',
  'paceAllYes','paceSomeNo','paceBack','mwPracticeExit','mwPracticeStart','mwPracticePause',
  'mwPracticeNext','mwPracticeHandsFree','mwPracticeVoiceAdjust','mwPracticeSave','mwPracticeReset','mwPracticeRetry','mwDobVerifySave','mwScSave',
  'mwAthleteMembershipContinue','mwAthleteRestorePurchase','mwUtilityClose',
  'mwProgressGoTrain',
  'mwSelfPayMonthly','mwSelfPayAnnual','mwSupportSend','mwHomeMenuButton','manageCoachConnections'
];

for(const id of directIds){
  assert(ids.includes(id),'Missing athlete button #'+id);
  const refs=(html.match(new RegExp(escRegex(id),'g'))||[]).length;
  assert(refs>=2,'Button #'+id+' has no JavaScript wiring reference');
}

assert(html.includes("document.querySelectorAll('[data-open]').forEach"),'data-open navigation wiring missing');
assert(html.includes("document.querySelectorAll('[data-open-settings]').forEach"),'settings navigation wiring missing');
assert(html.includes("document.querySelectorAll('.nav button').forEach"),'bottom navigation wiring missing');
assert(html.includes("document.querySelectorAll('.quick button').forEach"),'Coach MW quick-button wiring missing');
assert(html.includes("if(e.target.closest('#mwPracticeLaunch'))"),'Practice launch delegated handler missing');
assert(html.includes("if(e.target.closest('#mwPracticeStart'))"),'Practice start delegated handler missing');
assert(html.includes("if(e.target.closest('#mwPracticePause'))"),'Practice pause delegated handler missing');
assert(html.includes("if(e.target.closest('#mwPracticeNext'))"),'Practice finish-rep delegated handler missing');
assert(html.includes("if(e.target.closest('#mwPracticeHandsFree'))"),'Practice hands-free finish delegated handler missing');
assert(html.includes("if(e.target.closest('#mwPracticeVoiceAdjust'))"),'Practice voice adjustment handler missing');
assert(html.includes("if(e.target.closest('#mwPracticeSave'))"),'Practice save delegated handler missing');
assert(html.includes("if(e.target.closest('#mwPracticeExit'))"),'Practice exit delegated handler missing');
assert(html.includes("[data-practice-coach]"),'Practice Ask Coach handler missing');
assert(html.includes("querySelector('[data-submit-checkin]')?.addEventListener('click'"),'Coach-assigned check-in handler missing');
assert(html.includes("querySelectorAll('[data-sday]')"),'Strength quick-check button wiring missing');
assert(html.includes("querySelectorAll('[data-resume-strength]')"),'Strength resume button wiring missing');
assert(html.includes("querySelectorAll('[data-mw-notification]')"),'Notification row button wiring missing');
assert(html.includes("querySelectorAll('[data-athlete-search-open]')"),'Athlete search result button wiring missing');

const inlineCalls=[...html.matchAll(/onclick\s*=\s*["']([^"']+)["']/gi)]
  .flatMap(m=>[...m[1].matchAll(/\b([A-Za-z_$][\w$]*)\s*\(/g)].map(x=>x[1]))
  .filter(x=>!['querySelector','getElementById'].includes(x));
for(const name of [...new Set(inlineCalls)]){
  const escaped=escRegex(name);
  const defined=new RegExp('(?:function\\s+'+escaped+'\\s*\\(|(?:const|let|var)\\s+'+escaped+'\\s*=|window\\.'+escaped+'\\s*=)').test(html);
  assert(defined,'Inline click handler calls undefined function '+name);
}

for(const [i,b] of buttons.entries()){
  const id=attr(b.tag,'id');
  const isGeneric=genericFamilies.some(a=>hasAttr(b.tag,a));
  const inline=hasAttr(b.tag,'onclick');
  const className=attr(b.tag,'class')||'';
  const classWired=className.split(/\s+/).includes('mwProfileSaveAlias');
  const knownDirect=id&&directIds.includes(id);
  const intentionallyInert=/No results/i.test(textNearButton(i));
  assert(
    isGeneric||inline||classWired||knownDirect||intentionallyInert,
    'Unclassified athlete button: '+b.tag
  );
}

assert(
  html.indexOf('let mwSeasonCalendar=null;') < html.indexOf('function activeSeasonPlanId()'),
  'Season calendar state must initialize before workout button helpers'
);

console.log('PASS: audited '+buttons.length+' athlete button definitions across navigation, Coach MW, Smart Entry, track, strength, profile, settings, notifications, schedule and support.');


// Render real saved strength data in the same scope as Progress, not the auth IIFE.
const vm=require('node:vm');
const mainScript=html.slice(html.indexOf('<script>\nconst $='));
const progressScript=mainScript.slice(0,mainScript.indexOf('</script>'));
const helper=progressScript.match(/function escapeHtmlLocal\(v\)\{[^\n]+/);
assert(helper,'Progress HTML helper must be available in the main athlete script');
const renderer=html.slice(html.indexOf('function renderWeightRoomProgressUI(){'),html.indexOf('function renderProgressUI(){'));
const elements=new Map();
const scope={document:{getElementById(id){if(!elements.has(id))elements.set(id,{textContent:'',innerHTML:'',value:'',classList:{remove(){},add(){}}});return elements.get(id)}},window:{},mwStrengthQuickCache:{one:{lifecycle_status:'completed',status:'as_prescribed',program_week:1,strength_day:1,day_label:'Lift <A>',session_feel:'normal'}},mwStrengthPerformanceRows:[{exercise_name:'Squat <test>',reps_completed:8,actual_load:100,recorded_at:'2026-10-01',weight_unit:'lb'},{exercise_name:'Squat <test>',reps_completed:8,actual_load:110,recorded_at:'2026-10-02',weight_unit:'lb'}],mwPracticeProgressCache:[],mwRenderProgressTrendChart(){},activeMWWeek:()=>1,MW_STRENGTH:{},PHASES:{1:{name:'Foundation'}},phaseFromWeek:()=>1};
vm.createContext(scope);vm.runInContext(helper[0]+'\n'+renderer+'\nrenderWeightRoomProgressUI();',scope);
assert.equal(elements.get('progressStrengthSessions').textContent,'1');
assert.match(elements.get('progressStrengthRecent').innerHTML,/Lift &lt;A&gt;/);
assert.match(elements.get('progressStrengthRecent').innerHTML,/Squat &lt;test&gt;/);
assert.match(elements.get('progressStrengthRecent').innerHTML,/\+10 lb/);
console.log('PASS: completed strength sessions and load trends render safely in Progress.');


assert(html.includes('id="mwHomeMenuButton"'),'Athlete Home menu button must exist');
assert(html.includes('id="mwHomeMenu"'),'Athlete Home dropdown must exist');
for(const id of ['coach','messages','schedule','pacer']){
  assert(html.includes('data-open="'+id+'"'),'Athlete Home menu missing '+id+' destination');
}
assert(html.includes('data-open-settings'),'Athlete Home menu must include Settings');
assert(html.includes("window.mwCloseAthleteHomeMenu=close"),'Athlete Home menu must close after navigation');
assert(html.includes('#home .mwHomeShortcuts{display:none!important}'),'Legacy Home shortcut grid must stay hidden');
console.log('PASS: athlete Home secondary actions are consolidated into the dropdown menu.');


assert(html.includes('id="mw-home-stationary-v1"'),'Athlete Home scroll-lock stylesheet must exist');
assert(html.includes("document.body.classList.toggle('mw-home-locked',locked)"),'Home lock helper must toggle body scrolling state');
assert(html.includes("document.documentElement.classList.toggle('mw-home-locked',locked)"),'Home lock helper must toggle document scrolling state');
assert(html.includes('body.mw-auth-ready.mw-home-locked'),'Home CSS must override normal authenticated page scrolling');
assert(html.includes('body.mw-auth-ready.mw-home-locked{')&&html.includes('overflow-y:auto!important;overscroll-behavior-y:auto!important;')&&html.includes('touch-action:pan-y!important;'),'Home content must scroll inside the locked viewport while preserving native gestures');
assert(html.includes('#home .mwHomeMenu{\n    max-height:min(70dvh,520px);'),'Home dropdown must remain internally usable on short screens');
console.log('PASS: Athlete Home keeps the viewport fixed while its content scrolls above the bottom navigation.');


assert(html.includes('position:fixed!important;'),'Home must retain its iOS viewport-lock safeguards');
assert(html.includes("Home's CSS constrains its own viewport; never cancel document touchmove."),'Home must preserve native iOS gestures instead of canceling touchmove globally');
assert(!html.includes("document.addEventListener('touchmove'"),'Home must not install a global touchmove cancellation handler');
assert(html.includes('touch-action:pan-y!important;'),'Home dropdown must retain its own vertical scrolling under the stationary viewport');
assert(html.includes('mwSetHomeScrollLock(homeLocked);'),'View navigation must use the hard Home scroll lock helper');
console.log('PASS: iOS Home preserves internal content scrolling and menu scroll under the fixed viewport.');

assert(adaptiveLayout.includes('Get guidance for returning after a break and see whether a coach review is needed.'),'Training intelligence explains the return guidance before the athlete taps it');
assert(adaptiveLayout.includes("var train=document.getElementById('workouts')"),'Training intelligence targets the Train tab');
assert(adaptiveLayout.includes("focus=train.querySelector"),'Training intelligence is inserted into the Train tab instead of Home');
assert(html.includes("const officialWeek=String(d.authoritativeProgram?.week||ps.current_week||1)"),'Athlete week display uses the authoritative season week');
assert(html.includes("week:officialWeek"),'Athlete profile context stores the authoritative week for workout rendering');
assert(adaptiveLayout.includes('settings.parentElement!==profile'),'Notification preferences are kept out of the Training Intelligence card');
console.log('PASS: Home training guidance is explained clearly and notification settings no longer crowd that card.');


assert(html.includes("document.querySelectorAll('.nav button').forEach(x=>x.classList.toggle('active',x.dataset.v===id))"),'openView must update all bottom-nav buttons without throwing');
assert(html.includes("document.querySelectorAll('.view').forEach(x=>x.classList.toggle('active',x.id===id))"),'openView must update all Athlete views without throwing');
assert(!html.includes("$('.nav button').forEach(x=>x.classList.toggle"),'Single-element selector must never be used with forEach for nav state');
assert(!html.includes("$('.view').forEach(x=>x.classList.toggle"),'Single-element selector must never be used with forEach for view state');
assert(!html.includes('touch-action:none!important'),'Stationary Home must not disable tap interactions');
console.log('PASS: scrollable Home preserves bottom navigation taps.');

assert(html.includes('let mwDeferSeasonDates=false;'),'Season date deferral state must exist');
assert(html.includes('deferSeasonDates:window.mwCoachConnected===true||mwDeferSeasonDates'),'Season plan must support automatic safe-date deferral without a legacy button');
assert(html.includes("if(sd.needsDates){"),'Season plan must handle unavailable exact dates');
console.log('PASS: Season Intelligence uses automatic date deferral instead of retired defer buttons.');

assert(html.includes('let mwCompletionRenderGeneration=0;'),'Train completion rendering must keep a generation guard');
assert(html.includes('const renderGeneration=++mwCompletionRenderGeneration;'),'Each Train render must claim a unique generation');
assert(html.includes('if(renderGeneration!==mwCompletionRenderGeneration)return;'),'Stale asynchronous Train renders must stop before mutating the workout UI');
assert(html.includes("const actionLabel=isDone?'✓ DONE':status==='in_progress'?'CONTINUE':status==='incomplete'?'FINISH LOGGING':'DONE';"),'IN PROGRESS workouts must expose CONTINUE instead of the completion path');
assert(html.includes("['in_progress','incomplete'].includes(status)?window.mwOpenPracticeFor?.(w,sessionNumber):beginWorkoutCheckin"),'IN PROGRESS and INCOMPLETE workouts must resume Practice Mode instead of entering a new completion flow');
assert(html.includes("isDone=!!wc['s'+sessionNumber]||status==='completed'"),'Authoritative completed status must take precedence over stale local completion state');
console.log('PASS: Athlete Train rendering prevents stale duplicate rows and resumes the authoritative in-progress workout.');

const athleteHtml=fs.readFileSync('athlete/index.html','utf8');
const authScriptMatch=athleteHtml.match(/<script id="mw-supabase-auth-v1">([\s\S]*?)<\/script>/);
assert(authScriptMatch,'Athlete auth script must exist');
assert(athleteHtml.includes('window.applyCoachVisual=applyCoachVisual;'),'Athlete coach visual helper must be exposed across script scopes');
assert(authScriptMatch[1].includes('function safeApplyCoachVisual(choice)'),'Auth flow must isolate optional coach visual failures');
assert(authScriptMatch[1].includes("typeof window.applyCoachVisual==='function'"),'Visual helper must be type-checked before use');
assert(!/(?<![\w.$])applyCoachVisual\(/.test(authScriptMatch[1]),'Auth flow must not call the optional helper unguarded');
const inlineScripts=[...athleteHtml.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map(m=>m[1]);
assert(inlineScripts.length>=30,'Athlete page lost expected inline script blocks');
for(const [index,body] of inlineScripts.entries()){
  try{new Function(body)}catch(error){throw new Error('Athlete inline script '+index+' failed to parse: '+error.message)}
}
console.log('PASS: Athlete auth tolerates optional visual failures and all inline scripts parse.');

assert(athleteHtml.includes('mw-athlete-readable-train'),'Athlete Train mobile readability overrides missing');
assert(athleteHtml.includes('#todayTrackDetails .mwMissedTrainingNotice p { font-size: 16px'),'Adaptive-training explanation must use readable mobile text');
assert(athleteHtml.includes(".sort((a,b)=>a.week-b.week||a.day-b.day)"),'Missed sessions must be listed in chronological order');
assert(athleteHtml.includes("const missedSummary=priorDays.map(x=>'Week '+x.week+', session '+x.day).join(' · ')"),'Adaptive-training card must prepare a detail for every counted missed session');
assert(athleteHtml.includes("<small>Missed: '+missedSummary"),'Adaptive-training details must display all sessions included in its count');

assert((athleteHtml.match(/class="workoutDetailRow"/g)||[]).length===4,'Track workout details must render as four organized sections');
assert(athleteHtml.includes('#todayTrackDetails .workoutDetailRow span { color: #f1e7d2; font-size: 15px; line-height: 1.55'),'Workout detail rows must use readable mobile typography');

assert(athleteHtml.includes("const workoutBullets="),'Workout prescription must render as bullet lists');
assert(athleteHtml.includes(String.raw`raw.split(/\s*[·•]\s*/)`),'Wicket instructions must be split into readable bullet points');
assert(athleteHtml.includes("class=\"workoutBulletList\""),'Workout details must use the organized bullet-list layout');

assert(athleteHtml.includes('class="mwPracticeWork"'),'Practice Mode instructions need a dedicated structured container');
assert(athleteHtml.includes("class=\"mwPracticeInstruction\""),'Practice Mode prescription must render labeled sections');
assert(athleteHtml.includes("class=\"mwPracticeBulletList\""),'Practice Mode instructions must render as bullets');
assert(athleteHtml.includes("calc(env(safe-area-inset-top) + 14px)"),'Practice Mode header must clear the iOS status bar');
assert(!athleteHtml.includes("$p('mwPracticeWork').textContent=prep.join"),'Practice Mode must not collapse the prescription into one paragraph');

assert(athleteHtml.includes('<details class="mwPracticePrescription">'),'Practice Mode workout instructions must be collapsible');
assert(athleteHtml.includes('<summary><span>TODAY’S WORK</span>'),'Practice Mode disclosure must identify the work-only content');
assert(athleteHtml.includes("instructionToggle.open?'TAP TO CLOSE':'TAP TO OPEN'"),'Practice Mode disclosure label must reflect its open/closed state');
assert(athleteHtml.includes("const mainWork=simplifyAthleteText(p.raw||session.focus||'Follow today’s MW prescription.')"),'Practice Mode must use the prescribed main work');
assert(athleteHtml.includes('This takes the place of your usual technique workout. Do not add reps.'),'Safety instruction must remain explicit in the simplified main work');
assert(!athleteHtml.includes('COACH’S FULL TRAINING NOTES'),'Unnecessary technical notes must not appear in Practice Mode');
