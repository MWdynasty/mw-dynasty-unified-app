## Founder-approved retention policy — October 17, 2026

The founder approved a **14-day raw-video retention limit** and **330-day separately consented 2D measurement-summary retention limit**. Athletes may delete either sooner, and coach sharing is disabled by default.

**Staging implementation**
- Server denies fresh playback after 14 days; signed playback links may remain valid for their original 60-second lifetime.
- The 330-day consented-summary deletion Cron is installed and active (`mw-motion-season-retention`, daily 03:00 UTC).
- The raw-video cleanup Cron is installed (`mw-motion-video-retention`, hourly at minute 12), using `pg_net` to invoke `mw-motion-maintenance` with `{"execute":true,"dryRun":false,"limit":20}`.
- **Credential prerequisite not yet satisfied:** the scheduler intentionally sends **no request** unless the *staging* service-role JWT has been securely provisioned in Supabase Vault as `mw_motion_staging_service_role_jwt`. As of implementation, that Vault entry was absent. Do not insert secrets into repository files or client code. This means **automatic physical video deletion is not yet running** even though the Cron job is active.
- The maintenance function enforces the staging project URL, service-role authorization, owner/path validation and storage-object deletion before metadata deletion. It is bounded to 20 candidates per run.
- The migration and CI checks are committed under `20261018000000_motion_video_retention_cron.sql` and `scripts/test-motion-retention-policy.js`.
- Provision the credential through an authorized secret-management flow, then verify the first scheduled invocation and physical deletion behavior before claiming the retention guarantee is fully operational.

Production remains unchanged; this approval does **not** authorize merging the draft PR or deploying the unfinished Motion Intelligence feature to production.


## Stage 9 — 41-week opt-in motion history and coach sharing (2026-10-17)

- Added `motion_season_observations` as a separate **330-day maximum** consented summary store. Raw recordings remain subject to the separate **14-day** policy. Video deletion does not erase a separately consented season observation; the athlete can delete either independently.
- Each observation records one 1–41 MW training week and a movement skill; client 2D measurements remain **unverified**. Saving requires a previously uploaded, unexpired adult-pilot recording, an assigned week, a separate explicit `motion-season-v1` consent and server validation of angle bounds.
- Coach sharing is OFF by default for every observation. Only active assigned coaches can read shared adult observations, never the video. The athlete can revoke sharing or permanently delete the summary, including after their pilot approval has been revoked. Staging SQL RLS is enabled and authenticated clients have SELECT only.
- Added a staging-only coach Motion Intelligence page and a preview-only coach dashboard link. The athlete page includes 41-week summaries, per-observation sharing and deletion.
- Staging `mw-motion-pilot` Edge v10 implements `save_season`, `season`, `share_season`, `delete_season`, and `coach_season`; `mw-motion-maintenance` v2 can purge expired season summaries when service-authorized.
- Installed staging Supabase Cron `mw-motion-season-retention` (03:00 UTC daily) to physically delete expired 330-day summary rows. This does **not** schedule raw-video cleanup. No staging adult pilot approval or real recording has been created for the release acceptance test.
- CI synthetic Edge lifecycle covers separate consent, duplicate save, cross-account denial, active assignment, revocation, video deletion independence, and season erasure. Browser syntax and schema guard tests also run.

**Not yet release-ready:** Trusted server-side duration/media-content inspection, automatic physical raw-video cleanup, full 41-week authoritative Season Intelligence plan synchronization (existing staging season plans include shorter legacy periods), authenticated real adult pilot account and iPhone capture/upload/playback testing, biomechanics validation, and app-wide production integration. Preview HTTP 200 and mocked tests do not establish real-device readiness.


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

## Stage 8 — Coach MW review, private reports and recent development comparisons

- Implemented movement-specific, evidence-bounded Coach MW review cards for all seven sprint skills, including read-aloud and copy actions. Guidance is rule-based; there is **no live LLM coach conversation**, calibrated kinematics, technique grade or performance prediction.
- Both a selected local recording and an athlete's saved private recording can run the same on-device pose pipeline. Saved-video review uses the owner-authorized signed playback URL.
- Added optional MW training-week tagging (weeks 1–41) to the assessment and recording history.
- Added an **optional, separate consent** for persisting client-estimated 2D measurements. Local analysis alone does not persist pose data. Only reports associated with uploaded, owner-controlled, unexpired assessments may be saved.
- Created staging `public.motion_reviews` with owner-only RLS SELECT, no authenticated writes, foreign-key cascade on assessment deletion, and unverified provenance labeling. Schema migration `20261017220000_motion_private_reviews.sql` was applied to staging.
- Staging `mw-motion-pilot` Edge **v8** supports `save_review` and `reviews`. It enforces current adult approval, ownership, explicit report consent, 14-day access cutoff, bounded metrics and audit entries. No coach access has been granted.
- Added a recent motion observation comparison grouped by movement and optional training week. It reports only changes in estimated 2D angles and does **not** interpret them as improved or worse technique. Because reports are attached to short-lived assessments, **this is not yet season-long retention or 41-week trend storage**.
- Latest development preview serves the report-saving controls and recent progression panel. Production remains unchanged.

**Remaining feature development:** long-term measurement retention consent and privacy design, season-long report architecture, permissioned coach visibility, Season Intelligence integration, validated movement feedback and server-side media duration/content checks. Physical retention cleanup remains unscheduled. Do not present the experimental rule-based review as validated AI biomechanics.

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
