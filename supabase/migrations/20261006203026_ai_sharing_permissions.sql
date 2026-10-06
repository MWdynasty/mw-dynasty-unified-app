-- Optional, versioned OpenAI permissions. No existing account is opted in.
create table public.ai_sharing_permissions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  own_ai boolean not null default false,
  coach_ai boolean not null default false,
  policy_version text not null check(policy_version='2026-10-06'),
  updated_at timestamptz not null default now()
);
alter table public.ai_sharing_permissions enable row level security;
revoke all on public.ai_sharing_permissions from anon,authenticated;
grant select,insert,update on public.ai_sharing_permissions to authenticated;
create policy ai_sharing_read on public.ai_sharing_permissions for select to authenticated
using (user_id=(select auth.uid()) or (coach_ai and exists (
  select 1 from public.athletes a join public.coach_assignments ca on ca.athlete_id=a.id
  where a.user_id=ai_sharing_permissions.user_id and ca.coach_user_id=(select auth.uid()) and ca.status::text='active'
)));
create policy ai_sharing_insert on public.ai_sharing_permissions for insert to authenticated with check(user_id=(select auth.uid()));
create policy ai_sharing_update on public.ai_sharing_permissions for update to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));
