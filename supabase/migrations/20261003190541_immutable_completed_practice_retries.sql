begin;

-- CREATE OR REPLACE retains the existing owner, ACL and security boundary.
create or replace function public.mw_coach_commit_practice_session(
  p_session_id uuid,
  p_results jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_role text;
  v_count integer := 0;
  v_synced jsonb := '[]'::jsonb;
  v_sync jsonb;
  v_meta record;
  v_expected jsonb;
begin
  if v_uid is null then
    raise exception 'Authentication required' using errcode='42501';
  end if;

  v_role := private.mw_current_role()::text;
  if v_role not in ('coach','admin','founder_owner') then
    raise exception 'Coach access required' using errcode='42501';
  end if;

  if p_session_id is null then
    raise exception 'Practice session id is required';
  end if;
  if jsonb_typeof(p_results) <> 'array' or jsonb_array_length(p_results)=0 then
    raise exception 'Practice timing results are required';
  end if;
  if jsonb_array_length(p_results)>200 then
    raise exception 'Too many timing results in one save';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_results) as x(
      athlete_id uuid,
      program_week integer,
      program_day integer,
      source_program_week integer,
      workout_key text,
      distance_m integer,
      season_plan_id uuid,
      workout_cycle_id uuid
    )
    group by x.athlete_id
    having count(distinct concat_ws('|',
      x.program_week::text,x.program_day::text,coalesce(x.source_program_week,0)::text,
      coalesce(x.workout_key,''),coalesce(x.distance_m,0)::text,
      coalesce(x.season_plan_id::text,''),coalesce(x.workout_cycle_id::text,'')
    ))>1
  ) then
    raise exception 'Mixed workout identity for one athlete in the same practice save';
  end if;

  -- Serialize the entire session before inspecting or writing its evidence.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('mw-practice-session|' || p_session_id::text,0));
  if exists(select 1 from public.coach_practice_timing_results where session_id=p_session_id and coach_user_id<>v_uid) then
    raise exception 'Practice session belongs to another coach' using errcode='42501';
  end if;
  if v_role='coach' and exists(select 1 from jsonb_to_recordset(p_results) as x(athlete_id uuid) where not private.mw_coach_is_assigned(x.athlete_id)) then
    raise exception 'This athlete is not assigned to your coach account' using errcode='42501';
  end if;
  -- A committed session is a receipt, never an edit command. Compare the whole
  -- normalized set, including metadata stored only on athlete reps, before any
  -- current-day/week validation or writes. EXCEPT ALL also detects duplicates.
  if exists(select 1 from public.athlete_practice_rep_results where coach_session_id=p_session_id) then
    select jsonb_agg(to_jsonb(normalized)) into v_expected from (
select v_uid as coach_user_id,
x.athlete_id as athlete_id,
coalesce(x.session_date,current_date) as session_date,
left(coalesce(x.group_name,'All'),80) as group_name,
x.group_id as group_id,
p_session_id as session_id,
case when x.division in ('boys','girls','open') then x.division else null end as division,
case when x.lane_number between 1 and 9 then x.lane_number else null end as lane_number,
case when x.timing_source in ('coach','athlete','sensor','manual') then x.timing_source else 'coach' end as timing_source,
case when x.result_status in ('finished','dnf','manual') then x.result_status else 'finished' end as result_status,
x.rep_number as rep_number,
x.time_seconds as time_seconds,
x.target_seconds as target_seconds,
x.target_min_seconds as target_min_seconds,
x.target_max_seconds as target_max_seconds,
x.prescribed_rest_seconds as prescribed_rest_seconds,
x.actual_rest_seconds as actual_rest_seconds,
case when x.pace_status in ('fast','on_pace','slow') then x.pace_status else null end as pace_status,
case when x.mw_intent in ('technical','speed','pace','recovery') then x.mw_intent else 'pace' end as mw_intent,
case when x.mw_interpretation in ('above_target','on_target','pace_violation','below_target') then x.mw_interpretation else null end as mw_interpretation,
x.workout_key as workout_key,
x.season_plan_id as season_plan_id,
x.workout_cycle_id as workout_cycle_id,
x.program_week as program_week,
x.program_day as program_day
  from jsonb_to_recordset(p_results) as x(
    athlete_id uuid,
    session_date date,
    group_name text,
    group_id uuid,
    division text,
    lane_number integer,
    timing_source text,
    result_status text,
    rep_number integer,
    time_seconds numeric,
    target_seconds numeric,
    target_min_seconds numeric,
    target_max_seconds numeric,
    prescribed_rest_seconds numeric,
    actual_rest_seconds numeric,
    pace_status text,
    mw_intent text,
    mw_interpretation text,
    workout_key text,
    season_plan_id uuid,
    workout_cycle_id uuid,
    program_week integer,
    program_day integer,
    source_program_week integer,
    distance_m integer
  )

    ) normalized;
    if exists (
      (select value from jsonb_array_elements(v_expected)
       except all
       select (select jsonb_object_agg(k.key,to_jsonb(r)->k.key) from jsonb_object_keys(v_expected->0) as k(key))
       from public.coach_practice_timing_results r where r.session_id=p_session_id and r.coach_user_id=v_uid)
      union all
      (select (select jsonb_object_agg(k.key,to_jsonb(r)->k.key) from jsonb_object_keys(v_expected->0) as k(key))
       from public.coach_practice_timing_results r where r.session_id=p_session_id and r.coach_user_id=v_uid
       except all select value from jsonb_array_elements(v_expected))
    ) or (select count(*) from public.athlete_practice_rep_results where coach_session_id=p_session_id and coach_user_id=v_uid)<>jsonb_array_length(p_results)
    or exists (
      select 1 from jsonb_to_recordset(p_results) as x(athlete_id uuid,rep_number integer,program_week integer,source_program_week integer,distance_m integer,workout_key text)
      left join public.athlete_practice_rep_results ar on ar.coach_session_id=p_session_id and ar.coach_user_id=v_uid and ar.athlete_id=x.athlete_id and ar.rep_number=x.rep_number
      where ar.athlete_id is null or ar.workout_key is distinct from x.workout_key
        or ar.source_program_week is distinct from coalesce(x.source_program_week,x.program_week)
        or ar.distance_m is distinct from x.distance_m
    ) then
      raise exception 'Completed practice session is immutable';
    end if;
    return jsonb_build_object('ok',true,'count',jsonb_array_length(p_results),'sessionId',p_session_id,'replayed',true,'synced','[]'::jsonb);
  end if;

  insert into public.coach_practice_timing_results(
    coach_user_id,athlete_id,session_date,group_name,group_id,session_id,division,lane_number,
    timing_source,result_status,rep_number,time_seconds,target_seconds,target_min_seconds,
    target_max_seconds,prescribed_rest_seconds,actual_rest_seconds,pace_status,mw_intent,
    mw_interpretation,workout_key,season_plan_id,workout_cycle_id,program_week,program_day
  )
  select
    v_uid,
    x.athlete_id,
    coalesce(x.session_date,current_date),
    left(coalesce(x.group_name,'All'),80),
    x.group_id,
    p_session_id,
    case when x.division in ('boys','girls','open') then x.division else null end,
    case when x.lane_number between 1 and 9 then x.lane_number else null end,
    case when x.timing_source in ('coach','athlete','sensor','manual') then x.timing_source else 'coach' end,
    case when x.result_status in ('finished','dnf','manual') then x.result_status else 'finished' end,
    x.rep_number,
    x.time_seconds,
    x.target_seconds,
    x.target_min_seconds,
    x.target_max_seconds,
    x.prescribed_rest_seconds,
    x.actual_rest_seconds,
    case when x.pace_status in ('fast','on_pace','slow') then x.pace_status else null end,
    case when x.mw_intent in ('technical','speed','pace','recovery') then x.mw_intent else 'pace' end,
    case when x.mw_interpretation in ('above_target','on_target','pace_violation','below_target') then x.mw_interpretation else null end,
    x.workout_key,
    x.season_plan_id,
    x.workout_cycle_id,
    x.program_week,
    x.program_day
  from jsonb_to_recordset(p_results) as x(
    athlete_id uuid,
    session_date date,
    group_name text,
    group_id uuid,
    division text,
    lane_number integer,
    timing_source text,
    result_status text,
    rep_number integer,
    time_seconds numeric,
    target_seconds numeric,
    target_min_seconds numeric,
    target_max_seconds numeric,
    prescribed_rest_seconds numeric,
    actual_rest_seconds numeric,
    pace_status text,
    mw_intent text,
    mw_interpretation text,
    workout_key text,
    season_plan_id uuid,
    workout_cycle_id uuid,
    program_week integer,
    program_day integer,
    source_program_week integer,
    distance_m integer
  )
  on conflict (session_id,athlete_id,rep_number)
  do update set
    coach_user_id=excluded.coach_user_id,
    session_date=excluded.session_date,
    group_name=excluded.group_name,
    group_id=excluded.group_id,
    division=excluded.division,
    lane_number=excluded.lane_number,
    timing_source=excluded.timing_source,
    result_status=excluded.result_status,
    time_seconds=excluded.time_seconds,
    target_seconds=excluded.target_seconds,
    target_min_seconds=excluded.target_min_seconds,
    target_max_seconds=excluded.target_max_seconds,
    prescribed_rest_seconds=excluded.prescribed_rest_seconds,
    actual_rest_seconds=excluded.actual_rest_seconds,
    pace_status=excluded.pace_status,
    mw_intent=excluded.mw_intent,
    mw_interpretation=excluded.mw_interpretation,
    workout_key=excluded.workout_key,
    season_plan_id=excluded.season_plan_id,
    workout_cycle_id=excluded.workout_cycle_id,
    program_week=excluded.program_week,
    program_day=excluded.program_day;

  get diagnostics v_count = row_count;

  for v_meta in
    select distinct on (x.athlete_id)
      x.athlete_id,x.program_week,x.program_day,
      coalesce(x.source_program_week,x.program_week) as source_program_week,
      x.workout_key,x.distance_m,x.season_plan_id,x.workout_cycle_id
    from jsonb_to_recordset(p_results) as x(
      athlete_id uuid,
      program_week integer,
      program_day integer,
      source_program_week integer,
      workout_key text,
      distance_m integer,
      season_plan_id uuid,
      workout_cycle_id uuid
    )
    order by x.athlete_id
  loop
    v_sync := public.mw_coach_sync_practice_session_to_athlete(
      p_session_id,
      v_meta.athlete_id,
      v_meta.program_week,
      v_meta.program_day,
      v_meta.source_program_week,
      v_meta.workout_key,
      v_meta.distance_m,
      v_meta.season_plan_id,
      v_meta.workout_cycle_id
    );
    v_synced := v_synced || jsonb_build_array(v_sync);
  end loop;

  return jsonb_build_object(
    'ok',true,
    'count',v_count,
    'sessionId',p_session_id,
    'synced',v_synced
  );
