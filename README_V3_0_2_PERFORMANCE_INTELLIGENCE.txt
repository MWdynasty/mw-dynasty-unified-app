MW DYNASTY UNIFIED APP V3.0.2 — PERFORMANCE INTELLIGENCE

What changed
- Athlete workout completion now captures session RPE (1–10).
- Sprint Pace AI actual rep times now feed Coach Performance Intelligence.
- Athlete Strength & Power includes an actual-set logger for load, reps, set RPE and target load.
- New protected /api/coach/performance endpoint calculates:
  * latest target accuracy
  * rep consistency
  * first-to-last drop-off
  * performance trend
  * coach review/watch signals
  * recent strength-session volume and exercises
- Coach Athlete Status Board now includes performance signals.
- Coach Task Board now includes performance review/watch items.
- AI Insights is upgraded to Performance Intelligence.
- Athlete detail view now shows timed-session and strength performance.
- Coach MW secured context now includes actual pace logs, actual strength logs and workout RPE.

Safety / coaching rule
Performance signals are coaching aids, not medical diagnoses. Coach Intelligence can flag and recommend review; the human coach makes the final training decision.

Database
Production Supabase was migrated on 2026-09-13. A matching migration file is included at:
supabase/migrations/20260913_performance_intelligence_v1.sql

Deployment
Deploy this folder/zip to the existing MW Dynasty Vercel project using the same environment variables as V3.0.1.
