-- MW Dynasty Season Intelligence: season-aware calendar refresh.
-- Legacy athletes continue using mw_refresh_own_program_state unchanged.
-- Season Intelligence athletes use this isolated refresh path.

create or replace function public.mw_refresh_own_season_program_state()
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
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
      source_program_week=v_source,season_phase_code=v_phase_code,program_version='mw-season-intelligence-v1',
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
    cross join generate_series(1,4) d
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
    cross join generate_series(1,4) d
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
    cross join generate_series(1,4) d
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
$function$;
grant execute on function public.mw_refresh_own_season_program_state() to authenticated;

create or replace function public.mw_refresh_own_strength_schedule(p_schedule jsonb)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_uid uuid:=auth.uid();
  v_athlete uuid;
  v_state public.athlete_program_state%rowtype;
  v_start_week integer;
  v_cycle text;
  v_item jsonb;
  v_week integer;
  v_day integer;
  v_source integer;
  v_label text;
  v_optional boolean;
  v_anchor date;
  v_scheduled date;
  v_entity text;
  v_has_sets boolean;
  v_row public.athlete_strength_checkins%rowtype;
  v_processed integer:=0;
begin
  if v_uid is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if not private.mw_athlete_feature_enabled('strength_power') then return jsonb_build_object('ok',true,'processed',0,'reason','strength_power_not_enabled'); end if;

  select a.id into v_athlete from public.athletes a join public.profiles p on p.user_id=a.user_id
   where a.user_id=v_uid and p.account_status='active'::public.mw_account_status limit 1;
  if v_athlete is null then raise exception 'Athlete profile not found' using errcode='42501'; end if;
  select * into v_state from public.athlete_program_state where athlete_id=v_athlete;
  if v_state.start_date is null then return jsonb_build_object('ok',true,'processed',0,'reason','program_not_started'); end if;

  v_cycle:=case when v_state.season_plan_id is null then 'mw-41' else 'season:'||v_state.season_plan_id::text end;
  v_start_week:=case when v_state.season_plan_id is null then coalesce(v_state.starting_week,v_state.current_week,1) else 1 end;

  for v_item in select value from jsonb_array_elements(coalesce(p_schedule,'[]'::jsonb))
  loop
    v_week:=nullif(v_item->>'week','')::integer;
    v_day:=nullif(v_item->>'day','')::integer;
    v_source:=coalesce(nullif(v_item->>'sourceWeek','')::integer,v_week);
    v_label:=left(coalesce(nullif(v_item->>'label',''),format('Day %s',v_day)),80);
    v_optional:=coalesce((v_item->>'optional')::boolean,false);
    if v_week is null or v_day is null or v_week<1 or v_week>41 or v_day<1 or v_day>7 then continue; end if;
    if v_state.season_plan_id is not null and v_week>coalesce(v_state.season_length_weeks,41) then continue; end if;
    v_source:=greatest(1,least(41,coalesce(v_source,v_week)));

    v_anchor:=v_state.start_date+((v_week-v_start_week)*7);
    v_scheduled:=v_anchor+((v_day-extract(isodow from v_anchor)::integer+7)%7);
    v_entity:=case when v_state.season_plan_id is null
      then format('mw-strength-w%s-d%s',v_week,v_day)
      else format('mw-season-strength-%s-w%s-d%s',v_state.season_plan_id,v_week,v_day) end;

    select exists(
      select 1 from public.athlete_strength_session_logs l
      where l.athlete_id=v_athlete and l.training_cycle_key=v_cycle
        and l.program_week=v_week and l.program_day=v_day
    ) into v_has_sets;

    select * into v_row
    from public.athlete_strength_checkins c
    where c.athlete_id=v_athlete and c.training_cycle_key=v_cycle
      and c.program_week=v_week and c.strength_day=v_day;

    if v_scheduled=current_date then
      insert into public.athlete_strength_checkins(
        athlete_id,training_cycle_key,season_plan_id,source_program_week,
        program_week,strength_day,day_label,status,recorded_at,lifecycle_status,
        scheduled_date,last_activity_at,is_optional
      ) values (
        v_athlete,v_cycle,v_state.season_plan_id,v_source,v_week,v_day,v_label,null,now(),
        case when v_has_sets then 'in_progress' else 'scheduled' end,v_scheduled,now(),v_optional
      )
      on conflict (athlete_id,training_cycle_key,program_week,strength_day) do update set
        day_label=excluded.day_label,
        scheduled_date=coalesce(public.athlete_strength_checkins.scheduled_date,excluded.scheduled_date),
        lifecycle_status=case
          when public.athlete_strength_checkins.lifecycle_status='completed' then 'completed'
          when public.athlete_strength_checkins.lifecycle_status='incomplete' then 'incomplete'
          when v_has_sets then 'in_progress'
          else public.athlete_strength_checkins.lifecycle_status
        end,
        started_at=case when v_has_sets then coalesce(public.athlete_strength_checkins.started_at,
          (select min(l.recorded_at) from public.athlete_strength_session_logs l
           where l.athlete_id=v_athlete and l.training_cycle_key=v_cycle and l.program_week=v_week and l.program_day=v_day))
          else public.athlete_strength_checkins.started_at end,
        last_activity_at=now(),is_optional=excluded.is_optional,
        season_plan_id=coalesce(public.athlete_strength_checkins.season_plan_id,excluded.season_plan_id),
        source_program_week=coalesce(public.athlete_strength_checkins.source_program_week,excluded.source_program_week);

    elsif v_scheduled<current_date then
      if v_row.id is not null and v_row.lifecycle_status='completed' then
        update public.athlete_strength_checkins
        set scheduled_date=coalesce(scheduled_date,v_scheduled),day_label=coalesce(day_label,v_label),
            is_optional=v_optional,last_activity_at=now(),
            season_plan_id=coalesce(season_plan_id,v_state.season_plan_id),
            source_program_week=coalesce(source_program_week,v_source)
        where id=v_row.id;
      elsif v_optional and not v_has_sets and v_row.id is null then
        null;
      else
        insert into public.athlete_strength_checkins(
          athlete_id,training_cycle_key,season_plan_id,source_program_week,
          program_week,strength_day,day_label,status,recorded_at,lifecycle_status,
          scheduled_date,started_at,last_activity_at,is_optional
        ) values (
          v_athlete,v_cycle,v_state.season_plan_id,v_source,v_week,v_day,v_label,
          case when v_has_sets then 'partial' else 'skipped' end,now(),
          case when v_has_sets then 'incomplete' else 'absent' end,v_scheduled,
          (select min(l.recorded_at) from public.athlete_strength_session_logs l
           where l.athlete_id=v_athlete and l.training_cycle_key=v_cycle and l.program_week=v_week and l.program_day=v_day),
          now(),v_optional
        )
        on conflict (athlete_id,training_cycle_key,program_week,strength_day) do update set
          day_label=excluded.day_label,
          scheduled_date=coalesce(public.athlete_strength_checkins.scheduled_date,excluded.scheduled_date),
          lifecycle_status=case
            when public.athlete_strength_checkins.lifecycle_status='completed' then 'completed'
            when v_has_sets then 'incomplete'
            when public.athlete_strength_checkins.lifecycle_status in ('in_progress','incomplete') then 'incomplete'
            else 'absent'
          end,
          status=case
            when public.athlete_strength_checkins.lifecycle_status='completed' then public.athlete_strength_checkins.status
            when v_has_sets or public.athlete_strength_checkins.lifecycle_status in ('in_progress','incomplete') then 'partial'
            else 'skipped'
          end,
          started_at=coalesce(public.athlete_strength_checkins.started_at,
            (select min(l.recorded_at) from public.athlete_strength_session_logs l
             where l.athlete_id=v_athlete and l.training_cycle_key=v_cycle and l.program_week=v_week and l.program_day=v_day)),
          last_activity_at=now(),is_optional=excluded.is_optional,
          season_plan_id=coalesce(public.athlete_strength_checkins.season_plan_id,excluded.season_plan_id),
          source_program_week=coalesce(public.athlete_strength_checkins.source_program_week,excluded.source_program_week);
      end if;

      if coalesce((select s.workout_reminders from public.athlete_settings s where s.athlete_id=v_athlete),true)
        and exists(select 1 from public.athlete_strength_checkins c
          where c.athlete_id=v_athlete and c.training_cycle_key=v_cycle
            and c.program_week=v_week and c.strength_day=v_day and c.lifecycle_status='incomplete')
        and not exists(select 1 from public.athlete_notifications n
          where n.athlete_id=v_athlete and n.notification_type='strength_incomplete'
            and n.entity_id=v_entity and n.read_at is null) then
        insert into public.athlete_notifications(athlete_id,notification_type,title,body,action_view,entity_type,entity_id)
        values(v_athlete,'strength_incomplete','Finish logging your weight-room session',
          format('Week %s · %s is incomplete. Your saved sets are still here—tap to finish.',v_week,v_label),
          'workouts','strength_session',v_entity);
      end if;
    end if;
    v_processed:=v_processed+1;
  end loop;

  return jsonb_build_object('ok',true,'processed',v_processed,'training_cycle_key',v_cycle,'season_plan_id',v_state.season_plan_id);
end;
$function$;
grant execute on function public.mw_refresh_own_strength_schedule(jsonb) to authenticated;
