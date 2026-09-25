-- MW Dynasty Season Intelligence production-safe RLS hotfix.
-- Corrects an already-deployed policy whose unqualified athlete_id reference
-- could resolve to coach_assignments.athlete_id inside the EXISTS subquery.
-- This migration is intentionally narrow and does not activate any new season plan.

drop policy if exists "season plans visible to authorized account" on public.athlete_season_plans;
drop policy if exists "athletes read own season plans" on public.athlete_season_plans;
drop policy if exists "authorized staff read season plans" on public.athlete_season_plans;

create policy "season plans visible to authorized account"
on public.athlete_season_plans
for select to authenticated
using (
  exists(
    select 1 from public.athletes a
    where a.id=athlete_season_plans.athlete_id
      and a.user_id=(select auth.uid())
  )
  or exists(
    select 1 from public.profiles p
    where p.user_id=(select auth.uid())
      and p.account_status='active'::public.mw_account_status
      and p.role in ('founder_owner','admin')
  )
  or exists(
    select 1
    from public.coach_assignments ca
    join public.coach_access_entitlements cae
      on cae.coach_user_id=ca.coach_user_id and cae.status='active'
    where ca.athlete_id=athlete_season_plans.athlete_id
      and ca.coach_user_id=(select auth.uid())
      and ca.status::text='active'
      and cae.access_tier='mw_sprint_performance'
  )
);
