-- MW Dynasty Season Intelligence — consolidate RLS policies for performance and clarity.
-- Keeps the same authorization model while avoiding multiple permissive policies.

drop policy if exists "athletes read own season targets" on public.athlete_season_targets;
drop policy if exists "athletes manage own season targets" on public.athlete_season_targets;
drop policy if exists "performance coaches manage assigned season targets" on public.athlete_season_targets;
drop policy if exists "season targets authorized access" on public.athlete_season_targets;

create policy "season targets authorized access"
on public.athlete_season_targets
for all to authenticated
using (
  exists(
    select 1 from public.athletes a
    where a.id=athlete_season_targets.athlete_id
      and a.user_id=(select auth.uid())
  )
  or exists(
    select 1
    from public.coach_assignments ca
    join public.coach_access_entitlements cae
      on cae.coach_user_id=ca.coach_user_id and cae.status='active'
    where ca.athlete_id=athlete_season_targets.athlete_id
      and ca.coach_user_id=(select auth.uid())
      and ca.status::text='active'
      and cae.access_tier='mw_sprint_performance'
  )
  or exists(
    select 1 from public.profiles p
    where p.user_id=(select auth.uid())
      and p.account_status='active'::public.mw_account_status
      and p.role in ('founder_owner','admin')
  )
)
with check (
  exists(
    select 1 from public.athletes a
    where a.id=athlete_season_targets.athlete_id
      and a.user_id=(select auth.uid())
  )
  or exists(
    select 1
    from public.coach_assignments ca
    join public.coach_access_entitlements cae
      on cae.coach_user_id=ca.coach_user_id and cae.status='active'
    where ca.athlete_id=athlete_season_targets.athlete_id
      and ca.coach_user_id=(select auth.uid())
      and ca.status::text='active'
      and cae.access_tier='mw_sprint_performance'
  )
  or exists(
    select 1 from public.profiles p
    where p.user_id=(select auth.uid())
      and p.account_status='active'::public.mw_account_status
      and p.role in ('founder_owner','admin')
  )
);

drop policy if exists "athletes read own season revisions" on public.athlete_season_plan_revisions;
drop policy if exists "authorized staff read season revisions" on public.athlete_season_plan_revisions;
drop policy if exists "season revisions authorized read" on public.athlete_season_plan_revisions;

create policy "season revisions authorized read"
on public.athlete_season_plan_revisions
for select to authenticated
using (
  exists(
    select 1 from public.athletes a
    where a.id=athlete_season_plan_revisions.athlete_id
      and a.user_id=(select auth.uid())
  )
  or exists(
    select 1
    from public.coach_assignments ca
    join public.coach_access_entitlements cae
      on cae.coach_user_id=ca.coach_user_id and cae.status='active'
    where ca.athlete_id=athlete_season_plan_revisions.athlete_id
      and ca.coach_user_id=(select auth.uid())
      and ca.status::text='active'
      and cae.access_tier='mw_sprint_performance'
  )
  or exists(
    select 1 from public.profiles p
    where p.user_id=(select auth.uid())
      and p.account_status='active'::public.mw_account_status
      and p.role in ('founder_owner','admin')
  )
);
