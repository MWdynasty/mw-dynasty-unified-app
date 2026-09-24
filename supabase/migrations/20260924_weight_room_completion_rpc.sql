-- Completion endpoint for normal and late weight-room finishes.
create or replace function public.mw_complete_own_strength_session(
  p_program_week integer,p_strength_day integer,p_outcome text,p_day_label text default null,p_is_optional boolean default false
) returns jsonb language plpgsql security definer set search_path to ''
as $function$
declare
  v_uid uuid:=auth.uid(); v_athlete uuid; v_state public.athlete_program_state%rowtype;
  v_start_week integer; v_anchor date; v_scheduled date; v_row public.athlete_strength_checkins%rowtype;
begin
  if v_uid is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if not private.mw_athlete_feature_enabled('strength_power') then raise exception 'MW Strength & Power access required' using errcode='42501'; end if;
  if p_program_week<1 or p_program_week>41 or p_strength_day<1 or p_strength_day>7 then raise exception 'Invalid strength session position'; end if;
  if p_outcome not in ('as_prescribed','modified') then raise exception 'Invalid strength completion outcome'; end if;
  select a.id into v_athlete from public.athletes a join public.profiles p on p.user_id=a.user_id
   where a.user_id=v_uid and p.account_status='active'::public.mw_account_status limit 1;
  if v_athlete is null then raise exception 'Athlete profile not found' using errcode='42501'; end if;
  select * into v_state from public.athlete_program_state where athlete_id=v_athlete;
  v_start_week:=coalesce(v_state.starting_week,v_state.current_week,1);
  if v_state.start_date is not null then
    v_anchor:=v_state.start_date+((p_program_week-v_start_week)*7);
    v_scheduled:=v_anchor+((p_strength_day-extract(isodow from v_anchor)::integer+7)%7);
  end if;
  insert into public.athlete_strength_checkins(
    athlete_id,program_week,strength_day,day_label,status,recorded_at,lifecycle_status,scheduled_date,started_at,last_activity_at,completed_at,completed_late,is_optional
  ) values (
    v_athlete,p_program_week,p_strength_day,left(coalesce(p_day_label,format('Day %s',p_strength_day)),80),p_outcome,now(),'completed',v_scheduled,
    (select min(l.recorded_at) from public.athlete_strength_session_logs l where l.athlete_id=v_athlete and l.program_week=p_program_week and l.program_day=p_strength_day),
    now(),now(),case when v_scheduled is not null and current_date>v_scheduled then true else false end,coalesce(p_is_optional,false)
  )
  on conflict (athlete_id,program_week,strength_day) do update set
    day_label=coalesce(excluded.day_label,public.athlete_strength_checkins.day_label),status=excluded.status,recorded_at=now(),lifecycle_status='completed',
    scheduled_date=coalesce(public.athlete_strength_checkins.scheduled_date,excluded.scheduled_date),started_at=coalesce(public.athlete_strength_checkins.started_at,excluded.started_at),
    last_activity_at=now(),completed_at=now(),
    completed_late=case when coalesce(public.athlete_strength_checkins.scheduled_date,excluded.scheduled_date) is not null
      and current_date>coalesce(public.athlete_strength_checkins.scheduled_date,excluded.scheduled_date) then true else public.athlete_strength_checkins.completed_late end,
    is_optional=excluded.is_optional
  returning * into v_row;
  update public.athlete_notifications set read_at=coalesce(read_at,now())
   where athlete_id=v_athlete and notification_type='strength_incomplete'
     and entity_id=format('mw-strength-w%s-d%s',p_program_week,p_strength_day) and read_at is null;
  return jsonb_build_object('athlete_id',v_row.athlete_id,'program_week',v_row.program_week,'strength_day',v_row.strength_day,
    'day_label',v_row.day_label,'status',v_row.status,'lifecycle_status',v_row.lifecycle_status,'scheduled_date',v_row.scheduled_date,
    'started_at',v_row.started_at,'completed_at',v_row.completed_at,'completed_late',v_row.completed_late,'is_optional',v_row.is_optional);
end;
$function$;
grant execute on function public.mw_complete_own_strength_session(integer,integer,text,text,boolean) to authenticated;
