# MW Dynasty — Season Intelligence V1 Implementation Checklist

This file is the source-of-truth checklist for the Season Intelligence rollout.
Do not merge to production until all required launch gates are checked.

## A. Non-negotiable architecture
- [x] Preserve the original 41-week MW program as the master training library.
- [x] Do not replace existing athlete workout history, rep logs, completion states, PRs, strength maxes, or tiers.
- [x] Add a season-plan layer above the 41-week library.
- [x] Map each athlete Season Week to an MW Master Source Week.
- [x] Keep Track and Strength on the same season week / phase clock.
- [x] Keep legacy 41-week athletes backward compatible when no season plan exists.
- [ ] Add explicit rollback notes and production migration rollback plan before release.

## B. Athlete identity / onboarding
- [x] Competition Level: 6th, 7th, 8th, 9th, 10th, 11th, 12th, Collegiate, Professional.
- [x] State where the athlete competes.
- [x] Season choice: Indoor, Outdoor, Both.
- [x] Competition path: School, AAU, USATF, NCAA, Professional/Open.
- [x] Keep existing age/DOB, events, PRs, experience, goals, and strength maxes.
- [x] Capture season start, first meet, primary championship/peak, and optional second peak.
- [x] Athlete can save/update season dates separately from Smart Entry without rerunning the full assessment.
- [x] Verified state-calendar dates now require an explicit Confirm/Edit step before MW creates the athlete season plan.
- [x] Athletes who do not know exact dates can defer season dates and continue temporarily on the standard MW calendar, then update dates later.

## C. State Season Registry
- [x] State-season registry schema exists.
- [x] Source URL, confidence, verified date, and season year are stored.
- [x] Alabama high-school outdoor seed exists as first registry example.
- [x] All 50 states now have 2027 high-school outdoor registry coverage in the isolated test database: 22 official, 14 official-peak/estimated-start, and 14 explicitly estimated pending fuller association calendars.
- [ ] Populate states that sanction high-school indoor track.
- [ ] Add middle-school calendar data where an official statewide calendar exists.
- [ ] Fall back to MW estimated ranges when no authoritative state calendar exists.
- [ ] Never present an estimate as an official state date.
- [ ] Annual refresh process for new state association calendars.
- [ ] Continue source upgrades as associations publish/finalize dates. The 50-state registry records source URL, confidence, season year, and verification timestamp; estimated rows must never be presented as official.
- [ ] Handle states where middle school schedules are district/local rather than statewide.
- [x] Athlete-confirmed dates override registry estimates; state-calendar dates are never silently locked without confirmation. Team/coach inheritance still pending.

## C2. Product entitlement boundary
- [x] Coach Core does NOT receive Season Intelligence.
- [x] Coach Intelligence does NOT receive the MW 41-week source-mapping/adaptive-programming engine.
- [x] Coach Intelligence receives Season Intelligence INSIGHTS for coach-authored programming without access to MW source-week mapping or automatic MW programming.
- [x] MW Sprint Performance receives the full Season Intelligence engine: state/season calibration, MW source-week mapping, Track + Strength synchronization, Smart Entry, and adaptive season planning.
- [x] Individual full MW Athlete membership follows full-MW access and may use the full athlete Season Intelligence experience.
- [x] Add explicit feature flags for season_intelligence_insights vs season_intelligence_engine before production UI rollout.

