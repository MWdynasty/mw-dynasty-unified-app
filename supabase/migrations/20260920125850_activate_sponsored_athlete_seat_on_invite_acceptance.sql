-- MW Dynasty production migration
-- Applied to Supabase project keqgunlfwhjgcsurynef as 20260920125850 activate_sponsored_athlete_seat_on_invite_acceptance
-- Captured from supabase_migrations.schema_migrations on 2026-09-20.

CREATE OR REPLACE FUNCTION public.mw_accept_coach_invitation(p_invite_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := auth.uid();
  v_email text;
  v_inv public.coach_invitations%rowtype;
  v_athlete_id uuid;
  v_tier text;
  v_sponsored_price integer;
begin
  if v_uid is null then raise exception 'Authentication required' using errcode='42501'; end if;
  select lower(trim(email)) into v_email from auth.users where id=v_uid;
  if v_email is null or v_email='' then raise exception 'Authenticated email required' using errcode='42501'; end if;

  select * into v_inv
  from public.coach_invitations
  where invite_token=p_invite_token
    and status='pending'
    and lower(trim(athlete_email))=v_email
    and (expires_at is null or expires_at>now())
  order by created_at desc
  limit 1
  for update;
  if v_inv.id is null then raise exception 'Invitation is invalid, expired, or not assigned to this account'; end if;

  select id into v_athlete_id from public.athletes where user_id=v_uid limit 1;
  if v_athlete_id is null then raise exception 'This login is not connected to an MW athlete record' using errcode='42501'; end if;

  -- Validate the paid sponsorship path before changing invitation/assignment state.
  if v_inv.billing_type='coach_sponsored' then
    select e.access_tier,p.sponsored_athlete_price_cents
      into v_tier,v_sponsored_price
    from public.coach_access_entitlements e
    left join public.membership_plans p
      on p.audience='coach' and p.access_tier=e.access_tier and p.active=true
    where e.coach_user_id=v_inv.coach_user_id and e.status='active'
    order by e.updated_at desc
    limit 1;

    if v_tier is null then
      raise exception 'Coach sponsorship requires an active coach membership' using errcode='42501';
    end if;
    if v_sponsored_price is null then
      raise exception 'Sponsored athlete pricing is not configured for this coach tier';
    end if;
    if not private.mw_coach_sponsored_billing_enabled(v_inv.coach_user_id) then
      raise exception 'Coach-sponsored billing is not active yet. Ask your coach to finish sponsorship billing setup or resend this invitation as athlete self-pay.' using errcode='42501';
    end if;
  end if;

  update public.coach_invitations
  set status='accepted',accepted_at=now(),accepted_by=v_uid
  where id=v_inv.id;

  insert into public.coach_assignments(coach_user_id,athlete_id,status,assigned_by,assigned_at)
  values(v_inv.coach_user_id,v_athlete_id,'active'::public.mw_assignment_status,v_inv.coach_user_id,now())
  on conflict (coach_user_id,athlete_id) where status='active' do nothing;

  if v_inv.billing_type='coach_sponsored' then
    insert into public.membership_entitlements(source,email,email_normalized,user_id,plan_code,status,access_starts_at,access_ends_at,metadata,updated_at)
    values('coach_sponsored',v_email,v_email,v_uid,'mw_athlete','active',now(),v_inv.sponsorship_ends_at,
      jsonb_build_object(
        'billing_type','coach_sponsored',
        'responsible_coach_user_id',v_inv.coach_user_id::text,
        'sponsored_athlete_price_cents',v_sponsored_price,
        'coach_access_tier',v_tier,
        'sponsored_billing_verified',true
      ),now())
    on conflict (source,email_normalized) do update set
      user_id=excluded.user_id,
      status='active',
      access_starts_at=least(public.membership_entitlements.access_starts_at,now()),
      access_ends_at=excluded.access_ends_at,
      metadata=excluded.metadata,
      updated_at=now();

    insert into public.billing_subscriptions(
      audience,beneficiary_user_id,payer_user_id,responsible_coach_user_id,billing_type,billing_cycle,plan_code,provider,status,
      current_period_start,current_period_end,cancel_at_period_end,metadata
    ) values(
      'athlete',v_uid,v_inv.coach_user_id,v_inv.coach_user_id,'coach_sponsored','monthly','mw_athlete','coach_sponsored','active',
      now(),v_inv.sponsorship_ends_at,false,
      jsonb_build_object(
        'coach_access_tier',v_tier,
        'sponsored_athlete_price_cents',v_sponsored_price,
        'invitation_id',v_inv.id,
        'sponsored_billing_verified',true
      )
    )
    on conflict (beneficiary_user_id,audience) do update set
      payer_user_id=v_inv.coach_user_id,
      responsible_coach_user_id=v_inv.coach_user_id,
      billing_type='coach_sponsored',
      billing_cycle='monthly',
      plan_code='mw_athlete',
      provider='coach_sponsored',
      status='active',
      current_period_start=least(coalesce(public.billing_subscriptions.current_period_start,now()),now()),
      current_period_end=v_inv.sponsorship_ends_at,
      cancel_at_period_end=false,
      pending_plan_code=null,
      pending_billing_type=null,
      pending_billing_cycle=null,
      pending_payer_user_id=null,
      pending_effective_at=null,
      metadata=excluded.metadata,
      updated_at=now();
  end if;

  if v_inv.billing_type='coach_sponsored' then
    update public.coach_sponsor_seats s
    set status='active',athlete_email=v_email,athlete_user_id=v_uid,
        claimed_at=coalesce(claimed_at,now()),activated_at=coalesce(activated_at,now()),updated_at=now()
    where s.coach_invitation_id=v_inv.id
      and s.status in ('invited','claimed');

    update public.profiles
    set account_status='active'::public.mw_account_status,updated_at=now()
    where user_id=v_uid;

    update public.onboarding_journeys
    set selected_plan_code='mw_athlete',payment_status='paid',stage='profile',
        status='in_progress',last_completed_stage='membership',updated_at=now(),
        metadata=metadata || jsonb_build_object('billing_type','coach_sponsored','responsible_coach_user_id',v_inv.coach_user_id::text)
    where user_id=v_uid and audience='athlete';
  end if;

  return jsonb_build_object(
    'ok',true,
    'coach_user_id',v_inv.coach_user_id,
    'athlete_id',v_athlete_id,
    'status','accepted',
    'billing_type',v_inv.billing_type,
    'sponsorship_ends_at',v_inv.sponsorship_ends_at,
    'sponsored_athlete_price_cents',case when v_inv.billing_type='coach_sponsored' then v_sponsored_price else null end
  );
end;
$function$
