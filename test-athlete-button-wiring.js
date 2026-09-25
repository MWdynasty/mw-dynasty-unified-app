const fs=require('fs');
const assert=require('assert');

const html=fs.readFileSync('athlete/index.html','utf8');
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
  'data-open','data-open-settings','data-v','data-practice-coach','data-submit-checkin',
  'data-athlete-search-open','data-coach-thread','data-mw-notification','data-resume-strength',
  'data-sday','data-session','data-finish-previous','data-q'
];

const directIds=[
  'mwTogglePassword','mwForgotPassword','mwAuthLogin','mwSavePassword','mwAthleteNotificationBell',
  'mwAthleteThreadBack','mwSendReply','mwAthleteMarkNotificationsRead','clearChat','mic','go',
  'openEntry','encourageMe','faithTalk','saveSeasonDatesOnly','assess','backCoach','mwPracticeLaunch',
  'askStrength','saveStrengthPerformance','finishStrengthAsPrescribed','finishStrengthModified',
  'save','coachInviteReview','coachInviteAccept','saveLiftMaxes','profileEntry','mwContinueSelfPay',
  'helpCenterBtn','reportIssueBtn','privacyBtn','termsBtn','deleteAccountBtn','mwDiagnosticsSend',
  'saveSettings','replayTour','mwSignOut','tourSkip','tourBack','tourNext','qsSkip','qsBack','qsNext',
  'paceAllYes','paceSomeNo','paceBack','mwPracticeExit','mwPracticeStart','mwPracticePause',
  'mwPracticeNext','mwPracticeSave','mwDobVerifySave','mwScSave','mwDeferSeasonDates',
  'mwAssessmentDeferDates','mwAthleteMembershipContinue','mwAthleteRestorePurchase','mwUtilityClose',
  'mwSelfPayMonthly','mwSelfPayAnnual','mwSupportSend','mwHomeMenuButton'
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


assert(html.includes('id="mwHomeMenuButton"'),'Athlete Home menu button must exist');
assert(html.includes('id="mwHomeMenu"'),'Athlete Home dropdown must exist');
for(const id of ['coach','messages','schedule','pacer']){
  assert(html.includes('data-open="'+id+'"'),'Athlete Home menu missing '+id+' destination');
}
assert(html.includes('data-open-settings'),'Athlete Home menu must include Settings');
assert(html.includes("window.mwCloseAthleteHomeMenu=close"),'Athlete Home menu must close after navigation');
assert(html.includes('#home .mwHomeShortcuts{display:none!important}'),'Legacy Home shortcut grid must stay hidden');
console.log('PASS: athlete Home secondary actions are consolidated into the dropdown menu.');


assert(html.includes('id="mw-home-stationary-v1"'),'Stationary Athlete Home stylesheet must exist');
assert(html.includes("document.body.classList.toggle('mw-home-locked',locked)"),'Home lock helper must toggle body scrolling state');
assert(html.includes("document.documentElement.classList.toggle('mw-home-locked',locked)"),'Home lock helper must toggle document scrolling state');
assert(html.includes('body.mw-auth-ready.mw-home-locked'),'Stationary Home CSS must override normal authenticated scrolling');
assert(html.includes('#home .mwHomeMenu{\n    max-height:min(70dvh,520px);'),'Home dropdown must remain internally usable on short screens');
console.log('PASS: Athlete Home is stationary on phone-sized screens while secondary views retain scrolling.');


assert(html.includes('position:fixed!important;'),'Stationary Home must hard-lock the body on iOS');
assert(html.includes('touch-action:manipulation!important;'),'Stationary Home must preserve taps while the body lock and touchmove guard prevent scrolling');
assert(html.includes("document.addEventListener('touchmove'"),'Stationary Home must block iOS touchmove rubber-banding');
assert(html.includes("e.preventDefault();"),'Stationary Home touchmove handler must cancel viewport movement');
assert(html.includes("if(e.target.closest('#mwHomeMenu'))return;"),'Home dropdown must remain independently scrollable');
assert(html.includes('mwSetHomeScrollLock(homeLocked);'),'View navigation must use the hard Home scroll lock helper');
console.log('PASS: iOS Athlete Home hard scroll lock prevents viewport panning while preserving menu scroll.');


assert(html.includes("$$('.nav button').forEach(x=>x.classList.toggle('active',x.dataset.v===id))"),'openView must update all bottom-nav buttons without throwing');
assert(html.includes("$$('.view').forEach(x=>x.classList.toggle('active',x.id===id))"),'openView must update all Athlete views without throwing');
assert(!html.includes("$('.nav button').forEach(x=>x.classList.toggle"),'Single-element selector must never be used with forEach for nav state');
assert(!html.includes("$('.view').forEach(x=>x.classList.toggle"),'Single-element selector must never be used with forEach for view state');
assert(!html.includes('touch-action:none!important'),'Stationary Home must not disable tap interactions');
console.log('PASS: stationary Home preserves bottom navigation taps.');
