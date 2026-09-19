-- Applies Stripe subscription state to MW Dynasty access records.
-- This function is callable only by the Supabase service role (the Stripe webhook).

create table if not exists private.stripe_webhook_events (
  stripe_event_id text primary key,
  event_type text not null,
  received_at timestamptz not null default now()
);

revoke all on table private.stripe_webhook_events from public, anon, authenticated;

create or replace function public.mw_apply_stripe_subscription(
  p_event_id text,
  p_event_type text,
  p_user_id uuid,
  p_email text,
  p_plan_code text,
  p_subscription_id text,
  p_customer_id text,
  p_status text,
  p_period_start timestamptz,
  p_period_end timestamptz,
  p_cancel_at_period_end boolean default false,
  p_sponsor_quantity integer default 0,
  p_payload jsonb default '{}'::jsonb
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_audience text;
  v_access_tier text;
  v_email text;
  v_billing_status text;
  v_membership_status text;
  v_has_access boolean;
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

  return true;
end;
$$;

revoke all on function public.mw_apply_stripe_subscription(text, text, uuid, text, text, text, text, text, timestamptz, timestamptz, boolean, integer, jsonb) from public, anon, authenticated;
grant execute on function public.mw_apply_stripe_subscription(text, text, uuid, text, text, text, text, text, timestamptz, timestamptz, boolean, integer, jsonb) to service_role;
