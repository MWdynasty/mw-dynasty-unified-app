# MW Motion Intelligence — Stage 4 local pose pilot (2026-10-17)

## Scope and status
**Development preview only. Not production approved.** The production `main` branch is unchanged. The pilot is explicitly separate from MW Dynasty's normal athlete account and has its own staging Supabase session key.

### Implemented in feature branch
- `lib/mw-motion-local-pose.js`: optional browser-side MediaPipe Pose Landmarker (CPU, `@mediapipe/tasks-vision@0.10.35`, fixed lite model URL) with up to 36 evenly spaced frames per clip, max 30 seconds, 720-pixel longest-side decode canvas, model cleanup, URL revocation, cancel support.
- `lib/mw-motion-biomechanics.js`: normalized landmark conversion to **pixel-aspect-corrected** 2D coordinates; estimates knee angle, trunk tilt, and shin tilt. Reports clip-wide medians with method `estimated_2d_clip_median`. Abstains on poor visibility, non-side view, missing dimensions or insufficient frames.
- `athlete/motion.html`: separate staging sign-in, adult consent disclosure, upload/history/private playback/delete, optional on-device analysis with pose overlay and explicit uncertainty notices. No auto-save of pose results.
- `athlete/index.html`: gated development Train entry updated to accurately describe experimental analysis.
- Staging Supabase `motion_pilot_approvals`: RLS-enabled and no client access; upload preparation requires an **admin-approved adult** with nonexpired approval in addition to verified session, DOB and per-recording consent. No approvals seeded.
- `scripts/test-motion-local-pose.js`: synthetic mocked detector tests for timeline bounds, monotonic timestamps, pixel-frame processing, cleanup, cancellation, low-confidence abstention and staging login isolation.

### Privacy and technical notes
- Video frames remain in the browser during local analysis and **are not uploaded** by the analysis action. Secure video upload is a **separate explicit button**.
- The model and WASM are downloaded from jsDelivr and Google Cloud Storage. MediaPipe documentation states input is processed on-device, while SDK usage/performance metrics may be sent to Google. The pilot consent text discloses this. Third-party SDK supply-chain review and hosting strategy remain release gates.
- 2D projected angles are **not** lab-calibrated biomechanics; no ground-reaction force, stride power, injury diagnosis, or coaching prescriptions are derived.
- Clip-wide medians combine different movement phases; future phase segmentation, camera calibration, and expert review are required before meaningful coaching.
- No Pose Landmarker result is sent to Coach MW, a coach account, Season Intelligence, or persistent storage.
- Real media processing on iPhone/Safari, Android, and desktop is **not yet verified**. Synthetic tests do not prove device compatibility, precision or safety.
- Backend still does not independently verify video duration/content. Orphan cleanup and scheduled retention/deletion remain unfinished.

### Verification gates before any production release
1. Obtain a real **adult** staging athlete with verified DOB and separately approved `motion_pilot_approvals` record. No public self-approval.
2. Test real MP4/MOV/WebM playback and pose extraction on iPhone, Safari, Chrome, Android; verify model downloads, browser memory, abort cleanup and CPU latency.
3. Run two-user authenticated end-to-end upload/playback/delete and cross-account denial; validate expired/reused signed tokens.
4. Add server-side media content/duration inspection, scheduled orphan cleanup, retention policy, explicit guardian-consent design for ages 13–17 and legal review.
5. Validate estimated angles against expert-labeled side-view footage with appropriate camera setup; reject invalid or misleading results.
6. Only after quality and privacy gates: add reviewed coaching observations and optional Coach MW interpretation, then 41-week Season Intelligence links with no forced extra volume.
7. Complete broader athlete/coach regression suites and approve controlled production rollout.

### Links
- [Motion Intelligence PR #191](https://github.com/MWdynasty/mw-dynasty-unified-app/pull/191)
- [Google Pose Landmarker Web guide](https://developers.google.com/edge/mediapipe/solutions/vision/pose_landmarker/web_js)
- [Google MediaPipe Tasks privacy notice](https://developers.google.com/edge/mediapipe/solutions/tasks)
