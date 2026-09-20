-- MW Dynasty production migration
-- Applied to Supabase project keqgunlfwhjgcsurynef as 20260920133241 authoritative_apple_membership_activation
-- Captured from supabase_migrations.schema_migrations on 2026-09-20.

create table if not exists private.apple_transaction_events (
  transaction_id text primary key,
  original_transaction_id text,
  user_id uuid,
  plan_code text,
  product_id text,
  environment text,
  status text,
  payload jsonb not null default '{}'::jsonb,
  processed_at timestamptz not null default now()
);
revoke all on private.apple_transaction_events from public,anon,authenticated;

create or replace function public.mw_apply_apple_subscription(
  p_event_id text,
  p_user_id uuid,
  p_plan_code text,
  p_product_id text,
  p_transaction_id text,
  p_original_transaction_id text,
  p_status text,
  p_period_start timestamptz,
  p_period_end timestamptz,
  p_environment text default 'production',
  p_payload jsonb default '{}'::jsonb
)
returns boolean
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_audience text;
  v_access_tier text;
  v_email text;
  v_has_access boolean;
  v_membership_status text;
begin
  if auth.role()<>'service_role' then raise exception 'service role required'; end if;
  if coalesce(trim(p_event_id),'')='' or coalesce(trim(p_transaction_id),'')='' or coalesce(trim(p_original_transaction_id),'')='' then
    raise exception 'Apple transaction identifiers are required';
  end if;
  if p_plan_code not in ('mw_athlete','coach_core','coach_intelligence','mw_sprint_performance') then
    raise exception 'Unsupported MW plan';
  end if;
  if coalesce(trim(p_product_id),'')='' then raise exception 'Apple product identifier is required'; end if;

  insert into private.apple_transaction_events(
    transaction_id,original_transaction_id,user_id,plan_code,product_id,environment,status,payload
  ) values (
    p_transaction_id,p_original_transaction_id,p_user_id,p_plan_code,p_product_id,
    lower(coalesce(nullif(trim(p_environment),''),'production')),lower(coalesce(nullif(trim(p_status),''),'expired')),
    coalesce(p_payload,'{}'::jsonb)||jsonb_build_object('event_id',p_event_id)
  )
  on conflict(transaction_id) do nothing;
  if not found then return false; end if;

  select lower(trim(u.email)) into v_email from auth.users u where u.id=p_user_id;
  if v_email is null then raise exception 'MW user not found'; end if;

  v_audience:=case when p_plan_code='mw_athlete' then 'athlete' else 'coach' end;
  v_access_tier:=case p_plan_code
    when 'coach_core' then 'core'
    when 'coach_intelligence' then 'intelligence'
    when 'mw_sprint_performance' then 'mw_sprint_performance'
    else null end;
  v_has_access:=lower(p_status) in ('active','grace_period')
    and (p_period_end is null or p_period_end>now());
  v_membership_status:=case
    when v_has_access then 'active'
    when lower(p_status)='billing_retry' then 'past_due'
    else 'cancelled' end;

  insert into public.billing_subscriptions(
    audience,beneficiary_user_id,payer_user_id,billing_type,billing_cycle,plan_code,
    provider,provider_subscription_id,status,current_period_start,current_period_end,
    cancel_at_period_end,metadata
  ) values (
    v_audience,p_user_id,p_user_id,'individual','monthly',p_plan_code,
    'apple',p_original_transaction_id,
    case when v_has_access then 'active' when lower(p_status)='billing_retry' then 'past_due' else 'cancelled' end,
    p_period_start,p_period_end,false,
    jsonb_build_object(
      'apple_product_id',p_product_id,'apple_transaction_id',p_transaction_id,
      'apple_environment',lower(coalesce(nullif(trim(p_environment),''),'production')),
      'last_apple_event',p_event_id
    )||coalesce(p_payload,'{}'::jsonb)
  )
  on conflict(beneficiary_user_id,audience) do update set
    payer_user_id=excluded.payer_user_id,billing_type=excluded.billing_type,
    billing_cycle=excluded.billing_cycle,plan_code=excluded.plan_code,provider=excluded.provider,
    provider_subscription_id=excluded.provider_subscription_id,status=excluded.status,
    current_period_start=excluded.current_period_start,current_period_end=excluded.current_period_end,
    cancel_at_period_end=excluded.cancel_at_period_end,
    metadata=public.billing_subscriptions.metadata||excluded.metadata,updated_at=now();

  if v_audience='athlete' then
    insert into public.membership_entitlements(
      source,email,email_normalized,user_id,external_member_id,plan_code,status,
      access_starts_at,access_ends_at,last_event_at,metadata
    ) values (
      'apple',v_email,v_email,p_user_id,p_original_transaction_id,p_plan_code,v_membership_status,
      coalesce(p_period_start,now()),p_period_end,now(),
      jsonb_build_object('apple_product_id',p_product_id,'apple_transaction_id',p_transaction_id,'apple_environment',p_environment)
    )
    on conflict(source,email_normalized) do update set
      user_id=excluded.user_id,external_member_id=excluded.external_member_id,plan_code=excluded.plan_code,
      status=excluded.status,access_starts_at=excluded.access_starts_at,access_ends_at=excluded.access_ends_at,
      last_event_at=excluded.last_event_at,metadata=public.membership_entitlements.metadata||excluded.metadata,updated_at=now();
  else
    if not exists(
      select 1 from public.coach_access_applications ca
      where ca.coach_user_id=p_user_id
        and ca.verification_status in ('approved','auto_approved')
        and ca.status in ('approved','invited','activated')
    ) then
      raise exception 'Coach verification is required before Apple membership activation';
    end if;
    insert into public.coach_access_entitlements(coach_user_id,access_tier,status)
    values(p_user_id,v_access_tier,case when v_has_access then 'active' else 'revoked' end)
    on conflict(coach_user_id) do update set access_tier=excluded.access_tier,status=excluded.status,updated_at=now();
  end if;

  if v_has_access then
    update public.profiles set account_status='active'::public.mw_account_status,updated_at=now() where user_id=p_user_id;
  elsif lower(p_status) in ('expired','revoked','billing_retry') then
    update public.profiles set account_status='paused'::public.mw_account_status,updated_at=now()
    where user_id=p_user_id and account_status='active'::public.mw_account_status;
  end if;

  update public.onboarding_journeys
  set selected_plan_code=p_plan_code,
      sponsored_athlete_seats=case when v_audience='coach' then 0 else sponsored_athlete_seats end,
      payment_status=case when v_has_access then 'paid' when lower(p_status) in ('expired','revoked','billing_retry') then 'failed' else payment_status end,
      stage=case when v_has_access and v_audience='coach' then 'coach_onboarding'
                 when v_has_access and v_audience='athlete' then 'profile' else stage end,
      status=case when v_has_access then 'in_progress' else status end,
      last_completed_stage=case when v_has_access then 'payment' else last_completed_stage end,
      metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
        'payment_provider','apple','apple_transaction_id',p_transaction_id,
        'apple_original_transaction_id',p_original_transaction_id,'apple_environment',p_environment
      ),
      updated_at=now()
  where user_id=p_user_id and audience=v_audience;

  if v_audience='coach' then
    update public.coach_access_applications
    set selected_plan_code=p_plan_code,access_tier=v_access_tier,
        sponsored_athlete_seats=0,
        payment_status=case when v_has_access then 'paid' when lower(p_status) in ('expired','revoked','billing_retry') then 'failed' else payment_status end,
        status=case when v_has_access then 'activated' else status end,
        activated_at=case when v_has_access then coalesce(activated_at,now()) else activated_at end
    where coach_user_id=p_user_id;
  end if;

  return true;
end;
$function$;

revoke all on function public.mw_apply_apple_subscription(text,uuid,text,text,text,text,text,timestamptz,timestamptz,text,jsonb) from public,anon,authenticated;
grant execute on function public.mw_apply_apple_subscription(text,uuid,text,text,text,text,text,timestamptz,timestamptz,text,jsonb) to service_role;

comment on function public.mw_apply_apple_subscription(text,uuid,text,text,text,text,text,timestamptz,timestamptz,text,jsonb) is
'Authoritative service-only Apple subscription activation path. Client purchase callbacks cannot grant MW access.';
