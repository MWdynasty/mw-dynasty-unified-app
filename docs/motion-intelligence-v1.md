# MW Motion Intelligence — Foundation (Draft V1)

Status: development-branch foundation only. NOT deployed; no video AI analysis implemented.

## Mission
Integrate repeatable, coach-reviewable sprint technique assessments into the existing unified 41-week season, with Tuesday as the standard capture opportunity. Keep indoor/outdoor one continuous progression; never restart foundation or auto-peak at indoor.

## Athlete workflow
1. Today's Tuesday technical workout includes a designated Motion Assessment card. Other days may include coach-assigned assessments.
2. Recording is optional for workout completion. Athletes can skip with a reason. Skipping never changes attendance to absent or invalidates training.
3. Choose movement: block start, two-point start, three-point start, four-point start, wickets, or front-side mechanics.
4. Follow camera instructions (stable tripod, unobstructed view, enough light, full athlete in frame; side view preferred for initial release; no promises of precision).
5. Capture/upload 1–2 videos with explicit video-sharing and data-processing consent. If underage, use the existing account's verified parent/guardian consent policies where legally applicable.
6. Server validates permissions, MIME/size/duration, and ownership before private upload. All raw videos private, expiring access URLs only.
7. Video transitions queued -> processing -> needs_better_video / analyzed / failed. Failures allow retry without losing workout state.
8. AI detects key frames and landmarks, estimates only video-supported metrics, reports confidence and limitations, and prioritizes at most two constructive cues. If evidence insufficient, abstain.
9. Coach can review and override comments before group/coach-directed feedback is final. Athlete feedback must identify provisional vs coach-approved status.
10. Save comparable results with view, capture conditions, measurement method/model version, and timestamps. Do not aggregate dissimilar camera views into angle trends.

## Technical assessment templates
- Block / four-point start: set position, block exit, first 3–5 steps, transitions through first 30 m.
- Two-/three-point start: stance, initial projection, first steps; do not assume block-specific metrics.
- Wickets / front-side: trunk posture, front-side recovery, foot position and contacts, rhythm. Never equate all limbs forming fixed angles with technical correctness.

## System connections
- Coach MW: annotated replay + prioritized coaching cues + vetted drills from the existing MW Dynasty library; no invented program content.
- Train tab: today-first card and status; weekly video opportunity; standardized repeat assessments every 3–4 weeks.
- Season Intelligence: technique history alongside times, fatigue and completion. No automatic changes to the 41-week program based on a single clip.
- Coach: permission-scoped athlete/group review and optional assignments; explicit approval/override.
- Founder: aggregate volume, failures, latency and feature adoption; no unrestricted access to identifiable minor videos.

## Data contract (proposed, not migrated)
motion_assessments: id, athlete_id, coach_id?, workout_id?, week_number (1..41), movement_type, camera_view, status, skipped_reason?, consent_record_id?, created_at, reviewed_at?, reviewer_id?.
motion_assets: id, assessment_id, private_storage_path, mime_type, duration_ms, byte_size, retention_expires_at.
motion_findings: id, assessment_id, measurement_name, value?, units?, confidence?, measurement_method, model_version, frame_range?, limitations, finding_text, coach_override?.
motion_audit: actor_id, assessment_id, action, timestamp (no unnecessary video contents).

All tables must have row-level security tied to athlete ownership, verified coach/team relationships, and owner-authorized review; never trust user-editable role metadata. Private storage paths must not be exposed to unrelated accounts. Define retention/deletion, guardian consent, and human review before enabling video collection.

## Acceptance gates before production
- Athlete/coach account separation and RLS penetration tests; minors' privacy safeguards.
- Upload validation, interrupted uploads, expired signed URLs, failed analysis, retries and deletions.
- Repeated recordings compared only under comparable capture conditions; low-confidence results abstain.
- Coach feedback and corrections persist with audit trail; cannot cross teams.
- Workout complete works if video skipped or processing delayed.
- Mobile Safari, iOS TestFlight and desktop coach tests; screen reader labels; slow-network recovery.
- Measured inference costs, throttling and per-account quotas.
- Flag gated release to pilot accounts only, rollback plan, logs and error monitoring.
