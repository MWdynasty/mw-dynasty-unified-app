-- MW Dynasty Performance Intelligence V1
-- Applied to production Supabase on 2026-09-13.

alter table public.workout_completions
  add column if not exists session_rpe smallint;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'workout_completions_session_rpe_check'
      and conrelid = 'public.workout_completions'::regclass
  ) then
    alter table public.workout_completions
      add constraint workout_completions_session_rpe_check
      check (session_rpe is null or session_rpe between 1 and 10);
  end if;
end $$;

create table if not exists public.athlete_strength_session_logs (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references public.athletes(id) on delete cascade,
  program_week integer not null check (program_week between 1 and 41),
  program_day integer,
  session_label text,
  exercise_name text not null,
  set_number integer not null check (set_number > 0),
  reps_completed integer check (reps_completed is null or reps_completed >= 0),
  target_load numeric check (target_load is null or target_load >= 0),
  actual_load numeric check (actual_load is null or actual_load >= 0),
  weight_unit text not null default 'lb' check (weight_unit in ('lb','kg')),
  set_rpe numeric check (set_rpe is null or (set_rpe >= 1 and set_rpe <= 10)),
  notes text,
  recorded_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists athlete_strength_session_logs_athlete_recorded_idx
  on public.athlete_strength_session_logs (athlete_id, recorded_at desc);
create index if not exists athlete_strength_session_logs_week_idx
  on public.athlete_strength_session_logs (athlete_id, program_week, program_day);

alter table public.athlete_strength_session_logs enable row level security;

drop policy if exists mw_strength_logs_insert_own on public.athlete_strength_session_logs;
create policy mw_strength_logs_insert_own on public.athlete_strength_session_logs
  for insert to authenticated
  with check (athlete_id = (select private.mw_own_athlete_id()));

drop policy if exists mw_strength_logs_update_own on public.athlete_strength_session_logs;
create policy mw_strength_logs_update_own on public.athlete_strength_session_logs
  for update to authenticated
  using (athlete_id = (select private.mw_own_athlete_id()))
  with check (athlete_id = (select private.mw_own_athlete_id()));

drop policy if exists mw_strength_logs_delete_own on public.athlete_strength_session_logs;
create policy mw_strength_logs_delete_own on public.athlete_strength_session_logs
  for delete to authenticated
  using (athlete_id = (select private.mw_own_athlete_id()));

drop policy if exists mw_strength_logs_select_own on public.athlete_strength_session_logs;
drop policy if exists mw_strength_logs_coach_select on public.athlete_strength_session_logs;
drop policy if exists mw_strength_logs_select_authorized on public.athlete_strength_session_logs;
create policy mw_strength_logs_select_authorized on public.athlete_strength_session_logs
  for select to authenticated
  using (
    athlete_id = (select private.mw_own_athlete_id())
    or (select private.mw_is_admin_or_founder())
    or ((select private.mw_current_role()) = 'coach'::mw_app_role
        and (select private.mw_coach_is_assigned(athlete_id)))
  );

drop policy if exists mw_pace_logs_select_own on public.athlete_pace_logs;
drop policy if exists mw_pace_logs_coach_select on public.athlete_pace_logs;
drop policy if exists mw_pace_logs_select_authorized on public.athlete_pace_logs;
create policy mw_pace_logs_select_authorized on public.athlete_pace_logs
  for select to authenticated
  using (
    athlete_id = (select private.mw_own_athlete_id())
    or (select private.mw_is_admin_or_founder())
    or ((select private.mw_current_role()) = 'coach'::mw_app_role
        and (select private.mw_coach_is_assigned(athlete_id)))
  );
