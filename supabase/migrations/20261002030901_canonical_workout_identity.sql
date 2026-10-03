-- Phase 1: identity only. Apply separately from the web/server release after review.
-- Legacy aliases are normalized from THEIR recorded plan, never today's active plan.
-- Conflicting historical evidence aborts the transaction; nothing is silently deleted.
begin;

-- Existing unplanned history retains the legacy mw-41 cycle. New unplanned
-- programs and restarts get a database-issued cycle ID; strength is unaffected.
alter table public.athlete_program_state add column if not exists workout_cycle_id uuid;
alter table public.workout_completions add column if not exists workout_cycle_id uuid;
alter table public.athlete_practice_rep_results add column if not exists workout_cycle_id uuid;
create or replace function private.mw_stamp_track_cycle()
returns trigger language plpgsql set search_path='' as $$
begin
  if new.season_plan_id is null then
    if tg_op='INSERT' then new.workout_cycle_id:=coalesce(new.workout_cycle_id,gen_random_uuid());
    elsif (old.season_plan_id is not null or new.start_date is distinct from old.start_date)
      and new.workout_cycle_id is not distinct from old.workout_cycle_id then
      new.workout_cycle_id:=gen_random_uuid();
    end if;
  end if;
  return new;
end $$;
revoke all on function private.mw_stamp_track_cycle() from public,anon,authenticated;
create trigger mw_track_training_cycle before insert or update on public.athlete_program_state
for each row execute function private.mw_stamp_track_cycle();

create or replace function public.mw_workout_identity_key(
  p_athlete_id uuid,p_season_plan_id uuid,p_week integer,p_day integer,
  p_session_key text default 'track',p_workout_cycle_id uuid default null
) returns text language plpgsql immutable set search_path='' as $$
begin
  if p_athlete_id is null or p_week is null or p_day is null
     or p_week not between 1 and 41 or p_day not between 1 and 7
     or (p_season_plan_id is not null and p_workout_cycle_id is not null)
     or p_session_key is null or p_session_key !~ '^[a-z][a-z0-9-]{0,63}$' then
    raise exception 'Invalid workout identity';
  end if;
  return format('mw-workout-v1:%s:%s:w%s:d%s:%s',p_athlete_id,
    case when p_season_plan_id is not null then 'season:'||p_season_plan_id::text
      when p_workout_cycle_id is not null then 'cycle:'||p_workout_cycle_id::text else 'mw-41' end,
    p_week,p_day,p_session_key);
end $$;
revoke all on function public.mw_workout_identity_key(uuid,uuid,integer,integer,text,uuid) from public,anon;
grant execute on function public.mw_workout_identity_key(uuid,uuid,integer,integer,text,uuid) to authenticated;

create or replace function private.mw_workout_record_plan(p_key text,p_plan uuid)
returns uuid language plpgsql immutable set search_path='' as $$
declare v_encoded text; v_plan uuid;
begin
  v_encoded:=coalesce(substring(p_key from '^mw-season-([0-9a-f-]{36})-w'),
                      substring(p_key from '^mw-workout-v1:[0-9a-f-]{36}:season:([0-9a-f-]{36}):w'));
  v_plan:=v_encoded::uuid;
  if p_plan is not null and v_plan is not null and p_plan<>v_plan then
    raise exception 'Workout season metadata mismatch';
  end if;
  return coalesce(v_plan,p_plan);
end $$;

create or replace function private.mw_workout_record_cycle(p_key text,p_cycle uuid)
returns uuid language plpgsql immutable set search_path='' as $$
declare v_encoded uuid;
begin
  v_encoded:=substring(p_key from '^mw-workout-v1:[0-9a-f-]{36}:cycle:([0-9a-f-]{36}):w')::uuid;
  if p_cycle is not null and v_encoded is not null and p_cycle<>v_encoded then
    raise exception 'Workout cycle metadata mismatch';
  end if;
  return coalesce(v_encoded,p_cycle);
end $$;
revoke all on function private.mw_workout_record_cycle(text,uuid) from public,anon;
grant execute on function private.mw_workout_record_cycle(text,uuid) to authenticated;

