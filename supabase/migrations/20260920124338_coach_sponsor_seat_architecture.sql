-- MW Dynasty production migration
-- Applied to Supabase project keqgunlfwhjgcsurynef as 20260920124338 coach_sponsor_seat_architecture
-- Captured from supabase_migrations.schema_migrations on 2026-09-20.

-- Sponsor-seat architecture is part of the same coach onboarding lifecycle.
-- Sponsorship is optional and is selected only after coach verification.

create table if not exists public.coach_sponsorship_packages (
  id uuid primary key default gen_random_uuid(),
  coach_application_id uuid references public.coach_access_applications(id) on delete set null,
  coach_user_id uuid references auth.users(id) on delete cascade,
  plan_code text not null references public.membership_plans(plan_code),
  requested_seats integer not null default 0 check (requested_seats between 0 and 5000),
  seat_price_cents integer not null check (seat_price_cents >= 0),
  coach_price_cents integer not null check (coach_price_cents >= 0),
  monthly_total_cents integer generated always as (coach_price_cents + (requested_seats * seat_price_cents)) stored,
  status text not null default 'draft'
    check (status in ('draft','checkout_started','active','past_due','cancel_at_period_end','cancelled')),
  provider text not null default 'unconfigured',
  provider_subscription_id text,
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (coach_application_id is not null or coach_user_id is not null)
);

create unique index if not exists coach_sponsorship_packages_application_active_uidx
  on public.coach_sponsorship_packages(coach_application_id)
  where coach_application_id is not null and status in ('draft','checkout_started','active','past_due','cancel_at_period_end');

create unique index if not exists coach_sponsorship_packages_user_active_uidx
  on public.coach_sponsorship_packages(coach_user_id)
  where coach_user_id is not null and status in ('draft','checkout_started','active','past_due','cancel_at_period_end');

create index if not exists coach_sponsorship_packages_status_idx
  on public.coach_sponsorship_packages(status,updated_at desc);

create table if not exists public.coach_sponsor_seats (
  id uuid primary key default gen_random_uuid(),
  package_id uuid not null references public.coach_sponsorship_packages(id) on delete cascade,
  seat_number integer not null check (seat_number > 0),
  status text not null default 'available'
    check (status in ('available','invited','claimed','active','scheduled_to_end','ended')),
  athlete_email text,
  athlete_user_id uuid references auth.users(id) on delete set null,
  coach_invitation_id bigint references public.coach_invitations(id) on delete set null,
  invited_at timestamptz,
  claimed_at timestamptz,
  activated_at timestamptz,
  scheduled_end_at timestamptz,
  ended_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(package_id,seat_number)
);

create index if not exists coach_sponsor_seats_package_status_idx
  on public.coach_sponsor_seats(package_id,status,seat_number);
create index if not exists coach_sponsor_seats_athlete_idx
  on public.coach_sponsor_seats(athlete_user_id) where athlete_user_id is not null;

alter table public.coach_sponsorship_packages enable row level security;
alter table public.coach_sponsor_seats enable row level security;

-- Package/seat mutations remain server-controlled. Once the coach account exists,
-- the coach may read only their own package and seats.
drop policy if exists "coach_reads_own_sponsorship_package" on public.coach_sponsorship_packages;
create policy "coach_reads_own_sponsorship_package"
on public.coach_sponsorship_packages for select to authenticated
using ((select auth.uid()) = coach_user_id);

drop policy if exists "coach_reads_own_sponsor_seats" on public.coach_sponsor_seats;
create policy "coach_reads_own_sponsor_seats"
on public.coach_sponsor_seats for select to authenticated
using (exists (
  select 1 from public.coach_sponsorship_packages p
  where p.id=package_id and p.coach_user_id=(select auth.uid())
));

grant select on public.coach_sponsorship_packages to authenticated;
grant select on public.coach_sponsor_seats to authenticated;
grant all on public.coach_sponsorship_packages to service_role;
grant all on public.coach_sponsor_seats to service_role;

comment on table public.coach_sponsorship_packages is
'One coach membership purchase plus optional sponsored-athlete seat quantity. Pricing is snapshotted at selection/checkout so later catalog changes do not rewrite an existing purchase.';
comment on table public.coach_sponsor_seats is
'Individual sponsored-athlete seats owned by a paid coach sponsorship package. Seats move available -> invited -> claimed -> active and can later be recycled after access ends.';
