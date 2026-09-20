# MW Dynasty Payment Launch QA

Last architecture pass: 2026-09-20

## Verified in code/database
- [x] Athlete and Coach payment activation is server-authoritative.
- [x] Coach API access requires a current paid base membership; expired periods fail closed even if a provider webhook is delayed.
- [x] Explicit prelaunch Coach QA accounts are separated from production paid entitlements.
- [x] Apple and Stripe cannot silently replace one another as the active base membership provider.
- [x] Apple transactions are bound to the authenticated MW account with appAccountToken.
- [x] Sponsored-athlete seats require both an active Coach base membership and paid sponsorship billing.
- [x] Zero sponsored seats do not create a sponsorship package.
- [x] A sponsorship-only Stripe subscription does not replace the Coach base membership.
- [x] Duplicate sponsorship-only checkout is blocked while a live sponsorship package exists.
- [x] Sponsorship-only Stripe webhooks use the live Stripe line-item quantity.
- [x] Sponsored-athlete access is extended when the sponsorship package renews into a new paid period.
- [x] Temporary sponsorship billing failure pauses sponsored access without permanently detaching the athlete; recovery restores only seats marked as billing interruptions.
- [x] Final sponsorship cancellation/expiration remains distinct from recoverable billing interruption.
- [x] Billing integrity audit currently reports zero production billing invariant failures.

## External/provider tests still required before launch
- [ ] Stripe test-mode Athlete purchase -> webhook -> Athlete activation.
- [ ] Stripe test-mode Coach purchase -> webhook -> Coach activation.
- [ ] Abandoned Stripe checkout -> account/journey remains resumable.
- [ ] Stripe failed payment/past_due -> access pauses.
- [ ] Stripe payment recovery -> access restores.
- [ ] Stripe cancellation at period end -> access remains through paid period, then ends.
- [ ] Coach sponsored-seat purchase -> package/seats created.
- [ ] Sponsored invitation -> seat reservation -> athlete acceptance -> sponsored access.
- [ ] No-seat-available invitation -> clean error and no partial invitation state.
- [ ] Sponsorship renewal -> existing sponsored athletes receive the new paid period.
- [ ] Sponsorship past_due -> sponsored access pauses; recovery restores it.
- [ ] Sponsorship final cancellation -> access ends at the paid boundary.
- [ ] App Store Connect products created with the exact Build 13 product IDs.
- [ ] Apple IAP API credentials installed as server secrets.
- [ ] App Store Server Notifications V2 endpoint configured.
- [ ] Apple Sandbox Athlete purchase -> server verification -> activation.
- [ ] Apple Sandbox Coach purchase -> server verification -> activation.
- [ ] Apple restore purchase -> same MW account -> activation.
- [ ] Apple cancellation/renewal/expiration/refund notification behavior verified.
- [ ] Build 13 IPA compiled, uploaded to TestFlight, and tested on a physical iPhone.

## Launch blockers
Any duplicate charge, client-authoritative activation, paid-period access loss, post-expiration access, cross-account Apple transaction, sponsorship seat over-allocation, or webhook recovery failure is a launch blocker.
