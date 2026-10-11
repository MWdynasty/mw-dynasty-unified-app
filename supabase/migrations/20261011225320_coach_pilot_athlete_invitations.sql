-- Complimentary pilots are explicitly approved, separate from paid sponsorship.
create table private.mw_coach_pilots (
 coach_user_id uuid primary key references auth.users(id) on delete cascade,
 access_tier text not null check (access_tier='intelligence'),
 status text not null default 'active' check (status in ('active','revoked')),
 approved_by uuid references auth.users(id),
 expires_at timestamptz,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
alter table private.mw_coach_pilots enable row level security;
revoke all on private.mw_coach_pilots from public,anon,authenticated;
grant all on private.mw_coach_pilots to service_role;

create function private.mw_coach_pilot_active(p_coach_user_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from private.mw_coach_pilots cp
  join public.profiles p on p.user_id=cp.coach_user_id
  join public.coach_access_entitlements e on e.coach_user_id=cp.coach_user_id
  where cp.coach_user_id=p_coach_user_id and cp.status='active'
   and (cp.expires_at is null or cp.expires_at>now())
   and p.role::text='coach' and p.account_status::text='active'
   and e.status='active' and e.access_source='internal_test' and e.access_tier=cp.access_tier);
$$;
revoke all on function private.mw_coach_pilot_active(uuid) from public,anon,authenticated;

create function private.mw_pilot_athlete_active(p_user_id uuid,p_coach_user_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select private.mw_coach_pilot_active(p_coach_user_id) and exists(
  select 1 from public.athletes a join public.profiles p on p.user_id=a.user_id
   join public.coach_assignments ca on ca.athlete_id=a.id
  where a.user_id=p_user_id and p.role::text='athlete' and p.account_status::text='active'
   and ca.coach_user_id=p_coach_user_id and ca.status::text='active');
$$;
revoke all on function private.mw_pilot_athlete_active(uuid,uuid) from public,anon,authenticated;

create function public.mw_current_coach_pilot_status()
returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('active',private.mw_coach_pilot_active(private.mw_authenticated_uid()),
  'billing_type','coach_pilot','payment_required',false);
$$;
revoke all on function public.mw_current_coach_pilot_status() from public,anon;
grant execute on function public.mw_current_coach_pilot_status() to authenticated;

alter table public.coach_invitations drop constraint coach_invitations_billing_type_check;
alter table public.coach_invitations add constraint coach_invitations_billing_type_check
 check (billing_type in ('self_pay','coach_sponsored','coach_pilot'));

create function private.mw_guard_pilot_invitation()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.status='pending' and private.mw_coach_pilot_active(new.coach_user_id) then
  new.billing_type:='coach_pilot';
  select cp.access_tier,cp.expires_at into new.sponsor_access_tier,new.sponsorship_ends_at
   from private.mw_coach_pilots cp where cp.coach_user_id=new.coach_user_id;
  new.sponsor_price_cents:=0;
 elsif new.billing_type='coach_pilot' and (tg_op='INSERT' or new.status='pending') then
  raise exception 'Free pilot invitations require an active approved pilot' using errcode='42501';
 end if;
 return new;
end;$$;
revoke all on function private.mw_guard_pilot_invitation() from public,anon,authenticated;
create trigger mw_guard_pilot_invitation before insert or update on public.coach_invitations
 for each row execute function private.mw_guard_pilot_invitation();

CREATE OR REPLACE FUNCTION public.mw_accept_coach_invitation(p_invite_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := private.mw_authenticated_uid();
  v_email text;
  v_inv public.coach_invitations%rowtype;
  v_athlete_id uuid;
  v_tier text;
  v_sponsored_price integer;
  v_sponsorship_end timestamptz;
begin
  if v_uid is null then raise exception 'Authentication required' using errcode='42501'; end if;
  select lower(trim(email)) into v_email from auth.users where id=v_uid;
  if v_email is null or v_email='' then raise exception 'Authenticated email required' using errcode='42501'; end if;

  select * into v_inv
  from public.coach_invitations
  where invite_token=p_invite_token
    and status in ('pending','accepted')
    and lower(trim(athlete_email))=v_email
    and (expires_at is null or expires_at>now())
  order by created_at desc
  limit 1
  for update;
  if v_inv.id is null then raise exception 'Invitation is invalid, expired, or not assigned to this account'; end if;


  if v_inv.team_id is not null and not exists(
    select 1 from public.profiles p where p.user_id=v_inv.coach_user_id and p.account_status::text='active'
      and (p.role::text in ('admin','founder_owner') or exists(
       select 1 from public.team_members tm where tm.team_id=v_inv.team_id and tm.user_id=v_inv.coach_user_id and tm.member_role='coach'
      ))
  ) then raise exception 'This coach is no longer authorized for the invited team' using errcode='42501'; end if;
  select id into v_athlete_id from public.athletes where user_id=v_uid limit 1;
  if v_athlete_id is null then raise exception 'This login is not connected to an MW athlete record' using errcode='42501'; end if;
  if not exists(select 1 from public.profiles where user_id=v_uid and role::text='athlete'
   and account_status::text in ('invited','active','paused')) then
   raise exception 'Eligible athlete account required' using errcode='42501';
  end if;
  if v_inv.billing_type='coach_pilot' then
   if not private.mw_coach_pilot_active(v_inv.coach_user_id) then
    raise exception 'This coach pilot has ended' using errcode='42501';
   end if;
   if not exists(select 1 from public.athletes where id=v_athlete_id
    and date_of_birth is not null and date_of_birth<=(current_date-interval '13 years')::date) then
    raise exception 'Complete your athlete profile and verify age 13 or older before joining the pilot' using errcode='22023';
   end if;
  end if;
  if v_inv.status='accepted' then
   if v_inv.accepted_by is distinct from v_uid or not exists(select 1 from public.coach_assignments
    where coach_user_id=v_inv.coach_user_id and athlete_id=v_athlete_id and status::text='active') then
    raise exception 'This invitation cannot reopen a disconnected account' using errcode='42501';
   end if;
   return jsonb_build_object('ok',true,'reused',true,'coach_user_id',v_inv.coach_user_id,
    'athlete_id',v_athlete_id,'status','accepted','billing_type',v_inv.billing_type);
  end if;

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

    -- A coach-sponsored invitation must own a real paid seat. Billing being active
    -- by itself is not enough to grant another athlete access.
    select sp.current_period_end into v_sponsorship_end
    from public.coach_sponsor_seats s
    join public.coach_sponsorship_packages sp on sp.id=s.package_id
    where s.coach_invitation_id=v_inv.id
      and s.status in ('invited','claimed')
      and sp.coach_user_id=v_inv.coach_user_id
      and sp.requested_seats>0
      and sp.status in ('active','cancel_at_period_end')
      and (sp.current_period_end is null or sp.current_period_end>now())
    order by sp.updated_at desc
    limit 1
    for update of s;

    if not found then
      raise exception 'This sponsored invitation does not have a valid paid athlete seat. Ask the coach to add or resend a sponsored seat.' using errcode='42501';
    end if;
  end if;

  update public.coach_invitations
  set status='accepted',accepted_at=now(),accepted_by=v_uid
  where id=v_inv.id;

  insert into public.coach_assignments(coach_user_id,athlete_id,status,assigned_by,assigned_at)
  values(v_inv.coach_user_id,v_athlete_id,'active'::public.mw_assignment_status,v_inv.coach_user_id,now())
  on conflict (coach_user_id,athlete_id) where status='active' do nothing;

  if v_inv.billing_type='coach_pilot' then
    select access_tier,expires_at into v_tier,v_sponsorship_end
     from private.mw_coach_pilots where coach_user_id=v_inv.coach_user_id;
    insert into public.membership_entitlements(source,email,email_normalized,user_id,plan_code,status,access_starts_at,access_ends_at,metadata)
     values('coach_pilot',v_email,v_email,v_uid,'mw_athlete','active',now(),v_sponsorship_end,
      jsonb_build_object('billing_type','coach_pilot','responsible_coach_user_id',v_inv.coach_user_id::text,
       'coach_access_tier',v_tier,'invitation_id',v_inv.id,'complimentary_pilot',true,'payment_required',false))
     on conflict(source,email_normalized) do update set user_id=excluded.user_id,status='active',
      access_ends_at=excluded.access_ends_at,metadata=excluded.metadata,updated_at=now();
    update public.profiles set account_status='active',updated_at=now() where user_id=v_uid;
    update public.onboarding_journeys set stage='profile',status='in_progress',last_completed_stage='account',
     metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('complimentary_pilot',true,'payment_required',false,
      'responsible_coach_user_id',v_inv.coach_user_id::text),updated_at=now()
     where user_id=v_uid and audience='athlete';
  end if;

  if v_inv.billing_type='coach_sponsored' then
    insert into public.membership_entitlements(source,email,email_normalized,user_id,plan_code,status,access_starts_at,access_ends_at,metadata,updated_at)
    values('coach_sponsored',v_email,v_email,v_uid,'mw_athlete','active',now(),v_sponsorship_end,
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
      now(),v_sponsorship_end,false,
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
      current_period_end=v_sponsorship_end,
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
    'sponsorship_ends_at',v_sponsorship_end,
    'sponsored_athlete_price_cents',case when v_inv.billing_type='coach_sponsored' then v_sponsored_price else null end
  );
end;
$function$;

CREATE OR REPLACE FUNCTION private.mw_athlete_access_profile()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := private.mw_authenticated_uid();
  v_ent public.membership_entitlements%rowtype;
  v_sub public.billing_subscriptions%rowtype;
  v_has_access boolean := false;
  v_billing_type text := 'none';
  v_coach uuid;
  v_tier text;
  v_has_coach boolean := false;
  v_internal_test boolean := false;
  v_pilot boolean := false;
  v_individual_full boolean := false;
  v_ai_intelligence boolean := false;
  v_mw_full boolean := false;
  v_date_of_birth date;
  v_age_verified boolean := false;
begin
  if v_uid is null then
    return jsonb_build_object(
      'access_mode','none','has_access',false,'coach_access_tier',null,
      'age_verified',false,'age_verification_required',false,
      'athlete_app',false,'coach_assigned_training',false,'messaging',false,
      'basic_coach_mw',false,'pace_tracking',false,'ai_intelligence',false,
      'mw_training_system',false,'strength_power',false,'sprint_school',false,
      'smart_entry',false,'advanced_performance_tools',false
    );
  end if;

  select a.date_of_birth into v_date_of_birth
  from public.athletes a
  where a.user_id=v_uid
  limit 1;

  select e.* into v_ent
  from public.membership_entitlements e
  where e.user_id=v_uid
    and e.status in ('active','trialing','cancelled')
    and e.access_starts_at<=now()
    and (e.access_ends_at is null or e.access_ends_at>now())
    and (e.source<>'coach_pilot' or private.mw_pilot_athlete_active(v_uid,nullif(e.metadata->>'responsible_coach_user_id','')::uuid))
  order by case when e.source='internal_test' then 0 when e.source='coach_sponsored' then 1 when e.source='coach_pilot' then 3 else 2 end,
           e.updated_at desc
  limit 1;

  v_has_access := v_ent.id is not null;
  if not v_has_access then
    v_age_verified := v_date_of_birth is not null and v_date_of_birth <= (current_date - interval '13 years')::date;
    return jsonb_build_object(
      'access_mode','none','has_access',false,'coach_access_tier',null,
      'age_verified',v_age_verified,'age_verification_required',not v_age_verified,
      'athlete_app',false,'coach_assigned_training',false,'messaging',false,
      'basic_coach_mw',false,'pace_tracking',false,'ai_intelligence',false,
      'mw_training_system',false,'strength_power',false,'sprint_school',false,
      'smart_entry',false,'advanced_performance_tools',false
    );
  end if;

  select b.* into v_sub
  from public.billing_subscriptions b
  where b.beneficiary_user_id=v_uid and b.audience='athlete'
  order by b.updated_at desc
  limit 1;

  v_pilot := v_ent.source='coach_pilot';
  v_internal_test := v_ent.source='internal_test' or coalesce(v_ent.metadata->>'billing_type','')='internal_test';
  v_age_verified := v_internal_test
    or (v_date_of_birth is not null and v_date_of_birth <= (current_date - interval '13 years')::date);

  v_billing_type := case when v_pilot then 'coach_pilot' else coalesce(
    nullif(v_sub.billing_type,''),
    nullif(v_ent.metadata->>'billing_type',''),
    case when v_ent.source='coach_sponsored' then 'coach_sponsored' else 'individual' end
  ) end;

  v_coach := case when v_pilot then nullif(v_ent.metadata->>'responsible_coach_user_id','')::uuid else coalesce(
    v_sub.responsible_coach_user_id,
    nullif(v_ent.metadata->>'responsible_coach_user_id','')::uuid
  ) end;

  -- A sponsored athlete is entitled only while BOTH the Coach base membership
  -- and the paid sponsorship source remain valid. A stale entitlement row by
  -- itself must never keep Athlete access alive.
  if v_billing_type='coach_sponsored'
     and (v_coach is null or not private.mw_coach_sponsored_billing_enabled(v_coach)) then
    return jsonb_build_object(
      'access_mode','none','has_access',false,'billing_type','coach_sponsored',
      'responsible_coach_user_id',case when v_coach is null then null else v_coach::text end,
      'coach_access_tier',null,
      'age_verified',v_age_verified,'age_verification_required',not v_age_verified,
      'athlete_app',false,'coach_assigned_training',false,'messaging',false,
      'basic_coach_mw',false,'pace_tracking',false,'ai_intelligence',false,
      'mw_training_system',false,'strength_power',false,'sprint_school',false,
      'smart_entry',false,'advanced_performance_tools',false
    );
  end if;

  if v_billing_type in ('coach_sponsored','coach_pilot') and v_coach is not null then
    select cae.access_tier into v_tier
    from public.coach_access_entitlements cae
    join public.profiles p on p.user_id=cae.coach_user_id
    where cae.coach_user_id=v_coach
      and cae.status='active'
      and p.role::text='coach'
      and p.account_status::text='active'
    limit 1;
  end if;

  select exists(
    select 1
    from public.athletes a
    join public.coach_assignments ca on ca.athlete_id=a.id
    where a.user_id=v_uid
      and ca.status::text='active'
      and (v_coach is null or ca.coach_user_id=v_coach)
  ) into v_has_coach;

  if not v_age_verified then
    return jsonb_build_object(
      'access_mode','age_verification_required',
      'has_access',v_has_access,
      'billing_type',v_billing_type,
      'responsible_coach_user_id',case when v_coach is null then null else v_coach::text end,
      'coach_access_tier',v_tier,
      'age_verified',false,
      'age_verification_required',true,
      'athlete_app',true,
      'coach_assigned_training',false,
      'messaging',false,
      'basic_coach_mw',false,
      'pace_tracking',false,
      'ai_intelligence',false,
      'mw_training_system',false,
      'strength_power',false,
      'sprint_school',false,
      'smart_entry',false,
      'advanced_performance_tools',false
    );
  end if;

  v_individual_full := v_has_access
    and not v_internal_test
    and not v_pilot
    and v_billing_type <> 'coach_sponsored'
    and v_ent.source <> 'transition_grace';

  v_ai_intelligence := v_internal_test
    or v_individual_full
    or (v_billing_type in ('coach_sponsored','coach_pilot') and v_tier in ('intelligence','mw_sprint_performance'));

  v_mw_full := v_internal_test
    or v_individual_full
    or (v_billing_type in ('coach_sponsored','coach_pilot') and v_tier='mw_sprint_performance');

  return jsonb_build_object(
    'access_mode',case
      when v_internal_test then 'internal_test'
      when v_individual_full then 'individual_full'
      when v_pilot then 'coach_'||v_tier||'_pilot'
      when v_billing_type='coach_sponsored' and v_tier='core' then 'coach_core'
      when v_billing_type='coach_sponsored' and v_tier='intelligence' then 'coach_intelligence'
      when v_billing_type='coach_sponsored' and v_tier='mw_sprint_performance' then 'coach_sprint_performance'
      when v_billing_type='coach_sponsored' then 'coach_sponsored_unresolved'
      else 'limited'
    end,
    'has_access',v_has_access,
    'billing_type',v_billing_type,
    'responsible_coach_user_id',case when v_coach is null then null else v_coach::text end,
    'coach_access_tier',v_tier,
    'age_verified',v_age_verified,
    'age_verification_required',false,
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
$function$;

CREATE OR REPLACE FUNCTION public.mw_my_membership_status()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_row public.membership_entitlements%rowtype;
  v_billing_type text;
  v_can_continue boolean := false;
  v_features jsonb;
begin
  if private.mw_authenticated_uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;

  v_features := private.mw_athlete_access_profile();

  select e.* into v_row
  from public.membership_entitlements e
  where e.user_id=private.mw_authenticated_uid()
  order by
    case when e.status in ('active','trialing','cancelled') and e.access_starts_at<=now() and (e.access_ends_at is null or e.access_ends_at>now()) then 0 else 1 end,
    case when e.source='internal_test' then 0 when e.source='coach_sponsored' then 1 when e.source='coach_pilot' then 3 else 2 end,
    e.updated_at desc
  limit 1;

  if v_row.id is null then
    return jsonb_build_object(
      'has_access',false,
      'status','awaiting_activation',
      'plan_code','mw_athlete',
      'billing_type','self_pay',
      'access_mode',v_features->>'access_mode',
      'feature_access',v_features
    );
  end if;

  v_billing_type:=coalesce(v_row.metadata->>'billing_type',case when v_row.source='coach_sponsored' then 'coach_sponsored' else 'individual' end);
  v_can_continue:=(v_billing_type='coach_sponsored' and v_row.access_ends_at is not null and v_row.access_ends_at<=now()+interval '30 days');

  return jsonb_build_object(
    'has_access',coalesce((v_features->>'has_access')::boolean,false),
    'status',v_row.status,
    'plan_code',v_row.plan_code,
    'access_starts_at',v_row.access_starts_at,
    'access_ends_at',v_row.access_ends_at,
    'billing_type',v_billing_type,
    'responsible_coach_user_id',coalesce(v_features->>'responsible_coach_user_id',v_row.metadata->>'responsible_coach_user_id'),
    'coach_access_tier',coalesce(v_features->>'coach_access_tier',v_row.metadata->>'coach_access_tier'),
    'sponsored_athlete_price_cents',v_row.metadata->>'sponsored_athlete_price_cents',
    'can_continue_self_pay',v_can_continue,
    'self_pay_requested_at',v_row.metadata->>'self_pay_requested_at',
    'access_mode',v_features->>'access_mode',
    'feature_access',v_features
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.mw_billing_status()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := private.mw_authenticated_uid();
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
  v_sponsor_package_id uuid;
  v_pilot_features jsonb;
begin
  if v_uid is null then raise exception 'Authentication required' using errcode='42501'; end if;
  perform public.mw_apply_due_billing_transitions(v_uid);

  -- Abandoned provider handoffs should not trap the member in a permanent
  -- "pending" state. Stripe-backed transitions register a provider reference
  -- immediately; Apple handoffs that never finish can be retried after timeout.
  update public.billing_transitions
  set status='cancelled',
      metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
        'cancel_reason','provider_handoff_timeout',
        'cancelled_at',now()
      ),
      updated_at=now()
  where beneficiary_user_id=v_uid
    and status in ('requested','awaiting_payment','awaiting_provider','scheduled')
    and provider_reference is null
    and coalesce(metadata->>'payment_confirmed','false')<>'true'
    and created_at < now()-interval '2 hours';

  update public.billing_transitions
  set status='failed',
      metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
        'failure_closed_at',now(),
        'failure_close_reason','stripe_pending_update_expired'
      ),
      updated_at=now()
  where beneficiary_user_id=v_uid
    and audience='coach'
    and transition_type='plan_change'
    and direction='upgrade'
    and status='awaiting_payment'
    and coalesce(metadata->>'payment_failed','false')='true'
    and nullif(metadata->>'last_payment_failed_at','')::timestamptz < now()-interval '25 hours';

  update public.billing_subscriptions b
  set pending_plan_code=null,
      pending_billing_type=null,
      pending_billing_cycle=null,
      pending_payer_user_id=null,
      pending_effective_at=null,
      updated_at=now()
  where b.beneficiary_user_id=v_uid
    and b.pending_plan_code is not null
    and not exists(
      select 1 from public.billing_transitions t
      where t.beneficiary_user_id=v_uid
        and t.status in ('requested','awaiting_payment','awaiting_provider','scheduled')
        and t.to_plan_code=b.pending_plan_code
    );

  select * into v_profile from public.profiles where user_id=v_uid;
  if v_profile.user_id is null then raise exception 'MW profile not found' using errcode='P0002'; end if;
  if v_profile.role::text='athlete' then
   v_pilot_features:=private.mw_athlete_access_profile();
   if v_pilot_features->>'billing_type'='coach_pilot' and (v_pilot_features->>'has_access')::boolean then
    return jsonb_build_object('audience','athlete','current_plan_code','mw_athlete','billing_type','coach_pilot',
     'billing_cycle','pilot','provider','complimentary_pilot','subscription_status','active','payment_required',false,
     'current_period_end',null,'pending_transition',null,'responsible_coach_user_id',v_pilot_features->>'responsible_coach_user_id',
     'feature_access',v_pilot_features);
   end if;
  elsif private.mw_coach_pilot_active(v_uid) then
   return jsonb_build_object('audience','coach','current_plan_code','coach_intelligence','current_tier','intelligence',
    'billing_type','coach_pilot','billing_cycle','pilot','provider','complimentary_pilot','subscription_status','active',
    'payment_required',false,'sponsored_billing_active',false,'sponsored_seats_total',0,'sponsored_seats_available',0,'pending_transition',null);
  end if;

  select * into v_sub
  from public.billing_subscriptions
  where beneficiary_user_id=v_uid
    and audience=case when v_profile.role::text in ('coach','admin','founder_owner') then 'coach' else 'athlete' end
  limit 1;

  select * into v_transition
  from public.billing_transitions
  where beneficiary_user_id=v_uid
    and status in ('requested','awaiting_payment','awaiting_provider','scheduled')
  order by created_at desc
  limit 1;

  if v_profile.role::text in ('coach','admin','founder_owner') then
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

    select p.id into v_sponsor_package_id
    from public.coach_sponsorship_packages p
    where p.coach_user_id=v_uid
      and p.status in ('active','cancel_at_period_end')
    order by p.created_at desc
    limit 1;

    if v_sponsor_package_id is not null then
      perform private.mw_sync_sponsor_seats(v_sponsor_package_id);
    end if;

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
      'subscription_status',coalesce(v_sub.status,'awaiting_activation'),
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
        'payment_confirmed',coalesce(v_transition.metadata->>'payment_confirmed','false'),
        'payment_failed',coalesce(v_transition.metadata->>'payment_failed','false'),
        'last_payment_failed_at',v_transition.metadata->>'last_payment_failed_at',
        'last_payment_failure_message',v_transition.metadata->>'last_payment_failure_message'
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
$function$;


create function public.mw_pilot_invitation_status(p_invite_token text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_uid uuid:=private.mw_authenticated_uid(); v_inv public.coach_invitations; v_email text; v_p public.profiles; v_dob date; v_coach text;
begin
 if v_uid is null then raise exception 'Authentication required' using errcode='42501'; end if;
 select lower(trim(email)) into v_email from auth.users where id=v_uid;
 select * into v_inv from public.coach_invitations where invite_token=p_invite_token and billing_type='coach_pilot'
  and lower(trim(athlete_email))=v_email and status in ('pending','accepted') and (expires_at is null or expires_at>now())
  and (status='pending' or accepted_by=v_uid) limit 1;
 if v_inv.id is null or not private.mw_coach_pilot_active(v_inv.coach_user_id) then
  raise exception 'This pilot invitation is invalid, expired, ended, or assigned to another email' using errcode='42501';
 end if;
 select * into v_p from public.profiles where user_id=v_uid;
 if v_p.role::text is distinct from 'athlete' or v_p.account_status::text not in ('invited','active','paused') then
  raise exception 'Eligible athlete account required' using errcode='42501'; end if;
 select date_of_birth into v_dob from public.athletes where user_id=v_uid;
 select trim(concat_ws(' ',first_name,last_name)) into v_coach from public.profiles where user_id=v_inv.coach_user_id;
 return jsonb_build_object('email',v_email,'coach_name',v_coach,'first_name',v_p.first_name,'last_name',v_p.last_name,
  'registration_complete',v_dob is not null and v_dob<=(current_date-interval '13 years')::date
   and coalesce(trim(v_p.last_name),'')<>'' and coalesce(trim(v_p.first_name),'')<>'',
  'payment_required',false,'access_tier',v_inv.sponsor_access_tier);
end;$$;
revoke all on function public.mw_pilot_invitation_status(text) from public,anon;
grant execute on function public.mw_pilot_invitation_status(text) to authenticated;

create function public.mw_complete_coach_pilot_registration(p_invite_token text,p_first_name text default null,p_last_name text default null,p_date_of_birth date default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_uid uuid:=private.mw_authenticated_uid(); v_status jsonb; v_dob date; v_first text; v_last text; v_result jsonb;
begin
 v_status:=public.mw_pilot_invitation_status(p_invite_token);
 select coalesce(p_date_of_birth,date_of_birth) into v_dob from public.athletes where user_id=v_uid;
 v_first:=left(trim(coalesce(nullif(trim(p_first_name),''),v_status->>'first_name','')),80);
 v_last:=left(trim(coalesce(nullif(trim(p_last_name),''),v_status->>'last_name','')),80);
 if v_dob is null or v_dob>(current_date-interval '13 years')::date then
  raise exception 'MW Dynasty athlete accounts require age 13 or older' using errcode='22023'; end if;
 if v_first='' or v_last='' then raise exception 'First and last name are required' using errcode='22023'; end if;
 update public.athletes set date_of_birth=v_dob,training_context='coach_team',updated_at=now() where user_id=v_uid;
 update public.profiles set first_name=v_first,last_name=v_last,updated_at=now() where user_id=v_uid;
 v_result:=public.mw_accept_coach_invitation(p_invite_token);
 return v_result||jsonb_build_object('payment_required',false,'pilot_active',true);
end;$$;
revoke all on function public.mw_complete_coach_pilot_registration(text,text,text,date) from public,anon;
grant execute on function public.mw_complete_coach_pilot_registration(text,text,text,date) to authenticated;