## D. Periodization rules
- [x] Foundation phase.
- [x] Pre-Competition phase.
- [x] Competition phase.
- [x] Peak / Championship phase.
- [x] Phase allocations work for condensed seasons and still total the exact available weeks.
- [x] Master-source mapping stays inside Weeks 1–41.
- [x] Source-week mapping is monotonic.
- [ ] Coaching signoff still required, but the actual mapping engine has been executed across 4, 6, 8, 10, 12, 16, 20, 24, and 41 weeks and passed exact-count, monotonicity, and 1–41 source-range checks.
- [x] Existing age + experience tier assignment remains active inside season-aware Smart Entry.
- [x] Existing Foundation / Development / Performance volume factors remain active after a Season Week maps to an MW Master Source Week.
- [x] Season-mapped program response carries a developmental load profile (age band, training years, track/strength tier, volume factor, recovery factor, RPE cap).
- [x] Athlete track + strength prescriptions now apply developmental volume directly; pace rep totals also follow the reduced prescription. Full regression QA still required before release.
- [ ] Age-appropriate middle-school taper / peak rules.
- [ ] High-school progression rules.
- [ ] Collegiate progression rules.
- [ ] Professional/open progression rules.
- [ ] Event-specific mapping review for 100m, 200m, 400m and multi-event sprint profiles.
- [ ] Ensure condensed plans do not skip indispensable technical or tissue-preparation progressions.

## E. Indoor + Outdoor + multi-peak continuity
- [x] Indoor + Outdoor can create separate season plans.
- [x] Outdoor continuation mapping does not automatically restart at Master Week 1.
- [ ] Add explicit transition/reload block between Indoor Peak A and Outdoor build.
- [ ] School Outdoor -> AAU / USATF continuation.
- [ ] AAU / USATF District -> Regional -> Nationals / Junior Olympics progression.
- [ ] Qualification-driven season extension without restarting Foundation.
- [ ] Athlete who does not qualify ends/recovery-transitions correctly.
- [ ] Collegiate Indoor -> Outdoor dual-peak model.
- [ ] Professional/open calendar with flexible target meets and multiple A meets.
- [ ] Support two primary championship targets when an athlete legitimately needs them.

## F. Meet intelligence
- [x] Competition target hierarchy schema added for athlete season plans, plus coach meet-priority fields.
- [x] Meet importance classification: C = training meet, B = important, A = peak/championship.
- [x] Adaptation policy explicitly prevents a full taper for B/C meets and separates primary-A vs qualifier-A freshness.
- [x] Coach can mark a meet as the primary target; athlete season plans store a primary championship target.
- [ ] Race-model and load adjustments around A/B/C meets.
- [ ] Meet reminders tied to the active season plan.
- [x] Performance-coach qualification workflow records qualified/not-qualified/completed and surfaces the dependent next target without silently changing the plan.

## G. Smart Entry
- [x] Smart Entry can read a Season Intelligence calendar.
- [x] Smart Entry can place an athlete into the current season rather than forcing Week 1.
- [x] Health/pain hold remains protected.
- [x] Existing track + strength tier recommendation remains.
- [x] Season-aware Smart Entry keeps the real championship clock intact.
- [ ] Test late join: 6 weeks before State.
- [x] Test late join: athlete entered in Competition phase and received SEASON-AWARE PROTECTED ENTRY rather than being forced back to Week 1.
- [x] Test late join: Peak window with insufficient readiness correctly returns CHAMPIONSHIP ENTRY — COACH REVIEW.
- [ ] Test returning athlete after 4+ weeks off.
- [ ] Coach/admin review path for risky late entries.
- [ ] Smart Entry explanation in Coach MW should state why the athlete was placed there.

## H. Attendance / missed workout adaptation
- [x] Existing lifecycle states preserved: scheduled, in-progress, incomplete, absent, completed.
- [x] Season-aware refresh uses the real season calendar.
- [x] Missing a workout does not push the championship date automatically.
- [x] Build adaptation rules for one missed session.
- [x] Build conservative adaptation rules for multiple missed/incomplete sessions and major disruption.
- [x] Never “make up” unsafe speed volume just because work was missed.
- [x] Policy removes/reduces low-priority volume first while preserving the next important speed exposure; session-level execution still requires integration QA.
- [ ] Recompute remaining load while protecting Peak date.
- [ ] Coach alert when missed training materially changes preparation.
- [ ] Athlete explanation: calendar moved, workload adapted, championship date did not.

