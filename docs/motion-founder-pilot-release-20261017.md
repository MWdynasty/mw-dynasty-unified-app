# Motion Intelligence — controlled founder pilot, October 17, 2026

## Accessible staging release

- URL: https://motion-staging.mwdynasty.com/athlete/motion?motionPilot=1
- Vercel project: `prj_3bEGMsV7nYjLX07b2EoeKvQS2zqe`, team `team_xt3ayo8JXP192rKs6wbvKzLz`.
- The dedicated alias tracks `feature/motion-intelligence-foundation`. Its alias-only hosting exception removes the Vercel login wall; application authentication and adult approval still apply. Other aliases retain their existing hosting protection.
- Supabase: **Phase 1 Staging**, `uuggbmccnyswiwkjgydo`. Motion API v16; founder access bridge v1. Nothing in this release writes to the production project.
- The existing founder_owner identity is the sole production identity accepted by the bridge. A verified owner session and explicit pilot consent provision a separate staging athlete/session, expiring November 16, 2026. No password is copied and no email is sent. Revoked approvals cannot be reactivated by signing in.
- The bridge reads only the owner's adult eligibility and active season/program start through the owner's existing production permissions. Staging receives that limited training context. No production workouts, subscription records or coach assignments are copied.

## Release repairs

- Separate iPhone camera capture and saved-video selection.
- Optional Coach MW feedback after successful upload, plus manual review and read-aloud.
- Coaching focus follows the existing Personal Performance progression: Foundation 1–12, Development 13–24, Performance 25–37, Consolidation 38–41. Indoor does not reset it. Saved recordings use their recorded week; a scheduled start is shown as before Week 1.
- Scope camera permission, CDN/model downloads, WebAssembly and private playback policy to the two Motion pages, including Vercel's clean URLs. Other pages retain their previous policies.
- Fix an initial CI compatibility error: the founder-access handler/test now use JavaScript-compatible syntax so existing Node 20 regression jobs do not require Node's newer TypeScript stripping API.

## Live service evidence

An operator-authorized, staging-only disposable check returned HTTP 200, `passed:true`, through pg_net request 6. It used three newly authenticated synthetic accounts and a real FFmpeg-encoded 1-second MP4, never a user's recording.

Confirmed against deployed Auth, Storage, Postgres and Edge services:

- Signed upload, server-verified 1000 ms duration, private history and authoritative week 5.
- Signed playback returns the stored bytes. Unrelated accounts cannot play or directly select another account's records.
- Separate summary consent; sharing OFF by default; assigned coach sees only shared summaries; revocation removes access.
- Physical video deletion preserves separately consented summary data.
- An aged disposable recording is denied playback, then removed from Storage and metadata by the real maintenance service.
- An aged disposable summary is physically removed; approval revocation takes effect immediately.

Afterward: zero disposable auth accounts, zero remaining private videos, zero remaining observations; both retention jobs remain enabled. The temporary release-check endpoint was retired with JWT verification enabled and an HTTP 410 handler. No recurring diagnostic was installed.

All Motion unit/security checks and real MP4/MOV parser checks passed locally. A browser opened the deployed sign-in screen at the URL above. This does **not** establish physical iPhone camera/pose behavior or a successful founder sign-in.

## Native distribution status

The prepared `testflight-motion-intelligence` source targets version **3.0.17 (16)**, opens the dedicated Motion screen directly, and disables native purchases for the pilot. The existing signed Codemagic workflow submits to TestFlight when successful.

At this checkpoint, an actual signed IPA, Apple upload/processing, tester assignment and installation are **not confirmed**. The build-service browser is at its sign-in screen. GitHub/Vercel success must not be described as TestFlight availability.

PR #191 remains a controlled staging release; it is not merged into `main`. A public production release remains pending founder use and resolution of any resulting defects.

## Rollback

Revoke the dedicated staging alias exception to restore its Vercel sign-in wall, and revoke the founder's staging pilot approval to block uploads and fresh playback. Preserve athlete deletion/consented-history controls. Do not change existing production domains or accounts.
