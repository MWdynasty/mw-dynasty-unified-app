# Pace targets from available PRs and time trials

Athletes can supply any one full-effort standing/block-start result at 100m,
150m, 200m, 300m, 400m or 500m. The existing 60m profile field also remains supported.
Missing times stay blank. Workout logs are not automatically promoted to best marks.
Optional result type, timing method and date travel with measured results.

`lib/mw-pace-model.js` supplies the same deterministic calculation to athlete
practice, Pace AI, coach calculators/grouping, and coach practice heats:

- A recorded mark at the prescribed distance is used directly.
- Between usable recorded distances, log-distance/log-time interpolation uses
  the athlete's own marks. Existing 100m/200m/400m interpolation is retained.
- Outside the recorded range, the nearest usable pair supplies extrapolation.
- With only one result or inconsistent paired marks, a provisional power-law
  exponent of **1.10** provides a starting reference. This is an explicit MW
  heuristic, **not a validated prediction of individual sprint performance**.
  Additional nearby trials should replace that assumption with personal data.
- The reference time is divided by prescribed speed intensity. Computed times
  are not stored as PRs. Cross-distance targets are labeled estimates.
- The displayed +/-1% execution zone is a training tolerance, not a statistical
  confidence interval or a claim about prediction accuracy.

Recorded trial times and race PRs differ via `athlete_prs.mark_type`. The table
retains its existing one-result-per-athlete/per-distance storage model: explicitly
editing a result replaces that distance's active reference; this is not a separate
race/trial history store. Existing account, ownership and RLS rules remain in place.
Legacy numeric-string RPC calls still work and preserve stored metadata.

## Verification

`npm test` and `npm run test:coach-access` pass. Single-result scenarios for each
of the six requested distances exercise all target distances, direct measured
marks, interpolation, refinement, invalid/missing input, and athlete/coach/Pace AI
parity. Trial metadata saving is tested through the API handlers. A rollback-only
production RPC test verified saving all three new distances plus metadata and
legacy-input compatibility without keeping test account edits.

Signed-in mobile/desktop browser verification is still pending. The mathematics
is deterministic and provisional; it has not been calibrated against a population
of measured sprint trials.
