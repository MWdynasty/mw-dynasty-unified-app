'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {effectiveCalendar}=require('./server/lib/mw-season-calendar');

async function main(){
  const originalFetch=global.fetch;
  const requested=[],rows=[
    {calendar_mode:'custom',season_start_date:'2026-09-07',source:'assigned_coach',coach_user_id:'coach-1'},
    {calendar_mode:'standard',season_start_date:null,source:'assigned_coach',coach_user_id:'coach-1'}
  ];
  global.fetch=async(url)=>{
    requested.push(String(url));
    assert.match(String(url),/rpc\/mw_effective_season_calendar/,'assigned coach calendar is resolved before any athlete-owned plan');
    return {ok:true,status:200,json:async()=>[rows.shift()]};
  };
  try{
    const calendar=await effectiveCalendar('test-token',{now:new Date('2026-10-05T12:00:00Z')});
    assert.equal(calendar.calendarOwner,'coach');
    assert.equal(calendar.source,'assigned_coach');
    assert.equal(calendar.startDate,'2026-09-07');
    assert.equal(calendar.week,5);
    assert.equal(requested.length,1,'coach-managed athlete must not reconcile or create a second athlete season plan');
    const standard=await effectiveCalendar('test-token',{now:new Date('2026-10-05T12:00:00Z')});
    assert.equal(standard.calendarOwner,'coach','assigned athletes remain on the team standard calendar before a custom team season is saved');
    assert.equal(standard.source,'assigned_coach');
    assert.equal(requested.length,2,'assigned athletes must not fall back to their own plan when the coach has not set custom dates yet');
  }finally{global.fetch=originalFetch}

  const program=fs.readFileSync('server/api/program.js','utf8');
  assert(program.includes("authority.calendar?.calendarOwner==='coach'"),'athlete Today/program must identify the coach-owned calendar');
  assert(program.includes('if(c.athlete&&c.token&&!coachCalendar)'),'coach-managed athletes must not reconcile a separate athlete season plan');
  assert(program.includes('if(plan?.id&&!coachCalendar)'),'coach-owned schedules must not be remapped by a separate athlete plan');
  const roster=fs.readFileSync('server/api/coach/roster.js','utf8');
  assert(roster.includes('teamPosition||programPosition(st,plan,rosterNow)'),'coach roster and athlete Today must share the coach calendar week');
  const coachIntel=fs.readFileSync('server/api/coach/season-intelligence.js','utf8');
  assert(coachIntel.includes("request('coach_season_settings?on_conflict=coach_user_id'"),'Coach Season Intelligence saves the canonical team calendar');
  const athlete=fs.readFileSync('athlete/index.html','utf8');
  assert(athlete.includes('details class="question mwOptionalDetails"'),'athlete performance data is available but not required during short setup');
  assert(athlete.includes("eyebrow:'3. RECORD YOUR WORK'"),'athlete onboarding teaches workout recording');
  assert(athlete.includes('data-open-settings aria-label="Settings"'),'athlete settings are a separate gear action');
  assert(!athlete.includes('data-open-settings role="menuitem" class="mwHomeMenuSettings"'),'athlete settings are not mixed into the Menu list');
  assert(athlete.includes('USE MW STANDARD CALENDAR & BUILD MY SEASON'),'athletes explicitly confirm a safe default calendar before building their season');
  const coach=fs.readFileSync('coach/app.js','utf8');
  const core=coach.slice(coach.indexOf('  core:[',coach.indexOf('const COACH_MOBILE_TOURS=')),coach.indexOf('  intelligence:[',coach.indexOf('const COACH_MOBILE_TOURS=')));
  assert(!core.includes('Coach MW'),'Coach Core tutorial does not mention or spotlight Coach MW');
  assert.equal((core.match(/title:/g)||[]).length,4,'Coach Core tutorial is a concise four-step workflow');
  assert(coach.includes("title==='Menu'?'<button class=\"icon-btn\" type=\"button\" data-page=\"account\" aria-label=\"Settings\""),'coach settings are a separate gear action on Menu');
  assert(!coach.includes("['account','⚙️','Settings / Profile'"),'coach settings are not listed as a Menu tile');
  assert(coach.includes('Profile → connect athletes → set the team season'),'coach Home shows the simplified first-run order');
  console.log('PASS: coach-owned season controls athlete Today and coach roster; onboarding is shorter and AI remains optional.');
}
main().catch(e=>{console.error(e);process.exitCode=1});
