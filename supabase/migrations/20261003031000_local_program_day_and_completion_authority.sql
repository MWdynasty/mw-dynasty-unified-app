begin;

create or replace function private.mw_request_time_zone()
returns text
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_headers jsonb := '{}'::jsonb;
  v_tz text := 'UTC';
begin
  begin
    v_headers := coalesce(nullif(current_setting('request.headers',true),''),'{}')::jsonb;
  exception when others then
    v_headers := '{}'::jsonb;
  end;
  v_tz := nullif(left(coalesce(v_headers->>'x-mw-time-zone',''),80),'');
  if v_tz is null or not exists(select 1 from pg_catalog.pg_timezone_names where name=v_tz) then
    v_tz := 'UTC';
  end if;
  return v_tz;
end
$function$;

do $do$
begin
  if to_regprocedure('public.mw_refresh_own_program_state_local_core()') is null
     and to_regprocedure('public.mw_refresh_own_program_state()') is not null then
    execute 'alter function public.mw_refresh_own_program_state() rename to mw_refresh_own_program_state_local_core';
  end if;
  if to_regprocedure('public.mw_refresh_own_season_program_state_local_core()') is null
     and to_regprocedure('public.mw_refresh_own_season_program_state()') is not null then
    execute 'alter function public.mw_refresh_own_season_program_state() rename to mw_refresh_own_season_program_state_local_core';
  end if;
end
$do$;

create or replace function public.mw_refresh_own_program_state()
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_tz text := private.mw_request_time_zone();
begin
  perform pg_catalog.set_config('TimeZone',v_tz,true);
  return public.mw_refresh_own_program_state_local_core();
end
$function$;

create or replace function public.mw_refresh_own_season_program_state()
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_tz text := private.mw_request_time_zone();
begin
  perform pg_catalog.set_config('TimeZone',v_tz,true);
  return public.mw_refresh_own_season_program_state_local_core();
end
$function$;

revoke all on function public.mw_refresh_own_program_state() from public,anon;
grant execute on function public.mw_refresh_own_program_state() to authenticated;
revoke all on function public.mw_refresh_own_season_program_state() from public,anon;
grant execute on function public.mw_refresh_own_season_program_state() to authenticated;

create or replace function private.mw_stamp_workout_status()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_is_athlete_self boolean := false;
  v_has_coach_evidence boolean := false;
  v_tz text := private.mw_request_time_zone();
begin
  if tg_op='UPDATE' and old.completion_status='completed' and new.completion_status<>'completed' then
    new.completion_status:='completed';
    new.completed_at:=old.completed_at;
    new.completed_late:=old.completed_late;
  end if;

  if tg_op='UPDATE' and old.completion_status='completed' and new.completion_status='completed' then
    select exists(
      select 1 from public.athletes a
      where a.id=new.athlete_id and a.user_id=auth.uid()
    ) into v_is_athlete_self;

    if v_is_athlete_self then
      select exists(
        select 1 from public.athlete_practice_rep_results pr
        where pr.athlete_id=old.athlete_id
          and pr.workout_key=old.workout_key
          and pr.coach_session_id is not null
      ) into v_has_coach_evidence;

      if v_has_coach_evidence then
        new.completed_at:=old.completed_at;
        new.started_at:=coalesce(old.started_at,new.started_at);
        new.pace_check_status:=old.pace_check_status;
        new.pace_reps_total:=old.pace_reps_total;
        new.pace_reps_hit:=old.pace_reps_hit;
        new.performance_checked_at:=old.performance_checked_at;
        new.season_plan_id:=coalesce(old.season_plan_id,new.season_plan_id);
        new.workout_cycle_id:=coalesce(old.workout_cycle_id,new.workout_cycle_id);
        new.source_program_week:=coalesce(old.source_program_week,new.source_program_week);
      end if;
    end if;
  end if;

  if new.completion_status='in_progress' and new.started_at is null then
    new.started_at:=now();
  end if;
  if new.completion_status='completed' then
    new.completed_at:=coalesce(new.completed_at,now());
    if new.scheduled_date is not null
       and (new.completed_at at time zone v_tz)::date>new.scheduled_date then
      new.completed_late:=true;
    elsif new.scheduled_date is not null then
      new.completed_late:=false;
    end if;
  end if;
  new.last_activity_at:=now();
  return new;
end
$function$;

commit;
