-- MW Dynasty production migration
-- Applied to Supabase project keqgunlfwhjgcsurynef as 20260920123714 gate_coach_access_on_payment_and_seed_athlete_onboarding
-- Captured from supabase_migrations.schema_migrations on 2026-09-20.

CREATE OR REPLACE FUNCTION public.mw_provision_new_athlete()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_athlete_id uuid;
  v_first_name text;
  v_last_name text;
  v_email text;
  v_has_access boolean := false;
  v_sponsored_invite boolean := false;
  v_account_status public.mw_account_status := 'invited'::public.mw_account_status;
  v_dob date;
  v_application_id uuid;
  v_preapproved_coach boolean := false;
begin
  v_first_name:=nullif(trim(coalesce(new.raw_user_meta_data->>'first_name','')),'');
  v_last_name:=nullif(trim(coalesce(new.raw_user_meta_data->>'last_name','')),'');
  v_email:=lower(trim(coalesce(new.email,'')));

  if nullif(trim(coalesce(new.raw_user_meta_data->>'date_of_birth','')),'') is not null then
    begin
      v_dob := (new.raw_user_meta_data->>'date_of_birth')::date;
    exception when others then
      raise exception 'A valid date of birth is required' using errcode='22023';
    end;
  end if;

  -- User metadata is never sufficient to authorize a coach role. The application id
  -- is only a lookup key; authorization comes from a server-reviewed application row.
  if nullif(trim(coalesce(new.raw_user_meta_data->>'mw_application_id','')),'') is not null then
    begin
      v_application_id := (new.raw_user_meta_data->>'mw_application_id')::uuid;
    exception when others then
      v_application_id := null;
    end;
  end if;

  if v_application_id is not null and v_email<>'' then
    select exists(
      select 1
      from public.coach_access_applications ca
      join public.profiles reviewer on reviewer.user_id=ca.reviewed_by
      where ca.id=v_application_id
        and lower(trim(ca.email))=v_email
        and ca.status in ('approved','invited')
        and ca.payment_status='paid'
        and ca.verification_status in ('approved','auto_approved')
        and ca.access_tier in ('core','intelligence','mw_sprint_performance')
        and ca.reviewed_by is not null
        and reviewer.account_status='active'::public.mw_account_status
        and reviewer.role in ('founder_owner'::public.mw_app_role,'admin'::public.mw_app_role)
    ) into v_preapproved_coach;
  end if;

  if v_preapproved_coach then
    insert into public.profiles(user_id,first_name,last_name,role,account_status)
    values(new.id,coalesce(v_first_name,'Coach'),v_last_name,'coach'::public.mw_app_role,'invited'::public.mw_account_status)
    on conflict(user_id) do update set
      first_name=excluded.first_name,
      last_name=excluded.last_name,
      role='coach'::public.mw_app_role,
      account_status='invited'::public.mw_account_status,
      updated_at=now();
    return new;
  end if;

  if v_email<>'' then
    select exists(
      select 1 from public.membership_entitlements e
      where e.email_normalized=v_email
        and e.status in ('active','trialing','cancelled')
        and e.access_starts_at<=now()
        and (e.access_ends_at is null or e.access_ends_at>now())
    ) into v_has_access;

    select exists(
      select 1 from public.coach_invitations ci
      where lower(trim(ci.athlete_email))=v_email
        and ci.status='pending'
        and ci.billing_type='coach_sponsored'
        and (ci.expires_at is null or ci.expires_at>now())
        and (ci.sponsorship_ends_at is null or ci.sponsorship_ends_at>now())
    ) into v_sponsored_invite;
  end if;

  if v_has_access or v_sponsored_invite then
    v_account_status:='active'::public.mw_account_status;
  end if;

  insert into public.profiles(user_id,first_name,last_name,role,account_status)
  values(new.id,coalesce(v_first_name,'Athlete'),v_last_name,'athlete'::public.mw_app_role,v_account_status)
  on conflict(user_id) do update set
    first_name=coalesce(excluded.first_name,public.profiles.first_name),
    last_name=coalesce(excluded.last_name,public.profiles.last_name),
    updated_at=now();

  insert into public.athletes(user_id,date_of_birth)
  values(new.id,v_dob)
  on conflict(user_id) do update set date_of_birth=coalesce(excluded.date_of_birth,public.athletes.date_of_birth);

  update public.membership_entitlements
  set user_id=new.id,updated_at=now()
  where email_normalized=v_email and user_id is distinct from new.id;

  select id into v_athlete_id from public.athletes where user_id=new.id limit 1;
  if v_athlete_id is not null then
    insert into public.athlete_program_state(athlete_id) values(v_athlete_id) on conflict(athlete_id) do nothing;
    insert into public.athlete_settings(athlete_id) values(v_athlete_id) on conflict(athlete_id) do nothing;
  end if;

  insert into public.onboarding_journeys(
    user_id,audience,channel,stage,status,verification_status,selected_plan_code,
    payment_status,assessment_status,last_completed_stage,metadata
  )
  values(
    new.id,
    'athlete',
    case
      when coalesce(new.raw_user_meta_data->>'signup_source','')='ios' then 'ios'
      when coalesce(new.raw_user_meta_data->>'signup_source','')='android' then 'android'
      else 'website'
    end,
    case when v_has_access or v_sponsored_invite then 'profile' else 'membership' end,
    'in_progress',
    'not_required',
    case when v_has_access then 'mw_athlete' else null end,
    case when v_has_access or v_sponsored_invite then 'paid' else 'ready' end,
    'not_started',
    'account',
    jsonb_build_object('signup_source',coalesce(new.raw_user_meta_data->>'signup_source','website'))
  )
  on conflict (user_id,audience) where user_id is not null
  do update set
    channel=excluded.channel,
    stage=excluded.stage,
    status='in_progress',
    payment_status=excluded.payment_status,
    updated_at=now();

  return new;
end;
$function$
