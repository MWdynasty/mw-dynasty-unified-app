-- MW Dynasty: make sprint rep tracking exclusive to the MW Sprint Performance System.

create or replace function public.mw_rep_tracking_access()
returns boolean
language sql
stable
security definer
set search_path = public, private, auth
as $$
  select case
    when auth.uid() is null then false
    when exists (
      select 1 from public.profiles p
      where p.user_id = auth.uid()
        and p.account_status = 'active'
        and p.role::text in ('founder_owner','admin')
    ) then true
    when exists (
      select 1 from public.membership_entitlements me
      where me.user_id = auth.uid()
        and me.plan_code = 'mw_athlete'
        and me.status in ('active','trialing','cancelled')
        and (me.access_starts_at is null or me.access_starts_at <= now())
        and (me.access_ends_at is null or me.access_ends_at > now())
    ) then true
    when exists (
      select 1
      from public.athletes a
      join public.coach_assignments ca on ca.athlete_id = a.id and ca.status::text = 'active'
      join public.coach_access_entitlements cae on cae.coach_user_id = ca.coach_user_id
        and cae.status = 'active'
        and cae.access_tier = 'mw_sprint_performance'
      where a.user_id = auth.uid()
    ) then true
    else false
  end
$$;

revoke all on function public.mw_rep_tracking_access() from public, anon;
grant execute on function public.mw_rep_tracking_access() to authenticated;

create or replace function private.mw_current_coach_has_sprint_performance()
returns boolean
language sql
stable
security definer
set search_path = public, private, auth
as $$
  select exists (
    select 1 from public.coach_access_entitlements cae
    where cae.coach_user_id = auth.uid()
      and cae.status = 'active'
      and cae.access_tier = 'mw_sprint_performance'
  )
$$;

grant execute on function private.mw_current_coach_has_sprint_performance() to authenticated;

drop policy if exists mw_pace_logs_insert_own on public.athlete_pace_logs;
create policy mw_pace_logs_insert_own on public.athlete_pace_logs
for insert to authenticated
with check (
  athlete_id = (select private.mw_own_athlete_id())
  and public.mw_rep_tracking_access()
);

drop policy if exists mw_pace_logs_update_own on public.athlete_pace_logs;
create policy mw_pace_logs_update_own on public.athlete_pace_logs
for update to authenticated
using (
  athlete_id = (select private.mw_own_athlete_id())
  and public.mw_rep_tracking_access()
)
with check (
  athlete_id = (select private.mw_own_athlete_id())
  and public.mw_rep_tracking_access()
);

drop policy if exists mw_pace_logs_select_authorized on public.athlete_pace_logs;
create policy mw_pace_logs_select_authorized on public.athlete_pace_logs
for select to authenticated
using (
  (athlete_id = (select private.mw_own_athlete_id()) and public.mw_rep_tracking_access())
  or (select private.mw_is_admin_or_founder())
  or (
    (select private.mw_current_role()) = 'coach'::mw_app_role
    and (select private.mw_current_coach_has_sprint_performance())
    and (select private.mw_coach_is_assigned(athlete_pace_logs.athlete_id))
  )
);

drop policy if exists mw_completions_insert_own on public.workout_completions;
create policy mw_completions_insert_own on public.workout_completions
for insert to authenticated
with check (
  athlete_id = (select private.mw_own_athlete_id())
  and (
    public.mw_rep_tracking_access()
    or (
      coalesce(pace_check_status, 'not_applicable') = 'not_applicable'
      and pace_reps_total is null
      and pace_reps_hit is null
      and performance_checked_at is null
    )
  )
);

drop policy if exists mw_completions_update_own on public.workout_completions;
create policy mw_completions_update_own on public.workout_completions
for update to authenticated
using (athlete_id = (select private.mw_own_athlete_id()))
with check (
  athlete_id = (select private.mw_own_athlete_id())
  and (
    public.mw_rep_tracking_access()
    or (
      coalesce(pace_check_status, 'not_applicable') = 'not_applicable'
      and pace_reps_total is null
      and pace_reps_hit is null
      and performance_checked_at is null
    )
  )
);
