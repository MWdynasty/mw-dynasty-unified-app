const assert=require('assert');
const fs=require('fs');
const {resolveFromCalendar,applyAuthoritativeState}=require('./server/lib/mw-authoritative-state');
const {evaluatePerformance}=require('./server/lib/mw-performance-intelligence');

const now=new Date('2026-09-25T12:00:00Z');

const reconciled=resolveFromCalendar(
  {current_week:3,current_day:5,current_phase:1,source_program_week:3,program_status:'active'},
  {mode:'custom',status:'active',week:2,phase:1,startDate:'2026-09-18'},
  {now}
);
assert.equal(reconciled.authority,'season_intelligence');
assert.equal(reconciled.week,2);
assert.equal(reconciled.day,5);
assert.equal(reconciled.sourceWeek,2);
assert.equal(reconciled.diverged,true);
assert.equal(reconciled.storedWeek,3);

const mapped=resolveFromCalendar(
  {current_week:9,current_phase:2,source_program_week:9},
  {mode:'season_plan',status:'active',week:4,phase:3,phaseCode:'pre_competition',sourceWeek:18,seasonLengthWeeks:12},
  {now}
);
assert.equal(mapped.week,4);
assert.equal(mapped.sourceWeek,18);
assert.equal(mapped.phase,3);
assert.equal(mapped.phaseCode,'pre_competition');

const fallback=resolveFromCalendar({current_week:7,current_day:3,current_phase:1,source_program_week:7},null,{now});
assert.equal(fallback.authority,'program_state_fallback');
assert.equal(fallback.week,7);
assert.equal(fallback.sourceWeek,7);

const applied=applyAuthoritativeState({current_week:3,current_phase:1},reconciled);
assert.equal(applied.current_week,2);
assert.equal(applied.state_authority,'season_intelligence');
assert.equal(applied.stored_current_week,3);
assert.equal(applied.week_diverged,true);

const ready=evaluatePerformance({
  recentWorkouts:[
    {completion_status:'completed',session_rpe:7,pace_reps_total:4,pace_reps_hit:4},
    {completion_status:'completed',session_rpe:8,pace_reps_total:4,pace_reps_hit:4}
  ],
  recentPaceLogs:[
    {program_week:2,program_day:5,rep_number:2,target_seconds:30,actual_seconds:30.2},
    {program_week:2,program_day:5,rep_number:1,target_seconds:30,actual_seconds:30.0}
  ],
  recentStrengthLogs:[{set_rpe:8}]
},{coachManaged:false,officialWeek:2,officialDay:5});
assert.equal(ready.status,'ready');
assert.equal(ready.directive.code,'continue_as_planned');

const monitor=evaluatePerformance({
  recentWorkouts:[{completion_status:'completed',session_rpe:9,pace_reps_total:4,pace_reps_hit:3}],
  recentPaceLogs:[],
  recentStrengthLogs:[]
},{coachManaged:false,officialWeek:2,officialDay:5});
assert.equal(monitor.status,'monitor');
assert.equal(monitor.automaticChange,'protect_optional_load_only');
assert.equal(monitor.directive.code,'protect_quality');

const review=evaluatePerformance({
  recentWorkouts:[
    {completion_status:'completed',session_rpe:9.5,pace_reps_total:4,pace_reps_hit:1},
    {completion_status:'completed',session_rpe:9.2,pace_reps_total:4,pace_reps_hit:2}
  ],
  recentPaceLogs:[
    {program_week:2,program_day:5,rep_number:2,target_seconds:30,actual_seconds:32.5},
    {program_week:2,program_day:5,rep_number:1,target_seconds:30,actual_seconds:30.2}
  ],
  recentStrengthLogs:[]
},{coachManaged:true,officialWeek:2,officialDay:5});
assert.equal(review.status,'coach_review');
assert.equal(review.requiresCoachReview,true);
assert.equal(review.automaticChange,'none_coach_authority');
assert.equal(review.directive.code,'review_before_progression');

const athleteHtml=fs.readFileSync('athlete/index.html','utf8');
assert(athleteHtml.includes("mwSeasonCalendar?.week||mwRemoteProfile.authoritativeWeek||mwRemoteProfile.week"),'Athlete week helpers must prefer Season Intelligence');
assert(athleteHtml.includes("mwRemoteProfile.week=String(seasonWeek)"),'Loaded Season Intelligence calendar must update the remote profile week');
assert(athleteHtml.includes("TRAINING READY · LOAD MONITORED"),'Athlete Home must surface monitored workload response');
assert(athleteHtml.includes("COACH REVIEW RECOMMENDED"),'Athlete Home must surface coach-review response for coach-managed athletes');

const smartEntry=fs.readFileSync('server/api/smart-entry.js','utf8');
assert(smartEntry.includes("rpc/mw_submit_smart_entry_v3"),'Smart Entry must use the season-authoritative v3 RPC');
assert(!smartEntry.includes("seasonAware=calendar.mode==='season_plan'"),'Smart Entry must not reserve season-aware behavior only for season plans');
assert(smartEntry.includes("'strength_speed'"),'Standard 41-week Strength & Speed phase must be represented in season-aware Smart Entry');

const migration=fs.readFileSync('supabase/migrations/20260925_season_intelligence_authority_v2.sql','utf8');
assert(migration.includes("p_season_phase not in ('foundation','strength_speed','pre_competition','competition','peak')"));
assert(migration.includes("'authority_version','mw-season-intelligence-authority-v2'"));

console.log('PASS: Season Intelligence is the authoritative week and performance response is deterministic, coach-gated, and visible.');
