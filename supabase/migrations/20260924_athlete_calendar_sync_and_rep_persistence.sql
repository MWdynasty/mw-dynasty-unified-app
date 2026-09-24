alter table public.workout_completions
  add column if not exists scheduled_date date,
  add column if not exists started_at timestamptz,
  add column if not exists last_activity_at timestamptz not null default now(),
  add column if not exists completed_late boolean not null default false;

alter table public.workout_completions
  alter column completed_at drop not null;

alter table public.workout_completions
  drop constraint if exists workout_completions_completion_status_check;

alter table public.workout_completions
  add constraint workout_completions_completion_status_check
  check (completion_status = any(array[
    'scheduled'::text,
    'in_progress'::text,
    'incomplete'::text,
    'absent'::text,
    'completed'::text,
    'partial'::text,
    'skipped'::text
  ]));

create index if not exists workout_completions_athlete_status_idx
  on public.workout_completions(athlete_id, completion_status, program_week, program_day);

create or replace function private.mw_stamp_workout_status()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if tg_op='UPDATE'
     and old.completion_status='completed'
     and new.completion_status<>'completed' then
    new.completion_status := 'completed';
    new.completed_at := old.completed_at;
    new.completed_late := old.completed_late;
  end if;

  if new.completion_status='in_progress' and new.started_at is null then
    new.started_at := now();
  end if;

  if new.completion_status='completed' then
    new.completed_at := coalesce(new.completed_at, now());
    if new.scheduled_date is not null and new.completed_at::date > new.scheduled_date then
      new.completed_late := true;
    end if;
  end if;

  new.last_activity_at := now();
  return new;
end;
$function$;

drop trigger if exists mw_stamp_workout_status on public.workout_completions;
create trigger mw_stamp_workout_status
before insert or update on public.workout_completions
for each row execute function private.mw_stamp_workout_status();

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
  v_row public.workout_completions%rowtype;
begin
  if v_uid is null then
    raise exception 'Authentication required' using errcode='42501';
  end if;
  if not private.mw_athlete_feature_enabled('mw_training_system') then
    raise exception 'MW Training System access required' using errcode='42501';
  end if;
  if p_program_week < 1 or p_program_week > 41 or p_program_day < 1 or p_program_day > 4 then
    raise exception 'Invalid MW workout position';
  end if;
  if p_status not in ('scheduled','in_progress','incomplete') then
    raise exception 'Invalid workout status';
  end if;

  select a.id into v_athlete
  from public.athletes a
  join public.profiles p on p.user_id=a.user_id
  where a.user_id=v_uid
    and p.account_status='active'::public.mw_account_status
  limit 1;

  if v_athlete is null then
    raise exception 'Athlete profile not found' using errcode='42501';
  end if;

  select * into v_state
  from public.athlete_program_state
  where athlete_id=v_athlete;

  v_start_week := coalesce(v_state.starting_week,v_state.current_week,1);
  if v_state.start_date is not null then
    v_anchor := v_state.start_date + ((p_program_week-v_start_week)*7);
    v_scheduled := v_anchor + ((p_program_day-extract(isodow from v_anchor)::integer+7)%7);
  end if;
  v_key := format('mw-track-w%s-d%s',p_program_week,p_program_day);

  insert into public.workout_completions(
    athlete_id,program_week,program_day,workout_key,completion_status,
    scheduled_date,started_at,last_activity_at,completed_at
  ) values (
    v_athlete,p_program_week,p_program_day,v_key,p_status,
    v_scheduled,
    case when p_status in ('in_progress','incomplete') then now() else null end,
    now(),
    null
  )
  on conflict (athlete_id,workout_key) do update
  set completion_status = case
        when public.workout_completions.completion_status='completed' then 'completed'
        else excluded.completion_status
      end,
      scheduled_date = coalesce(public.workout_completions.scheduled_date,excluded.scheduled_date),
      started_at = case
        when public.workout_completions.completion_status='completed' then public.workout_completions.started_at
        else coalesce(public.workout_completions.started_at,excluded.started_at)
      end,
      last_activity_at = now()
  returning * into v_row;

  if p_status='incomplete'
     and v_row.completion_status='incomplete'
     and coalesce((select s.workout_reminders from public.athlete_settings s where s.athlete_id=v_athlete),true)
     and not exists (
       select 1 from public.athlete_notifications n
       where n.athlete_id=v_athlete
         and n.notification_type='workout_incomplete'
         and n.entity_id=v_key
         and n.read_at is null
     ) then
    insert into public.athlete_notifications(
      athlete_id,notification_type,title,body,action_view,entity_type,entity_id
    ) values (
      v_athlete,
      'workout_incomplete',
      'Finish logging your workout',
      format('Week %s · Session %s is incomplete. Your saved reps are still here—tap to finish.',p_program_week,p_program_day),
      'workouts',
      'workout_completion',
      v_key
    );
  end if;

  return jsonb_build_object(
    'athlete_id',v_row.athlete_id,
    'program_week',v_row.program_week,
    'program_day',v_row.program_day,
    'workout_key',v_row.workout_key,
    'completion_status',v_row.completion_status,
    'scheduled_date',v_row.scheduled_date,
    'started_at',v_row.started_at,
    'last_activity_at',v_row.last_activity_at,
    'completed_late',v_row.completed_late
  );
