-- MW Dynasty 2.9: one athlete assignment shared by athlete app, coach dashboard, and Coach MW AI.
alter table public.athlete_program_state
  add column if not exists track_tier text not null default 'foundation',
  add column if not exists strength_tier text not null default 'foundation',
  add column if not exists program_version text not null default 'mw-41-tiered-v2.9',
  add column if not exists onboarding_assessment_completed_at timestamptz,
  add column if not exists assignment_updated_at timestamptz not null default now(),
  add column if not exists assignment_updated_by uuid null references public.profiles(user_id) on delete set null;

alter table public.athletes
  add column if not exists selected_events text[] not null default '{}',
  add column if not exists track_training_years numeric;

alter table public.athlete_program_state drop constraint if exists athlete_program_state_track_tier_check;
alter table public.athlete_program_state add constraint athlete_program_state_track_tier_check check (track_tier in ('foundation','development','performance'));
alter table public.athlete_program_state drop constraint if exists athlete_program_state_strength_tier_check;
alter table public.athlete_program_state add constraint athlete_program_state_strength_tier_check check (strength_tier in ('foundation','development','performance'));

create table if not exists public.athlete_program_assignment_history (
  id bigint generated always as identity primary key,
  athlete_id uuid not null references public.athletes(id) on delete cascade,
  track_tier text not null,
  strength_tier text not null,
  week integer not null check (week between 1 and 41),
  reason text,
  changed_by uuid references public.profiles(user_id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.athlete_program_assignment_history enable row level security;

grant select, insert on public.athlete_program_assignment_history to authenticated;
grant usage, select on sequence public.athlete_program_assignment_history_id_seq to authenticated;

drop policy if exists "athletes read own assignment history" on public.athlete_program_assignment_history;
create policy "athletes read own assignment history"
on public.athlete_program_assignment_history for select to authenticated
using (exists (select 1 from public.athletes a where a.id=athlete_id and a.user_id=(select auth.uid())));

drop policy if exists "athletes record own smart entry assignment" on public.athlete_program_assignment_history;
create policy "athletes record own smart entry assignment"
on public.athlete_program_assignment_history for insert to authenticated
with check (changed_by=(select auth.uid()) and exists (select 1 from public.athletes a where a.id=athlete_id and a.user_id=(select auth.uid())));

drop policy if exists "authorized staff read assignment history" on public.athlete_program_assignment_history;
create policy "authorized staff read assignment history"
on public.athlete_program_assignment_history for select to authenticated
using (
  exists (select 1 from public.profiles p where p.user_id=(select auth.uid()) and p.account_status='active' and p.role in ('founder_owner','admin'))
  or exists (select 1 from public.coach_assignments ca where ca.coach_user_id=(select auth.uid()) and ca.athlete_id=athlete_id and ca.status='active')
);

drop policy if exists "authorized staff record assignment history" on public.athlete_program_assignment_history;
create policy "authorized staff record assignment history"
on public.athlete_program_assignment_history for insert to authenticated
with check (
  changed_by=(select auth.uid()) and (
    exists (select 1 from public.profiles p where p.user_id=(select auth.uid()) and p.account_status='active' and p.role in ('founder_owner','admin'))
    or exists (select 1 from public.coach_assignments ca where ca.coach_user_id=(select auth.uid()) and ca.athlete_id=athlete_id and ca.status='active')
  )
);

alter table public.athlete_prs add column if not exists timing_method text not null default 'unknown';
alter table public.athlete_prs drop constraint if exists athlete_prs_timing_method_check;
alter table public.athlete_prs add constraint athlete_prs_timing_method_check check (timing_method in ('fat','hand','unknown'));

alter table public.athlete_strength_maxes
  add column if not exists power_clean_max numeric,
  add column if not exists deadlift_max numeric,
  add column if not exists deadlift_type text not null default 'conventional',
  add column if not exists weight_unit text not null default 'lb';
alter table public.athlete_strength_maxes drop constraint if exists athlete_strength_maxes_deadlift_type_check;
alter table public.athlete_strength_maxes add constraint athlete_strength_maxes_deadlift_type_check check (deadlift_type in ('conventional','trap_bar'));
alter table public.athlete_strength_maxes drop constraint if exists athlete_strength_maxes_weight_unit_check;
alter table public.athlete_strength_maxes add constraint athlete_strength_maxes_weight_unit_check check (weight_unit in ('lb','kg'));

-- Assessment writes are deliberately column-scoped. Athletes can maintain their
-- own assessment data without gaining permission to change roles or other
-- administrative fields.
grant update (first_name, last_name) on public.profiles to authenticated;
drop policy if exists "athletes update own profile assessment names" on public.profiles;
create policy "athletes update own profile assessment names"
on public.profiles for update to authenticated
using (user_id=(select auth.uid()))
with check (user_id=(select auth.uid()));

grant update (date_of_birth, primary_event, secondary_event, selected_events, track_training_years, experience_level)
on public.athletes to authenticated;
drop policy if exists "athletes update own assessment profile" on public.athletes;
create policy "athletes update own assessment profile"
on public.athletes for update to authenticated
using (user_id=(select auth.uid()))
with check (user_id=(select auth.uid()));

grant update (program_status, track_tier, strength_tier, program_version, onboarding_assessment_completed_at, assignment_updated_at, assignment_updated_by)
on public.athlete_program_state to authenticated;
drop policy if exists "athletes update own assessment assignment" on public.athlete_program_state;
create policy "athletes update own assessment assignment"
on public.athlete_program_state for update to authenticated
using (athlete_id=(select private.mw_own_athlete_id()))
with check (athlete_id=(select private.mw_own_athlete_id()) and assignment_updated_by=(select auth.uid()));

drop policy if exists "athletes update own unverified prs" on public.athlete_prs;
create policy "athletes update own unverified prs"
on public.athlete_prs for update to authenticated
using (athlete_id=(select private.mw_own_athlete_id()) and verified=false)
with check (athlete_id=(select private.mw_own_athlete_id()) and verified=false and verified_by is null);

grant select, insert, update on public.athlete_strength_maxes to authenticated;

-- Assigned coaches and administrators must be able to keep the same official
-- assignment visible on both sides of the product.
grant update (current_week, track_tier, strength_tier, program_version, assignment_updated_at, assignment_updated_by)
on public.athlete_program_state to authenticated;
drop policy if exists "authorized staff update athlete assignment" on public.athlete_program_state;
create policy "authorized staff update athlete assignment"
on public.athlete_program_state for update to authenticated
using (
  (select private.mw_is_admin_or_founder())
  or (
    (select private.mw_current_role())='coach'
    and (select private.mw_coach_is_assigned(athlete_program_state.athlete_id))
  )
)
with check (
  (select private.mw_is_admin_or_founder())
  or (
    (select private.mw_current_role())='coach'
    and (select private.mw_coach_is_assigned(athlete_program_state.athlete_id))
  )
);

-- This privileged RPC performs its own role and assignment checks, but it must
-- never be exposed to anonymous callers.
revoke execute on function public.mw_coach_apply_program_adjustment(uuid,text,integer,text) from public, anon;
grant execute on function public.mw_coach_apply_program_adjustment(uuid,text,integer,text) to authenticated;
