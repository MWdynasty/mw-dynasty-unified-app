-- Disposable fixture for identity integration tests, NOT a production schema baseline.
create schema auth;
create schema private;
create role anon;
create role authenticated;
create type public.mw_app_role as enum ('athlete','coach','admin','founder_owner');
create type public.mw_account_status as enum ('active','inactive');
create type public.mw_program_status as enum ('active','not_started','completed','needs_review');
create table auth.users(id uuid primary key);
create table public.profiles(user_id uuid primary key,role public.mw_app_role,account_status public.mw_account_status);
create table public.athletes(id uuid primary key,user_id uuid references auth.users(id));
create table public.coach_assignments(coach_user_id uuid,athlete_id uuid,status text);
create table public.athlete_season_plans(
 id uuid primary key,athlete_id uuid,season_start_date date,primary_peak_date date,
 season_length_weeks integer,source_week_map jsonb
);
create table public.athlete_program_state(
 athlete_id uuid primary key,current_week integer,current_day integer,current_phase integer,
 program_status public.mw_program_status default 'active',starting_week integer,start_date date,
 season_plan_id uuid,season_length_weeks integer,source_program_week integer,season_phase_code text,
 program_version text,last_completed_workout_at timestamptz,updated_at timestamptz
);
create table public.workout_completions(
 id uuid primary key default gen_random_uuid(),athlete_id uuid,program_week integer,program_day integer,
 workout_key text,completion_status text,completed_at timestamptz,session_rpe numeric,pace_check_status text,
 pace_reps_total integer,pace_reps_hit integer,performance_checked_at timestamptz,scheduled_date date,
 started_at timestamptz,last_activity_at timestamptz default now(),completed_late boolean default false,
 season_plan_id uuid,source_program_week integer,unique(athlete_id,workout_key)
);
create table public.athlete_settings(athlete_id uuid,workout_reminders boolean);
create table public.athlete_notifications(
 id uuid default gen_random_uuid(),athlete_id uuid,notification_type text,title text,body text,
 action_view text,entity_type text,entity_id text,read_at timestamptz
);
create function auth.uid() returns uuid language sql stable as $$
 select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
$$;
create function private.mw_current_role() returns public.mw_app_role language sql stable security definer as $$
 select role from public.profiles where user_id=auth.uid()
$$;
create function private.mw_coach_is_assigned(p_id uuid) returns boolean language sql stable security definer as $$
 select exists(select 1 from public.coach_assignments where coach_user_id=auth.uid() and athlete_id=p_id and status='active')
$$;
create function private.mw_own_athlete_id() returns uuid language sql stable security definer as $$
 select id from public.athletes where user_id=auth.uid()
$$;
create function private.mw_athlete_feature_enabled(text) returns boolean language sql as $$ select true $$;
create function private.mw_current_coach_has_sprint_performance() returns boolean language sql as $$ select true $$;
create function private.mw_is_admin_or_founder() returns boolean language sql stable as $$
 select private.mw_current_role() in ('admin','founder_owner')
$$;
grant usage on schema public,auth,private to authenticated;
grant select on public.athlete_program_state,public.athletes,public.athlete_season_plans to authenticated;
grant select,insert,update on public.workout_completions to authenticated;
alter table public.workout_completions enable row level security;
create policy completion_read on public.workout_completions for select to authenticated
 using(athlete_id=private.mw_own_athlete_id() or private.mw_coach_is_assigned(athlete_id));
create policy completion_insert on public.workout_completions for insert to authenticated
 with check(athlete_id=private.mw_own_athlete_id());
create policy completion_update on public.workout_completions for update to authenticated
 using(athlete_id=private.mw_own_athlete_id()) with check(athlete_id=private.mw_own_athlete_id());
