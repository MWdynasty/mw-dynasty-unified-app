-- MW Dynasty 3.0.14 sponsored-athlete feature entitlement source of truth.
create or replace function private.mw_athlete_access_profile()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_ent public.membership_entitlements%rowtype;
  v_sub public.billing_subscriptions%rowtype;
  v_has_access boolean := false;
  v_billing_type text := 'none';
  v_coach uuid;
  v_tier text;
  v_has_coach boolean := false;
  v_internal_test boolean := false;
  v_individual_full boolean := false;
  v_ai_intelligence boolean := false;
  v_mw_full boolean := false;
begin
  if v_uid is null then
    return jsonb_build_object('access_mode','none','has_access',false,'coach_access_tier',null,'athlete_app',false,'coach_assigned_training',false,'messaging',false,'basic_coach_mw',false,'pace_tracking',false,'ai_intelligence',false,'mw_training_system',false,'strength_power',false,'sprint_school',false,'smart_entry',false,'advanced_performance_tools',false);
  end if;

  select e.* into v_ent
  from public.membership_entitlements e
  where e.user_id=v_uid
    and e.status in ('active','trialing','cancelled')
    and e.access_starts_at<=now()
    and (e.access_ends_at is null or e.access_ends_at>now())
  order by case when e.source='internal_test' then 0 when e.source='coach_sponsored' then 1 else 2 end,e.updated_at desc
  limit 1;

  v_has_access := v_ent.id is not null;
  if not v_has_access then
    return jsonb_build_object('access_mode','none','has_access',false,'coach_access_tier',null,'athlete_app',false,'coach_assigned_training',false,'messaging',false,'basic_coach_mw',false,'pace_tracking',false,'ai_intelligence',false,'mw_training_system',false,'strength_power',false,'sprint_school',false,'smart_entry',false,'advanced_performance_tools',false);
  end if;

  select b.* into v_sub from public.billing_subscriptions b where b.beneficiary_user_id=v_uid and b.audience='athlete' order by b.updated_at desc limit 1;

  v_internal_test := v_ent.source='internal_test' or coalesce(v_ent.metadata->>'billing_type','')='internal_test';
  v_billing_type := coalesce(nullif(v_sub.billing_type,''),nullif(v_ent.metadata->>'billing_type',''),case when v_ent.source='coach_sponsored' then 'coach_sponsored' else 'individual' end);
  v_coach := coalesce(v_sub.responsible_coach_user_id,nullif(v_ent.metadata->>'responsible_coach_user_id','')::uuid);

  if v_billing_type='coach_sponsored' and v_coach is not null then
    select cae.access_tier into v_tier
    from public.coach_access_entitlements cae
    join public.profiles p on p.user_id=cae.coach_user_id
    where cae.coach_user_id=v_coach and cae.status='active' and p.role::text='coach' and p.account_status::text='active'
    limit 1;
  end if;

  select exists(
    select 1 from public.athletes a
    join public.coach_assignments ca on ca.athlete_id=a.id
    where a.user_id=v_uid and ca.status::text='active' and (v_coach is null or ca.coach_user_id=v_coach)
  ) into v_has_coach;

  v_individual_full := v_has_access and not v_internal_test and v_billing_type <> 'coach_sponsored' and v_ent.source <> 'transition_grace';
  v_ai_intelligence := v_internal_test or v_individual_full or (v_billing_type='coach_sponsored' and v_tier in ('intelligence','mw_sprint_performance'));
  v_mw_full := v_internal_test or v_individual_full or (v_billing_type='coach_sponsored' and v_tier='mw_sprint_performance');

  return jsonb_build_object(
    'access_mode',case when v_internal_test then 'internal_test' when v_individual_full then 'individual_full' when v_billing_type='coach_sponsored' and v_tier='core' then 'coach_core' when v_billing_type='coach_sponsored' and v_tier='intelligence' then 'coach_intelligence' when v_billing_type='coach_sponsored' and v_tier='mw_sprint_performance' then 'coach_sprint_performance' when v_billing_type='coach_sponsored' then 'coach_sponsored_unresolved' else 'limited' end,
    'has_access',v_has_access,
    'billing_type',v_billing_type,
    'responsible_coach_user_id',case when v_coach is null then null else v_coach::text end,
    'coach_access_tier',v_tier,
    'athlete_app',v_has_access,
    'coach_assigned_training',v_has_access and v_has_coach,
    'messaging',v_has_access and v_has_coach,
    'basic_coach_mw',v_has_access,
    'pace_tracking',v_has_access,
    'ai_intelligence',v_ai_intelligence,
    'mw_training_system',v_mw_full,
    'strength_power',v_mw_full,
    'sprint_school',v_mw_full,
    'smart_entry',v_mw_full,
    'advanced_performance_tools',v_mw_full
  );
end;
$$;

create or replace function public.mw_rep_tracking_access()
returns boolean
language sql
stable
security definer
set search_path to 'public','private','auth'
as $$
  select case
    when auth.uid() is null then false
    when exists(select 1 from public.profiles p where p.user_id=auth.uid() and p.account_status::text='active' and p.role::text in ('founder_owner','admin')) then true
    else coalesce((private.mw_athlete_access_profile()->>'pace_tracking')::boolean,false)
  end
$$;
revoke all on function public.mw_rep_tracking_access() from public, anon;
grant execute on function public.mw_rep_tracking_access() to authenticated;
