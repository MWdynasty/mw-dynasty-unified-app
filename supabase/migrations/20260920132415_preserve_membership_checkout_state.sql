-- MW Dynasty production migration
-- Applied to Supabase project keqgunlfwhjgcsurynef as 20260920132415 preserve_membership_checkout_state
-- Captured from supabase_migrations.schema_migrations on 2026-09-20.

create or replace function public.mw_mark_membership_checkout_started(
  p_plan_code text,
  p_sponsor_quantity integer default 0,
  p_provider text default 'stripe',
  p_provider_reference text default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_uid uuid:=auth.uid();
  v_role text;
  v_audience text;
  v_plan public.membership_plans%rowtype;
  v_app public.coach_access_applications%rowtype;
  v_package_id uuid;
  v_qty integer:=greatest(coalesce(p_sponsor_quantity,0),0);
begin
  if v_uid is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if v_qty>250 then raise exception 'Sponsored-athlete quantity must be between 0 and 250' using errcode='22023'; end if;

  select role::text into v_role from public.profiles where user_id=v_uid;
  if v_role is null then raise exception 'MW profile not found' using errcode='P0002'; end if;
  v_audience:=case when v_role in ('coach','admin','founder_owner') then 'coach' else 'athlete' end;

  select * into v_plan from public.membership_plans
  where plan_code=p_plan_code and active=true and monthly_enabled=true and audience=v_audience
  limit 1;
  if v_plan.plan_code is null then raise exception 'This membership is not available for this account' using errcode='22023'; end if;
  if v_audience='athlete' and v_qty<>0 then raise exception 'Athlete membership cannot include sponsored seats' using errcode='22023'; end if;

  if v_audience='coach' and v_role='coach' then
    select * into v_app from public.coach_access_applications
    where coach_user_id=v_uid
      and verification_status in ('approved','auto_approved')
      and status in ('approved','invited','activated')
    order by created_at desc limit 1;
    if v_app.id is null then raise exception 'Coach verification must be completed before checkout' using errcode='42501'; end if;
  end if;

  update public.onboarding_journeys
  set selected_plan_code=p_plan_code,
      sponsored_athlete_seats=case when v_audience='coach' then v_qty else 0 end,
      payment_status='checkout_started',
      stage='payment',
      status='in_progress',
      last_completed_stage='membership',
      metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
        'checkout_provider',lower(coalesce(nullif(trim(p_provider),''),'stripe')),
        'checkout_reference',nullif(trim(coalesce(p_provider_reference,'')),''),
        'checkout_started_at',now()
      ),
      updated_at=now()
  where user_id=v_uid and audience=v_audience;

  if not found then
    insert into public.onboarding_journeys(
      user_id,audience,channel,stage,status,verification_status,selected_plan_code,
      sponsored_athlete_seats,payment_status,assessment_status,last_completed_stage,metadata
    ) values (
      v_uid,v_audience,'website','payment','in_progress',
      case when v_audience='coach' then coalesce(v_app.verification_status,'approved') else 'not_required' end,
      p_plan_code,case when v_audience='coach' then v_qty else 0 end,'checkout_started',
      case when v_audience='coach' then 'not_required' else 'not_started' end,'membership',
      jsonb_build_object('checkout_provider',lower(coalesce(nullif(trim(p_provider),''),'stripe')),'checkout_reference',nullif(trim(coalesce(p_provider_reference,'')),''),'checkout_started_at',now())
    );
  end if;

  if v_audience='coach' then
    update public.coach_access_applications
    set selected_plan_code=p_plan_code,
        sponsored_athlete_seats=v_qty,
        payment_status='checkout_started'
    where coach_user_id=v_uid and verification_status in ('approved','auto_approved');

    select id into v_package_id
    from public.coach_sponsorship_packages
    where coach_user_id=v_uid and status in ('draft','checkout_started')
    order by created_at desc limit 1 for update;

    if v_package_id is null then
      insert into public.coach_sponsorship_packages(
        coach_application_id,coach_user_id,plan_code,requested_seats,
        seat_price_cents,coach_price_cents,status,provider,metadata
      ) values (
        v_app.id,v_uid,p_plan_code,v_qty,
        coalesce(v_plan.sponsored_athlete_price_cents,0),v_plan.monthly_price_cents,
        'checkout_started',lower(coalesce(nullif(trim(p_provider),''),'stripe')),
        jsonb_build_object('checkout_reference',nullif(trim(coalesce(p_provider_reference,'')),''))
      ) returning id into v_package_id;
    else
      update public.coach_sponsorship_packages
      set plan_code=p_plan_code,requested_seats=v_qty,
          seat_price_cents=coalesce(v_plan.sponsored_athlete_price_cents,0),
          coach_price_cents=v_plan.monthly_price_cents,status='checkout_started',
          provider=lower(coalesce(nullif(trim(p_provider),''),'stripe')),
          metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('checkout_reference',nullif(trim(coalesce(p_provider_reference,'')),'')),
          updated_at=now()
      where id=v_package_id;
    end if;
  end if;

  return jsonb_build_object(
    'ok',true,'audience',v_audience,'plan_code',p_plan_code,
    'sponsor_quantity',case when v_audience='coach' then v_qty else 0 end,
    'monthly_price_cents',v_plan.monthly_price_cents,
    'sponsored_athlete_price_cents',v_plan.sponsored_athlete_price_cents,
    'monthly_total_cents',v_plan.monthly_price_cents+(case when v_audience='coach' then v_qty*coalesce(v_plan.sponsored_athlete_price_cents,0) else 0 end),
    'payment_status','checkout_started'
  );
end;
$function$;

revoke all on function public.mw_mark_membership_checkout_started(text,integer,text,text) from public,anon;
grant execute on function public.mw_mark_membership_checkout_started(text,integer,text,text) to authenticated;

comment on function public.mw_mark_membership_checkout_started(text,integer,text,text) is
'Authenticated checkout-state gate. Validates account audience and coach verification, snapshots membership/seat selection, and preserves resumable checkout state before provider payment.';
