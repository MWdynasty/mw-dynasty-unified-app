# October 6 continuation — launch evidence

Not ready for App Store submission. Preserve all existing accounts, payments, season dates and training history.

## Current inspected baseline

- GitHub main: `ff6d32080d4e37abf3712946ca5b46122744e752`.
- Production: `dpl_B1E5KURYeJBb6jKmY2KtRhXhwF2A`, READY, `app.mwdynasty.com`, same SHA.
- GitHub launch QA run `37531262767` succeeded on that SHA. This is not a signed upload.
- Production `mw-delete-account` version 7 was inspected before this patch. Apple purchase verification and notifications functions are ACTIVE; that does not prove working products, keys or purchases.

## Verified / unfinished / blocked

| Check | Status | Evidence / next gate |
| --- | --- | --- |
| TestFlight availability | Verified by user screenshot | MW Dynasty 3.0.16 (14), Open button. Installed binary signing/source provenance still needs App Store Connect inspection. Do not assume the uploaded Build 14 contains later native source changes just because its version matches. |
| Actual iPhone athlete observations | Partially verified | User recording October 6, approximately 198 seconds: app launch, MW loading screen, returning coach dashboard, athlete sign-in, athlete Home, default-off OpenAI consent choices, timed rep with Saved label, rest counter, targetless coach card with recorded reps, strength completion UI and Profile. Visible controls are not proof each was exercised successfully. |
| Athlete recording limitations | Unfinished | No demonstrated full Finish & Save plus cold-relaunch persistence, complete five reps, coach cross-account readback, subscription lifecycle, or tutorial completion in this recording. Three-second frame sampling is insufficient to certify pulse animation or stopwatch accuracy. |
| Practice integration | Verified automated, rerun on main | Real DOM/save handler/PostgreSQL/RLS: 16 athletes, 5 named groups, rename/assignment persistence, independent reps/rest, reset, refresh recovery, 32 correct athlete/coach results, replay without duplicates and cross-coach denial. |
| Workout/calendar/targetless metrics | Verified automated | `npm test` passed; includes coach calendar, timezone/rollover, targetless metrics and saved-target preservation. Existing production evidence remains in APPLE_RELEASE_20261006.md. Physical-device multi-group practice remains unfinished. |
| AI consent | Verified automated and visible on device | Default off, OpenAI disclosure and independent grants; client/RLS/provider-gate tests passed again. Device persistence and revocation need readback. |
| Deletion | Safety tests passed; end-to-end unfinished | Added malformed-JSON/shape/role/request-ID fail-closed guards. Handler tests use disposable transports, not real Auth deletion. Disposable in-app athlete deletion and coach request completion/timeframe remain open. |
| Payment-only access | Partial, not checkout verified | Previous isolated database replay proved active/period-end/expiry access rules. No fresh isolated checkout, webhook activation and logout/login evidence. Never cancel the owner's live subscription for QA. |
| Apple access | Blocked | Existing App Store Connect tab still shows Two-Factor Authentication and Incorrect verification code. No authenticated membership, role, products, signing integration or build history inspection. Complete securely; never send OTP/password/private keys in chat. |
| Apple subscription lifecycle | Blocked | Athlete/all coach plan sandbox purchase, restore, renewal, cancellation, expiry, grace, refund and account binding remain unverified. Use configured StoreKit IAP for intended native launch; do not assume website Stripe satisfies all storefronts. |
| Listing | Draft prepared, unfinished | Existing listing draft and support/privacy/terms links retained. Need actual selected-binary screenshots with synthetic data, final privacy/rating answers, working connected demo accounts and reviewer notes. Do not publish the supplied recording's personal profile or credentials. |
| Submission/public launch | Not submitted by this continuation | Access and verified device/payment/privacy requirements are not complete. No live App Store link has been verified. |

## User's immediate action

In the installed TestFlight app, sign in as Coach, select one designated test athlete, start an incomplete practice, time one rep and Finish & Save. Report the exact saved/error message. Then check the same athlete's profile and persistence. Never reset existing history or add synthetic performance to an unrelated athlete.

## Access required later

Active Apple Developer membership and App Store Connect App Manager access for MW Dynasty. Organization signing needs Certificates, Identifiers & Profiles access or owner-configured protected signing. Individual accounts require owner signing setup. Account holder completes agreements/tax/banking. Native StoreKit testing requires configured subscription products and sandbox testers. These remain distinct from possession of an older TestFlight build.
