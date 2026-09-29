-- One shared athlete Practice Mode history, regardless of who runs the timer.
-- Coach timing rows remain the detailed audit/source record.
-- athlete_practice_rep_results becomes the canonical athlete-facing performance history.

alter table public.athlete_practice_rep_results
  add column if not exists entry_source text not null default 'athlete',
  add column if not exists timing_source text not null default 'athlete',
  add column if not exists coach_user_id uuid references auth.users(id) on delete set null,
  add column if not exists coach_session_id uuid,
  add column if not exists target_min_seconds numeric(8,3),
  add column if not exists target_max_seconds numeric(8,3),
  add column if not exists actual_rest_seconds numeric(8,2),
  add column if not exists result_status text not null default 'finished',
  add column if not exists lane_number integer,
  add column if not exists division text;

alter table public.athlete_practice_rep_results
  drop constraint if exists athlete_practice_rep_results_entry_source_check,
  add constraint athlete_practice_rep_results_entry_source_check
    check (entry_source in ('athlete','coach')),
  drop constraint if exists athlete_practice_rep_results_timing_source_check,
  add constraint athlete_practice_rep_results_timing_source_check
    check (timing_source in ('athlete','coach','manual','sensor')),
  drop constraint if exists athlete_practice_rep_results_result_status_check,
  add constraint athlete_practice_rep_results_result_status_check
    check (result_status in ('finished','dnf','manual')),
  drop constraint if exists athlete_practice_rep_results_target_range_check,
  add constraint athlete_practice_rep_results_target_range_check
    check (
      (target_min_seconds is null and target_max_seconds is null)
      or (
        target_min_seconds > 0
        and target_max_seconds > 0
        and target_min_seconds <= target_max_seconds
      )
    ),
  drop constraint if exists athlete_practice_rep_results_lane_number_check,
  add constraint athlete_practice_rep_results_lane_number_check
    check (lane_number is null or lane_number between 1 and 9),
  drop constraint if exists athlete_practice_rep_results_division_check,
  add constraint athlete_practice_rep_results_division_check
    check (division is null or division in ('boys','girls','open'));

create index if not exists athlete_practice_rep_results_source_idx
  on public.athlete_practice_rep_results(athlete_id,entry_source,recorded_at desc);

create index if not exists athlete_practice_rep_results_coach_session_idx
  on public.athlete_practice_rep_results(coach_session_id,athlete_id,rep_number)
  where coach_session_id is not null;

create unique index if not exists coach_practice_timing_results_session_athlete_rep_unique
  on public.coach_practice_timing_results(session_id,athlete_id,rep_number);

