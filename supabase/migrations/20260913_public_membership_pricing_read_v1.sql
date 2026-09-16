-- Public read-only pricing catalog for app/web pricing sync.
alter table public.membership_plans enable row level security;
revoke all on table public.membership_plans from anon, authenticated;
grant select on table public.membership_plans to anon, authenticated;
drop policy if exists mw_membership_plans_public_active_select on public.membership_plans;
drop policy if exists mw_membership_plans_public_read on public.membership_plans;
create policy mw_membership_plans_public_read
on public.membership_plans
for select
to anon, authenticated
using (active = true);
