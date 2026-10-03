begin;

create or replace function private.mw_lock_workout_completion_write()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if new.athlete_id is null or new.workout_key is null then
    return new;
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(new.athlete_id::text || '|' || new.workout_key,0)
  );
  return new;
end
$function$;

drop trigger if exists mw_lock_workout_completion_write on public.workout_completions;
create trigger mw_lock_workout_completion_write
before insert or update of athlete_id,workout_key,completion_status,pace_check_status,pace_reps_total,pace_reps_hit,last_activity_at,completed_at
on public.workout_completions
for each row execute function private.mw_lock_workout_completion_write();

create or replace function public.mw_coach_sync_practice_session_to_athlete(
  p_session_id uuid,
  p_athlete_id uuid,
  p_program_week integer,
  p_program_day integer,
  p_source_program_week integer,
  p_workout_key text,
  p_distance_m integer default null,
  p_season_plan_id uuid default null,
  p_workout_cycle_id uuid default null
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
  v_current_plan uuid;
  v_current_cycle uuid;
  v_key text;
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
  if p_distance_m is not null and p_distance_m <= 0 then
    raise exception 'Invalid practice distance';
  end if;

  if v_role='coach' and not private.mw_coach_is_assigned(p_athlete_id) then
    raise exception 'This athlete is not assigned to your coach account' using errcode='42501';
  end if;

  select current_week,current_day,season_plan_id,workout_cycle_id
    into v_current_week,v_current_day,v_current_plan,v_current_cycle
  from public.athlete_program_state
  where athlete_id=p_athlete_id
  for update;

  if not found then
    raise exception 'Athlete program state not found';
  end if;

  if v_role='coach'
     and (v_current_week is distinct from p_program_week or v_current_day is distinct from p_program_day) then
    raise exception 'Practice session no longer matches the athlete current workout';
  end if;

  -- The endpoint resolves older clients' omitted plan metadata before calling us.
  if v_current_plan is not null then v_current_cycle:=null; end if;
  if p_workout_cycle_id is distinct from v_current_cycle then
    raise exception 'Practice training cycle no longer matches the athlete current workout';
  end if;
  if p_season_plan_id is distinct from v_current_plan then
    raise exception 'Practice season no longer matches the athlete current workout';
  end if;
  if v_current_plan is not null and not exists (
    select 1 from public.athlete_season_plans where id=v_current_plan and athlete_id=p_athlete_id
  ) then raise exception 'Season plan does not belong to athlete'; end if;
  v_key:=private.mw_normalize_workout_key(p_athlete_id,v_current_plan,p_program_week,p_program_day,p_workout_key,v_current_cycle);
  if v_key<>public.mw_workout_identity_key(p_athlete_id,v_current_plan,p_program_week,p_program_day,'track',v_current_cycle) then
    raise exception 'Coach practice requires the track workout slot';
  end if;

  -- Serialize all writes for this athlete/workout with the table trigger below.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_athlete_id::text || '|' || v_key,0)
  );

  -- A completed workout is immutable across different practice sessions.
  -- Retries of the same coach session remain idempotent.
  if exists (
    select 1 from public.workout_completions wc
    where wc.athlete_id=p_athlete_id
      and wc.workout_key=v_key
      and wc.completion_status='completed'
  ) and not exists (
    select 1 from public.athlete_practice_rep_results ar
    where ar.athlete_id=p_athlete_id
      and ar.workout_key=v_key
      and ar.coach_session_id=p_session_id
  ) then
    raise exception 'Current workout is already completed';
  end if;
  if exists(select 1 from public.coach_practice_timing_results
    where session_id=p_session_id and athlete_id=p_athlete_id
      and (coach_user_id=v_uid or v_role in ('admin','founder_owner'))
      and workout_key is not null and workout_key<>v_key) then
    raise exception 'Timing session belongs to another workout';
  end if;
  update public.coach_practice_timing_results
  set workout_key=v_key,season_plan_id=v_current_plan,workout_cycle_id=v_current_cycle,program_week=p_program_week,program_day=p_program_day
  where session_id=p_session_id and athlete_id=p_athlete_id and workout_key is null
    and (coach_user_id=v_uid or v_role in ('admin','founder_owner'));

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
    v_key,
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
    p_athlete_id,p_program_week,p_program_day,v_key,'completed',
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
    'workout_key',v_key,
    'rep_count',v_total,
    'pace_reps_hit',v_hit,
    'pace_check_status',v_pace_status,
    'entry_source','coach',
    'session_id',p_session_id
  );
end
$function$;



revoke all on function public.mw_coach_sync_practice_session_to_athlete(uuid,uuid,integer,integer,integer,text,integer,uuid,uuid)
from public,anon;

grant execute on function public.mw_coach_sync_practice_session_to_athlete(uuid,uuid,integer,integer,integer,text,integer,uuid,uuid)
to authenticated;

commit;
