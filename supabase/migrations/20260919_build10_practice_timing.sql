create table if not exists public.coach_practice_timing_results (
  id uuid primary key default gen_random_uuid(),
  coach_user_id uuid not null references auth.users(id) on delete cascade,
  athlete_id uuid not null references public.athletes(id) on delete cascade,
  session_date date not null default current_date,
  group_name text not null default 'All',
  rep_number integer not null check (rep_number > 0),
  time_seconds numeric(8,3) not null check (time_seconds > 0),
  target_seconds numeric(8,3),
  pace_status text check (pace_status in ('fast','on_pace','slow') or pace_status is null),
  created_at timestamptz not null default now()
);
create index if not exists coach_practice_timing_results_coach_date_idx on public.coach_practice_timing_results(coach_user_id,session_date desc);
create index if not exists coach_practice_timing_results_athlete_date_idx on public.coach_practice_timing_results(athlete_id,session_date desc);
alter table public.coach_practice_timing_results enable row level security;
drop policy if exists coach_practice_timing_select on public.coach_practice_timing_results;
drop policy if exists coach_practice_timing_insert on public.coach_practice_timing_results;
drop policy if exists coach_practice_timing_update on public.coach_practice_timing_results;
drop policy if exists coach_practice_timing_delete on public.coach_practice_timing_results;
create policy coach_practice_timing_select on public.coach_practice_timing_results for select to authenticated using (coach_user_id=auth.uid() or private.mw_is_admin_or_founder());
create policy coach_practice_timing_insert on public.coach_practice_timing_results for insert to authenticated with check ((coach_user_id=auth.uid() and private.mw_coach_is_assigned(athlete_id)) or private.mw_is_admin_or_founder());
create policy coach_practice_timing_update on public.coach_practice_timing_results for update to authenticated using (coach_user_id=auth.uid() or private.mw_is_admin_or_founder()) with check (coach_user_id=auth.uid() or private.mw_is_admin_or_founder());
create policy coach_practice_timing_delete on public.coach_practice_timing_results for delete to authenticated using (coach_user_id=auth.uid() or private.mw_is_admin_or_founder());