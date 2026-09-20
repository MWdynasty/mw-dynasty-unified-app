# MW Dynasty — Payment Launch QA

Last verified: 2026-09-20

This checklist is the release gate for Athlete, Coach, Apple, Stripe, and sponsored-athlete billing.

## Backend invariants already enforced

- Membership access is activated only from verified provider state, never from a browser/native success callback.
- A member cannot have an active Apple base membership silently replaced by Stripe, or vice versa.
- Apple subscriptions are bound to the original MW account through appAccountToken/original transaction history.
- Athlete products cannot activate Coach accounts and Coach products cannot activate Athlete accounts.
- Coach payment cannot activate an unverified Coach application.
- A zero-seat Coach Stripe membership does not create or overwrite a sponsorship package.
- A sponsorship-only checkout requires an already-active Coach membership and the current Coach plan.
- A second live sponsored-seat subscription is rejected.
- Sponsored invitations consume prepaid seat capacity and retries do not consume a second seat.
- Sponsored athlete access activates only after both the Coach base membership and paid sponsorship package are valid.
- Unpaid Coach billing status fails closed as awaiting_activation rather than reporting active.

## Rollback integration QA completed

These tests were executed against the real database functions inside transactions and rolled back. Post-test residue checks passed.

- [x] Stripe incomplete initial payment remains pending and grants no Athlete entitlement.
- [x] Stripe successful Athlete payment activates billing, entitlement, and profile.
- [x] Duplicate Stripe provider event is ignored idempotently.
- [x] Active Stripe base membership cannot be overwritten by Apple.
- [x] Stripe cancellation closes Athlete entitlement and pauses the profile.
- [x] Sponsored-seat billing is blocked before Coach base membership is active.
- [x] Zero-seat Coach membership creates no empty sponsorship package.
- [x] Sponsorship-only payment creates the exact paid seat quantity.
- [x] Sponsor quantity reduction removes only unused availability.
- [x] Duplicate sponsorship webhook is ignored idempotently.
- [x] Sponsored invitation reserves exactly one prepaid seat.
- [x] Sponsored invitation acceptance activates seat + Athlete entitlement + profile.
- [x] Ending the sponsor package closes sponsored Athlete access and pauses the profile.
- [x] Verified Apple Athlete purchase activates Apple billing + entitlement + profile.
- [x] Duplicate Apple event is ignored idempotently.
- [x] Apple revocation/refund removes access immediately even if the old transaction has a future expiration date.
- [x] All synthetic QA users/invitations were rolled back with zero test-record residue.

## Hardening discovered by QA

- Protected Athlete APIs now require a live entitlement in addition to profile state.
- Protected Coach APIs now require a live Coach entitlement.
- Stripe `incomplete` is stored as `pending_payment`, not active.
- Stripe `incomplete`, `unpaid`, and `incomplete_expired` cannot create a future-dated entitlement that accidentally unlocks access.
- Apple `revoked` maps to refunded/revoked access instead of a future-dated cancelled entitlement.
- Combined Stripe Coach + seat billing retires sponsored access when the base subscription ends.
- Separate Stripe seat add-ons are scheduled to end when the Coach base membership is set to cancel, and are stopped when the base membership terminates.
- A base-cancellation reversal only restores add-on renewal when MW itself linked that add-on cancellation to the base cancellation.

## Release scenarios

### Athlete — Stripe
- [ ] New Athlete creates account.
- [ ] Email confirmation returns to the same Athlete journey when confirmation is required.
- [ ] Membership checkout opens for mw_athlete.
- [ ] Abandoned checkout preserves the account and resumes at Membership.
- [ ] Successful Stripe subscription webhook activates billing + entitlement + profile.
- [ ] Athlete continues to Profile, then Entry Assessment.
- [ ] Past-due/cancelled state removes access according to MW billing policy.

### Athlete — Apple
- [ ] Native app shows App Store purchase, not Stripe web checkout.
- [ ] Purchase uses the authenticated MW user UUID as appAccountToken.
- [ ] MW server independently verifies the Apple transaction before access unlocks.
- [ ] Restore Purchase finds the correct active entitlement for the same MW account.
- [ ] App Store cancellation keeps access through the paid period and then removes it.
- [ ] Refund/revocation removes access after Apple server verification.

### Coach verification + payment
- [ ] Pending Coach cannot purchase or enter the Coach dashboard.
- [ ] Approved/auto-approved Coach receives secure account setup.
- [ ] Coach creates password and lands directly on Membership.
- [ ] Stripe Coach can purchase membership alone.
- [ ] Stripe Coach can purchase membership + sponsored seats together.
- [ ] Native Coach purchases only the base Coach membership through Apple.
- [ ] Native Coach is told clearly that sponsored seats are added after base activation.
- [ ] Provider-confirmed payment creates active Coach entitlement and unlocks dashboard.

### Sponsored athletes
- [ ] Active Coach with zero sponsored seats can add a sponsorship package without replacing the base membership.
- [ ] Apple-paid Coach can add Stripe sponsored seats without changing Apple base membership.
- [ ] Stripe-paid Coach can add sponsored seats later without creating a second base membership.
- [ ] Existing sponsored-seat package routes to Manage Sponsored Seats instead of creating another subscription.
- [ ] Sponsored invite reserves exactly one available seat.
- [ ] Retrying the same invite does not reserve another seat.
- [ ] No available seats blocks sponsored invite but still permits self-pay invite.
- [ ] Sponsored athlete accepts with the exact invited email/account.
- [ ] Acceptance activates the reserved seat, Athlete entitlement, profile, and onboarding journey.
- [ ] Ending sponsorship schedules/removes sponsored Athlete access without cancelling the Coach base membership.

### Provider isolation / abuse cases
- [ ] Active Apple member attempting web Stripe base checkout is rejected.
- [ ] Active Stripe member attempting Apple base activation is rejected until the paid period ends.
- [ ] Apple transaction from another MW account is rejected.
- [ ] Apple product/account-role mismatch is rejected.
- [ ] Client-side sponsor quantity alone never grants seats.
- [ ] Replayed Stripe/Apple provider events are idempotent.
- [ ] Invalid Stripe webhook signature is rejected.
- [ ] Apple server notification causes a fresh App Store Server API verification before access changes.

## External launch configuration still required

- [ ] Create/verify all four auto-renewable subscription products in App Store Connect.
- [ ] Match App Store prices to the active MW membership catalog.
- [ ] Configure APPLE_IAP_ISSUER_ID, APPLE_IAP_KEY_ID, APPLE_IAP_PRIVATE_KEY, and APPLE_BUNDLE_ID in Supabase.
- [ ] Configure App Store Server Notifications V2 to the MW Apple notification Edge Function.
- [ ] Run StoreKit sandbox purchase, renewal, cancellation, refund/revocation, and restore tests.
- [ ] Run Stripe test-mode checkout/webhook tests for Athlete, Coach, Coach + seats, sponsorship-only, cancellation, and failed payment.
- [ ] Verify Build 13 signed IPA uses com.mwdynasty.app and the production app URL.
- [ ] Enable Supabase leaked-password protection before public launch.
