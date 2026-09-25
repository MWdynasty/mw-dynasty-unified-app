-- MW Dynasty Season Intelligence — covering indexes for new foreign keys.
-- Safe, additive, and idempotent. This is a follow-up because the original
-- Season Intelligence cycle migration has already been applied in production.

create index if not exists workout_completions_season_fk_idx
  on public.workout_completions(season_plan_id)
  where season_plan_id is not null;

create index if not exists practice_rep_results_season_fk_idx
  on public.athlete_practice_rep_results(season_plan_id)
  where season_plan_id is not null;

create index if not exists strength_checkins_season_fk_idx
  on public.athlete_strength_checkins(season_plan_id)
  where season_plan_id is not null;

create index if not exists strength_logs_season_fk_idx
  on public.athlete_strength_session_logs(season_plan_id)
  where season_plan_id is not null;

create index if not exists athlete_season_plans_continuation_idx
  on public.athlete_season_plans(continuation_from_plan_id)
  where continuation_from_plan_id is not null;

create index if not exists athlete_season_plans_coach_context_idx
  on public.athlete_season_plans(coach_context_id)
  where coach_context_id is not null;

create index if not exists athlete_season_targets_dependency_idx
  on public.athlete_season_targets(qualification_dependency_target_id)
  where qualification_dependency_target_id is not null;

create index if not exists athlete_season_targets_calendar_event_idx
  on public.athlete_season_targets(coach_calendar_event_id)
  where coach_calendar_event_id is not null;

create index if not exists athlete_season_revisions_athlete_idx
  on public.athlete_season_plan_revisions(athlete_id);

create index if not exists athlete_season_revisions_changed_by_idx
  on public.athlete_season_plan_revisions(changed_by)
  where changed_by is not null;

create index if not exists coach_calendar_events_parent_event_idx
  on public.coach_calendar_events(parent_event_id)
  where parent_event_id is not null;

create index if not exists coach_season_context_group_idx
  on public.coach_season_contexts(group_id)
  where group_id is not null;
