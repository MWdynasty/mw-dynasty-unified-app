MW Dynasty V3.0.6 — Pricing Sync + App Store Cleanup

- Locked pricing remains: Athlete $19/mo; Coach Core $49 + $5/sponsored athlete; Coach Intelligence $79 + $6; MW Sprint Performance $109 + $7.
- Athlete and coach pricing surfaces now load from /api/pricing, with the locked values retained only as offline fallbacks.
- /api/pricing can safely read active pricing through a read-only public RLS policy on membership_plans.
- App version synchronized to 3.0.6 and native iOS build synchronized to Build 3.
- No checkout was enabled by this release; this is the single-source-of-truth pricing foundation.
