MW DYNASTY UNIFIED APP V3.0.3 — SIMPLE CHECK-INS

Athlete experience
- Workout completion is now low-input: tap DONE.
- Paceable workouts ask one question: "Did you hit your target pace for every rep?"
- YES logs all reps on pace.
- NO shows large 0/N through N/N tap choices. No typing required.
- Detailed Sprint Pace AI timing remains optional.
- Strength logging now defaults to two buttons: DID IT / CHANGED IT.
- Detailed set logging is still available under an optional expandable section.
- Athlete home is reduced to three primary actions: Start Training, Ask Coach MW, Training Tools.
- Onboarding reduced to four simple steps.

Coach experience
- Main navigation reduced to five choices.
- Dashboard uses large simple actions and hides advanced tools under More.
- Performance Intelligence now reads both quick pace check-ins and detailed timed reps.
- Generic Pace Execution score supports both sources while preserving detailed target-accuracy data internally.
- Strength quick check-ins appear alongside optional detailed set logs.

Backend
- workout_completions now stores pace_check_status, pace_reps_total, pace_reps_hit and performance_checked_at.
- athlete_strength_checkins stores lightweight strength completion/modified signals.
- RLS keeps athletes limited to their own logs while assigned coaches / founder / admin can read authorized athlete performance.

The database migration was applied to the MW Dynasty Supabase project on 2026-09-13.