create or replace function private.mw_normalize_workout_key(
  p_athlete uuid,p_plan uuid,p_week integer,p_day integer,p_key text,p_cycle uuid default null
) returns text language plpgsql immutable set search_path='' as $$
declare v_plan uuid; v_cycle uuid; v_key text; v_session text:='track';
begin
  v_plan:=private.mw_workout_record_plan(p_key,p_plan);
  v_cycle:=private.mw_workout_record_cycle(p_key,p_cycle);
  if p_key like 'mw-workout-v1:%' then v_session:=regexp_replace(p_key,'^.*:',''); end if;
  v_key:=public.mw_workout_identity_key(p_athlete,v_plan,p_week,p_day,v_session,v_cycle);
  if p_key=v_key or (v_session='track' and (
     p_key=format('mw-track-w%s-d%s',p_week,p_day)
     or (v_plan is not null and p_key=format('mw-season-%s-w%s-d%s',v_plan,p_week,p_day)))) then
    return v_key;
  end if;
  raise exception 'Workout identity mismatch';
end $$;
revoke all on function private.mw_workout_record_plan(text,uuid) from public,anon;
revoke all on function private.mw_normalize_workout_key(uuid,uuid,integer,integer,text,uuid) from public,anon;
grant execute on function private.mw_workout_record_plan(text,uuid) to authenticated;
grant execute on function private.mw_normalize_workout_key(uuid,uuid,integer,integer,text,uuid) to authenticated;

-- Preflight ambiguous aliases before updating any historical evidence.
lock table public.workout_completions,public.athlete_practice_rep_results in share row exclusive mode;
do $$
begin
  if exists (
    select 1 from public.workout_completions
    where workout_key ~ '^mw-(track-w|season-|workout-v1:)'
    group by athlete_id,private.mw_normalize_workout_key(athlete_id,season_plan_id,program_week,program_day,workout_key,workout_cycle_id)
    having count(*)>1
  ) or exists (
    select 1 from public.athlete_practice_rep_results
    where workout_key ~ '^mw-(track-w|season-|workout-v1:)'
    group by athlete_id,private.mw_normalize_workout_key(athlete_id,season_plan_id,program_week,program_day,workout_key,workout_cycle_id),rep_number
    having count(*)>1
  ) then
    raise exception 'Canonical workout identity collision: reconcile duplicate aliases before applying this migration';
  end if;
end $$;

-- Do not make historical activity appear recent during key-only backfill.
alter table public.workout_completions disable trigger mw_stamp_workout_status;

-- Keep notification links aligned with the completion identity; retain row IDs and all evidence.
update public.athlete_notifications n
set entity_id=private.mw_normalize_workout_key(w.athlete_id,w.season_plan_id,w.program_week,w.program_day,w.workout_key,w.workout_cycle_id)
from public.workout_completions w
where n.athlete_id=w.athlete_id and n.entity_type='workout_completion' and n.entity_id=w.workout_key
  and w.workout_key ~ '^mw-(track-w|season-|workout-v1:)';
update public.workout_completions
set workout_key=private.mw_normalize_workout_key(athlete_id,season_plan_id,program_week,program_day,workout_key,workout_cycle_id),
    season_plan_id=private.mw_workout_record_plan(workout_key,season_plan_id),
    workout_cycle_id=private.mw_workout_record_cycle(workout_key,workout_cycle_id)
where workout_key ~ '^mw-(track-w|season-|workout-v1:)';
update public.athlete_practice_rep_results
set workout_key=private.mw_normalize_workout_key(athlete_id,season_plan_id,program_week,program_day,workout_key,workout_cycle_id),
    season_plan_id=private.mw_workout_record_plan(workout_key,season_plan_id),
    workout_cycle_id=private.mw_workout_record_cycle(workout_key,workout_cycle_id)
where workout_key ~ '^mw-(track-w|season-|workout-v1:)';

alter table public.workout_completions enable trigger mw_stamp_workout_status;

grant insert (workout_cycle_id),update (workout_cycle_id) on public.workout_completions to authenticated;

