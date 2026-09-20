-- MW Dynasty production migration
-- Applied to Supabase project keqgunlfwhjgcsurynef as 20260920131225 coach_verification_decision_evidence
-- Captured from supabase_migrations.schema_migrations on 2026-09-20.

alter table public.coach_access_applications
  add column if not exists verification_evidence jsonb not null default '{}'::jsonb,
  add column if not exists verification_checked_at timestamptz,
  add column if not exists decision_reason text,
  add column if not exists email_domain text;

create table if not exists public.coach_verification_blocks (
  id uuid primary key default gen_random_uuid(),
  block_type text not null check (block_type in ('email','domain','request_fingerprint')),
  block_value text not null,
  reason text not null,
  active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz
);
create unique index if not exists coach_verification_blocks_active_uidx
  on public.coach_verification_blocks(block_type,lower(block_value))
  where active=true;
alter table public.coach_verification_blocks enable row level security;
revoke all on public.coach_verification_blocks from anon,authenticated;
grant all on public.coach_verification_blocks to service_role;

create index if not exists coach_access_applications_decision_idx
  on public.coach_access_applications(verification_status,decision_mode,created_at desc);

comment on table public.coach_verification_blocks is
'Explicit Founder/Admin verification blocks. Automatic denial is limited to deterministic block matches; inability to verify is routed to manual review.';
comment on column public.coach_access_applications.verification_evidence is
'Auditable machine-verification evidence. Never expose internal anti-abuse thresholds to applicants.';
