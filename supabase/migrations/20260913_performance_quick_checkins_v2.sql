-- MW Dynasty Performance Quick Check-Ins V2
alter table public.workout_completions
  add column if not exists pace_check_status text,
  add column if not exists pace_reps_total smallint,
  add column if not exists pace_reps_hit smallint,
  add column if not exists performance_checked_at timestamptz;

do $$ begin
  if not exists (select 1 from pg_constraint where conname='workout_completions_pace_status_check') then
    alter table public.workout_completions add constraint workout_completions_pace_status_check
      check (pace_check_status is null or pace_check_status in ('all','some','none','not_applicable'));
  end if;
  if not exists (select 1 from pg_constraint where conname='workout_completions_pace_total_check') then
    alter table public.workout_completions add constraint workout_completions_pace_total_check
      check (pace_reps_total is null or pace_reps_total between 1 and 60);
  end if;
  if not exists (select 1 from pg_constraint where conname='workout_completions_pace_hit_check') then
    alter table public.workout_completions add constraint workout_completions_pace_hit_check
      check (pace_reps_hit is null or (pace_reps_hit >= 0 and (pace_reps_total is null or pace_reps_hit <= pace_reps_total)));
  end if;
end $$;

create table if not exists public.athlete_strength_checkins (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references public.athletes(id) on delete cascade,
  program_week integer not null check (program_week between 1 and 41),
  strength_day integer not null check (strength_day between 1 and 7),
  day_label text,
  status text not null check (status in ('as_prescribed','modified','partial','skipped')),
  note text,
  recorded_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (athlete_id, program_week, strength_day)
);
create index if not exists athlete_strength_checkins_athlete_week_idx on public.athlete_strength_checkins(athlete_id,program_week,strength_day);
alter table public.athlete_strength_checkins enable row level security;

drop policy if exists mw_strength_checkins_insert_own on public.athlete_strength_checkins;
create policy mw_strength_checkins_insert_own on public.athlete_strength_checkins for insert to authenticated
with check (athlete_id=(select private.mw_own_athlete_id()));
drop policy if exists mw_strength_checkins_update_own on public.athlete_strength_checkins;
create policy mw_strength_checkins_update_own on public.athlete_strength_checkins for update to authenticated
using (athlete_id=(select private.mw_own_athlete_id())) with check (athlete_id=(select private.mw_own_athlete_id()));
drop policy if exists mw_strength_checkins_select_authorized on public.athlete_strength_checkins;
create policy mw_strength_checkins_select_authorized on public.athlete_strength_checkins for select to authenticated
using (athlete_id=(select private.mw_own_athlete_id()) or (select private.mw_is_admin_or_founder()) or (((select private.mw_current_role())='coach'::mw_app_role) and (select private.mw_coach_is_assigned(athlete_id))));
grant select,insert,update,delete on public.athlete_strength_checkins to authenticated;
grant all on public.athlete_strength_checkins to service_role;
