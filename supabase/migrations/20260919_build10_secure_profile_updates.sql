drop policy if exists "athletes update own profile assessment names" on public.profiles;

create or replace function public.mw_update_coach_profile(
  p_first_name text,
  p_last_name text,
  p_organization text default null,
  p_coach_title text default null
)
returns jsonb
language plpgsql
security definer
set search_path = 'public','private','pg_temp'
as $function$
declare
  v_uid uuid := auth.uid();
  v_role public.mw_app_role;
  v_first text := left(trim(coalesce(p_first_name,'')),80);
  v_last text := left(trim(coalesce(p_last_name,'')),80);
  v_org text := nullif(left(trim(coalesce(p_organization,'')),160),'');
  v_title text := nullif(left(trim(coalesce(p_coach_title,'')),120),'');
begin
  if v_uid is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if v_first='' or v_last='' then raise exception 'First and last name are required' using errcode='22023'; end if;

  select p.role into v_role
  from public.profiles p
  where p.user_id=v_uid and p.account_status='active'::public.mw_account_status
  limit 1;

  if v_role is null or v_role not in ('coach'::public.mw_app_role,'admin'::public.mw_app_role,'founder_owner'::public.mw_app_role) then
    raise exception 'Active Coach access required' using errcode='42501';
  end if;

  update public.profiles
  set first_name=v_first,last_name=v_last,coach_organization=v_org,coach_title=v_title,updated_at=now()
  where user_id=v_uid;

  return jsonb_build_object('ok',true,'firstName',v_first,'lastName',v_last,'organization',coalesce(v_org,''),'coachTitle',coalesce(v_title,''));
end;
$function$;

revoke all on function public.mw_update_coach_profile(text,text,text,text) from public;
grant execute on function public.mw_update_coach_profile(text,text,text,text) to authenticated;
