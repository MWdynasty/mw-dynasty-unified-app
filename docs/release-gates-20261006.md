# Release gate evidence — October 6, 2026

Not launch-ready. Automated, browser, backend, and physical-device evidence are distinct.

## Production inspected

- Initial production main: `1b9e2e6018973906c0035289b5b792e2df0d954d`, deployment `dpl_9isgyA8ecYjZ94Jo9Yk6VFYcrhWN`, READY.
- Correct connected coach authenticated in production. Coach tutorial completion and refresh session recovery observed in cloud browser, not iPhone.
- Designated athlete profile displayed 5 recorded reps, best 3.38s, average 3.75s, Completed, and 7.3% equal-distance variation with no pace target. No fabricated pace score.
- November 2, 2026 season start remains unchanged. Week 1 is a protected preseason preview.
- Today's workout was already saved. Start and Finish & Save were disabled. No reset, re-timing, or extra performance record was created.
- Read-only history baseline: 6 completed workouts and 29 rep-result rows existed at inspection.

## Reproducible fixes

- Athlete credentials used at Coach sign-in incorrectly entered Coach membership selection. Structured role errors now return to sign-in; only a verified unpaid Coach reaches checkout selection.
- Completed heat incorrectly said Ready. It now says Workouts already saved, explains protected existing results, and disables rep Reset.
- Matching coach bundles and returning-session paths are covered by executable regression tests.

## Checks passed

- `npm test` and `npm run test:coach-access`.
- DOM + Node + isolated Postgres practice integration: 16 athletes, four groups plus fifth, switching, reset, independent rest, refresh recovery, correct athlete saves, duplicate prevention, and completed-state protection. This is NOT physical-device testing.
- Disposable staging athlete authenticated, read its own profile, invoked the actual deletion endpoint, then failed relogin, user lookup, and refresh. SQL confirmed no fixture Auth user, profile, athlete, or session remained. No production account was deleted.
- `test-disposable-deletion-live.js` only accepts synthetic `mw-delete-…@example.invalid` fixtures and a public staging key; credentials are supplied at execution, never committed.

## Unfinished or blocked

- A fresh coach save and real-iPhone multi-group practice: existing assigned athlete's current workout is already completed; preserve it and use a designated incomplete disposable workout.
- Isolated provider purchase activation and athlete/coach restore, renewal, cancellation, expiry: state replay is not payment-provider evidence. No Apple subscription records were found in production at inspection.
- Full in-app deletion and coach deletion-request completion. Staging schema is not fully production-equivalent for coach deletion requests.
- Apple access blocked by rejected two-factor verification. No provenance verification of installed TestFlight 3.0.16 (14), new signed upload, or submission completed.
- Actual release-build screenshots, final App Store privacy/rating answers, review accounts and instructions require selected build, provider verification, and Apple records.
- No App Store submission or public release has occurred in this verification round.
