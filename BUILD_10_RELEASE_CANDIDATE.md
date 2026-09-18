# MW Dynasty — iOS Build 10 Release Candidate

App version: 3.0.16
iOS build: 10

## Build 10 completion scope
- Coach Practice Mode added to the Coach dashboard.
- Group Timing supports All / Boys / Girls views, configurable sprint groups, target time, rep timing, individual finish taps, pace labels, Next Rep, and Finish & Save.
- Practice timing results persist to secure Supabase history with RLS.
- Practice Mode quick attendance uses the live assigned-athlete roster and existing attendance API.
- Coach profile includes first name, last name, school / organization, coach title, and account email.
- Founder retains Coach Profile access and has a separate Founder Preview route for Core / Intelligence / Sprint Performance tier previews.
- Athlete sign-in includes a direct Coach Sign In switch.
- Coach sign-in includes an Athlete Sign In switch.
- Coach workspace dimensional 3D/4D controls are retained across navigation and action controls.
- Native project, Codemagic assertions, Athlete visible build metadata, Coach build metadata, and launch-integrity assertions are synchronized to Build 10.

## Static release checks completed
- coach/app.js parses successfully.
- athlete/index.html inline scripts parse successfully.
- Practice timing API and core coach/athlete API files parse successfully.
- Native marketing version remains 3.0.16.
- CURRENT_PROJECT_VERSION is 10 in Debug, Release, Xcode project, and Codemagic assertions.
- Practice timing production table has RLS enabled with select/insert/update/delete policies.
- Build 10 practice timing migration is source-controlled.

## Remaining release gate
The source is ready for the signed Build 10 compile/archive. Final App Store/TestFlight acceptance still depends on Codemagic/Xcode signing and real-device TestFlight QA.
