MW Dynasty V3.0.8 — Elite Billing Transition Foundation

This build adds the shared billing/responsibility layer used by Coach Core, Coach Intelligence, MW Sprint Performance, and the MW Athlete app.

Coach invitations
- Coach chooses Coach Sponsored or Athlete Self-Pay before creating the invite.
- Coach Sponsored carries the active coach tier's sponsored-athlete price from the live membership_plans table.
- Sponsored invitation acceptance creates the athlete/coach connection plus a coach-sponsored athlete billing entitlement.
- Self-pay invitations connect the athlete without silently creating coach-sponsored access.

Athlete handoff protection
- Coach-sponsored athletes keep the same account, profile, PRs, training history and coach relationship.
- Athlete can prepare monthly or annual self-pay when sponsorship has an end date.
- The system does not open individual checkout early; checkout opens at the sponsorship handoff time to avoid duplicate charging.
- A 72-hour non-billable transition grace entitlement protects access while payment finishes.
- Provider-confirmed billing transitions are idempotent and are applied only after confirmation.

Coach plan transitions
- Upgrade requests are immediate only after payment confirmation.
- Downgrades are period-end transitions; current access remains active until the handoff.
- Pricing calculations include the coach base plan plus active sponsored-athlete seats.
- When a coach tier changes, sponsored-athlete seat pricing metadata is synchronized to the new tier.

Payment-provider boundary
- This build contains the transition engine and native/web checkout contract.
- Actual money movement still requires the launch payment providers: StoreKit for iOS individual athlete purchases and the selected web/team billing provider for coach plans and sponsored seats.
- Do not treat a prepared transition as a completed purchase until provider confirmation reaches MW Dynasty.

Database migrations applied live in Supabase on 2026-09-14:
- coach_invitation_billing_responsibility
- elite_billing_transition_engine_v1
- elite_billing_handoff_safety_v2
- coach_sponsored_invite_acceptance_fix
- elite_billing_coach_seat_sync_v3
- billing_rpc_execute_hardening
