MW Dynasty V3.0.14 — Sponsored Athlete Tier Entitlements & Coach-Assigned Training

This source package locks the sponsored-athlete experience to the sponsoring coach's active tier and adds a production-safe coach-assigned training path.

Locked athlete access rules
- Individual Athlete ($19/month): full MW athlete product.
- Coach Core sponsored athlete: athlete app + coach-assigned training/check-ins + messaging + pace/rep logging + basic Coach MW. No AI Intelligence, MW 41-week system, Strength & Power, Sprint School, Smart Entry, or advanced performance tools.
- Coach Intelligence sponsored athlete: Core + AI/performance intelligence. Full MW methodology remains locked.
- MW Sprint Performance sponsored athlete: full athlete ecosystem, including Intelligence, 41-week MW sprint system, Strength & Power, Sprint School, Smart Entry, and advanced tools.

Backend additions
- mw_my_feature_access()
- mw_my_coach_assigned_programs()
- mw_log_coach_assigned_training_checkin(...)
- mw_my_coach_assigned_training_checkins()
- mw_coach_assigned_training_checkins(athlete_id)
- coach_assigned_training_checkins table

Client changes
- Athlete Home/Training/Progress/Coach MW adapt to live feature_access.
- Core/Intelligence athletes see coach-assigned training rather than MW 41-week content.
- Core Coach MW is explanatory/basic, not data-intelligence or program-replacement AI.
- Intelligence Coach MW can reason about athlete trends/context but cannot reveal/replace the full MW methodology.
- Direct Pace AI/Distance Pacer routes are entitlement-gated.
- Smart Entry is 13+ and only available to full-MW access.
- DOB picker enforces a 13+ maximum birth date.

Pricing correction
- Athlete monthly: $19.
- Athlete annual is DISABLED until explicitly approved by Founder.
- Coach Core: $49 + $5/sponsored athlete.
- Coach Intelligence: $79 + $6/sponsored athlete.
- MW Sprint Performance: $109 + $7/sponsored athlete.

Privacy/permissions
- Precise location is optional and used only for GPS distance measurement.
- Microphone/speech is optional and used for Coach MW voice input.
- Camera/photo library is optional and used only when the user chooses an image for Coach MW.
- Smart Entry readiness can persist clear/tight/pain and should be disclosed as health-related data conservatively.

Deployment status
- Production Supabase backend changes are live and tested.
- This client/source package is NOT automatically deployed by creating this archive. GitHub/Vercel access or a manual deploy is still required.
