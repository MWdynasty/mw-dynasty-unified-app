# MW Dynasty Apple release candidate preparation

Status: NOT READY FOR SUBMISSION. No signed-device release or TestFlight distribution has been verified.

## Evidence and preserved accounts

Production inspected at main f41f00b6f5c14f2f3c165065d76049befdf1bb14, Vercel dpl_2bon6JavsrvvZy4S3CnbgEXeEtYS. Coach signed-in browser: tutorial Finish persists after refresh; returning session opens Train; actual Practice recognizes the completed athlete workout and prevents re-timing it. November 2, 2026 season start remains unchanged. October 6 preseason preview is Week 1 Tuesday, technical accelerations plus strength.

The identified production athlete remains connected to its existing coach. Preserve all historical completions and recorded results. Do not use production accounts for cancellation, deletion or forced progression tests.

A paid athlete membership was verified against a live-mode Stripe checkout reference and active billing/entitlement records. A separate internal-test entitlement also exists, so successful access alone does not prove the paid gate. Secure athlete sign-in was offered and declined; sign-out/re-login access remains unverified. Use isolated sandbox accounts for subscription lifecycle tests. Private account identifiers and payment details are intentionally omitted from this release document.

Isolated model/DOM/PostgreSQL checks: sixteen athletes (eight boys/eight girls), four groups plus fifth, memberships/rename persistence, independent timing/rest, reset, refresh draft recovery, 32 correct athlete/coach results, immutable completion and idempotent replay. These are automated checks, not actual iPhone or tester observations.

## Candidate changes

Targetless sessions: recorded reps, best/average time, completion and equal-distance time variation; no invented pace score or fallback to stale 0/5 check-in. Athlete Progress retains recorded targets instead of recalculating history against today's plan/PR. Preserve the two coach bundles identically.

Native source: assemble archived base source with ios_v3_0_16_patch. Base includes AppDelegate, shared Xcode scheme, launch storyboard, permission descriptions and 1024px App Store icon. Apply patched Info.plist to both CI workflows; production URL app.mwdynasty.com. Native MW crest pulses while loading, respects Reduce Motion, hides on success/error. Purchase/permission bridge restricted to main-frame HTTPS production origin. Persistent WKWebView data store retained. Compile using Xcode/iOS SDK 26 or later. Version/build 3.0.16/14 is provisional: inspect previously uploaded builds before signing and uploading; bump monotonically if required.

## Payment release gates

Native StoreKit identifiers: com.mwdynasty.app.athlete.monthly; com.mwdynasty.app.coach.core.monthly; com.mwdynasty.app.coach.intelligence.monthly; com.mwdynasty.app.coach.sprintperformance.monthly. Production Apple verification and server-notification functions exist; deployment is not proof of configured Apple keys, approved products or renewal processing.

Use Apple IAP for digital membership in the initial native release. US storefront external purchase links have an exception; outside the US they require applicable entitlements/terms or are prohibited. Stripe web checkout is not a global native-payment solution. Audit sponsor seats and billing/support links across the actual native screens before enabling storefronts. Storefront distribution selection is pending owner decision and App Store Connect configuration.

Required isolated sandbox evidence for athlete and each coach plan: purchase activation, correctly bound appAccountToken, restore, pending/cancelled checkout, successful renewal, auto-renew disabled while paid period remains active, expiry, grace/billing retry, refund/revocation, out-of-order and duplicate notifications, wrong-account rejection. Do not charge or revoke a real user to obtain this evidence.

## Privacy gates

Verify actual in-app deletion for a disposable athlete and coach. Existing coach flow creates a deletion request; ensure completion, published processing time, deletion confirmation and subscription-management explanation. No production-history deletion for QA.

Document account/contact identifiers, age/eligibility, training and fitness results, measurements, messages, images/audio when provided, purchases, diagnostics and actual analytics behavior. Distinguish data linked to the user from tracking; do not submit guessed privacy answers. Location is optional Distance Marker; microphone/speech optional Coach MW; camera/photos optional uploads; notifications optional. Explain connected-coach visibility and disconnection/history treatment.

Before AI submission, clearly name the third-party AI provider and obtain explicit permission for personal data sent to it. Verify athlete permission before a coach includes that athlete's private data. Current policy wording alone is not evidence of an adequate consent flow. Audit user-generated messages/content reporting, blocking and support.

## Actual device and TestFlight acceptance

Record device model, iOS version, release build, tester role, date and evidence for each: install/cold start, native/web launch pulse, errors/retry, returning sessions, secure logout/relogin, tutorial Finish/replay, small-phone layouts, multiple-group practice (16 athletes plus fifth group), timing accuracy/tap ergonomics, Next Rep, per-heat rest, switch progress, rep reset, interruption/relaunch, Finish & Save, refresh persistence, correct coach/athlete visibility and no duplicates. Calendar checks must use isolated fixtures with coach timezone, Sunday/Monday, DST and rollover; preserve November 2 date. Collect tester feedback and retest reproducible fixes. Capture store screenshots only from the actual selected build.

## Listing draft

Name: MW Dynasty
Subtitle: Train. Track. Coach.
Description: MW Dynasty helps athletes and coaches keep their training connected. Follow track and strength workouts, run practice in groups and heats, record rep times and review saved results. Coaches can organize athletes and use the team season calendar to guide connected workouts. Optional Coach MW tools support training questions and planning. Eligible users must be 13 or older. Some features require a membership. Training information supports coaching decisions and is not medical advice.
Support URL: https://app.mwdynasty.com/support.html
Privacy URL: https://app.mwdynasty.com/privacy.html
Terms URL: https://app.mwdynasty.com/terms.html
Icon: existing archived AppIcon-1024.png; visually review on actual release before upload.
Screenshots: pending actual iPhone build, synthetic/demo data only.

Complete Apple's current rating questionnaire truthfully, including messaging/user content, AI and health/fitness features. 13+ eligibility is a product policy, not a claim that Apple has assigned a rating. Review calculated regional ratings and available higher-rating override before publishing. This is not a Kids Category submission.

## Review preparation

Provide working, isolated coach and athlete demo accounts connected to each other, with synthetic historical results, five or more saved groups, no real athlete data, stable access and a November/calendar fixture explained in review notes. Credentials must be supplied securely in App Store Connect, never committed here. Verify both accounts from the exact release binary.

Review instructions: choose Coach; sign in with supplied coach account; Team opens the connected demo athlete; Train opens prescribed practice; Practice offers Add group, Edit group, group/heat navigation, individual finish controls, independent rest and saved results. Use a fresh incomplete demo workout to time/save. Sign into Athlete with supplied athlete demo account; Progress shows the same saved session. Settings contains membership restore/manage, privacy/support and deletion controls. Explain optional permissions and native StoreKit purchases. Do not direct reviewers to erase real history.

Owner/access dependencies: Apple Developer membership; App Store Connect app/team access, agreements/tax/banking handled by owner; signing certificates/provisioning or authorized cloud signing integration; configured IAP products and server credentials; isolated sandbox accounts; actual iPhone testers and feedback; final privacy/age-rating decisions. Submission remains gated on the above verified evidence.

Official references checked October 6, 2026:
- https://developer.apple.com/app-store/review/guidelines/ (3.1 payments, 4.2 useful functionality, 5.1 privacy/deletion/third-party AI permission)
- https://developer.apple.com/news/upcoming-requirements/ (Xcode/iOS SDK requirements)
- https://developer.apple.com/help/app-store-connect/manage-app-information/set-an-app-age-rating
- https://developer.apple.com/help/app-store-connect/reference/app-information/age-ratings-values-and-definitions