create or replace function public.mw_coach_sync_practice_session_to_athlete(
  p_session_id uuid,
  p_athlete_id uuid,
  p_program_week integer,
  p_program_day integer,
  p_source_program_week integer,
  p_workout_key text,
  p_distance_m integer default null,
  p_season_plan_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_role text;
  v_current_week integer;
  v_current_day integer;
  v_total integer;
  v_hit integer;
  v_first_at timestamptz;
  v_last_at timestamptz;
  v_pace_status text;
begin
  if v_uid is null then
    raise exception 'Authentication required' using errcode='42501';
  end if;

  v_role := private.mw_current_role()::text;
  if v_role not in ('coach','admin','founder_owner') then
    raise exception 'Coach access required' using errcode='42501';
  end if;

  if p_session_id is null or p_athlete_id is null then
    raise exception 'Practice session and athlete are required';
  end if;
  if p_program_week not between 1 and 41 or p_program_day not between 1 and 7 then
    raise exception 'Invalid program week/day';
  end if;
  if p_source_program_week is not null and p_source_program_week not between 1 and 41 then
    raise exception 'Invalid source program week';
  end if;
  if coalesce(p_workout_key,'') <> format('mw-track-w%s-d%s',p_program_week,p_program_day) then
    raise exception 'Workout identity mismatch';
  end if;
  if p_distance_m is not null and p_distance_m <= 0 then
    raise exception 'Invalid practice distance';
  end if;

  if v_role='coach' and not private.mw_coach_is_assigned(p_athlete_id) then
    raise exception 'This athlete is not assigned to your coach account' using errcode='42501';
  end if;

  select current_week,current_day
    into v_current_week,v_current_day
  from public.athlete_program_state
  where athlete_id=p_athlete_id;

  if not found then
    raise exception 'Athlete program state not found';
  end if;

  if v_role='coach'
     and (v_current_week is distinct from p_program_week or v_current_day is distinct from p_program_day) then
    raise exception 'Practice session no longer matches the athlete current workout';
  end if;

  select
    count(*)::integer,
    count(*) filter (where pace_status='on_pace')::integer,
    min(created_at),
    max(created_at)
  into v_total,v_hit,v_first_at,v_last_at
  from public.coach_practice_timing_results
  where session_id=p_session_id
    and athlete_id=p_athlete_id
    and (coach_user_id=v_uid or v_role in ('admin','founder_owner'));

  if coalesce(v_total,0)=0 then
    raise exception 'No coach timing rows found for this athlete/session';
  end if;

  insert into public.athlete_practice_rep_results(
    athlete_id,workout_key,program_week,program_day,rep_number,distance_m,
    time_seconds,target_seconds,pace_status,recorded_at,season_plan_id,source_program_week,
    entry_source,timing_source,coach_user_id,coach_session_id,
    target_min_seconds,target_max_seconds,actual_rest_seconds,result_status,lane_number,division
  )
  select
    r.athlete_id,
    p_workout_key,
    p_program_week,
    p_program_day,
    r.rep_number,
    p_distance_m,
    r.time_seconds,
    r.target_seconds,
    case
      when r.pace_status='on_pace' then 'on_pace'
      when r.pace_status in ('fast','slow') then 'outside_target'
      else 'timed'
    end,
    r.created_at,
    p_season_plan_id,
    coalesce(p_source_program_week,p_program_week),
    'coach',
    coalesce(r.timing_source,'coach'),
    r.coach_user_id,
    r.session_id,
    r.target_min_seconds,
    r.target_max_seconds,
    r.actual_rest_seconds,
    coalesce(r.result_status,'finished'),
    r.lane_number,
    r.division
  from public.coach_practice_timing_results r
  where r.session_id=p_session_id
    and r.athlete_id=p_athlete_id
    and (r.coach_user_id=v_uid or v_role in ('admin','founder_owner'))
  on conflict (athlete_id,workout_key,rep_number)
  do update set
    program_week=excluded.program_week,
    program_day=excluded.program_day,
    distance_m=coalesce(excluded.distance_m,public.athlete_practice_rep_results.distance_m),
    time_seconds=excluded.time_seconds,
    target_seconds=excluded.target_seconds,
    pace_status=excluded.pace_status,
    recorded_at=excluded.recorded_at,
    season_plan_id=coalesce(excluded.season_plan_id,public.athlete_practice_rep_results.season_plan_id),
    source_program_week=excluded.source_program_week,
    entry_source=excluded.entry_source,
    timing_source=excluded.timing_source,
    coach_user_id=excluded.coach_user_id,
    coach_session_id=excluded.coach_session_id,
    target_min_seconds=excluded.target_min_seconds,
    target_max_seconds=excluded.target_max_seconds,
    actual_rest_seconds=excluded.actual_rest_seconds,
    result_status=excluded.result_status,
    lane_number=excluded.lane_number,
    division=excluded.division;

  v_pace_status := case
    when v_hit=v_total then 'all'
    when v_hit>0 then 'some'
    else 'none'
  end;

  insert into public.workout_completions(
    athlete_id,program_week,program_day,workout_key,completion_status,
    completed_at,session_rpe,pace_check_status,pace_reps_total,pace_reps_hit,
    performance_checked_at,scheduled_date,started_at,last_activity_at,
    season_plan_id,source_program_week
  )
  values(
    p_athlete_id,p_program_week,p_program_day,p_workout_key,'completed',
    coalesce(v_last_at,now()),null,v_pace_status,v_total,v_hit,
    now(),current_date,coalesce(v_first_at,now()),coalesce(v_last_at,now()),
    p_season_plan_id,coalesce(p_source_program_week,p_program_week)
  )
  on conflict (athlete_id,workout_key)
  do update set
    program_week=excluded.program_week,
    program_day=excluded.program_day,
    completion_status='completed',
    completed_at=coalesce(public.workout_completions.completed_at,excluded.completed_at),
    pace_check_status=excluded.pace_check_status,
    pace_reps_total=excluded.pace_reps_total,
    pace_reps_hit=excluded.pace_reps_hit,
    performance_checked_at=excluded.performance_checked_at,
    started_at=coalesce(public.workout_completions.started_at,excluded.started_at),
    last_activity_at=excluded.last_activity_at,
    season_plan_id=coalesce(excluded.season_plan_id,public.workout_completions.season_plan_id),
    source_program_week=excluded.source_program_week;

  return jsonb_build_object(
    'ok',true,
    'athlete_id',p_athlete_id,
    'workout_key',p_workout_key,
    'rep_count',v_total,
    'pace_reps_hit',v_hit,
    'pace_check_status',v_pace_status,
    'entry_source','coach',
    'session_id',p_session_id
  );
end
$function$;

revoke all on function public.mw_coach_sync_practice_session_to_athlete(uuid,uuid,integer,integer,integer,text,integer,uuid)
from public,anon;

grant execute on function public.mw_coach_sync_practice_session_to_athlete(uuid,uuid,integer,integer,integer,text,integer,uuid)
to authenticated;
