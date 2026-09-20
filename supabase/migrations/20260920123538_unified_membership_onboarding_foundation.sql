-- MW Dynasty production migration
-- Applied to Supabase project keqgunlfwhjgcsurynef as 20260920123538 unified_membership_onboarding_foundation
-- Captured from supabase_migrations.schema_migrations on 2026-09-20.

-- MW Dynasty unified membership/onboarding architecture foundation.
-- One lifecycle for website + app; channel changes presentation, not account/subscription truth.

alter table public.coach_access_applications
  add column if not exists verification_method text,
  add column if not exists verification_detail text,
  add column if not exists athlete_count integer,
  add column if not exists verification_status text not null default 'pending',
  add column if not exists decision_mode text,
  add column if not exists verification_score integer,
  add column if not exists payment_status text not null default 'not_ready',
  add column if not exists selected_plan_code text references public.membership_plans(plan_code),
  add column if not exists sponsored_athlete_seats integer not null default 0;

do $$ begin
  alter table public.coach_access_applications
    add constraint coach_access_applications_verification_status_check
    check (verification_status in ('pending','auto_approved','needs_review','approved','denied'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.coach_access_applications
    add constraint coach_access_applications_decision_mode_check
    check (decision_mode is null or decision_mode in ('automatic','manual'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.coach_access_applications
    add constraint coach_access_applications_verification_score_check
    check (verification_score is null or verification_score between 0 and 100);
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.coach_access_applications
    add constraint coach_access_applications_payment_status_check
    check (payment_status in ('not_ready','ready','checkout_started','paid','failed','refunded'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.coach_access_applications
    add constraint coach_access_applications_athlete_count_check
    check (athlete_count is null or athlete_count between 1 and 5000);
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.coach_access_applications
    add constraint coach_access_applications_sponsored_seats_check
    check (sponsored_athlete_seats between 0 and 5000);
exception when duplicate_object then null; end $$;

create table if not exists public.onboarding_journeys (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  coach_application_id uuid references public.coach_access_applications(id) on delete cascade,
  audience text not null check (audience in ('athlete','coach')),
  channel text not null check (channel in ('website','ios','android')),
  stage text not null,
  status text not null default 'in_progress' check (status in ('in_progress','blocked','completed','cancelled')),
  verification_status text not null default 'not_required'
    check (verification_status in ('not_required','pending','auto_approved','needs_review','approved','denied')),
  selected_plan_code text references public.membership_plans(plan_code),
  sponsored_athlete_seats integer not null default 0 check (sponsored_athlete_seats between 0 and 5000),
  payment_status text not null default 'not_started'
    check (payment_status in ('not_started','not_ready','ready','checkout_started','paid','failed','refunded')),
  assessment_status text not null default 'not_started'
    check (assessment_status in ('not_started','in_progress','completed','not_required')),
  last_completed_stage text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  check (user_id is not null or coach_application_id is not null)
);

create unique index if not exists onboarding_journeys_user_audience_uidx
  on public.onboarding_journeys(user_id,audience) where user_id is not null;
create unique index if not exists onboarding_journeys_coach_application_uidx
  on public.onboarding_journeys(coach_application_id) where coach_application_id is not null;
create index if not exists onboarding_journeys_stage_idx on public.onboarding_journeys(audience,status,stage);
create index if not exists coach_access_applications_verification_idx
  on public.coach_access_applications(verification_status,status,created_at desc);

alter table public.onboarding_journeys enable row level security;

drop policy if exists "users_read_own_onboarding" on public.onboarding_journeys;
create policy "users_read_own_onboarding"
on public.onboarding_journeys for select to authenticated
using ((select auth.uid()) is not null and (select auth.uid()) = user_id);

drop policy if exists "users_update_own_onboarding" on public.onboarding_journeys;
create policy "users_update_own_onboarding"
on public.onboarding_journeys for update to authenticated
using ((select auth.uid()) is not null and (select auth.uid()) = user_id)
with check ((select auth.uid()) is not null and (select auth.uid()) = user_id);

grant select,update on public.onboarding_journeys to authenticated;
grant all on public.onboarding_journeys to service_role;

comment on table public.onboarding_journeys is
'Canonical MW Dynasty onboarding state shared by website, iOS, and Android. Product access must not be granted until required verification and payment gates are satisfied.';
