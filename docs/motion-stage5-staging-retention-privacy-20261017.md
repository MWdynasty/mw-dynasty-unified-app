# MW Motion Intelligence — Stage 5 staging privacy, revocation and retention

Date: 2026-10-17
Environment: **Phase 1 Staging** Supabase `uuggbmccnyswiwkjgydo`; GitHub branch `feature/motion-intelligence-foundation`.

## Implemented and deployed to staging

- Pilot Edge API checks admin-controlled `motion_pilot_approvals` for **prepare**, **finalize** and **playback**. A revoked/expired account cannot request new signed playback links or finalize uploads. `eligibility` returns a boolean for browser gating, without exposing date of birth.
- The athlete staging pilot gates **both** private video upload and local pose analysis on verified adult approval; local pose analysis rechecks approval before processing.
- Deletion now **tombstones** the assessment before removing storage objects, immediately blocking new playback and preventing a concurrent finalize from resurrecting a deleted recording. The tombstone retains the upload intent while its 2-hour signed upload token expires; previously issued 60-second playback URLs may persist briefly.
- Staging RLS hides deleted assessments, assets and findings from authenticated Data API reads. Separate authenticated users only have owner-scoped read policies. No direct client write grants on private video metadata or private storage.
- `mw-motion-maintenance` Edge function is deployed with `verify_jwt=true` and a **service-role-only** authorization check, bounded to 20 assessments per invocation. It defaults to **dry-run**. It can delete eligible objects and assessment metadata only when explicitly called with `{"execute":true,"dryRun":false}`.
- Maintenance eligibility: pilot assessments older than **14 days**; abandoned draft uploads more than **one hour after** their two-hour upload token expiry; and deleted tombstones after that same token grace period. The code verifies that each object path belongs to the assessment owner before deletion, deletes storage objects before DB rows, and records audit events. Any failures are counted for retry.
- Synthetic automated tests cover 14-day boundaries, token grace, owner-path isolation, tombstones, authorization guards and cancellation. Real cross-user browser/media testing remains pending.

## Not yet enabled

**The maintenance function is deployed but has no automatic schedule or configured Vault credential. The 14-day retention policy is therefore NOT yet operational.** Do not claim automatic deletion is active. The UI explicitly discloses this. The staging database and storage bucket had no pilot video records at the last predeployment check.

## Before activating automatic deletion

1. Review and approve the **14-day staging-only** retention period. This is not a production retention policy.
2. Run a real, authenticated **dry-run** using a trusted operator with a server-side service key; confirm the results contain no unexpected eligible recordings.
3. Set up `pg_cron` + `pg_net` and store the service key securely in **Supabase Vault**. Do not paste a service key into a repository, frontend, chat transcript, GitHub Actions log, or SQL migration.
4. Schedule the service-only Edge function daily with `{"execute":true,"dryRun":false,"limit":20}` after dry-run review. Monitor response status and failures. A 207 response means some items failed; retry and investigate.
5. Validate retention deletion with two synthetic adult staging accounts, an expired pending upload, a deleted tombstone, and a live stored clip. Verify private storage and metadata are both gone, that a late upload token cannot resurrect a clip, and that cross-account access is denied.
6. Add observability/alerting for scheduler failures and a privacy request workflow. Establish a retention policy and guardian-consent architecture for ages 13–17 before any production release.

## Remaining release gates

- Backend video duration/content inspection is **not** implemented; the current 30-second duration check is browser-side and cannot be trusted as a server-side guarantee.
- The signed upload token is valid for two hours; revocation prevents finalize but cannot retroactively invalidate a token already issued.
- Video accuracy and mobile compatibility are not validated with real footage. Experimental 2D angles are not coaching recommendations.
- Do not enable uploads for minors, use production accounts, merge to `main`, or promise automatic deletion until all gates are satisfied.

References:
- Supabase signed upload URL documentation: https://supabase.com/docs/reference/javascript/storage-from-createsigneduploadurl
- Supabase Edge scheduling: https://supabase.com/docs/guides/functions/schedule-functions
- Development PR: https://github.com/MWdynasty/mw-dynasty-unified-app/pull/191
