-- MW Dynasty Season Intelligence: isolate workout/strength history by training cycle.
-- This keeps the existing 41-week history intact while allowing Indoor, Outdoor,
-- AAU/USATF, collegiate, and professional plans to reuse Season Week numbers safely.

alter table public.workout_completions
  add column if not exists season_plan_id uuid references public.athlete_season_plans(id) on delete set null,
  add column if not exists source_program_week integer;

alter table public.athlete_practice_rep_results
  add column if not exists season_plan_id uuid references public.athlete_season_plans(id) on delete set null,
  add column if not exists source_program_week integer;

alter table public.athlete_strength_checkins
  add column if not exists training_cycle_key text not null default 'mw-41',
  add column if not exists season_plan_id uuid references public.athlete_season_plans(id) on delete set null,
  add column if not exists source_program_week integer;

alter table public.athlete_strength_session_logs
  add column if not exists training_cycle_key text not null default 'mw-41',
  add column if not exists season_plan_id uuid references public.athlete_season_plans(id) on delete set null,
  add column if not exists source_program_week integer;

alter table public.workout_completions drop constraint if exists workout_completions_source_program_week_check;
alter table public.workout_completions add constraint workout_completions_source_program_week_check
  check (source_program_week is null or source_program_week between 1 and 41);
alter table public.athlete_practice_rep_results drop constraint if exists athlete_practice_rep_results_source_program_week_check;
alter table public.athlete_practice_rep_results add constraint athlete_practice_rep_results_source_program_week_check
  check (source_program_week is null or source_program_week between 1 and 41);
alter table public.athlete_strength_checkins drop constraint if exists athlete_strength_checkins_source_program_week_check;
alter table public.athlete_strength_checkins add constraint athlete_strength_checkins_source_program_week_check
  check (source_program_week is null or source_program_week between 1 and 41);
alter table public.athlete_strength_session_logs drop constraint if exists athlete_strength_session_logs_source_program_week_check;
alter table public.athlete_strength_session_logs add constraint athlete_strength_session_logs_source_program_week_check
  check (source_program_week is null or source_program_week between 1 and 41);

alter table public.athlete_strength_checkins
  drop constraint if exists athlete_strength_checkins_athlete_id_program_week_strength__key;
alter table public.athlete_strength_checkins
  drop constraint if exists athlete_strength_checkins_cycle_unique;
alter table public.athlete_strength_checkins
  add constraint athlete_strength_checkins_cycle_unique
  unique (athlete_id,training_cycle_key,program_week,strength_day);

drop index if exists public.athlete_strength_session_logs_set_unique;
create unique index athlete_strength_session_logs_cycle_set_unique
  on public.athlete_strength_session_logs(
    athlete_id,training_cycle_key,program_week,program_day,exercise_name,set_number
  );

create index if not exists workout_completions_season_plan_idx
  on public.workout_completions(athlete_id,season_plan_id,program_week,program_day);
create index if not exists practice_rep_results_season_plan_idx
  on public.athlete_practice_rep_results(athlete_id,season_plan_id,program_week,program_day);
create index if not exists strength_checkins_cycle_idx
  on public.athlete_strength_checkins(athlete_id,training_cycle_key,program_week,strength_day);
create index if not exists strength_logs_cycle_idx
  on public.athlete_strength_session_logs(athlete_id,training_cycle_key,program_week,program_day);

grant update (season_plan_id,source_program_week) on public.workout_completions to authenticated;

