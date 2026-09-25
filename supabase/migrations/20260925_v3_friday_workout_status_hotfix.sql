-- MW Sprint System V3 Friday logging hotfix
-- The V3 program adds Friday as program_day 5. The status RPC still had the old
-- four-day guard, which prevented Practice Mode from starting/saving on Friday.

CREATE OR REPLACE FUNCTION public.mw_mark_own_workout_status(p_program_week integer, p_program_day integer, p_status text)
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
  v_anchor date;
  v_scheduled date;
  v_key text;
  v_source integer;
  v_row public.workout_completions%rowtype;
begin
  if v_uid is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if not private.mw_athlete_feature_enabled('mw_training_system') then raise exception 'MW Training System access required' using errcode='42501'; end if;
  if p_program_week < 1 or p_program_week > 41 or p_program_day < 1 or p_program_day > 5 then raise exception 'Invalid MW workout position'; end if;
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
