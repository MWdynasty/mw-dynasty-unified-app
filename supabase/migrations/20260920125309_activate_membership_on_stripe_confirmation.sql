-- MW Dynasty production migration
-- Applied to Supabase project keqgunlfwhjgcsurynef as 20260920125309 activate_membership_on_stripe_confirmation
-- Captured from supabase_migrations.schema_migrations on 2026-09-20.

CREATE OR REPLACE FUNCTION public.mw_apply_stripe_subscription(p_event_id text, p_event_type text, p_user_id uuid, p_email text, p_plan_code text, p_subscription_id text, p_customer_id text, p_status text, p_period_start timestamp with time zone, p_period_end timestamp with time zone, p_cancel_at_period_end boolean DEFAULT false, p_sponsor_quantity integer DEFAULT 0, p_payload jsonb DEFAULT '{}'::jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_audience text;
  v_access_tier text;
  v_email text;
  v_billing_status text;
  v_membership_status text;
  v_has_access boolean;
  v_package_id uuid;
begin
  if auth.role() <> 'service_role' then
    raise exception 'service role required';
  end if;

  if coalesce(trim(p_event_id), '') = '' or coalesce(trim(p_subscription_id), '') = '' then
    raise exception 'Stripe event and subscription identifiers are required';
  end if;

  if p_plan_code not in ('mw_athlete', 'coach_core', 'coach_intelligence', 'mw_sprint_performance') then
    raise exception 'Unsupported MW plan';
  end if;

  insert into private.stripe_webhook_events (stripe_event_id, event_type)
  values (p_event_id, coalesce(nullif(trim(p_event_type), ''), 'unknown'))
  on conflict (stripe_event_id) do nothing;

  if not found then
    return false;
  end if;

  select u.email into v_email
  from auth.users u
  where u.id = p_user_id;
  v_email := lower(coalesce(nullif(trim(p_email), ''), v_email));
  if v_email is null then
    raise exception 'No email is available for this MW member';
  end if;

  v_audience := case when p_plan_code = 'mw_athlete' then 'athlete' else 'coach' end;
  v_access_tier := case p_plan_code
    when 'coach_core' then 'core'
    when 'coach_intelligence' then 'intelligence'
    when 'mw_sprint_performance' then 'mw_sprint_performance'
    else null
  end;
  v_billing_status := case
    when p_status = 'trialing' then 'trialing'
    when p_status = 'past_due' then 'past_due'
    when p_status in ('cancelled', 'canceled', 'unpaid', 'incomplete_expired') then 'cancelled'
    when coalesce(p_cancel_at_period_end, false) then 'cancel_at_period_end'
    when p_status in ('active', 'incomplete') then 'active'
    else 'pending_payment'
  end;
  v_has_access := p_status in ('active', 'trialing')
    or (p_status in ('cancelled', 'canceled') and p_period_end is not null and p_period_end > now());
  v_membership_status := case
    when v_has_access and p_status = 'trialing' then 'trialing'
    when v_has_access then 'active'
    when p_status = 'past_due' then 'past_due'
    else 'cancelled'
  end;

  insert into public.billing_subscriptions (
    audience, beneficiary_user_id, payer_user_id, billing_type, billing_cycle,
    plan_code, provider, provider_subscription_id, status,
    current_period_start, current_period_end, cancel_at_period_end, metadata
  ) values (
    v_audience, p_user_id, p_user_id, 'individual', 'monthly',
    p_plan_code, 'stripe', p_subscription_id, v_billing_status,
    p_period_start, p_period_end, coalesce(p_cancel_at_period_end, false),
    jsonb_build_object('stripe_customer_id', p_customer_id, 'sponsor_quantity', greatest(coalesce(p_sponsor_quantity, 0), 0), 'last_stripe_event', p_event_type)
      || coalesce(p_payload, '{}'::jsonb)
  )
  on conflict (beneficiary_user_id, audience) do update set
    payer_user_id = excluded.payer_user_id,
    billing_type = excluded.billing_type,
    billing_cycle = excluded.billing_cycle,
    plan_code = excluded.plan_code,
    provider = excluded.provider,
    provider_subscription_id = excluded.provider_subscription_id,
    status = excluded.status,
    current_period_start = excluded.current_period_start,
    current_period_end = excluded.current_period_end,
    cancel_at_period_end = excluded.cancel_at_period_end,
    metadata = public.billing_subscriptions.metadata || excluded.metadata,
    updated_at = now();

  if v_audience = 'athlete' then
    insert into public.membership_entitlements (
      source, email, email_normalized, user_id, external_member_id, plan_code,
      status, access_starts_at, access_ends_at, last_event_at, metadata
    ) values (
      'stripe', v_email, v_email, p_user_id, p_subscription_id, p_plan_code,
      v_membership_status, coalesce(p_period_start, now()), p_period_end, now(),
      jsonb_build_object('stripe_customer_id', p_customer_id, 'cancel_at_period_end', coalesce(p_cancel_at_period_end, false))
    )
    on conflict (source, email_normalized) do update set
      email = excluded.email,
      user_id = excluded.user_id,
      external_member_id = excluded.external_member_id,
      plan_code = excluded.plan_code,
      status = excluded.status,
      access_starts_at = excluded.access_starts_at,
      access_ends_at = excluded.access_ends_at,
      last_event_at = excluded.last_event_at,
      metadata = public.membership_entitlements.metadata || excluded.metadata,
      updated_at = now();
  else
    insert into public.coach_access_entitlements (coach_user_id, access_tier, status)
    values (p_user_id, v_access_tier, case when v_has_access then 'active' else 'revoked' end)
    on conflict (coach_user_id) do update set
      access_tier = excluded.access_tier,
      status = excluded.status,
      updated_at = now();
  end if;

  -- Payment is the activation gate for both Athlete and Coach journeys.
  if v_has_access then
    update public.profiles
    set account_status='active'::public.mw_account_status, updated_at=now()
    where user_id=p_user_id;
  elsif p_status in ('past_due','cancelled','canceled','unpaid','incomplete_expired') then
    update public.profiles
    set account_status='paused'::public.mw_account_status, updated_at=now()
    where user_id=p_user_id and account_status='active'::public.mw_account_status;
  end if;

  update public.onboarding_journeys
  set selected_plan_code=p_plan_code,
      sponsored_athlete_seats=case when v_audience='coach' then greatest(coalesce(p_sponsor_quantity,0),0) else 0 end,
      payment_status=case when v_has_access then 'paid' when p_status in ('past_due','unpaid','incomplete_expired') then 'failed' else payment_status end,
      stage=case when v_has_access and v_audience='coach' then 'coach_onboarding'
                 when v_has_access and v_audience='athlete' then 'profile'
                 else stage end,
      status=case when v_has_access then 'in_progress' else status end,
      last_completed_stage=case when v_has_access then 'payment' else last_completed_stage end,
      updated_at=now()
  where user_id=p_user_id and audience=v_audience;

  if v_audience='coach' then
    update public.coach_access_applications
    set selected_plan_code=p_plan_code,
        access_tier=v_access_tier,
        sponsored_athlete_seats=greatest(coalesce(p_sponsor_quantity,0),0),
        payment_status=case when v_has_access then 'paid' when p_status in ('past_due','unpaid','incomplete_expired') then 'failed' else payment_status end,
        status=case when v_has_access then 'activated' else status end,
        activated_at=case when v_has_access then coalesce(activated_at,now()) else activated_at end
    where coach_user_id=p_user_id;

    if v_has_access then
      select id into v_package_id
      from public.coach_sponsorship_packages
      where coach_user_id=p_user_id
        and status in ('draft','checkout_started','active','past_due','cancel_at_period_end')
      order by created_at desc limit 1;

      if v_package_id is null then
        insert into public.coach_sponsorship_packages(
          coach_application_id,coach_user_id,plan_code,requested_seats,
          seat_price_cents,coach_price_cents,status,provider,provider_subscription_id,
          current_period_start,current_period_end,cancel_at_period_end,metadata
        )
        select ca.id,p_user_id,p_plan_code,greatest(coalesce(p_sponsor_quantity,0),0),
               mp.sponsored_athlete_price_cents,mp.monthly_price_cents,
               case when coalesce(p_cancel_at_period_end,false) then 'cancel_at_period_end' else 'active' end,
               'stripe',p_subscription_id,p_period_start,p_period_end,coalesce(p_cancel_at_period_end,false),
               jsonb_build_object('stripe_customer_id',p_customer_id)
        from public.membership_plans mp
        left join public.coach_access_applications ca on ca.coach_user_id=p_user_id
        where mp.plan_code=p_plan_code
        limit 1
        returning id into v_package_id;
      else
        update public.coach_sponsorship_packages p
        set plan_code=p_plan_code,
            requested_seats=greatest(coalesce(p_sponsor_quantity,0),0),
            seat_price_cents=mp.sponsored_athlete_price_cents,
            coach_price_cents=mp.monthly_price_cents,
            status=case when coalesce(p_cancel_at_period_end,false) then 'cancel_at_period_end' else 'active' end,
            provider='stripe',
            provider_subscription_id=p_subscription_id,
            current_period_start=p_period_start,
            current_period_end=p_period_end,
            cancel_at_period_end=coalesce(p_cancel_at_period_end,false),
            updated_at=now()
        from public.membership_plans mp
        where p.id=v_package_id and mp.plan_code=p_plan_code;
      end if;

      if v_package_id is not null then
        perform private.mw_sync_sponsor_seats(v_package_id);
      end if;
    end if;
  end if;

  return true;
end;
$function$
