# MW Dynasty — Payment Launch QA

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