## I. Weight room synchronization
- [x] Strength reads the same season-week mapping used by track.
- [x] Existing strength completion and set persistence remain.
- [x] Season-week schedule can map to a different 41-week Master Strength source week.
- [x] Integration QA confirms Track and Strength share the same season-plan source mapping; compatibility-by-phase still receives coaching review before launch.
- [ ] Competition lifting volume reduction validation.
- [ ] Peak priming / low-fatigue lifting validation.
- [ ] Indoor-to-outdoor strength reload logic.
- [ ] Missed lifting session adaptation without harming sprint quality.

## J. Coach / team integration
- [ ] Coach sees each athlete’s active season, phase, target championship, and weeks remaining.
- [x] Coach Season Intelligence context supports state, season, competition path, first practice, first meet, primary peak, secondary peak, and goal.
- [ ] Sponsored athletes can inherit the team calendar.
- [ ] Athlete/team override hierarchy is explicit and auditable.
- [x] Existing school breaks / exams / blocked dates feed Coach Intelligence insights and Performance engine context.
- [ ] Coach can override dates with an audit trail.
- [ ] Individual athlete can branch from team calendar if their season continues.
- [ ] Coach receives notification when athlete qualifies and plan extension is available.
- [ ] Coach dashboard shows Track + Strength synchronization status.
- [ ] Existing coach-assigned-program memberships remain distinct from MW full Sprint System behavior.

## K. Founder / support visibility
- [ ] Founder can inspect an athlete’s season-plan source and mapping.
- [ ] Diagnostics show Season Week, Phase, Source Week, target date, and calendar source.
- [ ] Founder/admin can identify state-registry records needing annual refresh.
- [x] Versioned season-plan revision history records who changed dates/maps, why, and before/after values.
- [ ] No silent automatic plan change without a stored reason.

## L. Coach MW AI awareness
- [x] Coach MW receives season context; source-week/engine internals are exposed only for MW Sprint Performance, not Coach Intelligence.
- [ ] Coach MW can explain “why am I on this week?”
- [x] Coach MW receives coach season contexts and calendar sources; state-estimate vs confirmed-date wording is guarded by product/source rules.
- [ ] Coach MW does not tell athlete a state estimate is guaranteed/official.
- [ ] Coach MW can explain missed-session adaptations.
- [x] Season Week and Master Source Week are separate fields in the engine; Coach Intelligence is blocked from source-week internals.

## M. UI / athlete experience
- [x] Competition level selector added on branch.
- [x] State selector added on branch.
- [x] Indoor / Outdoor / Both selector added on branch.
- [x] Competition path selector added on branch.
- [x] Indoor/outdoor date fields added on branch.
- [ ] Replace technical 41-week language where Season Intelligence is active.
- [ ] Athlete sees simple “Season Week X of Y” rather than Master Source Week.
- [ ] Athlete can see current Phase and target championship without clutter.
- [ ] Confirm/Edit estimated state-calendar screen.
- [ ] Both-season athlete can see Indoor target and Outdoor target cleanly.
- [ ] Mobile layout / iPhone safe-area QA.
- [ ] Desktop athlete web-app QA.
- [ ] Accessibility and form-validation QA.

## N. Security / data integrity
- [x] Season-plan tables use RLS.
- [x] Athlete can read only their own season plans.
- [x] Authorized staff read path exists.
- [x] Season-plan write goes through authenticated RPC.
- [x] Supabase security advisor run on the isolated Season Intelligence test database after migrations; feature-specific anonymous RPC exposure was hardened. Production advisor was also rerun after the approved RLS hotfix.
- [x] Supabase performance advisor run on the isolated test database; missing Season Intelligence FK indexes were added and duplicate permissive target/revision policies were consolidated.
- [x] Database integration QA with two synthetic athletes confirms an athlete sees only their own season plan/targets/revision history; season-plan write RPC resolves ownership from auth.uid().
- [x] Database integration QA confirms Coach Intelligence sees zero full MW season plans/targets, while an assigned MW Sprint Performance coach sees only the assigned athlete’s plan/targets/revisions.
- [ ] Validate all date and enum inputs server-side.
- [x] Plan revision integration QA preserves revision number, reason, prior peak date, and new peak date; Coach Intelligence is blocked from revision RPC.

