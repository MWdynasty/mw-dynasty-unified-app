-- MW Dynasty weight-room lifecycle synchronization
alter table public.athlete_strength_checkins
  add column if not exists lifecycle_status text not null default 'scheduled',
  add column if not exists scheduled_date date,
  add column if not exists started_at timestamptz,
  add column if not exists last_activity_at timestamptz not null default now(),
  add column if not exists completed_at timestamptz,
  add column if not exists completed_late boolean not null default false,
  add column if not exists is_optional boolean not null default false;

alter table public.athlete_strength_checkins alter column status drop not null;
alter table public.athlete_strength_checkins drop constraint if exists athlete_strength_checkins_lifecycle_status_check;
alter table public.athlete_strength_checkins add constraint athlete_strength_checkins_lifecycle_status_check
check (lifecycle_status = any(array['scheduled'::text,'in_progress'::text,'incomplete'::text,'absent'::text,'completed'::text]));

update public.athlete_strength_checkins
set lifecycle_status=case
  when status in ('as_prescribed','modified') then 'completed'
  when status='partial' then 'incomplete'
  when status='skipped' then 'absent'
  else lifecycle_status end,
completed_at=case when status in ('as_prescribed','modified') then coalesce(completed_at,recorded_at) else completed_at end,
last_activity_at=coalesce(recorded_at,now());

create index if not exists athlete_strength_checkins_lifecycle_idx
on public.athlete_strength_checkins(athlete_id,lifecycle_status,program_week,strength_day);

create unique index if not exists athlete_strength_session_logs_set_unique
on public.athlete_strength_session_logs(athlete_id,program_week,program_day,exercise_name,set_number);

create or replace function private.mw_stamp_strength_checkin()
returns trigger language plpgsql security definer set search_path to ''
as $function$
begin
  if tg_op='UPDATE' and old.lifecycle_status='completed' and new.lifecycle_status<>'completed' then
    new.lifecycle_status:='completed'; new.completed_at:=old.completed_at; new.completed_late:=old.completed_late; new.status:=coalesce(old.status,new.status);
  end if;
  if new.lifecycle_status='in_progress' and new.started_at is null then new.started_at:=now(); end if;
  if new.lifecycle_status='incomplete' and new.status is null then new.status:='partial'; end if;
  if new.lifecycle_status='absent' and new.status is null then new.status:='skipped'; end if;
  if new.status in ('as_prescribed','modified') then
    new.lifecycle_status:='completed'; new.completed_at:=coalesce(new.completed_at,now());
    if new.scheduled_date is not null and new.completed_at::date>new.scheduled_date then new.completed_late:=true; end if;
  end if;
  new.last_activity_at:=now(); return new;
end;
$function$;

drop trigger if exists mw_stamp_strength_checkin on public.athlete_strength_checkins;
create trigger mw_stamp_strength_checkin before insert or update on public.athlete_strength_checkins
for each row execute function private.mw_stamp_strength_checkin();

create or replace function public.mw_mark_own_strength_status(
  p_program_week integer,p_strength_day integer,p_status text,p_day_label text default null,p_is_optional boolean default false
) returns jsonb language plpgsql security definer set search_path to ''
as $function$
declare
  v_uid uuid:=auth.uid(); v_athlete uuid; v_state public.athlete_program_state%rowtype;
  v_start_week integer; v_anchor date; v_scheduled date; v_entity text; v_row public.athlete_strength_checkins%rowtype;
