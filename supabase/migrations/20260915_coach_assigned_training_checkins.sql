-- MW Dynasty 3.0.14: simple athlete completion/RPE/pace check-ins for coach-authored programs.
create table if not exists public.coach_assigned_training_checkins (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references public.athletes(id) on delete cascade,
  assignment_id uuid not null references public.coach_program_assignments(id) on delete cascade,
  status text not null check (status in ('completed','partial','modified','skipped')),
  session_rpe smallint null check (session_rpe between 1 and 10),
  pace_check_status text null check (pace_check_status in ('on_pace','missed','not_applicable')),
  pace_reps_total smallint null check (pace_reps_total is null or pace_reps_total >= 0),
  pace_reps_hit smallint null check (pace_reps_hit is null or pace_reps_hit >= 0),
  athlete_note text null,
  completed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint mw_coach_checkin_rep_consistency check (pace_reps_total is null or pace_reps_hit is null or pace_reps_hit <= pace_reps_total)
);
create index if not exists coach_assigned_checkins_athlete_completed_idx on public.coach_assigned_training_checkins(athlete_id, completed_at desc);
create index if not exists coach_assigned_checkins_assignment_completed_idx on public.coach_assigned_training_checkins(assignment_id, completed_at desc);
alter table public.coach_assigned_training_checkins enable row level security;
revoke all on table public.coach_assigned_training_checkins from anon, authenticated;

create or replace function public.mw_log_coach_assigned_training_checkin(
  p_assignment_id uuid,
  p_status text,
  p_session_rpe smallint default null,
  p_pace_check_status text default null,
  p_pace_reps_total smallint default null,
  p_pace_reps_hit smallint default null,
  p_athlete_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_uid uuid := auth.uid();
  v_athlete_id uuid;
  v_access jsonb;
  v_ok boolean := false;
  v_id uuid;
begin
  if v_uid is null then raise exception 'Authentication required' using errcode='42501'; end if;
  v_access := private.mw_athlete_access_profile();
  if coalesce((v_access->>'has_access')::boolean,false) is not true
     or coalesce((v_access->>'coach_assigned_training')::boolean,false) is not true then
    raise exception 'Coach-assigned training access required' using errcode='42501';
  end if;
  if p_status not in ('completed','partial','modified','skipped') then raise exception 'Invalid completion status'; end if;
  if p_session_rpe is not null and (p_session_rpe < 1 or p_session_rpe > 10) then raise exception 'RPE must be 1-10'; end if;
  if p_pace_check_status is not null and p_pace_check_status not in ('on_pace','missed','not_applicable') then raise exception 'Invalid pace status'; end if;
  if p_pace_reps_total is not null and p_pace_reps_total < 0 then raise exception 'Invalid total reps'; end if;
  if p_pace_reps_hit is not null and p_pace_reps_hit < 0 then raise exception 'Invalid reps hit'; end if;
  if p_pace_reps_total is not null and p_pace_reps_hit is not null and p_pace_reps_hit > p_pace_reps_total then raise exception 'Reps hit cannot exceed total reps'; end if;

  select a.id into v_athlete_id from public.athletes a where a.user_id=v_uid limit 1;
  if v_athlete_id is null then raise exception 'Athlete profile not found' using errcode='42501'; end if;

  select exists(
    select 1
    from public.coach_program_assignments cpa
    join public.coach_assignments ca on ca.athlete_id=v_athlete_id and ca.coach_user_id=cpa.coach_user_id and ca.status::text='active'
    where cpa.id=p_assignment_id and cpa.status='active'
      and (cpa.athlete_id=v_athlete_id or (cpa.group_id is not null and exists(select 1 from public.coach_group_members cgm where cgm.group_id=cpa.group_id and cgm.athlete_id=v_athlete_id)))
  ) into v_ok;
  if not v_ok then raise exception 'This program is not assigned to this athlete' using errcode='42501'; end if;

  insert into public.coach_assigned_training_checkins(athlete_id,assignment_id,status,session_rpe,pace_check_status,pace_reps_total,pace_reps_hit,athlete_note)
  values(v_athlete_id,p_assignment_id,p_status,p_session_rpe,p_pace_check_status,p_pace_reps_total,p_pace_reps_hit,nullif(left(trim(coalesce(p_athlete_note,'')),2000),''))
  returning id into v_id;
  return jsonb_build_object('ok',true,'id',v_id,'completed_at',now());
end;
$$;
revoke all on function public.mw_log_coach_assigned_training_checkin(uuid,text,smallint,text,smallint,smallint,text) from public, anon;
grant execute on function public.mw_log_coach_assigned_training_checkin(uuid,text,smallint,text,smallint,smallint,text) to authenticated;

create or replace function public.mw_my_coach_assigned_training_checkins()
returns jsonb
language sql
stable
security definer
set search_path=''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',c.id,'assignment_id',c.assignment_id,'status',c.status,'session_rpe',c.session_rpe,
    'pace_check_status',c.pace_check_status,'pace_reps_total',c.pace_reps_total,'pace_reps_hit',c.pace_reps_hit,
    'athlete_note',c.athlete_note,'completed_at',c.completed_at
  ) order by c.completed_at desc),'[]'::jsonb)
  from public.coach_assigned_training_checkins c
  join public.athletes a on a.id=c.athlete_id
  where a.user_id=auth.uid();
$$;
revoke all on function public.mw_my_coach_assigned_training_checkins() from public, anon;
grant execute on function public.mw_my_coach_assigned_training_checkins() to authenticated;

create or replace function public.mw_coach_assigned_training_checkins(p_athlete_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_uid uuid := auth.uid();
  v_role text;
  v_allowed boolean := false;
  v_result jsonb;
begin
  if v_uid is null then raise exception 'Authentication required' using errcode='42501'; end if;
  select p.role::text into v_role from public.profiles p where p.user_id=v_uid and p.account_status::text='active' limit 1;
  if v_role in ('founder_owner','admin') then v_allowed:=true;
  elsif v_role='coach' then
    select exists(select 1 from public.coach_assignments ca where ca.coach_user_id=v_uid and ca.athlete_id=p_athlete_id and ca.status::text='active') into v_allowed;
  end if;
  if not v_allowed then raise exception 'Coach access required' using errcode='42501'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',c.id,'assignment_id',c.assignment_id,'status',c.status,'session_rpe',c.session_rpe,
    'pace_check_status',c.pace_check_status,'pace_reps_total',c.pace_reps_total,'pace_reps_hit',c.pace_reps_hit,
    'athlete_note',c.athlete_note,'completed_at',c.completed_at
  ) order by c.completed_at desc),'[]'::jsonb)
  into v_result from public.coach_assigned_training_checkins c where c.athlete_id=p_athlete_id;
  return coalesce(v_result,'[]'::jsonb);
end;
$$;
revoke all on function public.mw_coach_assigned_training_checkins(uuid) from public, anon;
grant execute on function public.mw_coach_assigned_training_checkins(uuid) to authenticated;