end;
$function$;

grant execute on function public.mw_mark_own_workout_status(integer,integer,text) to authenticated;

create or replace function public.mw_refresh_own_program_state()
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
  v_week_offset integer;
  v_sched_week integer;
  v_phase integer;
  v_today date := current_date;
  v_iso_day integer := extract(isodow from current_date)::integer;
begin
  if v_uid is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if not private.mw_athlete_feature_enabled('mw_training_system') then
    raise exception 'MW Training System access required' using errcode='42501';
  end if;

  select a.id into v_athlete
  from public.athletes a
  join public.profiles p on p.user_id=a.user_id
  where a.user_id=v_uid
    and p.account_status='active'::public.mw_account_status
  limit 1;

  if v_athlete is null then
    raise exception 'Athlete profile not found' using errcode='42501';
  end if;

  select * into v_state
  from public.athlete_program_state
  where athlete_id=v_athlete
  for update;

  if not found then
    insert into public.athlete_program_state(
      athlete_id,current_week,current_day,current_phase,program_status,starting_week
    ) values (
      v_athlete,1,1,1,'not_started',1
    )
    returning * into v_state;
  end if;

  if v_state.start_date is not null
     and v_state.program_status in ('active','not_started') then
    v_start_week := coalesce(v_state.starting_week,v_state.current_week,1);

    if v_today < v_state.start_date then
      update public.athlete_program_state
      set current_week=v_start_week,
          current_day=1,
          current_phase=case when v_start_week<=8 then 1 when v_start_week<=16 then 2 when v_start_week<=24 then 3 when v_start_week<=33 then 4 else 5 end,
          program_status='not_started',
          updated_at=now()
      where athlete_id=v_athlete
      returning * into v_state;
    else
      v_week_offset := greatest(0,floor((v_today-v_state.start_date)/7.0)::integer);
      v_sched_week := v_start_week + v_week_offset;
      v_phase := case
        when least(41,v_sched_week)<=8 then 1
        when least(41,v_sched_week)<=16 then 2
        when least(41,v_sched_week)<=24 then 3
        when least(41,v_sched_week)<=33 then 4
        else 5
      end;

      update public.athlete_program_state
      set current_week=least(41,v_sched_week),
          current_day=v_iso_day,
          current_phase=v_phase,
          program_status=case when v_sched_week>41 then 'completed'::public.mw_program_status else 'active'::public.mw_program_status end,
          last_completed_workout_at=(select max(wc.completed_at) from public.workout_completions wc where wc.athlete_id=v_athlete and wc.completion_status='completed'),
          updated_at=now()
      where athlete_id=v_athlete
      returning * into v_state;

      with sched as (
        select w as program_week,d as program_day,format('mw-track-w%s-d%s',w,d) as workout_key,
          (anchor_date + ((d-extract(isodow from anchor_date)::integer+7)%7))::date as scheduled_date
        from generate_series(v_start_week,least(41,v_start_week+v_week_offset)) w
        cross join generate_series(1,4) d
        cross join lateral (select (v_state.start_date + ((w-v_start_week)*7))::date as anchor_date) a
      )
      update public.workout_completions wc
      set scheduled_date=s.scheduled_date,
          completion_status=case
            when wc.completion_status='completed' then 'completed'
            when exists(select 1 from public.athlete_practice_rep_results pr where pr.athlete_id=v_athlete and pr.workout_key=wc.workout_key) then 'incomplete'
            when wc.completion_status in ('in_progress','incomplete','partial') then 'incomplete'
            else 'absent'
          end,
          started_at=coalesce(wc.started_at,(select min(pr.recorded_at) from public.athlete_practice_rep_results pr where pr.athlete_id=v_athlete and pr.workout_key=wc.workout_key)),
          last_activity_at=now()
      from sched s
      where wc.athlete_id=v_athlete
        and wc.workout_key=s.workout_key
        and s.scheduled_date < v_today
        and wc.completion_status<>'completed';

      with sched as (
        select w as program_week,d as program_day,format('mw-track-w%s-d%s',w,d) as workout_key,
          (anchor_date + ((d-extract(isodow from anchor_date)::integer+7)%7))::date as scheduled_date
        from generate_series(v_start_week,least(41,v_start_week+v_week_offset)) w
        cross join generate_series(1,4) d
        cross join lateral (select (v_state.start_date + ((w-v_start_week)*7))::date as anchor_date) a
      )
      insert into public.workout_completions(
        athlete_id,program_week,program_day,workout_key,completion_status,
        scheduled_date,started_at,last_activity_at,completed_at
      )
      select v_athlete,s.program_week,s.program_day,s.workout_key,
        case when exists(select 1 from public.athlete_practice_rep_results pr where pr.athlete_id=v_athlete and pr.workout_key=s.workout_key) then 'incomplete' else 'absent' end,
        s.scheduled_date,
        (select min(pr.recorded_at) from public.athlete_practice_rep_results pr where pr.athlete_id=v_athlete and pr.workout_key=s.workout_key),
        now(),null
      from sched s
      where s.scheduled_date < v_today
      on conflict (athlete_id,workout_key) do nothing;

      with sched_today as (
        select w as program_week,d as program_day,format('mw-track-w%s-d%s',w,d) as workout_key,
          (anchor_date + ((d-extract(isodow from anchor_date)::integer+7)%7))::date as scheduled_date
        from generate_series(v_start_week,least(41,v_start_week+v_week_offset)) w
        cross join generate_series(1,4) d
        cross join lateral (select (v_state.start_date + ((w-v_start_week)*7))::date as anchor_date) a
      )
      insert into public.workout_completions(
        athlete_id,program_week,program_day,workout_key,completion_status,
        scheduled_date,last_activity_at,completed_at
      )
      select v_athlete,s.program_week,s.program_day,s.workout_key,'scheduled',s.scheduled_date,now(),null
      from sched_today s
      where s.scheduled_date=v_today
      on conflict (athlete_id,workout_key) do update
      set scheduled_date=coalesce(public.workout_completions.scheduled_date,excluded.scheduled_date);

      if coalesce((select s.workout_reminders from public.athlete_settings s where s.athlete_id=v_athlete),true) then
        insert into public.athlete_notifications(
          athlete_id,notification_type,title,body,action_view,entity_type,entity_id
        )
        select v_athlete,'workout_incomplete','Finish logging your workout',
          format('Week %s · Session %s is incomplete. Your saved reps are still here—tap to finish.',wc.program_week,wc.program_day),
          'workouts','workout_completion',wc.workout_key
        from public.workout_completions wc
        where wc.athlete_id=v_athlete
          and wc.completion_status='incomplete'
          and not exists(
            select 1 from public.athlete_notifications n
            where n.athlete_id=v_athlete
              and n.notification_type='workout_incomplete'
              and n.entity_id=wc.workout_key
              and n.read_at is null
          );
      end if;
    end if;
  end if;

  return jsonb_build_object(
    'athlete_id',v_state.athlete_id,
    'current_week',v_state.current_week,
    'current_day',v_state.current_day,
    'current_phase',v_state.current_phase,
    'program_status',v_state.program_status,
    'start_date',v_state.start_date,
    'starting_week',v_state.starting_week,
    'sync_model','calendar'
  );
end;
$function$;