-- Old direct REST clients still upsert aliases. Normalize BEFORE conflict detection.
create or replace function private.mw_stamp_workout_identity()
returns trigger language plpgsql set search_path='' as $$
begin
  new.workout_key:=private.mw_normalize_workout_key(new.athlete_id,new.season_plan_id,new.program_week,new.program_day,new.workout_key,new.workout_cycle_id);
  new.season_plan_id:=private.mw_workout_record_plan(new.workout_key,new.season_plan_id);
  new.workout_cycle_id:=private.mw_workout_record_cycle(new.workout_key,new.workout_cycle_id);
  if tg_op='UPDATE' and new.workout_key<>old.workout_key then
    raise exception 'A saved workout cannot be reassigned to another identity';
  end if;
  return new;
end $$;
revoke all on function private.mw_stamp_workout_identity() from public,anon,authenticated;
create trigger mw_canonical_workout_identity before insert or update on public.workout_completions
for each row execute function private.mw_stamp_workout_identity();
create trigger mw_canonical_practice_identity before insert or update on public.athlete_practice_rep_results
for each row execute function private.mw_stamp_workout_identity();

alter table public.coach_practice_timing_results
  add column if not exists workout_key text,
  add column if not exists workout_cycle_id uuid,
  add column if not exists season_plan_id uuid references public.athlete_season_plans(id),
  add column if not exists program_week integer,
  add column if not exists program_day integer;
-- Existing timing rows can be attributed only when the prior bridge persisted their identity.
update public.coach_practice_timing_results c
set workout_key=a.workout_key,season_plan_id=a.season_plan_id,workout_cycle_id=a.workout_cycle_id,program_week=a.program_week,program_day=a.program_day
from public.athlete_practice_rep_results a
where a.coach_session_id=c.session_id and a.athlete_id=c.athlete_id and a.rep_number=c.rep_number;

create or replace function private.mw_stamp_coach_workout_identity()
returns trigger language plpgsql set search_path='' as $$
begin
  if tg_op='UPDATE' and old.workout_key is not null and new.workout_key is null then
    new.workout_key:=old.workout_key;new.season_plan_id:=old.season_plan_id;new.workout_cycle_id:=old.workout_cycle_id;
    new.program_week:=old.program_week;new.program_day:=old.program_day;
  end if;
  if new.workout_key is not null then
    new.workout_key:=private.mw_normalize_workout_key(new.athlete_id,new.season_plan_id,new.program_week,new.program_day,new.workout_key,new.workout_cycle_id);
    new.season_plan_id:=private.mw_workout_record_plan(new.workout_key,new.season_plan_id);
  new.workout_cycle_id:=private.mw_workout_record_cycle(new.workout_key,new.workout_cycle_id);
    if tg_op='UPDATE' and old.workout_key is not null and new.workout_key<>old.workout_key then
      raise exception 'Coach timing session cannot be reassigned to another workout';
    end if;
  elsif new.workout_cycle_id is not null or new.season_plan_id is not null or new.program_week is not null or new.program_day is not null then
    raise exception 'Coach timing workout metadata requires an identity';
  end if;
  return new;
end $$;
revoke all on function private.mw_stamp_coach_workout_identity() from public,anon,authenticated;
create trigger mw_canonical_coach_timing_identity before insert or update on public.coach_practice_timing_results
for each row execute function private.mw_stamp_coach_workout_identity();

