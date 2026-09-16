MW DYNASTY UNIFIED APP V3.0 — REQUIRED ATHLETE ASSESSMENT

NEW ATHLETE FLOW
1. Account creation/sign-in
2. First-login tutorial (may be skipped or replayed)
3. Required Athlete Profile Assessment (cannot be bypassed for workouts)
4. MW Smart Entry assigns track tier, strength tier, phase, and starting week
5. Assigned program unlocks

REQUIRED ASSESSMENT DATA
- First and last name
- Date of birth (Athlete app eligibility is 13+)
- One or more selected events: 100m, 200m, 400m
- Consistent track-training history and recent readiness inputs

OPTIONAL / NOT-ESTABLISHED DATA
- 100m, 200m, and 400m PRs, with FAT/hand/unknown timing method
- Power Clean, Front Squat, Back Squat, and Deadlift maximums
- A new or youth athlete is never required to test or invent a 1RM

SYNCHRONIZATION
- The assessment updates the authenticated athlete profile, athlete record, PRs,
  four lifting maximums, Smart Entry assessment, and athlete_program_state.
- The athlete API refuses to return prescriptions until the required assessment
  timestamp exists.
- The coaching dashboard reads the same events, training history, PRs, maxes,
  tiers, week, and assessment status.
- Coach MW uses the same official athlete state.

COACH MW SUPPORTING KNOWLEDGE
- Both athlete-facing and coach-facing Coach MW load the same versioned science
  layer distilled from all 85 founder-supplied textbook screenshots.
- Covered domains include biomechanics, physiology, training design, sprint
  development, warm-up/cool-down, strength, plyometrics, restoration, youth
  safeguards, and 100m/200m/400m application.
- MW prescriptions and founder-approved methodology remain authoritative.
- The supporting text cannot silently replace workouts, add unapproved official
  exercises, or be presented as original MW authorship.

DEPLOYMENT
Apply the V2.9/V3.0 Supabase migration before deploying this application build.
Review RLS policies and test with new age-10, novice adult, trained, and advanced
accounts before production promotion.
