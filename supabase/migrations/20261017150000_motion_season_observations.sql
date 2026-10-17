-- Separate optional, long-lived technique observations; video retains its 14-day limit.
-- Each measurement is a client estimate, not a validated biomechanical assessment.
create table if not exists public.motion_season_observations (
 id uuid primary key default gen_random_uuid(),
 assessment_id uuid unique references public.motion_assessments(id) on delete set null,
 athlete_id uuid not null references public.athletes(id) on delete cascade,
 owner_user_id uuid not null references auth.users(id) on delete cascade,
 movement_type text not null check (movement_type in ('block_start','two_point_start','three_point_start','four_point_start','acceleration_30m','front_side','wickets')),
 week_number integer not null check (week_number between 1 and 41),
 sampled_frames integer not null check (sampled_frames between 5 and 36),
 pose_frames integer not null check (pose_frames between 5 and 36 and pose_frames<=sampled_frames),
 metrics jsonb not null check (jsonb_typeof(metrics)='array' and jsonb_array_length(metrics) between 1 and 3),
 method text not null default 'local-pose-v1' check (method='local-pose-v1'),
 provenance text not null default 'unverified_client_2d' check (provenance='unverified_client_2d'),
 consent_version text not null check (consent_version='motion-season-v1'),
 consented_at timestamptz not null default now(),
 share_with_assigned_coach boolean not null default false,
 observed_at timestamptz not null default now(),
 expires_at timestamptz not null default (now()+interval '330 days'),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 constraint motion_season_observations_valid_expiry check (expires_at>created_at and expires_at<=created_at+interval '331 days')
);
create index if not exists motion_season_observations_owner_week_idx on public.motion_season_observations(owner_user_id,week_number,observed_at desc);
create index if not exists motion_season_observations_athlete_shared_idx on public.motion_season_observations(athlete_id,observed_at desc) where share_with_assigned_coach;
alter table public.motion_season_observations enable row level security;
revoke all on public.motion_season_observations from anon,authenticated;
grant select on public.motion_season_observations to authenticated;
drop policy if exists "athlete read private season observations" on public.motion_season_observations;
create policy "athlete read private season observations" on public.motion_season_observations for select to authenticated
using (owner_user_id=(select auth.uid()) and expires_at>now());
drop policy if exists "assigned coach read explicitly shared adult observations" on public.motion_season_observations;
create policy "assigned coach read explicitly shared adult observations" on public.motion_season_observations for select to authenticated
using (
 share_with_assigned_coach and expires_at>now()
 and exists(select 1 from public.coach_assignments ca
   where ca.athlete_id=motion_season_observations.athlete_id
   and ca.coach_user_id=(select auth.uid()) and ca.status='active')
 and exists(select 1 from public.athletes a where a.id=motion_season_observations.athlete_id
   and a.date_of_birth <= (current_date-interval '18 years')::date)
);