-- Existing five-day status/calendar behavior retained; only identity construction changes.
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
    v_key := public.mw_workout_identity_key(v_athlete,null,p_program_week,p_program_day,'track',v_state.workout_cycle_id);
    v_source := p_program_week;
  else
    v_key := public.mw_workout_identity_key(v_athlete,v_state.season_plan_id,p_program_week,p_program_day);
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
          public.mw_workout_identity_key(v_athlete,null,w,d,'track',v_state.workout_cycle_id) as workout_key,
          (
            anchor_date + ((d-extract(isodow from anchor_date)::integer+7)%7)
          )::date as scheduled_date
        from generate_series(v_start_week,least(41,v_start_week+v_week_offset)) w
        cross join generate_series(1,5) d
        cross join lateral (
          select (v_state.start_date + ((w-v_start_week)*7))::date as anchor_date
        ) a
        where d<=4
           or (anchor_date + ((d-extract(isodow from anchor_date)::integer+7)%7))::date >= date '2026-09-25'
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
          public.mw_workout_identity_key(v_athlete,null,w,d,'track',v_state.workout_cycle_id) as workout_key,
          (
            anchor_date + ((d-extract(isodow from anchor_date)::integer+7)%7)
          )::date as scheduled_date
        from generate_series(v_start_week,least(41,v_start_week+v_week_offset)) w
        cross join generate_series(1,5) d
        cross join lateral (
          select (v_state.start_date + ((w-v_start_week)*7))::date as anchor_date
        ) a
        where d<=4
           or (anchor_date + ((d-extract(isodow from anchor_date)::integer+7)%7))::date >= date '2026-09-25'
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
          public.mw_workout_identity_key(v_athlete,null,w,d,'track',v_state.workout_cycle_id) as workout_key,
          (
            anchor_date + ((d-extract(isodow from anchor_date)::integer+7)%7)
          )::date as scheduled_date
        from generate_series(v_start_week,least(41,v_start_week+v_week_offset)) w
        cross join generate_series(1,5) d
        cross join lateral (
          select (v_state.start_date + ((w-v_start_week)*7))::date as anchor_date
        ) a
        where d<=4
           or (anchor_date + ((d-extract(isodow from anchor_date)::integer+7)%7))::date >= date '2026-09-25'
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
$function$;

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
      public.mw_workout_identity_key(v_athlete,v_plan.id,w,d) as workout_key,
      coalesce(nullif(v_plan.source_week_map->(w::text)->>'sourceWeek','')::integer,w) as source_program_week,
      (anchor_date+((d-extract(isodow from anchor_date)::integer+7)%7))::date as scheduled_date
    from generate_series(1,v_week) w
    cross join generate_series(1,5) d
    cross join lateral (select (v_plan.season_start_date+((w-1)*7))::date as anchor_date) a
    where d<=4
       or (anchor_date+((d-extract(isodow from anchor_date)::integer+7)%7))::date >= date '2026-09-25'
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
      public.mw_workout_identity_key(v_athlete,v_plan.id,w,d) as workout_key,
      coalesce(nullif(v_plan.source_week_map->(w::text)->>'sourceWeek','')::integer,w) as source_program_week,
      (anchor_date+((d-extract(isodow from anchor_date)::integer+7)%7))::date as scheduled_date
    from generate_series(1,v_week) w
    cross join generate_series(1,5) d
    cross join lateral (select (v_plan.season_start_date+((w-1)*7))::date as anchor_date) a
    where d<=4
       or (anchor_date+((d-extract(isodow from anchor_date)::integer+7)%7))::date >= date '2026-09-25'
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
      public.mw_workout_identity_key(v_athlete,v_plan.id,w,d) as workout_key,
      coalesce(nullif(v_plan.source_week_map->(w::text)->>'sourceWeek','')::integer,w) as source_program_week,
      (anchor_date+((d-extract(isodow from anchor_date)::integer+7)%7))::date as scheduled_date
    from generate_series(1,v_week) w
    cross join generate_series(1,5) d
    cross join lateral (select (v_plan.season_start_date+((w-1)*7))::date as anchor_date) a
    where d<=4
       or (anchor_date+((d-extract(isodow from anchor_date)::integer+7)%7))::date >= date '2026-09-25'
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

