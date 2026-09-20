# MW Dynasty — Apple In-App Purchase Contract

This file is the single source of truth for the native iOS payment wiring added for Build 13.

## Bundle
- Bundle ID: `com.mwdynasty.app`

## Auto-renewable monthly products
Create these exact product identifiers in App Store Connect:
- `com.mwdynasty.app.athlete.monthly` → `mw_athlete`
- `com.mwdynasty.app.coach.core.monthly` → `coach_core`
- `com.mwdynasty.app.coach.intelligence.monthly` → `coach_intelligence`
- `com.mwdynasty.app.coach.sprintperformance.monthly` → `mw_sprint_performance`

App Store prices must be configured to match the active MW membership catalog. The Supabase membership catalog remains the web billing source of truth.

## Account binding
StoreKit purchases use the authenticated Supabase user UUID as StoreKit's `appAccountToken`.
The server refuses to activate a transaction whose Apple `appAccountToken` does not match the authenticated MW user.

## Server verification
Native purchase/restore:
1. StoreKit returns a locally verified transaction.
2. iOS sends only the transaction ID + selected plan to `mw-apple-purchase-verify`.
3. The Edge Function calls Apple's App Store Server API.
4. Bundle ID, product ID, app account token, current subscription status, and environment are validated.
5. Only the service-role RPC `mw_apply_apple_subscription` can create/revoke MW access.
6. The StoreKit transaction is finished only after MW server verification succeeds.

No client callback can directly activate a membership.

## Required Supabase Edge Function secrets
- `APPLE_IAP_ISSUER_ID`
- `APPLE_IAP_KEY_ID`
- `APPLE_IAP_PRIVATE_KEY`
- `APPLE_BUNDLE_ID=com.mwdynasty.app`

Optional:
- `MW_APPLE_PRODUCT_MAP` JSON can override the default product identifiers without changing code.

Never commit the Apple private key to GitHub or client code.

## App Store Server Notifications V2
Configure App Store Connect to send Version 2 subscription notifications to the deployed Supabase Edge Function:
`mw-apple-server-notifications`

That endpoint re-checks the referenced transaction with Apple's authenticated server API before changing access. Renewals, expiration, billing retry, grace period, revocation/refund, and auto-renew-off state are therefore server controlled.

## Sponsored athletes
Flexible per-athlete sponsorship quantity remains a Coach billing add-on and is not included in the native App Store subscription quantity. A Coach may buy the base Coach membership in iOS, then manage sponsored-athlete seats through Coach billing. Sponsored seats continue to use the MW sponsorship package/seat architecture and must never be granted from a client-side quantity value.

## Build
- Marketing version: 3.0.16
- iOS build: 13