## N2. Developmental loading regression tests
- [x] New/young athlete resolves to Foundation loading.
- [x] Experienced adult athlete can resolve to Performance loading.
- [x] 13-year-old / first-season scenario resolves Foundation track + strength loading at 65% volume with higher recovery and lower RPE cap.
- [x] 15-year-old / 2-years experience scenario resolves Development track + strength loading at 85% volume; source-week mapping remains independent of developmental volume.
- [ ] 17-year-old advanced loading resolves Performance volume correctly; event-specific 400m mapping review is still pending.
- [x] Adult/pro developmental-loading scenario resolves Performance volume with no youth age-band restrictions; flexible competition-calendar QA still pending.
- [x] Actual program-service execution confirms age/experience changes displayed track reps and strength sets/RPE while the season/championship mapping stays unchanged.
- [x] Actual program-service execution confirms developmental loading applies to both Track and Strength.

## O. Required test matrix before production
- [x] Existing legacy 41-week athlete: legacy track key remains mw-track-wX-dY, strength cycle remains mw-41, and no season plan is attached.
- [x] 8th grade / Alabama / Outdoor / 12-week synthetic season successfully maps Season Week 7 to MW Source Week 31.
- [ ] 10th grade / Alabama / Outdoor / state estimate -> confirm.
- [ ] High school / Indoor only.
- [ ] High school / Indoor + Outdoor.
- [ ] High school / Outdoor + AAU.
- [ ] High school / Outdoor + USATF.
- [x] Late-entry competition-window scenario (~6 weeks from the original test peak) stays on the real season clock and uses protected Smart Entry instead of restarting Foundation.
- [ ] Athlete misses one session.
- [ ] Athlete misses a full week.
- [ ] Athlete qualifies from Regional to National/JOs.
- [ ] Athlete does not qualify and season closes.
- [ ] Collegiate Indoor + Outdoor.
- [ ] Professional athlete with flexible outdoor schedule.
- [x] Database integration QA confirms Track and Strength carry the same season-plan identity and source-week mapping (including Season Week 6 -> Source Week 24 and Season Week 7 -> Source Week 31).
- [x] Rep logging persists through season mapping: saved rep data converts a past session to incomplete rather than absent and retains season_plan_id/source_program_week.
- [ ] Next Rep button still works.
- [ ] Finish & Save still works.
- [ ] Incomplete session still resumes.
- [x] Absent vs incomplete remains distinct for both track and strength in isolated database lifecycle QA.
- [ ] Coach dashboard reads the correct athlete season state.
- [x] Smart Entry review/guardrail behavior passes isolated DB QA, including Peak low-readiness review and pain hold.
- [x] Season Intelligence entitlement boundary passes DB QA: Core=none, Intelligence=insights, MW Sprint Performance=engine.

## P0. National outdoor registry gate
- [x] Founder made nationwide high-school outdoor coverage a prerequisite to interactive preview QA.
- [x] 50 distinct states are present for high-school outdoor 2027.
- [x] All 50 records have start/peak anchors, provenance, confidence, and verification timestamps.
- [x] Registry date integrity check: 0 missing anchors, 0 reversed anchors, 0 first-meet-before-start errors.
- [x] All 50 derived season lengths fall inside the Season Intelligence engine range (11–20 weeks).
- [x] State-calendar proposals still require Confirm/Edit before activation.
- [ ] Upgrade remaining estimated/partial records when governing associations publish fuller 2027 dates. Arkansas, South Carolina, and West Virginia were upgraded to official after source verification; Missouri was upgraded to official-peak/estimated-start.
- [ ] Build indoor-state registry coverage after outdoor national QA is locked.
- [ ] Begin interactive preview QA only after the national registry behavior is signed off.

