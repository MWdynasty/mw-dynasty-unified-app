# MW Dynasty 3.0.4 — App Store Candidate QA

## Completed in this build
- Unified app version: 3.0.4
- iOS native build number: 1
- Athlete in-app account deletion retained
- Coach in-app account deletion initiation added
- Coach deletion backend upgraded (`mw-delete-account` v2)
- Coach support now writes authenticated requests to the live MW support table
- Privacy policy expanded for athlete + coach data, AI, GPS location, microphone/speech, coach connections, retention, and deletion
- Native iOS permission purpose strings added for Location When In Use, Microphone, Speech Recognition, Camera, and Photo Library
- Native permission bridge added before Distance Marker GPS and Coach MW voice input
- Xcode-ready native iPhone project added under `ios-native/`
- App icons generated for iPhone + App Store marketing icon
- Native launch screen and offline/configuration error screen added

## Automated checks completed
- `node --check` passed for coach and distance JavaScript
- Inline JavaScript syntax checks passed for athlete, pace AI, distance marker, coach, and support pages
- Internal HTML asset-reference scan: 0 missing files
- 41-week × 3 track tiers × 3 strength tiers test: PASS
- `Info.plist`: valid plist
- `project.pbxproj`: valid plist/project syntax

## Required manual checks on a physical iPhone before TestFlight
1. Athlete sign-in / password reset / sign-out
2. Coach sign-in / sign-out
3. Athlete account deletion
4. Coach account deletion request
5. Coach support submission
6. Coach MW text, voice input, voice playback, and image upload
7. Distance Marker GPS permission and measurement
8. Pace quick check-ins and coach-side Performance Intelligence sync
9. Strength quick check-ins and coach-side sync
10. Privacy and Terms links
11. Dynamic type / rotation / smaller iPhone layout

## Before Xcode Archive
- Deploy the V3.0.4 web build to the final production HTTPS domain.
- Run `ios-native/set-production-url.sh https://YOUR-FINAL-DOMAIN` or edit `MWDynasty/Info.plist`.
- Choose your Apple Developer Team in Xcode Signing & Capabilities.
- Confirm the final bundle identifier before creating the App Store Connect record.

## V3.0.6 Pricing Sync Cleanup
- App display version synchronized to 3.0.6 / iOS Build 10.
- Athlete membership display reads `/api/pricing` with $19 locked fallback.
- Coach membership displays read `/api/pricing` and map by plan code with locked fallbacks.
- `membership_plans` is read-only to anon/authenticated and RLS exposes active plans only.
- One consolidated pricing SELECT policy remains (`mw_membership_plans_public_read`).
- Pricing API module mock test passed.
- 41-week × 3 track tiers × 3 strength tiers regression test passed.

## V3.0.7 Final Coach QA Patch
- More-menu navigation rebinding added for all rendered pages.
- Live coach search added across navigation, assigned athletes, groups, coach programs, and calendar events.
- Secure coach invitation server route added and browser-direct invitation creation removed.
- Program document importer added for PDF, Word (.docx), Excel (.xlsx/.xls), CSV, and TXT with editable coach review before save.
- Live in-app coach notifications added with unread badge, mark-read, and trigger-backed events.
- Supabase coach notification RLS policy test: PASS.
- Athlete reply → coach notification trigger test: PASS.
- Season Calendar authenticated write policy test: PASS.
- Coach invitation authenticated insert policy test: PASS.
- Coach program authenticated insert policy test: PASS.
- Coach groups/calendar/messages/activity/support authenticated insert tests: PASS.
- Attendance authenticated insert test for an assigned athlete: PASS.
- Invite API mock test: PASS.
- Notifications API mock test: PASS.
- TXT program-import API mock test: PASS.
- All JavaScript syntax checks: PASS.
- 41-week × 3 track tiers × 3 strength tiers regression test: PASS.

### TestFlight note
The notification bell is now live for in-app coach notifications. Native APNs push delivery still requires TestFlight/device-level Apple push configuration and should be tested during the iOS launch phase.

## V3.0.8 Elite Billing Transition QA
- Verify Coach Core invite can choose Coach Sponsored vs Athlete Self-Pay.
- Verify pending invitation shows the correct billing responsibility.
- Verify sponsored invite acceptance creates coach-sponsored athlete access with live tier seat pricing.
- Verify athlete membership screen clearly shows coach-sponsored vs individual billing.
- Verify self-pay continuation can be prepared without ending sponsorship early.
- Verify checkout does not launch before sponsorship ends.
- Verify transition grace protects access for 72 hours after handoff while payment completes.
- Verify coach upgrade keeps current tier until payment confirmation.
- Verify coach downgrade keeps current tier until paid-period end.
- Verify current coach test account remains Coach Core during Core QA.
- StoreKit and the final coach/web payment provider still require provider-side launch configuration and transaction verification.


## V3.0.9 Intelligence QA + Athlete Messaging
- [ ] Coach Intelligence has no unreadable black text on dark surfaces.
- [ ] Coach MW avatar/voice preference is in Account Settings, not duplicated on chat page.
- [ ] Coach MW assistant responses show Read Aloud and use authenticated /api/speak.
- [ ] Coach MW microphone captures speech where browser SpeechRecognition is supported.
- [ ] Rep tracking appears only as an MW Sprint Performance upgrade teaser in Coach Intelligence.
- [ ] Athlete Home shows Messages with unread badge.
- [ ] Athlete inbox loads coach messages and marks unread messages read when opened.
- [ ] Athlete can reply to coach from the message thread.
- [ ] Existing 41-week track/strength data remains intact.