drop function public.mw_coach_sync_practice_session_to_athlete(uuid,uuid,integer,integer,integer,text,integer,uuid);
create or replace function public.mw_coach_sync_practice_session_to_athlete(
  p_session_id uuid,
  p_athlete_id uuid,
  p_program_week integer,
  p_program_day integer,
  p_source_program_week integer,
  p_workout_key text,
  p_distance_m integer default null,
  p_season_plan_id uuid default null,
  p_workout_cycle_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_role text;
  v_current_week integer;
  v_current_day integer;
  v_current_plan uuid;
  v_current_cycle uuid;
  v_key text;
  v_total integer;
  v_hit integer;
  v_first_at timestamptz;
  v_last_at timestamptz;
  v_pace_status text;
begin
  if v_uid is null then
    raise exception 'Authentication required' using errcode='42501';
  end if;

  v_role := private.mw_current_role()::text;
  if v_role not in ('coach','admin','founder_owner') then
    raise exception 'Coach access required' using errcode='42501';
  end if;

  if p_session_id is null or p_athlete_id is null then
    raise exception 'Practice session and athlete are required';
  end if;
  if p_program_week not between 1 and 41 or p_program_day not between 1 and 7 then
    raise exception 'Invalid program week/day';
  end if;
  if p_source_program_week is not null and p_source_program_week not between 1 and 41 then
    raise exception 'Invalid source program week';
  end if;
  if p_distance_m is not null and p_distance_m <= 0 then
    raise exception 'Invalid practice distance';
  end if;

  if v_role='coach' and not private.mw_coach_is_assigned(p_athlete_id) then
    raise exception 'This athlete is not assigned to your coach account' using errcode='42501';
  end if;

  select current_week,current_day,season_plan_id,workout_cycle_id
    into v_current_week,v_current_day,v_current_plan,v_current_cycle
  from public.athlete_program_state
  where athlete_id=p_athlete_id
  for update;

  if not found then
    raise exception 'Athlete program state not found';
  end if;

  if v_role='coach'
     and (v_current_week is distinct from p_program_week or v_current_day is distinct from p_program_day) then
    raise exception 'Practice session no longer matches the athlete current workout';
  end if;

  -- The endpoint resolves older clients' omitted plan metadata before calling us.
  if v_current_plan is not null then v_current_cycle:=null; end if;
  if p_workout_cycle_id is distinct from v_current_cycle then
    raise exception 'Practice training cycle no longer matches the athlete current workout';
  end if;
  if p_season_plan_id is distinct from v_current_plan then
    raise exception 'Practice season no longer matches the athlete current workout';
  end if;
  if v_current_plan is not null and not exists (
    select 1 from public.athlete_season_plans where id=v_current_plan and athlete_id=p_athlete_id
  ) then raise exception 'Season plan does not belong to athlete'; end if;
  v_key:=private.mw_normalize_workout_key(p_athlete_id,v_current_plan,p_program_week,p_program_day,p_workout_key,v_current_cycle);
  if v_key<>public.mw_workout_identity_key(p_athlete_id,v_current_plan,p_program_week,p_program_day,'track',v_current_cycle) then
    raise exception 'Coach practice requires the track workout slot';
  end if;
  if exists(select 1 from public.coach_practice_timing_results
    where session_id=p_session_id and athlete_id=p_athlete_id
      and (coach_user_id=v_uid or v_role in ('admin','founder_owner'))
      and workout_key is not null and workout_key<>v_key) then
    raise exception 'Timing session belongs to another workout';
  end if;
  update public.coach_practice_timing_results
  set workout_key=v_key,season_plan_id=v_current_plan,workout_cycle_id=v_current_cycle,program_week=p_program_week,program_day=p_program_day
  where session_id=p_session_id and athlete_id=p_athlete_id and workout_key is null
    and (coach_user_id=v_uid or v_role in ('admin','founder_owner'));

  select
    count(*)::integer,
    count(*) filter (where pace_status='on_pace')::integer,
    min(created_at),
    max(created_at)
  into v_total,v_hit,v_first_at,v_last_at
  from public.coach_practice_timing_results
  where session_id=p_session_id
    and athlete_id=p_athlete_id
    and (coach_user_id=v_uid or v_role in ('admin','founder_owner'));

  if coalesce(v_total,0)=0 then
    raise exception 'No coach timing rows found for this athlete/session';
  end if;

  insert into public.athlete_practice_rep_results(
    athlete_id,workout_key,program_week,program_day,rep_number,distance_m,
    time_seconds,target_seconds,pace_status,recorded_at,season_plan_id,source_program_week,
    entry_source,timing_source,coach_user_id,coach_session_id,
    target_min_seconds,target_max_seconds,actual_rest_seconds,result_status,lane_number,division
  )
  select
    r.athlete_id,
    v_key,
    p_program_week,
    p_program_day,
    r.rep_number,
    p_distance_m,
    r.time_seconds,
    r.target_seconds,
    case
      when r.pace_status='on_pace' then 'on_pace'
      when r.pace_status in ('fast','slow') then 'outside_target'
      else 'timed'
    end,
    r.created_at,
    p_season_plan_id,
    coalesce(p_source_program_week,p_program_week),
    'coach',
    coalesce(r.timing_source,'coach'),
    r.coach_user_id,
    r.session_id,
    r.target_min_seconds,
    r.target_max_seconds,
    r.actual_rest_seconds,
    coalesce(r.result_status,'finished'),
    r.lane_number,
    r.division
  from public.coach_practice_timing_results r
  where r.session_id=p_session_id
    and r.athlete_id=p_athlete_id
    and (r.coach_user_id=v_uid or v_role in ('admin','founder_owner'))
  on conflict (athlete_id,workout_key,rep_number)
  do update set
    program_week=excluded.program_week,
    program_day=excluded.program_day,
    distance_m=coalesce(excluded.distance_m,public.athlete_practice_rep_results.distance_m),
    time_seconds=excluded.time_seconds,
    target_seconds=excluded.target_seconds,
    pace_status=excluded.pace_status,
    recorded_at=excluded.recorded_at,
    season_plan_id=coalesce(excluded.season_plan_id,public.athlete_practice_rep_results.season_plan_id),
    source_program_week=excluded.source_program_week,
    entry_source=excluded.entry_source,
    timing_source=excluded.timing_source,
    coach_user_id=excluded.coach_user_id,
    coach_session_id=excluded.coach_session_id,
    target_min_seconds=excluded.target_min_seconds,
    target_max_seconds=excluded.target_max_seconds,
    actual_rest_seconds=excluded.actual_rest_seconds,
    result_status=excluded.result_status,
    lane_number=excluded.lane_number,
    division=excluded.division;

  v_pace_status := case
    when v_hit=v_total then 'all'
    when v_hit>0 then 'some'
    else 'none'
  end;

  insert into public.workout_completions(
    athlete_id,program_week,program_day,workout_key,completion_status,
    completed_at,session_rpe,pace_check_status,pace_reps_total,pace_reps_hit,
    performance_checked_at,scheduled_date,started_at,last_activity_at,
    season_plan_id,source_program_week
  )
  values(
    p_athlete_id,p_program_week,p_program_day,v_key,'completed',
    coalesce(v_last_at,now()),null,v_pace_status,v_total,v_hit,
    now(),current_date,coalesce(v_first_at,now()),coalesce(v_last_at,now()),
    p_season_plan_id,coalesce(p_source_program_week,p_program_week)
  )
  on conflict (athlete_id,workout_key)
  do update set
    program_week=excluded.program_week,
    program_day=excluded.program_day,
    completion_status='completed',
    completed_at=coalesce(public.workout_completions.completed_at,excluded.completed_at),
    pace_check_status=excluded.pace_check_status,
    pace_reps_total=excluded.pace_reps_total,
    pace_reps_hit=excluded.pace_reps_hit,
    performance_checked_at=excluded.performance_checked_at,
    started_at=coalesce(public.workout_completions.started_at,excluded.started_at),
    last_activity_at=excluded.last_activity_at,
    season_plan_id=coalesce(excluded.season_plan_id,public.workout_completions.season_plan_id),
    source_program_week=excluded.source_program_week;

  return jsonb_build_object(
    'ok',true,
    'athlete_id',p_athlete_id,
    'workout_key',v_key,
    'rep_count',v_total,
    'pace_reps_hit',v_hit,
    'pace_check_status',v_pace_status,
    'entry_source','coach',
    'session_id',p_session_id
  );
end
$function$;

revoke all on function public.mw_coach_sync_practice_session_to_athlete(uuid,uuid,integer,integer,integer,text,integer,uuid,uuid)
from public,anon;

grant execute on function public.mw_coach_sync_practice_session_to_athlete(uuid,uuid,integer,integer,integer,text,integer,uuid,uuid)
to authenticated;

commit;
