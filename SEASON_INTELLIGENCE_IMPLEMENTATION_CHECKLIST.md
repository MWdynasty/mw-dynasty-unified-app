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
- [ ] Allow athlete to edit season information later without rerunning the entire onboarding unnecessarily.
- [ ] Add clear “MW estimated these dates — Confirm / Edit” flow after state lookup.
- [ ] Support athletes who do not know exact dates yet without trapping onboarding.

## C. State Season Registry
- [x] State-season registry schema exists.
- [x] Source URL, confidence, verified date, and season year are stored.
- [x] Alabama high-school outdoor seed exists as first registry example.
- [ ] Populate all supported states for high-school outdoor calendars.
- [ ] Populate states that sanction high-school indoor track.
- [ ] Add middle-school calendar data where an official statewide calendar exists.
- [ ] Fall back to MW estimated ranges when no authoritative state calendar exists.
- [ ] Never present an estimate as an official state date.
- [ ] Annual refresh process for new state association calendars.
- [ ] State association / governing-body source review before each season.
- [ ] Handle states where middle school schedules are district/local rather than statewide.
- [ ] Coach/team dates and athlete-confirmed dates override state estimates.

## C2. Product entitlement boundary
- [x] Coach Core does NOT receive Season Intelligence.
- [x] Coach Intelligence does NOT receive the MW 41-week source-mapping/adaptive-programming engine.
- [ ] Coach Intelligence may receive Season Intelligence INSIGHTS for its own coach-authored program: calendar context, weeks-to-championship, athlete trend/risk flags, and AI analysis without exposing or generating MW methodology.
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
- [ ] Validate phase ratios for 6, 8, 10, 12, 16, 20, 24, and 41-week real coaching scenarios.
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
- [ ] Test late join: already in Competition phase.
- [ ] Test late join: Peak window with insufficient readiness.
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
- [ ] Verify Foundation track never pairs with an incompatible late-season strength source.
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
- [ ] Run Supabase security advisor after migration (not run yet because the feature migration has intentionally not been applied to production).
- [ ] Run Supabase performance advisor after migration.
- [ ] Verify no athlete can activate/edit another athlete’s plan in database integration QA; RLS/RPC ownership checks are implemented.
- [ ] Verify coach access only applies to assigned athletes in integration QA; full season-plan/target access is restricted to assigned MW Sprint Performance coaches.
- [ ] Validate all date and enum inputs server-side.
- [ ] Ensure plan-history/audit records cannot be silently overwritten.

## N2. Developmental loading regression tests
- [x] New/young athlete resolves to Foundation loading.
- [x] Experienced adult athlete can resolve to Performance loading.
- [ ] 13-year-old / 100m / first season: condensed season + Foundation volume.
- [ ] 15-year-old / 200m / 2 years experience: Development volume + correct source-week map.
- [ ] 17-year-old / 400m / advanced: event-specific season mapping + appropriate tier volume.
- [ ] Adult/pro athlete: Performance volume, no youth restrictions, flexible calendar.
- [ ] Confirm age/experience affects HOW MUCH training is prescribed without changing the championship anchor.
- [ ] Confirm age/experience loading applies to both Track and Strength.

## O. Required test matrix before production
- [ ] Existing legacy 41-week athlete: unchanged.
- [ ] 8th grade / Alabama / Outdoor / short season.
- [ ] 10th grade / Alabama / Outdoor / state estimate -> confirm.
- [ ] High school / Indoor only.
- [ ] High school / Indoor + Outdoor.
- [ ] High school / Outdoor + AAU.
- [ ] High school / Outdoor + USATF.
- [ ] Athlete joins 6 weeks before State.
- [ ] Athlete misses one session.
- [ ] Athlete misses a full week.
- [ ] Athlete qualifies from Regional to National/JOs.
- [ ] Athlete does not qualify and season closes.
- [ ] Collegiate Indoor + Outdoor.
- [ ] Professional athlete with flexible outdoor schedule.
- [ ] Track + Weight Room always show same Season Week/phase.
- [ ] Rep logging persists through season mapping.
- [ ] Next Rep button still works.
- [ ] Finish & Save still works.
- [ ] Incomplete session still resumes.
- [ ] Absent vs incomplete remains distinct.
- [ ] Coach dashboard reads the correct athlete season state.
- [ ] Smart Entry lock/review behavior still works.
- [ ] Subscription / entitlement behavior unchanged.

## P. Deployment gates
- [x] Work isolated on feature/season-intelligence-v1.
- [x] Production main branch not replaced during initial build.
- [ ] Full Node regression suite must run in CI/preview. Static JavaScript syntax checks pass in development review.
- [ ] Database migration tested safely before production.
- [ ] Preview deployment created (held until the database migrations have a safe test target).
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
