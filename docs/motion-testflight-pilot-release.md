# MW Dynasty Motion Intelligence — Private TestFlight Pilot

- Native version: 3.0.17, build 16, bundle ID `com.mwdynasty.app`.
- Signed Codemagic workflow: `ios-signed-build` on pushes to `testflight-motion-intelligence`.
- The native shell is restricted to the dedicated staging origin `https://motion-staging.mwdynasty.com/athlete/motion?motionPilot=1`.
- Staging Supabase is isolated from production. Athlete and coach Motion entry points are visible in the pilot preview. Adults require staging sign-in, explicit consent, and admin pilot approval.
- Native purchase handling is disabled for the pilot. No public app, production site, or production database deployment is authorized by this branch.
- GitHub push prepares the Codemagic build; only Codemagic and App Store Connect can confirm signed IPA, TestFlight upload, processing and tester availability. Do not claim installation is ready based on GitHub/Vercel checks alone.
- If the staging deployment becomes unavailable, a new native build must be reviewed and generated; do not silently redirect to a new origin.

- Founder-only sign-in uses the verified production founder identity to create a separate, time-limited staging session. It copies no passwords and writes nothing to production.
- The direct Motion screen opens without passing through a separate staging Athlete Home login. Native purchases remain disabled.
- The dedicated staging alias serves feature/motion-intelligence-foundation. Only that alias has a Vercel hosting exception; application authentication, the founder allowlist, and adult pilot checks remain enforced.