begin
  if v_uid is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if not private.mw_athlete_feature_enabled('strength_power') then raise exception 'MW Strength & Power access required' using errcode='42501'; end if;
  if p_program_week<1 or p_program_week>41 or p_strength_day<1 or p_strength_day>7 then raise exception 'Invalid strength session position'; end if;
  if p_status not in ('scheduled','in_progress','incomplete') then raise exception 'Invalid strength session status'; end if;
  select a.id into v_athlete from public.athletes a join public.profiles p on p.user_id=a.user_id
   where a.user_id=v_uid and p.account_status='active'::public.mw_account_status limit 1;
  if v_athlete is null then raise exception 'Athlete profile not found' using errcode='42501'; end if;
  select * into v_state from public.athlete_program_state where athlete_id=v_athlete;
  v_start_week:=coalesce(v_state.starting_week,v_state.current_week,1);
  if v_state.start_date is not null then
    v_anchor:=v_state.start_date+((p_program_week-v_start_week)*7);
    v_scheduled:=v_anchor+((p_strength_day-extract(isodow from v_anchor)::integer+7)%7);
  end if;
  v_entity:=format('mw-strength-w%s-d%s',p_program_week,p_strength_day);
  insert into public.athlete_strength_checkins(
    athlete_id,program_week,strength_day,day_label,status,recorded_at,lifecycle_status,scheduled_date,started_at,last_activity_at,is_optional
  ) values (
    v_athlete,p_program_week,p_strength_day,left(coalesce(p_day_label,format('Day %s',p_strength_day)),80),
    case when p_status='incomplete' then 'partial' else null end,now(),p_status,v_scheduled,
    case when p_status in ('in_progress','incomplete') then now() else null end,now(),coalesce(p_is_optional,false)
  )
  on conflict (athlete_id,program_week,strength_day) do update set
    lifecycle_status=case when public.athlete_strength_checkins.lifecycle_status='completed' then 'completed' else excluded.lifecycle_status end,
    status=case when public.athlete_strength_checkins.lifecycle_status='completed' then public.athlete_strength_checkins.status when excluded.lifecycle_status='incomplete' then 'partial' else public.athlete_strength_checkins.status end,
    day_label=coalesce(public.athlete_strength_checkins.day_label,excluded.day_label),
    scheduled_date=coalesce(public.athlete_strength_checkins.scheduled_date,excluded.scheduled_date),
    started_at=case when public.athlete_strength_checkins.lifecycle_status='completed' then public.athlete_strength_checkins.started_at else coalesce(public.athlete_strength_checkins.started_at,excluded.started_at) end,
    last_activity_at=now(),is_optional=coalesce(public.athlete_strength_checkins.is_optional,excluded.is_optional)
  returning * into v_row;
  if p_status='incomplete' and v_row.lifecycle_status='incomplete'
     and coalesce((select s.workout_reminders from public.athlete_settings s where s.athlete_id=v_athlete),true)
     and not exists(select 1 from public.athlete_notifications n where n.athlete_id=v_athlete and n.notification_type='strength_incomplete' and n.entity_id=v_entity and n.read_at is null) then
    insert into public.athlete_notifications(athlete_id,notification_type,title,body,action_view,entity_type,entity_id)
    values(v_athlete,'strength_incomplete','Finish logging your weight-room session',
      format('Week %s · %s is incomplete. Your saved sets are still here—tap to finish.',p_program_week,coalesce(nullif(p_day_label,''),format('Day %s',p_strength_day))),
      'workouts','strength_session',v_entity);
  end if;
  return jsonb_build_object('athlete_id',v_row.athlete_id,'program_week',v_row.program_week,'strength_day',v_row.strength_day,
    'day_label',v_row.day_label,'status',v_row.status,'lifecycle_status',v_row.lifecycle_status,'scheduled_date',v_row.scheduled_date,
    'started_at',v_row.started_at,'completed_at',v_row.completed_at,'completed_late',v_row.completed_late,'is_optional',v_row.is_optional);
end;
$function$;
grant execute on function public.mw_mark_own_strength_status(integer,integer,text,text,boolean) to authenticated;

create or replace function public.mw_refresh_own_strength_schedule(p_schedule jsonb)
returns jsonb language plpgsql security definer set search_path to ''
as $function$
declare
  v_uid uuid:=auth.uid(); v_athlete uuid; v_state public.athlete_program_state%rowtype; v_start_week integer;
  v_item jsonb; v_week integer; v_day integer; v_label text; v_optional boolean; v_anchor date; v_scheduled date;
  v_entity text; v_has_sets boolean; v_row public.athlete_strength_checkins%rowtype; v_processed integer:=0;
