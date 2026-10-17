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

## Additional Stage 3 hardening (2026-10-17)

- The mobile staging sign-in now has its **own visible error/status area**; users no longer receive invisible sign-in errors while the recording panel is hidden. The pilot gate also displays an explanation when opened outside an authorized MW Vercel preview.
- The athlete preview only switches to the separate staging backend when the preview hostname matches the MW project family **and** `?motionPilot=1` is present. Production website domains are excluded.
- A **full two-user synthetic Edge lifecycle test** now exercises prepare, signed upload authorization, actual storage metadata checks, finalize, private playback, cross-account denial, delete, invalid-path rejection, retry finalization and approval revocation. These tests use mocked storage and database calls, **not** a live media upload.
- The browser has a centralized 30-second duration check, with tests for the exact 30-second boundary, too-long clips and invalid/infinite durations. This is **not server-side media verification**.
- If upload succeeds but the final save fails, the staging UI now offers **Retry Saving Uploaded Video** without uploading a duplicate, plus **Discard Unfinished Video**. Failed uploads attempt best-effort tombstone cleanup.
- Private video deletion checks every storage path against the assessment owner before removing any object. Staging `mw-motion-pilot` Edge deployment **v7** includes this guard and the additional playback-retention checks.
- The latest preview was fetched over the network and returned **HTTP 200** with the updated sign-in UI. This confirms the route is served; it is not proof of authenticated upload/playback.

## Stage 6 — Access expiration independently of cleanup

- The server now refuses to issue new playback links for recordings older than **14 days**, even if automatic file deletion has not yet run. History also excludes expired recordings. This is an **access restriction**, not evidence of physical file deletion.
- Recordings in `draft` state cannot be played, including when an asset row was partially created before finalization.
- The tests cover 15-day-old uploads, history exclusion, still-valid recordings and draft assets using the real Edge handler with synthetic database/storage mocks.
- Deployed to **staging Edge v7**. Live signed playback on a real device is still unverified. The pilot UI now discloses that physical cleanup is not automated.

## Stage 7 — Account-switching and media privacy (2026-10-17)

- When a staging athlete signs out or changes accounts, the browser now **pauses every private video, clears its signed playback source, removes the player, clears the selected local video file, and cancels local pose processing**. Merely hiding a video element is insufficient to stop playback.
- Late private playback responses cannot append a video to an account's old, detached history after a user switch. Late history responses are ignored when their request owner no longer matches the active staging account.
- Crash recovery for interrupted uploads now stores **only assessment IDs** under per-athlete session-storage keys. A slow upload retains the identity of its original staging athlete, even if a different athlete signs in while the upload is still finishing. No signed upload tokens are persisted.
- The Motion Intelligence automated suite now covers these account-isolation requirements, including simulated reload recovery. A live multi-account mobile browser test remains required.

## Live pilot acceptance test still required

1. Confirm an existing staging athlete is **18 or older** and has explicitly consented. An authorized administrator must create a time-limited `motion_pilot_approvals` record; no self-approval or production account reuse.
2. Sign in to the staging preview on an actual iPhone and select a side-view sprint clip of **30 seconds or less**. Confirm the video uploads, finalizes, and appears in private history.
3. Open private playback. Check that the signed link expires after 60 seconds. Confirm an unrelated signed-in athlete cannot see or play the recording.
4. Interrupt the network after upload, then use **Retry Saving Uploaded Video** to complete the same assessment without duplicating it. Test **Discard Unfinished Video** and verify its storage object is removed.
5. Upload a clip longer than 30 seconds and confirm the browser rejects it. Server-side video duration inspection remains a separate release gate.
6. Revoke the pilot approval and confirm that no new signed playback links, uploads or finalizations can be created. Test account sign-out and switching.
7. Run maintenance in **dry-run** mode with a trusted server-side credential; verify 14-day retention and expired upload cleanup with synthetic media. Only then approve a scheduled run.

## Not yet enabled

**The maintenance function is deployed but has no automatic schedule or configured Vault credential. Automatic **physical deletion** after 14 days is therefore NOT yet operational. A separate server-side access cutoff now prevents new playback links for expired recordings.** Do not claim automatic deletion is active. The UI explicitly discloses this. The staging database and storage bucket had no pilot video records at the last predeployment check.

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
