MW Dynasty V3.0.16 — Security Finalization & Production Soft-Launch Candidate

What changed since V3.0.15:
- App/source version synchronized to 3.0.16; iOS build synchronized to 7.
- Production athlete feature access now enforces 13+ verification at the centralized entitlement layer.
- Legacy athlete RPC/RLS paths were hardened so Core/Intelligence sponsored athletes cannot bypass MW Training System, Sprint School, Smart Entry, Strength & Power, or messaging feature gates through older endpoints.
- Coach assignment-history RLS scope bug fixed and regression-tested.
- RLS auth-initplan performance warnings reduced from 37 to 0 without widening access.
- Targeted foreign-key indexes added to high-value launch paths; unindexed-FK advisor count reduced from 35 to 20.
- Coach account provisioning no longer trusts user-editable signup metadata for Coach authorization.
- Production mw-coach-applications-admin Edge Function upgraded to v3: Founder/Admin approval is persisted before Auth invite creation, retry state is preserved, and existing Auth-account collisions require Founder review.
- Current production security audit still reports intentionally authenticated-callable SECURITY DEFINER RPCs and Supabase leaked-password protection disabled; neither is hidden by this source package.

Live production migrations applied after the V3.0.15 source cut:
- 20260915184338 launch_targeted_fk_indexes
- 20260915184415 fix_assignment_history_coach_scope
- 20260915184602 optimize_rls_auth_initplans
- 20260915185030 enforce_age_verification_in_athlete_feature_access
- 20260915190225 harden_legacy_athlete_entitlement_paths
- 20260915190308 enforce_athlete_feature_gates_in_rls
- 20260915190332 enforce_sponsored_content_and_messaging_gates
- 20260915190804 secure_coach_invite_provisioning

Important source-control note:
These migrations are already recorded in the production Supabase migration history. The connected GitHub account currently exposes no MW Dynasty repository, so the authoritative next repo sync should be done with a Supabase schema/migration pull once GitHub/coding access is restored. Do not re-apply these production migrations blindly.

Edge Function source included:
- supabase/functions/mw-coach-applications-admin/index.ts (production v3 source)

Launch pricing remains:
- Athlete: $19/month; annual disabled.
- Coach Core: $49/month + $5/sponsored athlete.
- Coach Intelligence: $79/month + $6/sponsored athlete.
- MW Sprint Performance: $109/month + $7/sponsored athlete.

Remaining external gates:
- Apple Developer activation / App Store Connect
- StoreKit production products and transactions
- permanent production email delivery
- GitHub/Linear coding-session repository access
- Supabase leaked-password protection setting
- signed/TestFlight real-device QA
- real coach-application approval smoke test when a legitimate application exists
- Sprint School filming and upload
- final App Review and controlled production soft launch
