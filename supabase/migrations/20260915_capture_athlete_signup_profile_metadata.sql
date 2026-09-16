-- MW Dynasty V3.0.15
-- Capture athlete last name and optional DOB from Supabase Auth signup metadata.
-- Existing clients that do not send DOB remain compatible; the 13+ trigger validates any DOB that is supplied.

create or replace function public.mw_provision_new_athlete()
returns trigger
language plpgsql
security definer
set search_path to 'public','auth','private'
as $function$
declare
  v_athlete_id uuid;
  v_first_name text;
  v_last_name text;
  v_email text;
  v_has_access boolean := false;
  v_sponsored_invite boolean := false;
  v_account_status public.mw_account_status := 'invited'::public.mw_account_status;
  v_account_type text;
  v_dob date;
begin
  v_first_name:=nullif(trim(coalesce(new.raw_user_meta_data->>'first_name','')),'');
  v_last_name:=nullif(trim(coalesce(new.raw_user_meta_data->>'last_name','')),'');
  v_email:=lower(trim(coalesce(new.email,'')));
  v_account_type:=coalesce(new.raw_user_meta_data->>'mw_account_type','');

  if nullif(trim(coalesce(new.raw_user_meta_data->>'date_of_birth','')),'') is not null then
    begin
      v_dob := (new.raw_user_meta_data->>'date_of_birth')::date;
    exception when others then
      raise exception 'A valid date of birth is required' using errcode='22023';
    end;
  end if;

  if v_account_type='vetted_coach' then
    insert into public.profiles(user_id,first_name,last_name,role,account_status)
    values(new.id,coalesce(v_first_name,'Coach'),v_last_name,'coach'::public.mw_app_role,'active'::public.mw_account_status)
    on conflict(user_id) do update set first_name=excluded.first_name,last_name=excluded.last_name,role='coach'::public.mw_app_role,account_status='active'::public.mw_account_status,updated_at=now();
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
  on conflict(user_id) do update set
    date_of_birth=coalesce(excluded.date_of_birth,public.athletes.date_of_birth);

  update public.membership_entitlements set user_id=new.id,updated_at=now()
  where email_normalized=v_email and user_id is distinct from new.id;

  select id into v_athlete_id from public.athletes where user_id=new.id limit 1;
  if v_athlete_id is not null then
    insert into public.athlete_program_state(athlete_id) values(v_athlete_id) on conflict(athlete_id) do nothing;
    insert into public.athlete_settings(athlete_id) values(v_athlete_id) on conflict(athlete_id) do nothing;
  end if;
  return new;
end;
$function$;
