MW DYNASTY UNIFIED APP V2.7 — TRAINING YEAR + SMART ENTRY CALENDAR

Added:
- MW Standard Training Year: Week 1 begins the day after Labor Day.
- Automatic current 41-week calendar position.
- Offseason/preseason protection: new athletes are not auto-dropped into late-season work outside the active 41-week cycle.
- Athlete Smart Entry now derives the official season week automatically instead of asking the athlete to guess it.
- Connected athletes inherit an assigned coach's custom season calendar when one is set.
- Coach Account now supports Standard MW Training Year or a Custom Week 1 start date.
- AI Season Planner displays the live training-year position and uses it as the scheduling reference.
- Existing readiness gates, track + strength synchronization, Coach Intelligence status board, tutorials, and V2.6 presentation remain intact.

Backend:
- coach_season_settings table + RLS
- mw_effective_season_calendar() protected function
- /api/season-calendar route

Brand/presentation baseline: V2.6 preserved.
