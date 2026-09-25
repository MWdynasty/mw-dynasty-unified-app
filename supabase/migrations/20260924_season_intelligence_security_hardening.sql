-- MW Dynasty Season Intelligence security hardening.
-- SECURITY DEFINER RPCs are never anonymous. Athlete-facing RPCs remain callable
-- only by signed-in users and still enforce auth/ownership/feature checks internally.

revoke execute on function public.mw_upsert_own_season_plan(integer,text,text,text,text,text,text,date,date,date,date,integer,jsonb,jsonb,boolean,uuid) from public, anon;
grant execute on function public.mw_upsert_own_season_plan(integer,text,text,text,text,text,text,date,date,date,date,integer,jsonb,jsonb,boolean,uuid) to authenticated;

revoke execute on function public.mw_reconcile_own_season_plan() from public, anon;
grant execute on function public.mw_reconcile_own_season_plan() to authenticated;

revoke execute on function public.mw_refresh_own_season_program_state() from public, anon;
grant execute on function public.mw_refresh_own_season_program_state() to authenticated;

revoke execute on function public.mw_submit_smart_entry_v2(integer,text,text,integer,integer,integer,integer,integer,text) from public, anon;
grant execute on function public.mw_submit_smart_entry_v2(integer,text,text,integer,integer,integer,integer,integer,text) to authenticated;

revoke execute on function public.mw_mark_own_workout_status(integer,integer,text) from public, anon;
grant execute on function public.mw_mark_own_workout_status(integer,integer,text) to authenticated;

revoke execute on function public.mw_mark_own_strength_status(integer,integer,text,text,boolean) from public, anon;
grant execute on function public.mw_mark_own_strength_status(integer,integer,text,text,boolean) to authenticated;

revoke execute on function public.mw_complete_own_strength_session(integer,integer,text,text,boolean) from public, anon;
grant execute on function public.mw_complete_own_strength_session(integer,integer,text,text,boolean) to authenticated;

revoke execute on function public.mw_refresh_own_strength_schedule(jsonb) from public, anon;
grant execute on function public.mw_refresh_own_strength_schedule(jsonb) to authenticated;

-- This low-level assignment function is no longer part of the client/API path.
-- Current week, phase, and source week are derived from the stored season plan.
revoke execute on function public.mw_apply_own_season_position(uuid,integer,text,integer,text) from public, anon, authenticated;

drop policy if exists "athletes read own season plans" on public.athlete_season_plans;
drop policy if exists "authorized staff read season plans" on public.athlete_season_plans;
drop policy if exists "season plans visible to authorized account" on public.athlete_season_plans;
create policy "season plans visible to authorized account"
on public.athlete_season_plans
for select to authenticated
using (
  exists(
    select 1 from public.athletes a
    where a.id=athlete_id and a.user_id=(select auth.uid())
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
