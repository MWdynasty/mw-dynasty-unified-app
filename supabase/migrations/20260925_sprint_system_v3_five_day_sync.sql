-- MW Sprint Performance System V3 five-day calendar synchronization
-- V3 adds Friday as the fifth programmed track day without retroactively marking
-- Fridays before the 2026-09-25 rollout as absent. It also stamps the active
-- program version used by standard and Season Intelligence athletes.

CREATE OR REPLACE FUNCTION public.mw_refresh_own_program_state()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
          program_version='mw-sprint-v3.0',
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
          program_version='mw-sprint-v3.0',
          last_completed_workout_at=(select max(wc.completed_at) from public.workout_completions wc where wc.athlete_id=v_athlete and wc.completion_status='completed'),
          updated_at=now()
      where athlete_id=v_athlete
      returning * into v_state;

      with sched as (
        select
          w as program_week,
          d as program_day,
          format('mw-track-w%s-d%s',w,d) as workout_key,
          (
            anchor_date + ((d-extract(isodow from anchor_date)::integer+7)%7)
          )::date as scheduled_date
        from generate_series(v_start_week,least(41,v_start_week+v_week_offset)) w
        cross join generate_series(1,5) d
        cross join lateral (
          select (v_state.start_date + ((w-v_start_week)*7))::date as anchor_date
        ) a
      )
      update public.workout_completions wc
      set scheduled_date=s.scheduled_date,
          completion_status=case
            when wc.completion_status='completed' then 'completed'
            when exists(
              select 1 from public.athlete_practice_rep_results pr
              where pr.athlete_id=v_athlete and pr.workout_key=wc.workout_key
            ) then 'incomplete'
            when wc.completion_status in ('in_progress','incomplete','partial') then 'incomplete'
            else 'absent'
          end,
          started_at=coalesce(
            wc.started_at,
            (select min(pr.recorded_at) from public.athlete_practice_rep_results pr where pr.athlete_id=v_athlete and pr.workout_key=wc.workout_key)
          ),
          last_activity_at=now()
      from sched s
      where wc.athlete_id=v_athlete
        and wc.workout_key=s.workout_key
        and s.scheduled_date < v_today
        and wc.completion_status<>'completed';

      with sched as (
        select
          w as program_week,
          d as program_day,
          format('mw-track-w%s-d%s',w,d) as workout_key,
          (
            anchor_date + ((d-extract(isodow from anchor_date)::integer+7)%7)
          )::date as scheduled_date
        from generate_series(v_start_week,least(41,v_start_week+v_week_offset)) w
        cross join generate_series(1,5) d
        cross join lateral (
          select (v_state.start_date + ((w-v_start_week)*7))::date as anchor_date
        ) a
      )
      insert into public.workout_completions(
        athlete_id,program_week,program_day,workout_key,completion_status,
        scheduled_date,started_at,last_activity_at,completed_at
      )
      select
        v_athlete,
        s.program_week,
        s.program_day,
        s.workout_key,
        case when exists(
          select 1 from public.athlete_practice_rep_results pr
          where pr.athlete_id=v_athlete and pr.workout_key=s.workout_key
        ) then 'incomplete' else 'absent' end,
        s.scheduled_date,
        (select min(pr.recorded_at) from public.athlete_practice_rep_results pr where pr.athlete_id=v_athlete and pr.workout_key=s.workout_key),
        now(),
        null
      from sched s
      where s.scheduled_date < v_today
      on conflict (athlete_id,workout_key) do nothing;

      with sched_today as (
        select
          w as program_week,
          d as program_day,
          format('mw-track-w%s-d%s',w,d) as workout_key,
          (
            anchor_date + ((d-extract(isodow from anchor_date)::integer+7)%7)
          )::date as scheduled_date
        from generate_series(v_start_week,least(41,v_start_week+v_week_offset)) w
        cross join generate_series(1,5) d
        cross join lateral (
          select (v_state.start_date + ((w-v_start_week)*7))::date as anchor_date
        ) a
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
        select
          v_athlete,
          'workout_incomplete',
          'Finish logging your workout',
          format('Week %s · Session %s is incomplete. Your saved reps are still here—tap to finish.',wc.program_week,wc.program_day),
          'workouts',
          'workout_completion',
          wc.workout_key
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
$function$


CREATE OR REPLACE FUNCTION public.mw_refresh_own_season_program_state()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid:=auth.uid();
  v_athlete uuid;
  v_state public.athlete_program_state%rowtype;
  v_plan public.athlete_season_plans%rowtype;
  v_today date:=current_date;
  v_week integer:=1;
  v_day integer:=extract(isodow from current_date)::integer;
  v_phase_code text:='foundation';
  v_phase integer:=1;
  v_source integer:=1;
  v_status public.mw_program_status:='active'::public.mw_program_status;
begin
  if v_uid is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if not private.mw_athlete_feature_enabled('mw_training_system') then raise exception 'MW Training System access required' using errcode='42501'; end if;

  select a.id into v_athlete
  from public.athletes a join public.profiles p on p.user_id=a.user_id
  where a.user_id=v_uid and p.account_status='active'::public.mw_account_status
  limit 1;
  if v_athlete is null then raise exception 'Athlete profile not found' using errcode='42501'; end if;

  select * into v_state from public.athlete_program_state where athlete_id=v_athlete for update;
  if not found or v_state.season_plan_id is null then
    raise exception 'No active MW Season Intelligence plan';
  end if;

  select * into v_plan
  from public.athlete_season_plans
  where id=v_state.season_plan_id and athlete_id=v_athlete
  limit 1;
  if not found then raise exception 'MW season plan not found'; end if;

  if v_today<v_plan.season_start_date then
    v_week:=1;
    v_status:='not_started'::public.mw_program_status;
  elsif v_today>v_plan.primary_peak_date then
    v_week:=v_plan.season_length_weeks;
    v_status:='completed'::public.mw_program_status;
  else
    v_week:=least(v_plan.season_length_weeks,greatest(1,floor((v_today-v_plan.season_start_date)/7.0)::integer+1));
    v_status:=case when v_state.program_status='needs_review'::public.mw_program_status then 'needs_review'::public.mw_program_status else 'active'::public.mw_program_status end;
  end if;

  v_phase_code:=coalesce(nullif(v_plan.source_week_map->(v_week::text)->>'phase',''),'foundation');
  if v_phase_code not in ('foundation','pre_competition','competition','peak') then v_phase_code:='foundation'; end if;
  v_phase:=case v_phase_code when 'foundation' then 1 when 'pre_competition' then 3 when 'competition' then 4 else 5 end;
  v_source:=coalesce(nullif(v_plan.source_week_map->(v_week::text)->>'sourceWeek','')::integer,v_week);
  v_source:=greatest(1,least(41,v_source));

  update public.athlete_program_state
  set current_week=v_week,current_day=v_day,current_phase=v_phase,program_status=v_status,
      start_date=v_plan.season_start_date,starting_week=1,season_length_weeks=v_plan.season_length_weeks,
      source_program_week=v_source,season_phase_code=v_phase_code,program_version='mw-season-intelligence-v1+mw-sprint-v3.0',
      last_completed_workout_at=(select max(wc.completed_at) from public.workout_completions wc where wc.athlete_id=v_athlete and wc.completion_status='completed'),
      updated_at=now()
  where athlete_id=v_athlete
  returning * into v_state;

  with sched as (
    select
      w as program_week,
      d as program_day,
      format('mw-season-%s-w%s-d%s',v_plan.id,w,d) as workout_key,
      coalesce(nullif(v_plan.source_week_map->(w::text)->>'sourceWeek','')::integer,w) as source_program_week,
      (anchor_date+((d-extract(isodow from anchor_date)::integer+7)%7))::date as scheduled_date
    from generate_series(1,v_week) w
    cross join generate_series(1,5) d
    cross join lateral (select (v_plan.season_start_date+((w-1)*7))::date as anchor_date) a
  )
  update public.workout_completions wc
  set scheduled_date=s.scheduled_date,
      completion_status=case
        when wc.completion_status='completed' then 'completed'
        when exists(select 1 from public.athlete_practice_rep_results pr where pr.athlete_id=v_athlete and pr.workout_key=s.workout_key) then 'incomplete'
        when wc.completion_status in ('in_progress','incomplete','partial') then 'incomplete'
        else 'absent'
      end,
      started_at=coalesce(wc.started_at,(select min(pr.recorded_at) from public.athlete_practice_rep_results pr where pr.athlete_id=v_athlete and pr.workout_key=s.workout_key)),
      last_activity_at=now(),season_plan_id=v_plan.id,source_program_week=s.source_program_week
  from sched s
  where wc.athlete_id=v_athlete and wc.workout_key=s.workout_key
    and s.scheduled_date<v_today and wc.completion_status<>'completed';

  with sched as (
    select
      w as program_week,
      d as program_day,
      format('mw-season-%s-w%s-d%s',v_plan.id,w,d) as workout_key,
      coalesce(nullif(v_plan.source_week_map->(w::text)->>'sourceWeek','')::integer,w) as source_program_week,
      (anchor_date+((d-extract(isodow from anchor_date)::integer+7)%7))::date as scheduled_date
    from generate_series(1,v_week) w
    cross join generate_series(1,5) d
    cross join lateral (select (v_plan.season_start_date+((w-1)*7))::date as anchor_date) a
  )
  insert into public.workout_completions(
    athlete_id,program_week,program_day,workout_key,completion_status,scheduled_date,
    started_at,last_activity_at,completed_at,season_plan_id,source_program_week
  )
  select
    v_athlete,s.program_week,s.program_day,s.workout_key,
    case when exists(select 1 from public.athlete_practice_rep_results pr where pr.athlete_id=v_athlete and pr.workout_key=s.workout_key) then 'incomplete' else 'absent' end,
    s.scheduled_date,
    (select min(pr.recorded_at) from public.athlete_practice_rep_results pr where pr.athlete_id=v_athlete and pr.workout_key=s.workout_key),
    now(),null,v_plan.id,s.source_program_week
  from sched s
  where s.scheduled_date<v_today
  on conflict (athlete_id,workout_key) do nothing;

  with sched_today as (
    select
      w as program_week,
      d as program_day,
      format('mw-season-%s-w%s-d%s',v_plan.id,w,d) as workout_key,
      coalesce(nullif(v_plan.source_week_map->(w::text)->>'sourceWeek','')::integer,w) as source_program_week,
      (anchor_date+((d-extract(isodow from anchor_date)::integer+7)%7))::date as scheduled_date
    from generate_series(1,v_week) w
    cross join generate_series(1,5) d
    cross join lateral (select (v_plan.season_start_date+((w-1)*7))::date as anchor_date) a
  )
  insert into public.workout_completions(
    athlete_id,program_week,program_day,workout_key,completion_status,scheduled_date,
    last_activity_at,completed_at,season_plan_id,source_program_week
  )
  select v_athlete,s.program_week,s.program_day,s.workout_key,'scheduled',s.scheduled_date,
         now(),null,v_plan.id,s.source_program_week
  from sched_today s
  where s.scheduled_date=v_today
  on conflict (athlete_id,workout_key) do update
  set scheduled_date=coalesce(public.workout_completions.scheduled_date,excluded.scheduled_date),
      season_plan_id=coalesce(public.workout_completions.season_plan_id,excluded.season_plan_id),
      source_program_week=coalesce(public.workout_completions.source_program_week,excluded.source_program_week);

  if coalesce((select s.workout_reminders from public.athlete_settings s where s.athlete_id=v_athlete),true) then
    insert into public.athlete_notifications(
      athlete_id,notification_type,title,body,action_view,entity_type,entity_id
    )
    select v_athlete,'workout_incomplete','Finish logging your workout',
      format('Week %s · Session %s is incomplete. Your saved reps are still here—tap to finish.',wc.program_week,wc.program_day),
      'workouts','workout_completion',wc.workout_key
    from public.workout_completions wc
    where wc.athlete_id=v_athlete and wc.season_plan_id=v_plan.id and wc.completion_status='incomplete'
      and not exists(
        select 1 from public.athlete_notifications n
        where n.athlete_id=v_athlete and n.notification_type='workout_incomplete'
          and n.entity_id=wc.workout_key and n.read_at is null
      );
  end if;

  return jsonb_build_object(
    'athlete_id',v_state.athlete_id,'current_week',v_state.current_week,'current_day',v_state.current_day,
    'current_phase',v_state.current_phase,'program_status',v_state.program_status,'start_date',v_state.start_date,
    'starting_week',v_state.starting_week,'season_plan_id',v_state.season_plan_id,
    'season_length_weeks',v_state.season_length_weeks,'source_program_week',v_state.source_program_week,
    'season_phase_code',v_state.season_phase_code,'sync_model','season_plan'
  );
end;
$function$


update public.athlete_program_state
set program_version=case
  when season_plan_id is not null then 'mw-season-intelligence-v1+mw-sprint-v3.0'
  else 'mw-sprint-v3.0'
end,
updated_at=now()
where coalesce(program_version,'') <> case
  when season_plan_id is not null then 'mw-season-intelligence-v1+mw-sprint-v3.0'
  else 'mw-sprint-v3.0'
end;
