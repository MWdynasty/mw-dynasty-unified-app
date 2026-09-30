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
