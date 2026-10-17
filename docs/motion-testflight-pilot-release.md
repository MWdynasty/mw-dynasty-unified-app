# MW Dynasty Motion Intelligence — Private TestFlight Pilot

- Native version: 3.0.17, build 15, bundle ID `com.mwdynasty.app`.
- Signed Codemagic workflow: `ios-signed-build` on pushes to `testflight-motion-intelligence`.
- The native shell is restricted to the immutable preview `https://mwdynastyunifiedappv31tiered13plusdeploy-dxd3n3qlw-mw-sprint.vercel.app/athlete/?motionPilot=1`.
- Staging Supabase is isolated from production. Athlete and coach Motion entry points are visible in the pilot preview. Adults require staging sign-in, explicit consent, and admin pilot approval.
- Native purchase handling is disabled for the pilot. No public app, production site, or production database deployment is authorized by this branch.
- GitHub push prepares the Codemagic build; only Codemagic and App Store Connect can confirm signed IPA, TestFlight upload, processing and tester availability. Do not claim installation is ready based on GitHub/Vercel checks alone.
- If the pinned preview becomes unavailable, a new native build must be reviewed and generated; do not silently redirect to a new origin.
