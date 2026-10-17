# Motion Intelligence — Stage 3 staging evidence (2026-10-17)

**Release state:** staging pilot implementation, NOT production-ready or biomechanics-validated.

## Implemented
- Supabase staging project: `uuggbmccnyswiwkjgydo`.
- `mw-motion-pilot` Edge Function (JWT required) with `prepare`, `finalize`, `list`, `playback`, and `delete` actions.
- Staging-only origin allowlist, explicit staging project guard, JWT identity lookup, adult DOB gating, consent version, 5 recording preparations per account per 24 hours.
- Signed upload token valid up to 2 hours; playback signed URL 60 seconds. Private bucket `motion-private`.
- Server-owned upload intents, audit events, metadata verification, and athlete-scoped record lookup.
- Direct client assessment inserts, asset metadata inserts and storage object policies revoked in staging.
- Athlete recording screen uses the Edge API; playback/history/deletion are native to the existing staging athlete account.
- Browser-side file type/size/duration checks; server-side storage MIME and size verification (not content or duration inspection).
- Pure 2D pose-landmark geometry module with confidence-based abstention, separate from the upload pipeline; it does NOT yet extract landmarks from real videos.

## Verified
- Private storage bucket is not public.
- Authenticated clients have no direct INSERT grant on motion_assessments or motion_assets.
- No client storage.objects policies exist for motion-private.
- motion_upload_intents and motion_audit_events have RLS enabled and no client grants.
- service_role INSERT privileges and audit sequence usage verified.
- GitHub Actions Motion foundation suite executes input/ownership/age/perspective/JS syntax/geometry checks. Results must be checked against the **latest** commit.
- Preview Vercel deployments are isolated from the production target.

## Not yet verified / release blockers
- No real signed-in athlete has completed prepare -> actual upload -> finalize -> private playback -> delete on iPhone/desktop.
- No actual second-account storage playback denial test.
- Supabase Edge Function ACTIVE indicates deployment, not a successful authenticated invocation.
- Video duration is measured only in the browser; a hostile client can bypass it. Server media sniffing/ffprobe validation is still required.
- Expired upload tokens can leave orphan objects; automated retention and orphan cleanup are not implemented.
- DOB alone does not establish legally valid age/guardian consent; pilot is adult-only, with minors disabled pending privacy review.
- No real pose extraction, visual overlays, biomechanics validation or Coach MW interpretation service.
- No coach review or Season Intelligence integration.
- Existing staging database security advisor warnings concerning legacy SECURITY DEFINER functions remain under separate review.

## Test account procedure (not yet executed)
1. Sign into an authorized **adult staging athlete** on the Motion preview with `?motionPilot=1`.
2. Upload a short synthetic/non-sensitive sprint video. Confirm status `uploaded`, private playback and deletion.
3. Attempt the same asset using a separate authenticated staging account. Must return 404/403, not a signed URL.
4. Test unsupported MIME, oversized file, 31-second clip, expired token, duplicate finalize, and interrupted upload.
5. Recheck audit events, orphan files, RLS, CI and production branch isolation.
6. Do not enable minors or merge to main until legal/security gates and the above real-world tests pass.