end
$function$;


-- Also protect the separately callable sync RPC: same-session is not permission
-- to rewrite completed athlete evidence. Retain all original scope checks.
do $migration$
declare
  v_before text := pg_get_functiondef('public.mw_coach_sync_practice_session_to_athlete(uuid,uuid,integer,integer,integer,text,integer,uuid,uuid)'::regprocedure);
  v_after text;
begin
  v_after := replace(v_before,'  insert into public.athlete_practice_rep_results(', $guard$  -- A matching completed session can only confirm existing athlete evidence.
  if exists(select 1 from public.workout_completions where athlete_id=p_athlete_id and workout_key=v_key and completion_status='completed') then
    if (select count(*) from public.coach_practice_timing_results where session_id=p_session_id and athlete_id=p_athlete_id and coach_user_id=v_uid)
       <> (select count(*) from public.athlete_practice_rep_results where coach_session_id=p_session_id and athlete_id=p_athlete_id and coach_user_id=v_uid)
    or exists (
      select 1 from public.coach_practice_timing_results r
      left join public.athlete_practice_rep_results ar on ar.athlete_id=r.athlete_id and ar.workout_key=v_key and ar.rep_number=r.rep_number and ar.coach_session_id=p_session_id and ar.coach_user_id=v_uid
      where r.session_id=p_session_id and r.athlete_id=p_athlete_id and r.coach_user_id=v_uid
        and (ar.athlete_id is null or row(ar.time_seconds,ar.target_seconds,ar.target_min_seconds,ar.target_max_seconds,ar.actual_rest_seconds,ar.timing_source,ar.result_status,ar.lane_number,ar.division,ar.mw_intent,ar.mw_interpretation,ar.pace_status,ar.source_program_week,ar.distance_m)
        is distinct from row(r.time_seconds,r.target_seconds,r.target_min_seconds,r.target_max_seconds,r.actual_rest_seconds,coalesce(r.timing_source,'coach'),r.result_status,r.lane_number,r.division,r.mw_intent,r.mw_interpretation,case when r.pace_status='on_pace' then 'on_pace' when r.pace_status in ('fast','slow') then 'outside_target' else 'timed' end,coalesce(p_source_program_week,p_program_week),p_distance_m))
    ) then raise exception 'Completed practice session is immutable'; end if;
    return jsonb_build_object('ok',true,'workout_key',v_key,'replayed',true);
  end if;

  insert into public.athlete_practice_rep_results($guard$);
  if v_after=v_before then raise exception 'Practice sync insert changed'; end if;
  execute v_after;
end
$migration$;

commit;
