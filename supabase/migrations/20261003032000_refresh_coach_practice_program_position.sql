begin;

create or replace function public.mw_coach_refresh_assigned_athlete_program_position(
  p_athlete_id uuid,
  p_session_date date
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_role text := private.mw_current_role()::text;
  v_state public.athlete_program_state%rowtype;
  v_plan_start date;
  v_plan_length integer;
  v_peak_date date;
  v_expected_week integer;
  v_expected_day integer;
begin
  if v_uid is null then
    raise exception 'Authentication required' using errcode='42501';
  end if;
  if v_role not in ('coach','admin','founder_owner') then
    raise exception 'Coach access required' using errcode='42501';
  end if;
  if v_role='coach' and not private.mw_coach_is_assigned(p_athlete_id) then
    raise exception 'This athlete is not assigned to your coach account' using errcode='42501';
  end if;
  if p_session_date is null then
    raise exception 'Session date is required';
  end if;

  select * into v_state
  from public.athlete_program_state
  where athlete_id=p_athlete_id
  for update;

  if not found then
    raise exception 'Athlete program state not found';
  end if;

  v_expected_day:=extract(isodow from p_session_date)::integer;

  if v_state.season_plan_id is not null then
    select season_start_date,season_length_weeks,primary_peak_date
      into v_plan_start,v_plan_length,v_peak_date
    from public.athlete_season_plans
    where id=v_state.season_plan_id and athlete_id=p_athlete_id;

    if v_plan_start is null then
      raise exception 'Season plan does not belong to athlete';
    end if;

    v_expected_week:=case
      when p_session_date<v_plan_start then 1
      when v_peak_date is not null and p_session_date>v_peak_date then least(coalesce(v_plan_length,41),41)
      else least(coalesce(v_plan_length,41),greatest(1,floor((p_session_date-v_plan_start)/7.0)::integer+1))
    end;
  elsif v_state.start_date is not null then
    v_expected_week:=case
      when p_session_date<v_state.start_date then coalesce(v_state.starting_week,v_state.current_week,1)
      else least(41,coalesce(v_state.starting_week,v_state.current_week,1)+greatest(0,floor((p_session_date-v_state.start_date)/7.0)::integer))
    end;
  else
    v_expected_week:=v_state.current_week;
  end if;

  update public.athlete_program_state
  set current_week=v_expected_week,
      current_day=v_expected_day,
      updated_at=now()
  where athlete_id=p_athlete_id;

  return jsonb_build_object(
    'ok',true,
    'athlete_id',p_athlete_id,
    'current_week',v_expected_week,
    'current_day',v_expected_day
  );
end
$function$;

revoke all on function public.mw_coach_refresh_assigned_athlete_program_position(uuid,date)
from public,anon;

grant execute on function public.mw_coach_refresh_assigned_athlete_program_position(uuid,date)
to authenticated;

commit;
