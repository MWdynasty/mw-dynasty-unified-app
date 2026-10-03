begin;

create table if not exists public.athlete_prs (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references public.athletes(id) on delete cascade,
  event text not null,
  time_seconds numeric not null,
  date_recorded date,
  verified boolean default false,
  verified_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  timing_method text default 'unknown'
);

create index if not exists athlete_prs_athlete_id_idx on public.athlete_prs(athlete_id);

alter table public.athlete_prs enable row level security;

create policy athlete_prs_select_authenticated on public.athlete_prs
for select to authenticated
using (
  exists(select 1 from public.athletes a where a.id=athlete_id and a.user_id=auth.uid())
  or exists(select 1 from public.coach_assignments ca where ca.athlete_id=athlete_id and ca.coach_user_id=auth.uid())
  or private.mw_current_role()::text in ('admin','founder_owner')
);

create table if not exists public.billing_subscriptions (
  id uuid primary key default gen_random_uuid(),
  audience text,
  beneficiary_user_id uuid,
  payer_user_id uuid,
  responsible_coach_user_id uuid,
  billing_type text,
  billing_cycle text default 'monthly',
  plan_code text,
  provider text default 'unconfigured',
  provider_subscription_id text,
  status text default 'pending_payment',
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean default false,
  pending_plan_code text,
  pending_billing_cycle text,
  pending_effective_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists billing_subscriptions_beneficiary_idx on public.billing_subscriptions(beneficiary_user_id);
create index if not exists billing_subscriptions_responsible_coach_idx on public.billing_subscriptions(responsible_coach_user_id);

alter table public.billing_subscriptions enable row level security;

create policy billing_subscriptions_select_own_or_admin on public.billing_subscriptions
for select to authenticated
using (
  beneficiary_user_id=auth.uid()
  or payer_user_id=auth.uid()
  or responsible_coach_user_id=auth.uid()
  or private.mw_current_role()::text in ('admin','founder_owner')
);

commit;