begin
  if v_uid is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if not private.mw_athlete_feature_enabled('strength_power') then return jsonb_build_object('ok',true,'processed',0,'reason','strength_power_not_enabled'); end if;
  select a.id into v_athlete from public.athletes a join public.profiles p on p.user_id=a.user_id
   where a.user_id=v_uid and p.account_status='active'::public.mw_account_status limit 1;
  if v_athlete is null then raise exception 'Athlete profile not found' using errcode='42501'; end if;
  select * into v_state from public.athlete_program_state where athlete_id=v_athlete;
  if v_state.start_date is null then return jsonb_build_object('ok',true,'processed',0,'reason','program_not_started'); end if;
  v_start_week:=coalesce(v_state.starting_week,v_state.current_week,1);
  for v_item in select value from jsonb_array_elements(coalesce(p_schedule,'[]'::jsonb)) loop
    v_week:=nullif(v_item->>'week','')::integer; v_day:=nullif(v_item->>'day','')::integer;
    v_label:=left(coalesce(nullif(v_item->>'label',''),format('Day %s',v_day)),80); v_optional:=coalesce((v_item->>'optional')::boolean,false);
    if v_week is null or v_day is null or v_week<1 or v_week>41 or v_day<1 or v_day>7 then continue; end if;
    v_anchor:=v_state.start_date+((v_week-v_start_week)*7);
    v_scheduled:=v_anchor+((v_day-extract(isodow from v_anchor)::integer+7)%7);
    v_entity:=format('mw-strength-w%s-d%s',v_week,v_day);
    select exists(select 1 from public.athlete_strength_session_logs l where l.athlete_id=v_athlete and l.program_week=v_week and l.program_day=v_day) into v_has_sets;
    select * into v_row from public.athlete_strength_checkins c where c.athlete_id=v_athlete and c.program_week=v_week and c.strength_day=v_day;
    if v_scheduled=current_date then
      insert into public.athlete_strength_checkins(athlete_id,program_week,strength_day,day_label,status,recorded_at,lifecycle_status,scheduled_date,last_activity_at,is_optional)
      values(v_athlete,v_week,v_day,v_label,null,now(),case when v_has_sets then 'in_progress' else 'scheduled' end,v_scheduled,now(),v_optional)
      on conflict (athlete_id,program_week,strength_day) do update set
        day_label=excluded.day_label,scheduled_date=coalesce(public.athlete_strength_checkins.scheduled_date,excluded.scheduled_date),
        lifecycle_status=case when public.athlete_strength_checkins.lifecycle_status='completed' then 'completed'
          when public.athlete_strength_checkins.lifecycle_status='incomplete' then 'incomplete'
          when v_has_sets then 'in_progress' else public.athlete_strength_checkins.lifecycle_status end,
        started_at=case when v_has_sets then coalesce(public.athlete_strength_checkins.started_at,
          (select min(l.recorded_at) from public.athlete_strength_session_logs l where l.athlete_id=v_athlete and l.program_week=v_week and l.program_day=v_day))
          else public.athlete_strength_checkins.started_at end,last_activity_at=now(),is_optional=excluded.is_optional;
    elsif v_scheduled<current_date then
      if v_row.id is not null and v_row.lifecycle_status='completed' then
        update public.athlete_strength_checkins set scheduled_date=coalesce(scheduled_date,v_scheduled),day_label=coalesce(day_label,v_label),is_optional=v_optional,last_activity_at=now() where id=v_row.id;
      elsif v_optional and not v_has_sets and v_row.id is null then
        null;
      else
        insert into public.athlete_strength_checkins(athlete_id,program_week,strength_day,day_label,status,recorded_at,lifecycle_status,scheduled_date,started_at,last_activity_at,is_optional)
        values(v_athlete,v_week,v_day,v_label,case when v_has_sets then 'partial' else 'skipped' end,now(),
          case when v_has_sets then 'incomplete' else 'absent' end,v_scheduled,
          (select min(l.recorded_at) from public.athlete_strength_session_logs l where l.athlete_id=v_athlete and l.program_week=v_week and l.program_day=v_day),now(),v_optional)
        on conflict (athlete_id,program_week,strength_day) do update set
          day_label=excluded.day_label,scheduled_date=coalesce(public.athlete_strength_checkins.scheduled_date,excluded.scheduled_date),
          lifecycle_status=case when public.athlete_strength_checkins.lifecycle_status='completed' then 'completed' when v_has_sets then 'incomplete'
            when public.athlete_strength_checkins.lifecycle_status in ('in_progress','incomplete') then 'incomplete' else 'absent' end,
          status=case when public.athlete_strength_checkins.lifecycle_status='completed' then public.athlete_strength_checkins.status
            when v_has_sets or public.athlete_strength_checkins.lifecycle_status in ('in_progress','incomplete') then 'partial' else 'skipped' end,
          started_at=coalesce(public.athlete_strength_checkins.started_at,
            (select min(l.recorded_at) from public.athlete_strength_session_logs l where l.athlete_id=v_athlete and l.program_week=v_week and l.program_day=v_day)),
          last_activity_at=now(),is_optional=excluded.is_optional;
      end if;
      if coalesce((select s.workout_reminders from public.athlete_settings s where s.athlete_id=v_athlete),true)
        and exists(select 1 from public.athlete_strength_checkins c where c.athlete_id=v_athlete and c.program_week=v_week and c.strength_day=v_day and c.lifecycle_status='incomplete')
        and not exists(select 1 from public.athlete_notifications n where n.athlete_id=v_athlete and n.notification_type='strength_incomplete' and n.entity_id=v_entity and n.read_at is null) then
        insert into public.athlete_notifications(athlete_id,notification_type,title,body,action_view,entity_type,entity_id)
        values(v_athlete,'strength_incomplete','Finish logging your weight-room session',
          format('Week %s · %s is incomplete. Your saved sets are still here—tap to finish.',v_week,v_label),'workouts','strength_session',v_entity);
      end if;
    end if;
    v_processed:=v_processed+1;
  end loop;
  return jsonb_build_object('ok',true,'processed',v_processed);
end;
$function$;
grant execute on function public.mw_refresh_own_strength_schedule(jsonb) to authenticated;
