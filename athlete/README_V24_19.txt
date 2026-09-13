MW Dynasty Athlete V24.19 — Secure Coach Invitation Acceptance

Built from the V24.18 App Store-ready no-payment baseline.
- Athlete Settings includes Connect to Coach.
- Athlete can review a secure coach invitation token before accepting.
- Acceptance calls authenticated mw_accept_coach_invitation.
- Signed-in athlete email must match the invitation.
- Expired/non-pending invitations are rejected.
- Successful acceptance creates the live coach assignment server-side.
- Supports invite links with ?invite= or ?invite_token= while preserving the signed-in athlete account.
- Payment remains intentionally parked.
