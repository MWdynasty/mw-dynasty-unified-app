grant update (
  athlete_id,
  program_week,
  program_day,
  workout_key,
  completion_status,
  session_rpe,
  pace_check_status,
  pace_reps_total,
  pace_reps_hit,
  performance_checked_at,
  completed_at
) on table public.workout_completions to authenticated;
