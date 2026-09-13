MW DYNASTY UNIFIED APP V2.9 — TIERED PROGRAM + SHARED ATHLETE STATE

This build introduces one versioned 41-week program service used by the athlete API,
coach program API, athlete-facing Coach MW, and coach-facing Coach MW.

TIERS
- Foundation: reduced volume and complexity, longer recovery, technique-first and
  age-appropriate strength rules.
- Development: controlled volume, progressive complexity, and submaximal strength.
- Performance: complete MW prescription for prepared advanced/pro athletes.

SYNCHRONIZATION
- athlete_program_state is the source of truth for track_tier, strength_tier,
  current_week, current_day, phase, status, and program_version.
- Athlete program requests always resolve from that state.
- Coach athlete detail reads the same state and provides a coach-approved assignment
  control.
- Every coach-approved tier/week change is written to
  athlete_program_assignment_history.
- Both Coach MW experiences receive the same tier/version context.
- Four prescribed sessions remain the progression requirement. A meet or optional
  primer/recovery item is a calendar event, not a fifth required completion.

DEPLOYMENT ORDER
1. Back up the production database and existing V2.8 deployment.
2. Review and apply supabase/migrations/20260912_mw_tiered_program_sync.sql.
3. Add RLS policies for assignment history matching the existing athlete,
   assigned-coach, admin, and founder rules.
4. Deploy this build to a preview environment.
5. Test one Foundation, Development, and Performance athlete through both apps.
6. Promote only after athlete/coach parity checks pass. Archive V2.8; do not delete
   the rollback copy.

IMPORTANT
This build does not medically clear athletes. Youth lifting and advanced sprint work
require appropriate supervision, readiness, and technique.
