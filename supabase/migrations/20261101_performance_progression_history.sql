-- Read-only, authenticated athlete history for Performance Intelligence.
-- The existing summary RPC remains available to older app clients.
create or replace function public.mw_get_performance_progression_history()
returns jsonb
language plpgsql
set search_path to ''
as $function$
declare
  v_uid uuid := (select auth.uid());
  v_athlete uuid;
  v_week integer;
  v_speed jsonb := '[]'::jsonb;
  v_strength jsonb := '[]'::jsonb;
  v_completed integer := 0;
  v_weeks integer := 0;
begin
  if v_uid is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select a.id into v_athlete
  from public.athletes a
  where a.user_id = v_uid
  order by a.created_at
  limit 1;

  if v_athlete is null then
    return jsonb_build_object(
      'status', 'no_profile',
      'speed_history', '[]'::jsonb,
      'strength_history', '[]'::jsonb,
      'consistency', jsonb_build_object('completed_workouts', 0, 'program_weeks', 0)
    );
  end if;

  select s.current_week into v_week
  from public.athlete_program_state s
  where s.athlete_id = v_athlete;

  -- Preserve every saved rep and classify its intent. Tempo and technical
  -- sessions remain visible but are never eligible for speed PR comparisons.
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'recorded_at', q.recorded_at,
      'distance_m', q.distance_m,
      'time_seconds', q.time_seconds,
      'target_seconds', q.target_seconds,
      'target_min_seconds', q.target_min_seconds,
      'target_max_seconds', q.target_max_seconds,
      'pace_status', q.pace_status,
      'intent', q.mw_intent,
      'interpretation', q.mw_interpretation,
      'intent_group', q.intent_group,
      'speed_test_eligible', q.speed_test_eligible,
      'program_week', q.program_week,
      'program_day', q.program_day,
      'rep_number', q.rep_number,
      'workout_key', q.workout_key,
      'workout_cycle_id', q.workout_cycle_id
    ) order by q.recorded_at
  ), '[]'::jsonb)
  into v_speed
  from (
    select r.recorded_at, r.distance_m, r.time_seconds, r.target_seconds,
      r.target_min_seconds, r.target_max_seconds, r.pace_status,
      r.mw_intent, r.mw_interpretation, r.program_week, r.program_day,
      r.rep_number, r.workout_key, r.workout_cycle_id,
      case
        when lower(coalesce(r.mw_intent, '') || ' ' || coalesce(r.mw_interpretation, ''))
          ~ '(technical|wicket|mechanic|drill|rhythm)' then 'technical'
        when lower(coalesce(r.mw_intent, '') || ' ' || coalesce(r.mw_interpretation, ''))
          ~ '(tempo|recovery|controlled|sub.?max)' then 'tempo'
        when lower(coalesce(r.mw_intent, '') || ' ' || coalesce(r.mw_interpretation, ''))
          ~ '(max.?velocity|maximum.?velocity|fly|flying)' then 'maximum_velocity'
        when lower(coalesce(r.mw_intent, '') || ' ' || coalesce(r.mw_interpretation, ''))
          ~ '(speed.?endurance|special.?endurance|split.?run)' then 'speed_endurance'
        when lower(coalesce(r.mw_intent, '') || ' ' || coalesce(r.mw_interpretation, ''))
          ~ '(acceleration|start)' then 'acceleration'
        when lower(coalesce(r.mw_intent, '') || ' ' || coalesce(r.mw_interpretation, ''))
          ~ '(competition|race|time.?trial|sprint.?test)' then 'competition'
        else 'unclassified'
      end as intent_group,
      lower(coalesce(r.mw_intent, '') || ' ' || coalesce(r.mw_interpretation, ''))
        ~ '(max.?velocity|maximum.?velocity|fly|flying|speed.?endurance|special.?endurance|split.?run|acceleration|start|competition|race|time.?trial|sprint.?test)'
        and lower(coalesce(r.mw_intent, '') || ' ' || coalesce(r.mw_interpretation, ''))
        !~ '(tempo|recovery|controlled|sub.?max|technical|wicket|mechanic|drill|rhythm)'
        as speed_test_eligible
    from public.athlete_practice_rep_results r
    where r.athlete_id = v_athlete
      and r.distance_m > 0
      and r.time_seconds > 0
      and lower(coalesce(r.result_status, '')) <> 'dnf'
    order by r.recorded_at desc
    limit 2000
  ) q;

  -- Staging may not yet have the strength history table. Dynamic SQL keeps this
  -- read-only RPC deployable there while returning full data in production.
  if pg_catalog.to_regclass('public.athlete_strength_session_logs') is not null then
    execute $sql$
      select coalesce(jsonb_agg(
        jsonb_build_object(
          'recorded_at', q.recorded_at,
          'exercise', q.exercise_name,
          'weight', q.actual_load,
          'reps', q.reps_completed,
          'unit', coalesce(nullif(trim(q.weight_unit), ''), 'lb'),
          'estimated_1rm', round(q.actual_load * (1 + q.reps_completed / 30.0), 2),
          'program_week', q.program_week,
          'program_day', q.program_day,
          'set_number', q.set_number,
          'training_cycle_key', q.training_cycle_key
        ) order by q.recorded_at
      ), '[]'::jsonb)
      from (
        select l.recorded_at, l.exercise_name, l.actual_load, l.reps_completed,
          l.weight_unit, l.program_week, l.program_day, l.set_number,
          l.training_cycle_key
        from public.athlete_strength_session_logs l
        where l.athlete_id = $1
          and l.actual_load > 0
          and l.reps_completed between 1 and 12
          and nullif(trim(l.exercise_name), '') is not null
        order by l.recorded_at desc
        limit 2000
      ) q
    $sql$ into v_strength using v_athlete;
  end if;

  if pg_catalog.to_regclass('public.workout_completions') is not null then
    execute $sql$
      select count(*)::integer,
        count(distinct program_week) filter (where program_week between 1 and 41)::integer
      from public.workout_completions
      where athlete_id = $1 and completion_status = 'completed'
    $sql$ into v_completed, v_weeks using v_athlete;
  end if;

  return jsonb_build_object(
    'status', 'ok',
    'current_week', v_week,
    'speed_history', v_speed,
    'strength_history', v_strength,
    'consistency', jsonb_build_object(
      'completed_workouts', coalesce(v_completed, 0),
      'program_weeks', coalesce(v_weeks, 0)
    )
  );
end
$function$;

revoke all on function public.mw_get_performance_progression_history() from public;
revoke all on function public.mw_get_performance_progression_history() from anon;
grant execute on function public.mw_get_performance_progression_history() to authenticated;
