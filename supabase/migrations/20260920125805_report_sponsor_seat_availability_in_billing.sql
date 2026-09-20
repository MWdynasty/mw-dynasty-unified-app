-- MW Dynasty production migration
-- Applied to Supabase project keqgunlfwhjgcsurynef as 20260920125805 report_sponsor_seat_availability_in_billing
-- Captured from supabase_migrations.schema_migrations on 2026-09-20.

CREATE OR REPLACE FUNCTION public.mw_billing_status()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := auth.uid();
  v_profile public.profiles%rowtype;
  v_sub public.billing_subscriptions%rowtype;
  v_transition public.billing_transitions%rowtype;
  v_ent public.membership_entitlements%rowtype;
  v_tier text;
  v_plan text;
  v_sponsored_price integer;
  v_sponsored_billing_active boolean := false;
  v_sponsor_total integer := 0;
  v_sponsor_used integer := 0;
  v_sponsor_available integer := 0;
begin
  if v_uid is null then raise exception 'Authentication required' using errcode='42501'; end if;
  perform public.mw_apply_due_billing_transitions(v_uid);
  select * into v_profile from public.profiles where user_id=v_uid;
  if v_profile.user_id is null then raise exception 'MW profile not found' using errcode='P0002'; end if;

  select * into v_sub
  from public.billing_subscriptions
  where beneficiary_user_id=v_uid
    and audience=case when v_profile.role::text='coach' then 'coach' else 'athlete' end
  limit 1;

  select * into v_transition
  from public.billing_transitions
  where beneficiary_user_id=v_uid
    and status in ('requested','awaiting_payment','awaiting_provider','scheduled')
  order by created_at desc
  limit 1;

  if v_profile.role::text='coach' then
    select cae.access_tier,mp.sponsored_athlete_price_cents
      into v_tier,v_sponsored_price
    from public.coach_access_entitlements cae
    left join public.membership_plans mp
      on mp.audience='coach' and mp.access_tier=cae.access_tier and mp.active=true
    where cae.coach_user_id=v_uid and cae.status='active'
    limit 1;

    v_plan:=case v_tier
      when 'core' then 'coach_core'
      when 'intelligence' then 'coach_intelligence'
      when 'mw_sprint_performance' then 'mw_sprint_performance'
      else null
    end;
    v_sponsored_billing_active := private.mw_coach_sponsored_billing_enabled(v_uid);
    select coalesce(p.requested_seats,0),
           count(s.id) filter (where s.status in ('invited','claimed','active','scheduled_to_end')),
           count(s.id) filter (where s.status='available')
      into v_sponsor_total,v_sponsor_used,v_sponsor_available
    from public.coach_sponsorship_packages p
    left join public.coach_sponsor_seats s on s.package_id=p.id
    where p.coach_user_id=v_uid and p.status in ('active','cancel_at_period_end')
    group by p.id,p.requested_seats,p.created_at
    order by p.created_at desc limit 1;

    return jsonb_build_object(
      'audience','coach',
      'current_plan_code',coalesce(v_sub.plan_code,v_plan),
      'current_tier',v_tier,
      'billing_cycle',coalesce(v_sub.billing_cycle,'monthly'),
      'billing_type',coalesce(v_sub.billing_type,'individual'),
      'provider',coalesce(v_sub.provider,'unconfigured'),
      'subscription_status',coalesce(v_sub.status,'active'),
      'current_period_end',v_sub.current_period_end,
      'cancel_at_period_end',coalesce(v_sub.cancel_at_period_end,false),
      'sponsored_billing_active',v_sponsored_billing_active,
      'sponsored_athlete_price_cents',v_sponsored_price,
      'sponsored_seats_total',coalesce(v_sponsor_total,0),
      'sponsored_seats_used',coalesce(v_sponsor_used,0),
      'sponsored_seats_available',coalesce(v_sponsor_available,0),
      'pending_transition',case when v_transition.id is null then null else jsonb_build_object(
        'id',v_transition.id,'type',v_transition.transition_type,'direction',v_transition.direction,'status',v_transition.status,
        'to_plan_code',v_transition.to_plan_code,'effective_at',v_transition.effective_at,'payment_required',v_transition.payment_required,
        'expected_amount_cents',v_transition.expected_amount_cents,'currency',v_transition.currency,
        'payment_confirmed',coalesce(v_transition.metadata->>'payment_confirmed','false')
      ) end
    );
  end if;

  select * into v_ent
  from public.membership_entitlements
  where user_id=v_uid
  order by case when status in ('active','trialing','cancelled') and access_starts_at<=now() and (access_ends_at is null or access_ends_at>now()) then 0 else 1 end,updated_at desc
  limit 1;

  return jsonb_build_object(
    'audience','athlete',
    'current_plan_code',coalesce(v_sub.plan_code,coalesce(v_ent.plan_code,'mw_athlete')),
    'billing_cycle',coalesce(v_sub.billing_cycle,'monthly'),
    'billing_type',coalesce(v_sub.billing_type,case when v_ent.source='coach_sponsored' then 'coach_sponsored' when v_ent.source='transition_grace' then 'transition_grace' else 'individual' end),
    'provider',coalesce(v_sub.provider,coalesce(v_ent.source,'unconfigured')),
    'subscription_status',coalesce(v_sub.status,coalesce(v_ent.status,'awaiting_activation')),
    'current_period_end',coalesce(v_sub.current_period_end,v_ent.access_ends_at),
    'responsible_coach_user_id',coalesce(v_sub.responsible_coach_user_id::text,v_ent.metadata->>'responsible_coach_user_id'),
    'pending_transition',case when v_transition.id is null then null else jsonb_build_object(
      'id',v_transition.id,'type',v_transition.transition_type,'direction',v_transition.direction,'status',v_transition.status,
      'to_plan_code',v_transition.to_plan_code,'to_billing_type',v_transition.to_billing_type,'to_billing_cycle',v_transition.to_billing_cycle,
      'effective_at',v_transition.effective_at,'checkout_opens_at',v_transition.metadata->>'checkout_opens_at',
      'grace_ends_at',v_transition.metadata->>'transition_grace_ends_at','payment_required',v_transition.payment_required,
      'expected_amount_cents',v_transition.expected_amount_cents,'currency',v_transition.currency,
      'payment_confirmed',coalesce(v_transition.metadata->>'payment_confirmed','false')
    ) end
  );
end;
$function$
