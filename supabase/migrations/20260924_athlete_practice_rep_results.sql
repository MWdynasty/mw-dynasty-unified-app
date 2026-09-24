create table if not exists public.athlete_practice_rep_results (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references public.athletes(id) on delete cascade,
  workout_key text not null,
  program_week integer not null check (program_week between 1 and 41),
  program_day integer not null check (program_day between 1 and 7),
  rep_number integer not null check (rep_number > 0),
  distance_m integer null check (distance_m is null or distance_m > 0),
  time_seconds numeric(8,2) not null check (time_seconds > 0),
  target_seconds numeric(8,2) null check (target_seconds is null or target_seconds > 0),
  pace_status text not null default 'timed' check (pace_status in ('timed','on_pace','outside_target')),
  recorded_at timestamptz not null default now(),
  unique (athlete_id, workout_key, rep_number)
);

alter table public.athlete_practice_rep_results enable row level security;

grant select, insert, update on table public.athlete_practice_rep_results to authenticated;

create policy "athlete practice reps select"
on public.athlete_practice_rep_results for select
to authenticated
using (
  athlete_id = (select private.mw_own_athlete_id())
  or (select private.mw_is_admin_or_founder())
  or (
    (select private.mw_current_role()) = 'coach'::mw_app_role
    and (select private.mw_current_coach_has_sprint_performance())
    and (select private.mw_coach_is_assigned(athlete_id))
  )
);

create policy "athlete practice reps insert own"
on public.athlete_practice_rep_results for insert
to authenticated
with check (
  athlete_id = (select private.mw_own_athlete_id())
  and (select private.mw_athlete_feature_enabled('mw_training_system'::text))
);

create policy "athlete practice reps update own"
on public.athlete_practice_rep_results for update
to authenticated
using (
  athlete_id = (select private.mw_own_athlete_id())
  and (select private.mw_athlete_feature_enabled('mw_training_system'::text))
)
with check (
  athlete_id = (select private.mw_own_athlete_id())
  and (select private.mw_athlete_feature_enabled('mw_training_system'::text))
);