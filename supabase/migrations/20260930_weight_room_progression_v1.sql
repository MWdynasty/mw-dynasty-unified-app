-- MW Dynasty Weight Room Progression V1
-- Minimal athlete input: Complete / Adjust + Strong / Normal / Heavy.
-- Detailed set logging remains optional and is used only for exceptions or deeper analysis.

alter table public.athlete_strength_checkins
  add column if not exists session_feel text,
  add column if not exists feel_recorded_at timestamptz;

alter table public.athlete_strength_checkins
  drop constraint if exists athlete_strength_checkins_session_feel_check;

alter table public.athlete_strength_checkins
  add constraint athlete_strength_checkins_session_feel_check
  check (session_feel is null or session_feel in ('strong','normal','heavy'));

create index if not exists athlete_strength_checkins_progression_idx
  on public.athlete_strength_checkins
  (athlete_id, lifecycle_status, completed_at desc, program_week desc, strength_day desc);

create or replace function public.mw_set_own_strength_session_feel(
  p_program_week integer,
  p_strength_day integer,
  p_feel text
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_athlete uuid;
  v_row public.athlete_strength_checkins%rowtype;
begin
  if v_uid is null then
    raise exception 'Authentication required' using errcode='42501';
  end if;

  if not private.mw_athlete_feature_enabled('strength_power') then
    raise exception 'MW Strength & Power access required' using errcode='42501';
  end if;

  if p_program_week < 1 or p_program_week > 41 or p_strength_day < 1 or p_strength_day > 7 then
    raise exception 'Invalid strength session position';
  end if;

  if p_feel not in ('strong','normal','heavy') then
    raise exception 'Invalid strength session feel';
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

  update public.athlete_strength_checkins
  set session_feel=p_feel,
      feel_recorded_at=now(),
      last_activity_at=now()
  where athlete_id=v_athlete
    and program_week=p_program_week
    and strength_day=p_strength_day
    and lifecycle_status='completed'
  returning * into v_row;

  if v_row.id is null then
    raise exception 'Complete the strength session before recording how it felt';
  end if;

  return jsonb_build_object(
    'athlete_id',v_row.athlete_id,
    'program_week',v_row.program_week,
    'strength_day',v_row.strength_day,
    'day_label',v_row.day_label,
    'status',v_row.status,
    'lifecycle_status',v_row.lifecycle_status,
    'session_feel',v_row.session_feel,
    'feel_recorded_at',v_row.feel_recorded_at,
    'completed_at',v_row.completed_at
  );
end
$function$;

revoke all on function public.mw_set_own_strength_session_feel(integer,integer,text)
from public,anon;

grant execute on function public.mw_set_own_strength_session_feel(integer,integer,text)
to authenticated;


-- Automatically preserve established max changes so Progress can show real season-over-season strength movement
-- without asking the athlete to log extra sets.
create table if not exists public.athlete_strength_max_history (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references public.athletes(id) on delete cascade,
  power_clean_max numeric,
  front_squat_max numeric,
  back_squat_max numeric,
  deadlift_max numeric,
  deadlift_type text not null default 'conventional',
  weight_unit text not null default 'lb',
  last_max_test date,
  recorded_at timestamptz not null default now(),
  change_source text not null default 'profile_update'
);

alter table public.athlete_strength_max_history
  drop constraint if exists athlete_strength_max_history_deadlift_type_check,
  add constraint athlete_strength_max_history_deadlift_type_check
    check (deadlift_type in ('conventional','trap_bar')),
  drop constraint if exists athlete_strength_max_history_weight_unit_check,
  add constraint athlete_strength_max_history_weight_unit_check
    check (weight_unit in ('lb','kg')),
  drop constraint if exists athlete_strength_max_history_change_source_check,
  add constraint athlete_strength_max_history_change_source_check
    check (change_source in ('baseline','profile_update','max_test'));

create index if not exists athlete_strength_max_history_athlete_time_idx
  on public.athlete_strength_max_history(athlete_id, recorded_at desc);

alter table public.athlete_strength_max_history enable row level security;

drop policy if exists mw_strength_max_history_select_authorized
  on public.athlete_strength_max_history;
create policy mw_strength_max_history_select_authorized
  on public.athlete_strength_max_history
  for select to authenticated
  using (
    athlete_id=(select private.mw_own_athlete_id())
    or (select private.mw_is_admin_or_founder())
    or (
      (select private.mw_current_role())='coach'::public.mw_app_role
      and (select private.mw_coach_is_assigned(athlete_id))
    )
  );

revoke all privileges on table public.athlete_strength_max_history from anon;
revoke insert,update,delete,truncate,references,trigger on table public.athlete_strength_max_history from authenticated;
grant select on table public.athlete_strength_max_history to authenticated;
grant all on table public.athlete_strength_max_history to service_role;

create or replace function private.mw_capture_strength_max_history()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_source text := 'profile_update';
begin
  if tg_op='UPDATE'
     and new.power_clean_max is not distinct from old.power_clean_max
     and new.front_squat_max is not distinct from old.front_squat_max
     and new.back_squat_max is not distinct from old.back_squat_max
     and new.deadlift_max is not distinct from old.deadlift_max
     and new.deadlift_type is not distinct from old.deadlift_type
     and new.weight_unit is not distinct from old.weight_unit
     and new.last_max_test is not distinct from old.last_max_test then
    return new;
  end if;

  if new.last_max_test is not null
     and (tg_op='INSERT' or old.last_max_test is distinct from new.last_max_test) then
    v_source := 'max_test';
  end if;

  insert into public.athlete_strength_max_history(
    athlete_id,power_clean_max,front_squat_max,back_squat_max,deadlift_max,
    deadlift_type,weight_unit,last_max_test,recorded_at,change_source
  ) values (
    new.athlete_id,new.power_clean_max,new.front_squat_max,new.back_squat_max,new.deadlift_max,
    coalesce(new.deadlift_type,'conventional'),coalesce(new.weight_unit,'lb'),new.last_max_test,
    coalesce(new.updated_at,now()),v_source
  );

  return new;
end
$function$;

revoke all on function private.mw_capture_strength_max_history() from public,anon,authenticated;

drop trigger if exists mw_capture_strength_max_history
  on public.athlete_strength_maxes;
create trigger mw_capture_strength_max_history
after insert or update of
  power_clean_max,front_squat_max,back_squat_max,deadlift_max,deadlift_type,weight_unit,last_max_test
on public.athlete_strength_maxes
for each row execute function private.mw_capture_strength_max_history();

insert into public.athlete_strength_max_history(
  athlete_id,power_clean_max,front_squat_max,back_squat_max,deadlift_max,
  deadlift_type,weight_unit,last_max_test,recorded_at,change_source
)
select
  m.athlete_id,m.power_clean_max,m.front_squat_max,m.back_squat_max,m.deadlift_max,
  coalesce(m.deadlift_type,'conventional'),coalesce(m.weight_unit,'lb'),m.last_max_test,
  coalesce(m.updated_at,now()),'baseline'
from public.athlete_strength_maxes m
where not exists (
  select 1 from public.athlete_strength_max_history h
  where h.athlete_id=m.athlete_id
);
