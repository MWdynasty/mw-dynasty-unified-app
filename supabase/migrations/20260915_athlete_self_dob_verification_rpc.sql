-- MW Dynasty V3.0.15
-- Allow an authenticated athlete with a legacy/null DOB to complete 13+ verification without exposing broad athlete-table writes.

create or replace function public.mw_set_athlete_date_of_birth(p_date_of_birth date)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_athlete_id uuid;
begin
  if v_uid is null then
    raise exception 'Authentication required' using errcode='42501';
  end if;
  if p_date_of_birth is null then
    raise exception 'Date of birth is required' using errcode='22023';
  end if;
  if p_date_of_birth > current_date - interval '13 years' then
    raise exception 'MW Dynasty athlete accounts require age 13 or older' using errcode='22023';
  end if;
  if not exists(
    select 1 from public.profiles p
    where p.user_id=v_uid and p.role::text='athlete' and p.account_status::text <> 'disabled'
  ) then
    raise exception 'Athlete account required' using errcode='42501';
  end if;

  update public.athletes a
  set date_of_birth=p_date_of_birth
  where a.user_id=v_uid
  returning a.id into v_athlete_id;

  if v_athlete_id is null then
    raise exception 'Athlete profile not found' using errcode='P0002';
  end if;

  return jsonb_build_object('ok',true,'date_of_birth',p_date_of_birth,'age_verified',true);
end;
$function$;

revoke all on function public.mw_set_athlete_date_of_birth(date) from public, anon;
grant execute on function public.mw_set_athlete_date_of_birth(date) to authenticated;