create or replace function public.mw_mark_own_workout_status(
  p_program_week integer,
  p_program_day integer,
  p_status text
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_athlete uuid;
  v_state public.athlete_program_state%rowtype;
  v_start_week integer;
  v_anchor date;
  v_scheduled date;
  v_key text;
  v_source integer;
  v_row public.workout_completions%rowtype;
begin
  if v_uid is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if not private.mw_athlete_feature_enabled('mw_training_system') then raise exception 'MW Training System access required' using errcode='42501'; end if;
  if p_program_week < 1 or p_program_week > 41 or p_program_day < 1 or p_program_day > 4 then raise exception 'Invalid MW workout position'; end if;
  if p_status not in ('scheduled','in_progress','incomplete') then raise exception 'Invalid workout status'; end if;

  select a.id into v_athlete
  from public.athletes a join public.profiles p on p.user_id=a.user_id
  where a.user_id=v_uid and p.account_status='active'::public.mw_account_status
  limit 1;
  if v_athlete is null then raise exception 'Athlete profile not found' using errcode='42501'; end if;

  select * into v_state from public.athlete_program_state where athlete_id=v_athlete;
  if v_state.season_plan_id is not null and p_program_week > coalesce(v_state.season_length_weeks,41) then
    raise exception 'Workout week is outside the active MW season plan';
  end if;

  v_start_week := case when v_state.season_plan_id is null then coalesce(v_state.starting_week,v_state.current_week,1) else 1 end;
  if v_state.start_date is not null then
    v_anchor := v_state.start_date + ((p_program_week-v_start_week)*7);
    v_scheduled := v_anchor + ((p_program_day-extract(isodow from v_anchor)::integer+7)%7);
  end if;

  if v_state.season_plan_id is null then
    v_key := format('mw-track-w%s-d%s',p_program_week,p_program_day);
    v_source := p_program_week;
  else
    v_key := format('mw-season-%s-w%s-d%s',v_state.season_plan_id,p_program_week,p_program_day);
    select coalesce(nullif(sp.source_week_map->(p_program_week::text)->>'sourceWeek','')::integer,p_program_week)
      into v_source
    from public.athlete_season_plans sp
    where sp.id=v_state.season_plan_id and sp.athlete_id=v_athlete;
    v_source := coalesce(v_source,p_program_week);
  end if;

  insert into public.workout_completions(
    athlete_id,program_week,program_day,workout_key,completion_status,
    scheduled_date,started_at,last_activity_at,completed_at,season_plan_id,source_program_week
  ) values (
    v_athlete,p_program_week,p_program_day,v_key,p_status,v_scheduled,
    case when p_status in ('in_progress','incomplete') then now() else null end,
    now(),null,v_state.season_plan_id,v_source
  )
  on conflict (athlete_id,workout_key) do update
  set completion_status=case when public.workout_completions.completion_status='completed' then 'completed' else excluded.completion_status end,
      scheduled_date=coalesce(public.workout_completions.scheduled_date,excluded.scheduled_date),
      started_at=case when public.workout_completions.completion_status='completed' then public.workout_completions.started_at else coalesce(public.workout_completions.started_at,excluded.started_at) end,
      last_activity_at=now(),
      season_plan_id=coalesce(public.workout_completions.season_plan_id,excluded.season_plan_id),
      source_program_week=coalesce(public.workout_completions.source_program_week,excluded.source_program_week)
  returning * into v_row;

  if p_status='incomplete'
     and v_row.completion_status='incomplete'
     and coalesce((select s.workout_reminders from public.athlete_settings s where s.athlete_id=v_athlete),true)
     and not exists(
       select 1 from public.athlete_notifications n
       where n.athlete_id=v_athlete and n.notification_type='workout_incomplete'
         and n.entity_id=v_key and n.read_at is null
     ) then
    insert into public.athlete_notifications(
      athlete_id,notification_type,title,body,action_view,entity_type,entity_id
    ) values (
      v_athlete,'workout_incomplete','Finish logging your workout',
      format('Week %s · Session %s is incomplete. Your saved reps are still here—tap to finish.',p_program_week,p_program_day),
      'workouts','workout_completion',v_key
    );
  end if;

  return jsonb_build_object(
    'athlete_id',v_row.athlete_id,'program_week',v_row.program_week,'program_day',v_row.program_day,
    'workout_key',v_row.workout_key,'completion_status',v_row.completion_status,
    'scheduled_date',v_row.scheduled_date,'started_at',v_row.started_at,
    'last_activity_at',v_row.last_activity_at,'completed_late',v_row.completed_late,
    'season_plan_id',v_row.season_plan_id,'source_program_week',v_row.source_program_week
  );
end;
$function$;
grant execute on function public.mw_mark_own_workout_status(integer,integer,text) to authenticated;

create or replace function public.mw_mark_own_strength_status(
  p_program_week integer,p_strength_day integer,p_status text,
  p_day_label text default null,p_is_optional boolean default false
) returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_uid uuid:=auth.uid();
  v_athlete uuid;
  v_state public.athlete_program_state%rowtype;
  v_start_week integer;
  v_anchor date;
  v_scheduled date;
  v_cycle text;
  v_entity text;
  v_source integer;
  v_row public.athlete_strength_checkins%rowtype;
begin
  if v_uid is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if not private.mw_athlete_feature_enabled('strength_power') then raise exception 'MW Strength & Power access required' using errcode='42501'; end if;
  if p_program_week<1 or p_program_week>41 or p_strength_day<1 or p_strength_day>7 then raise exception 'Invalid strength session position'; end if;
  if p_status not in ('scheduled','in_progress','incomplete') then raise exception 'Invalid strength session status'; end if;

  select a.id into v_athlete from public.athletes a join public.profiles p on p.user_id=a.user_id
   where a.user_id=v_uid and p.account_status='active'::public.mw_account_status limit 1;
  if v_athlete is null then raise exception 'Athlete profile not found' using errcode='42501'; end if;
  select * into v_state from public.athlete_program_state where athlete_id=v_athlete;
  if v_state.season_plan_id is not null and p_program_week>coalesce(v_state.season_length_weeks,41) then raise exception 'Strength week is outside the active MW season plan'; end if;

  v_cycle:=case when v_state.season_plan_id is null then 'mw-41' else 'season:'||v_state.season_plan_id::text end;
  v_start_week:=case when v_state.season_plan_id is null then coalesce(v_state.starting_week,v_state.current_week,1) else 1 end;
  if v_state.start_date is not null then
    v_anchor:=v_state.start_date+((p_program_week-v_start_week)*7);
    v_scheduled:=v_anchor+((p_strength_day-extract(isodow from v_anchor)::integer+7)%7);
  end if;
  if v_state.season_plan_id is null then
    v_source:=p_program_week;
    v_entity:=format('mw-strength-w%s-d%s',p_program_week,p_strength_day);
  else
    select coalesce(nullif(sp.source_week_map->(p_program_week::text)->>'sourceWeek','')::integer,p_program_week)
      into v_source from public.athlete_season_plans sp
      where sp.id=v_state.season_plan_id and sp.athlete_id=v_athlete;
    v_source:=coalesce(v_source,p_program_week);
    v_entity:=format('mw-season-strength-%s-w%s-d%s',v_state.season_plan_id,p_program_week,p_strength_day);
  end if;

  insert into public.athlete_strength_checkins(
    athlete_id,training_cycle_key,season_plan_id,source_program_week,
    program_week,strength_day,day_label,status,recorded_at,lifecycle_status,
    scheduled_date,started_at,last_activity_at,is_optional
  ) values (
    v_athlete,v_cycle,v_state.season_plan_id,v_source,p_program_week,p_strength_day,
    left(coalesce(p_day_label,format('Day %s',p_strength_day)),80),
    case when p_status='incomplete' then 'partial' else null end,now(),p_status,v_scheduled,
    case when p_status in ('in_progress','incomplete') then now() else null end,now(),coalesce(p_is_optional,false)
  )
  on conflict (athlete_id,training_cycle_key,program_week,strength_day) do update set
    lifecycle_status=case when public.athlete_strength_checkins.lifecycle_status='completed' then 'completed' else excluded.lifecycle_status end,
    status=case when public.athlete_strength_checkins.lifecycle_status='completed' then public.athlete_strength_checkins.status when excluded.lifecycle_status='incomplete' then 'partial' else public.athlete_strength_checkins.status end,
    day_label=coalesce(public.athlete_strength_checkins.day_label,excluded.day_label),
    scheduled_date=coalesce(public.athlete_strength_checkins.scheduled_date,excluded.scheduled_date),
    started_at=case when public.athlete_strength_checkins.lifecycle_status='completed' then public.athlete_strength_checkins.started_at else coalesce(public.athlete_strength_checkins.started_at,excluded.started_at) end,
    last_activity_at=now(),is_optional=coalesce(public.athlete_strength_checkins.is_optional,excluded.is_optional),
    season_plan_id=coalesce(public.athlete_strength_checkins.season_plan_id,excluded.season_plan_id),
    source_program_week=coalesce(public.athlete_strength_checkins.source_program_week,excluded.source_program_week)
  returning * into v_row;

  if p_status='incomplete' and v_row.lifecycle_status='incomplete'
     and coalesce((select s.workout_reminders from public.athlete_settings s where s.athlete_id=v_athlete),true)
     and not exists(select 1 from public.athlete_notifications n where n.athlete_id=v_athlete and n.notification_type='strength_incomplete' and n.entity_id=v_entity and n.read_at is null) then
    insert into public.athlete_notifications(athlete_id,notification_type,title,body,action_view,entity_type,entity_id)
    values(v_athlete,'strength_incomplete','Finish logging your weight-room session',
      format('Week %s · %s is incomplete. Your saved sets are still here—tap to finish.',p_program_week,coalesce(nullif(p_day_label,''),format('Day %s',p_strength_day))),
      'workouts','strength_session',v_entity);
  end if;

  return jsonb_build_object(
    'athlete_id',v_row.athlete_id,'program_week',v_row.program_week,'strength_day',v_row.strength_day,
    'day_label',v_row.day_label,'status',v_row.status,'lifecycle_status',v_row.lifecycle_status,
    'scheduled_date',v_row.scheduled_date,'started_at',v_row.started_at,'completed_at',v_row.completed_at,
    'completed_late',v_row.completed_late,'is_optional',v_row.is_optional,
    'training_cycle_key',v_row.training_cycle_key,'season_plan_id',v_row.season_plan_id,'source_program_week',v_row.source_program_week
  );
end;
$function$;
grant execute on function public.mw_mark_own_strength_status(integer,integer,text,text,boolean) to authenticated;

create or replace function public.mw_complete_own_strength_session(
  p_program_week integer,p_strength_day integer,p_outcome text,
  p_day_label text default null,p_is_optional boolean default false
) returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_uid uuid:=auth.uid();
  v_athlete uuid;
  v_state public.athlete_program_state%rowtype;
  v_start_week integer;
  v_anchor date;
  v_scheduled date;
  v_cycle text;
  v_entity text;
  v_source integer;
  v_row public.athlete_strength_checkins%rowtype;
begin
  if v_uid is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if not private.mw_athlete_feature_enabled('strength_power') then raise exception 'MW Strength & Power access required' using errcode='42501'; end if;
  if p_program_week<1 or p_program_week>41 or p_strength_day<1 or p_strength_day>7 then raise exception 'Invalid strength session position'; end if;
  if p_outcome not in ('as_prescribed','modified') then raise exception 'Invalid strength completion outcome'; end if;

  select a.id into v_athlete from public.athletes a join public.profiles p on p.user_id=a.user_id
   where a.user_id=v_uid and p.account_status='active'::public.mw_account_status limit 1;
  if v_athlete is null then raise exception 'Athlete profile not found' using errcode='42501'; end if;
  select * into v_state from public.athlete_program_state where athlete_id=v_athlete;
  if v_state.season_plan_id is not null and p_program_week>coalesce(v_state.season_length_weeks,41) then raise exception 'Strength week is outside the active MW season plan'; end if;

  v_cycle:=case when v_state.season_plan_id is null then 'mw-41' else 'season:'||v_state.season_plan_id::text end;
  v_start_week:=case when v_state.season_plan_id is null then coalesce(v_state.starting_week,v_state.current_week,1) else 1 end;
  if v_state.start_date is not null then
    v_anchor:=v_state.start_date+((p_program_week-v_start_week)*7);
    v_scheduled:=v_anchor+((p_strength_day-extract(isodow from v_anchor)::integer+7)%7);
  end if;
  if v_state.season_plan_id is null then
    v_source:=p_program_week;
    v_entity:=format('mw-strength-w%s-d%s',p_program_week,p_strength_day);
  else
    select coalesce(nullif(sp.source_week_map->(p_program_week::text)->>'sourceWeek','')::integer,p_program_week)
      into v_source from public.athlete_season_plans sp
      where sp.id=v_state.season_plan_id and sp.athlete_id=v_athlete;
    v_source:=coalesce(v_source,p_program_week);
    v_entity:=format('mw-season-strength-%s-w%s-d%s',v_state.season_plan_id,p_program_week,p_strength_day);
  end if;

  insert into public.athlete_strength_checkins(
    athlete_id,training_cycle_key,season_plan_id,source_program_week,
    program_week,strength_day,day_label,status,recorded_at,lifecycle_status,
    scheduled_date,started_at,last_activity_at,completed_at,completed_late,is_optional
  ) values (
    v_athlete,v_cycle,v_state.season_plan_id,v_source,p_program_week,p_strength_day,
    left(coalesce(p_day_label,format('Day %s',p_strength_day)),80),p_outcome,now(),'completed',v_scheduled,
    (select min(l.recorded_at) from public.athlete_strength_session_logs l
      where l.athlete_id=v_athlete and l.training_cycle_key=v_cycle and l.program_week=p_program_week and l.program_day=p_strength_day),
    now(),now(),case when v_scheduled is not null and current_date>v_scheduled then true else false end,coalesce(p_is_optional,false)
  )
  on conflict (athlete_id,training_cycle_key,program_week,strength_day) do update set
    day_label=coalesce(excluded.day_label,public.athlete_strength_checkins.day_label),
    status=excluded.status,recorded_at=now(),lifecycle_status='completed',
    scheduled_date=coalesce(public.athlete_strength_checkins.scheduled_date,excluded.scheduled_date),
    started_at=coalesce(public.athlete_strength_checkins.started_at,excluded.started_at),
    last_activity_at=now(),completed_at=now(),
    completed_late=case when coalesce(public.athlete_strength_checkins.scheduled_date,excluded.scheduled_date) is not null and current_date>coalesce(public.athlete_strength_checkins.scheduled_date,excluded.scheduled_date) then true else public.athlete_strength_checkins.completed_late end,
    is_optional=excluded.is_optional,
    season_plan_id=coalesce(public.athlete_strength_checkins.season_plan_id,excluded.season_plan_id),
    source_program_week=coalesce(public.athlete_strength_checkins.source_program_week,excluded.source_program_week)
  returning * into v_row;

  update public.athlete_notifications set read_at=coalesce(read_at,now())
  where athlete_id=v_athlete and notification_type='strength_incomplete' and entity_id=v_entity and read_at is null;

  return jsonb_build_object(
    'athlete_id',v_row.athlete_id,'program_week',v_row.program_week,'strength_day',v_row.strength_day,
    'day_label',v_row.day_label,'status',v_row.status,'lifecycle_status',v_row.lifecycle_status,
    'scheduled_date',v_row.scheduled_date,'started_at',v_row.started_at,'completed_at',v_row.completed_at,
    'completed_late',v_row.completed_late,'is_optional',v_row.is_optional,
    'training_cycle_key',v_row.training_cycle_key,'season_plan_id',v_row.season_plan_id,'source_program_week',v_row.source_program_week
  );
end;
$function$;
grant execute on function public.mw_complete_own_strength_session(integer,integer,text,text,boolean) to authenticated;