## V3.0.11 communication / billing QA
- [ ] Coach inbox lists assigned athletes, latest message preview, timestamp, unread dot.
- [ ] Coach opens athlete thread and sees coach + athlete messages in chronological order.
- [ ] Athlete reply becomes read when coach opens thread.
- [ ] Athlete inbox lists coach conversations and unread badge.
- [ ] Athlete opens coach thread and can reply.
- [ ] Team/group announcements are separate from direct messages.
- [ ] Coach top-right mystery avatar is gone; search + notification bell remain.
- [ ] Athlete search returns Training, Coach MW, Messages, Progress, Profile, Settings, Tools, Training Year.
- [ ] No unreadable black text remains on dark coach/athlete surfaces.
- [ ] Intelligence rep tracking renders as locked upgrade teaser.
- [ ] Coach MW Read Aloud and microphone work.
- [ ] Coach invite email trial sends and sponsored invite creates usable athlete access.
- [ ] Coach upgrade UI displays prorated amount due now, not full target plan price.


## V3.0.12 Coach Intelligence capability accuracy
- Coach MW now reads the authenticated coach tier before loading detailed sprint context.
- Coach Intelligence no longer receives rep-by-rep sprint timing context.
- Coach Intelligence can use quick pace check-ins, workout completion, attendance, PRs, flags, program position, and strength check-ins/logs.
- Coach MW is explicitly prohibited from advertising Session RPE as a current workflow capability.
- Detailed timed-rep target comparisons, consistency, and first-to-last drop-off remain MW Sprint Performance only.
- Coach MW page wording now says "pace check-ins" instead of generic "pacing" for clearer tier accuracy.


## V3.0.13 Coach Account navigation fix
- Fixed Account on Coach Core, Coach Intelligence, and MW Sprint Performance.
- Restored the missing training-year settings renderer/binder that was throwing before Account could render.
- Account now opens with plan/billing, training-year settings, tutorial, privacy/support, and deletion controls.
- Training-year setting supports MW Standard vs Custom Week 1 and reads/saves through the authenticated season-calendar API.
- No coach-tier entitlement or training-program data changed.

## V3.0.14 sponsored-athlete entitlement QA

### Individual athlete
- Full MW 41-week training loads.
- Strength & Power, Sprint School, Smart Entry, Performance tools and full Coach MW are available.
- $19 monthly membership is shown; no annual option is displayed.

### Coach Core sponsored athlete
- Home identifies coach-sponsored/Core access.
- Training opens coach-assigned program(s), not the MW 41-week system.
- Athlete can log completed/partial/modified/skipped, RPE, pace status, reps hit/total and note.
- Activity/Progress shows coach-assigned check-in history.
- Messaging and basic Coach MW remain available.
- Coach MW can explain the assigned workout but does not perform trend intelligence, prescribe program changes, expose full MW methodology, or unlock Smart Entry/Sprint School/advanced tools.
- Direct Smart Entry, Pace AI, Distance Pacer and full MW program URLs fail closed.

### Coach Intelligence sponsored athlete
- Everything in Core works.
- Coach MW/performance intelligence may use permitted recent athlete performance context.
- Full MW 41-week program, Strength & Power, Sprint School, Smart Entry and advanced tools remain locked.
- Direct URLs fail closed for full-MW-only capabilities.

### MW Sprint Performance sponsored athlete
- Full MW athlete ecosystem is available.
- Smart Entry, 41-week track, synchronized Strength & Power, Sprint School and advanced tools load normally.
- Coach-assigned training remains compatible where assigned.

### Upgrade/downgrade behavior
- Core → Intelligence unlocks intelligence without new athlete account.
- Intelligence → Sprint Performance unlocks full MW features without losing athlete history/messages/check-ins.
- Downgrade removes higher-tier feature access at entitlement effective date but preserves historical records.
- Sponsorship ending does not silently create a duplicate $19 charge.

### Age/privacy/permissions
- Under-13 DOB is rejected by backend and onboarding cannot activate an athlete without a valid 13+ DOB.
- Location prompt occurs only when GPS distance measurement is chosen.
- Microphone/speech prompt occurs only when voice input is chosen.
- Camera/photo prompt occurs only when an image is chosen for Coach MW.
- Account deletion warns Apple-billed users that deleting MW account does not cancel Apple billing.

## V3.0.16 launch-hardening QA

- Athlete signup requires first name, last name, DOB, email, password, and Terms/Privacy acceptance.
- DOB younger than 13 is rejected client-side; production database trigger/RPC also reject under-13 DOBs.
- Existing non-test athlete with null DOB is prompted to verify age before normal athlete navigation.
- Internal non-billable prelaunch test athletes remain exempt so existing QA accounts are not broken.
- Public pricing endpoint uses a publishable/anon key only; no service-role fallback is allowed.
- Athlete annual billing remains disabled and no annual launch option is rendered unless the backend explicitly re-enables it later.
- App version is 3.0.16 and iOS build number is 6 across web/native source metadata.
- `npm test` must pass both the 41-week/tier synchronization test and `test-launch-integrity.js`.
- All JavaScript files must pass `node --check` before packaging.
- Final device QA still requires the signed/TestFlight build after deployment.
