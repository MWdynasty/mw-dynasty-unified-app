-- Coach Practice Mode authoritative session/group foundation
create table if not exists public.coach_practice_sessions (
  id uuid primary key default gen_random_uuid(),
  coach_user_id uuid not null references auth.users(id) on delete cascade,
  workout_id text,
  session_date date not null default current_date,
  roster_scope text not null default 'all' check (roster_scope in ('boys','girls','all')),
  lane_capacity integer not null default 8 check (lane_capacity between 1 and 9),
  timing_authority text not null default 'coach' check (timing_authority in ('coach','athlete','sensor','manual')),
  status text not null default 'active' check (status in ('active','completed','finalized')),
  prescription_snapshot jsonb not null default '{}'::jsonb,
  completed_at timestamptz,
  finalized_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.coach_practice_groups (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.coach_practice_sessions(id) on delete cascade,
  division text not null check (division in ('boys','girls','open')),
  group_label text not null,
  lane_capacity integer not null check (lane_capacity between 1 and 9),
  created_at timestamptz not null default now(),
  unique(session_id, division, group_label)
);
create table if not exists public.coach_practice_lane_assignments (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.coach_practice_groups(id) on delete cascade,
  athlete_id uuid not null references auth.users(id) on delete cascade,
  lane_number integer not null check (lane_number between 1 and 9),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists coach_practice_active_lane_unique on public.coach_practice_lane_assignments(group_id,lane_number) where active;
create unique index if not exists coach_practice_active_athlete_unique on public.coach_practice_lane_assignments(group_id,athlete_id) where active;
create table if not exists public.coach_practice_audit_log (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.coach_practice_sessions(id) on delete cascade,
  coach_user_id uuid not null references auth.users(id) on delete cascade,
  action text not null,
  athlete_id uuid references auth.users(id) on delete set null,
  rep_number integer,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
alter table public.coach_practice_sessions enable row level security;
alter table public.coach_practice_groups enable row level security;
alter table public.coach_practice_lane_assignments enable row level security;
alter table public.coach_practice_audit_log enable row level security;
drop policy if exists coach_practice_sessions_owner on public.coach_practice_sessions;
create policy coach_practice_sessions_owner on public.coach_practice_sessions for all using (coach_user_id=auth.uid()) with check (coach_user_id=auth.uid());
drop policy if exists coach_practice_groups_owner on public.coach_practice_groups;
create policy coach_practice_groups_owner on public.coach_practice_groups for all using (exists(select 1 from public.coach_practice_sessions s where s.id=session_id and s.coach_user_id=auth.uid())) with check (exists(select 1 from public.coach_practice_sessions s where s.id=session_id and s.coach_user_id=auth.uid()));
drop policy if exists coach_practice_lanes_owner on public.coach_practice_lane_assignments;
create policy coach_practice_lanes_owner on public.coach_practice_lane_assignments for all using (exists(select 1 from public.coach_practice_groups g join public.coach_practice_sessions s on s.id=g.session_id where g.id=group_id and s.coach_user_id=auth.uid())) with check (exists(select 1 from public.coach_practice_groups g join public.coach_practice_sessions s on s.id=g.session_id where g.id=group_id and s.coach_user_id=auth.uid()));
drop policy if exists coach_practice_audit_owner on public.coach_practice_audit_log;
create policy coach_practice_audit_owner on public.coach_practice_audit_log for all using (coach_user_id=auth.uid()) with check (coach_user_id=auth.uid());
