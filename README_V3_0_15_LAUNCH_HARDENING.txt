MW Dynasty V3.0.15 — Launch Hardening & Age Verification

Completed in this source candidate:
- Athlete signup now collects first name, last name, and date of birth.
- Client signup rejects under-13 DOBs before account creation.
- Supabase provisioning migration stores signup last name and DOB when supplied.
- Legacy/null-DOB athletes can complete age verification through the restricted mw_set_athlete_date_of_birth RPC.
- Athlete navigation re-prompts for DOB until verification is complete, except internal non-billable test accounts.
- Existing database 13+ trigger remains the server-side enforcement boundary.
- Public pricing API no longer considers the service-role key; it uses only publishable/anon credentials for public plan reads.
- Version strings synchronized to App 3.0.15 / iOS Build 6.
- Manifest and status/pricing API versions synchronized.
- Coach program import metadata now reports the current app version instead of V3.0.7.
- Privacy children language aligned to the 13+ Athlete-account rule.
- Added automated launch-integrity checks for version alignment, age gating, annual-plan lock, local links, and packaged-secret patterns.

Production backend already applied before deployment:
- capture_athlete_signup_profile_metadata
- athlete_self_date_of_birth_verification_rpc

Important deployment note:
V3.0.15 is a prepared source candidate. The connected GitHub/Vercel integrations currently expose no deployable repository/team, so web deployment and signed iOS/TestFlight verification still require the external deployment path.

Launch pricing remains:
- Athlete: $19/month; annual disabled.
- Coach Core: $49/month + $5/sponsored athlete.
- Coach Intelligence: $79/month + $6/sponsored athlete.
- MW Sprint Performance: $109/month + $7/sponsored athlete.
