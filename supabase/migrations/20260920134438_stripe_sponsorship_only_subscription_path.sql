-- MW Dynasty production migration
-- Applied to Supabase project keqgunlfwhjgcsurynef as 20260920134438 stripe_sponsorship_only_subscription_path
-- Captured from supabase_migrations.schema_migrations on 2026-09-20.

create or replace function public.mw_apply_stripe_sponsorship_subscription(
  p_event_id text,
  p_event_type text,
  p_user_id uuid,
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
set search_path=''
as $function$
declare
  v_package_id uuid;
  v_package_status text;
  v_has_access boolean;
  v_app_id uuid;
begin
  if auth.role()<>'service_role' then raise exception 'service role required'; end if;
  if coalesce(trim(p_event_id),'')='' or coalesce(trim(p_subscription_id),'')='' then raise exception 'Stripe event and subscription identifiers are required'; end if;
  if p_plan_code not in ('coach_core','coach_intelligence','mw_sprint_performance') then raise exception 'Coach plan required'; end if;
  if coalesce(p_sponsor_quantity,0)<1 or p_sponsor_quantity>250 then raise exception 'Sponsor quantity must be between 1 and 250'; end if;
  if not exists(
    select 1 from public.billing_subscriptions b
    where b.beneficiary_user_id=p_user_id and b.audience='coach'
      and b.status in ('active','trialing','cancel_at_period_end')
      and (b.current_period_end is null or b.current_period_end>now())
  ) then raise exception 'An active Coach membership is required before sponsored seats can be billed'; end if;

  insert into private.stripe_webhook_events(stripe_event_id,event_type)
  values(p_event_id,coalesce(nullif(trim(p_event_type),''),'unknown'))
  on conflict(stripe_event_id) do nothing;
  if not found then return false; end if;

  v_has_access:=p_status in ('active','trialing')
    or (p_status in ('cancelled','canceled') and p_period_end is not null and p_period_end>now());
  v_package_status:=case
    when not v_has_access and p_status='past_due' then 'past_due'
    when not v_has_access then 'cancelled'
    when coalesce(p_cancel_at_period_end,false) or p_status in ('cancelled','canceled') then 'cancel_at_period_end'
    else 'active' end;

  select ca.id into v_app_id
  from public.coach_access_applications ca
  where ca.coach_user_id=p_user_id
  order by ca.created_at desc limit 1;

  select p.id into v_package_id
  from public.coach_sponsorship_packages p
  where p.coach_user_id=p_user_id
    and p.status in ('draft','checkout_started','active','past_due','cancel_at_period_end')
  order by p.created_at desc limit 1
  for update;

  if v_package_id is null then
    insert into public.coach_sponsorship_packages(
      coach_application_id,coach_user_id,plan_code,requested_seats,seat_price_cents,coach_price_cents,
      status,provider,provider_subscription_id,current_period_start,current_period_end,cancel_at_period_end,metadata
    )
    select v_app_id,p_user_id,p_plan_code,p_sponsor_quantity,mp.sponsored_athlete_price_cents,0,
      v_package_status,'stripe',p_subscription_id,p_period_start,p_period_end,coalesce(p_cancel_at_period_end,false),
      jsonb_build_object('stripe_customer_id',p_customer_id,'billing_scope','sponsorship_only')||coalesce(p_payload,'{}'::jsonb)
    from public.membership_plans mp where mp.plan_code=p_plan_code
    returning id into v_package_id;
  else
    update public.coach_sponsorship_packages p
    set plan_code=p_plan_code,requested_seats=p_sponsor_quantity,
        seat_price_cents=mp.sponsored_athlete_price_cents,coach_price_cents=0,
        status=v_package_status,provider='stripe',provider_subscription_id=p_subscription_id,
        current_period_start=p_period_start,current_period_end=p_period_end,
        cancel_at_period_end=coalesce(p_cancel_at_period_end,false),
        metadata=coalesce(p.metadata,'{}'::jsonb)||jsonb_build_object('stripe_customer_id',p_customer_id,'billing_scope','sponsorship_only')||coalesce(p_payload,'{}'::jsonb),
        updated_at=now()
    from public.membership_plans mp
    where p.id=v_package_id and mp.plan_code=p_plan_code;
  end if;

  if v_package_id is not null and v_has_access then
    perform private.mw_sync_sponsor_seats(v_package_id);
  elsif v_package_id is not null and not v_has_access then
    update public.coach_sponsor_seats
    set status=case when status='available' then 'ended' else 'scheduled_to_end' end,updated_at=now()
    where package_id=v_package_id and status<>'ended';

    update public.membership_entitlements
    set status='cancelled',
        access_ends_at=coalesce(p_period_end,now()),
        metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('sponsor_package_ended',true,'sponsor_package_subscription_id',p_subscription_id),
        updated_at=now()
    where source='coach_sponsored'
      and metadata->>'responsible_coach_user_id'=p_user_id::text
      and status in ('active','trialing','cancelled');
  end if;

  update public.onboarding_journeys
  set sponsored_athlete_seats=p_sponsor_quantity,
      metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('sponsorship_provider','stripe','sponsorship_subscription_id',p_subscription_id),
      updated_at=now()
  where user_id=p_user_id and audience='coach';

  return true;
end;
$function$;

revoke all on function public.mw_apply_stripe_sponsorship_subscription(text,text,uuid,text,text,text,text,timestamptz,timestamptz,boolean,integer,jsonb) from public,anon,authenticated;
grant execute on function public.mw_apply_stripe_sponsorship_subscription(text,text,uuid,text,text,text,text,timestamptz,timestamptz,boolean,integer,jsonb) to service_role;
comment on function public.mw_apply_stripe_sponsorship_subscription(text,text,uuid,text,text,text,text,timestamptz,timestamptz,boolean,integer,jsonb) is
'Service-only Stripe add-on subscription path for sponsored-athlete seats. Never replaces the Coach base membership provider.';