## P. Deployment gates
- [x] Work isolated on feature/season-intelligence-v1.
- [x] Production main branch not replaced during initial build.
- [ ] Full Node regression suite must run in CI/preview. Static JavaScript syntax checks pass in development review.
- [x] Season Intelligence migration chain and follow-up hardening migrations apply successfully on the isolated free Supabase test project.
- [x] Vercel preview build succeeded and an isolated Supabase test target now exists.
- [ ] Founder manual QA on preview.
- [ ] Coach pilot QA.
- [ ] Athlete pilot QA.
- [ ] Regression QA for track, strength, reps, auth, payments, and coach dashboard.
- [ ] Merge to main only after preview approval.
- [ ] Production migration.
- [ ] Production smoke test.
- [ ] Monitor runtime/Supabase errors after release.

## Launch principle
The championship date is the anchor. State/level helps estimate the season; confirmed athlete or coach dates override estimates. MW keeps the 41-week program as its master knowledge base, maps the athlete’s real Season Week to an MW Source Week, keeps Track + Strength synchronized, and adapts around missed work without moving the athlete’s real championship date.


### Database integration evidence — isolated test project
- [x] Completed session remains completed after season refresh.
- [x] Saved track reps turn an unfinished past session into incomplete, not absent.
- [x] Untouched past track session becomes absent.
- [x] Saved strength sets turn a past strength session into incomplete.
- [x] Untouched past strength session becomes absent.
- [x] Season-plan revision audit stores before/after championship dates and required reason.
- [x] RLS target/revision access re-tested after policy consolidation.
- [x] Feature-specific FK advisor findings were reduced to expected unused-index notices on the tiny synthetic dataset.
- [ ] Athlete UI interaction QA still required for Next Rep and Finish & Save. Practice Mode was hardened so it now uses the server-selected prescribedWork first, preventing developmental rep-count mismatches from hiding Finish & Save.
- [ ] Full latest-head Node/CI regression run still required.


### Registry verification evidence
- [x] Alabama high-school outdoor 2027 verified against the AHSAA 2026-2031 Five-Year Calendar.
- [x] Official AHSAA dates used by the registry: first spring practice Jan 18, Track first contest Feb 25, State Track & Field May 6-8.
- [x] MW stores May 8 as the single peak anchor while the source label preserves the official May 6-8 championship range.
- [x] Registry UI requires athlete confirmation/edit before a verified state calendar becomes the athlete's active season plan.


### Interactive preview QA — active
- [x] Latest Vercel preview deployment reports Ready for the Season Intelligence feature branch.
- [x] Static preflight confirms Practice Mode buttons are wired: Start Practice -> beginRep, Finish Rep -> finishRep, Save & Finish -> saveWorkout.
- [x] Practice Mode restores existing rep rows and keeps Finish & Save hidden until timed rep requirements are satisfied.
- [x] Practice Mode now reads server-selected prescribedWork before local tier fallback.
- [ ] LIVE CLICK QA: Start Practice -> Finish Rep -> next rep -> saved rep restoration.
- [ ] LIVE CLICK QA: Save & Finish workout persists completion and reloads correctly.
- [ ] LIVE CLICK QA: strength set logging persists and completed/incomplete/absent states render correctly.
- [ ] LIVE CLICK QA: athlete Confirm/Edit state-calendar flow.
- [ ] LIVE CLICK QA: athlete "I don't know yet" season-date deferral.
- [ ] LIVE CLICK QA: Coach Core / Intelligence / MW Sprint Performance season views.
- [ ] LIVE CLICK QA: phone-width and desktop-width rendering.
- [ ] BLOCKER: current ChatGPT Vercel connection is not authorized for the mw-sprint team, so the protected preview cannot yet be opened for actual click-through QA from this session.
