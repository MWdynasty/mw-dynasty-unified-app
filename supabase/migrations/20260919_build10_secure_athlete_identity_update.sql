create or replace function public.mw_update_athlete_identity(
  p_first_name text,
  p_last_name text
)
returns jsonb
language plpgsql
security definer
set search_path = 'public','private','pg_temp'
as $function$
declare
  v_uid uuid := auth.uid();
  v_first text := left(trim(coalesce(p_first_name,'')),80);
  v_last text := left(trim(coalesce(p_last_name,'')),80);
begin
  if v_uid is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if v_first='' or v_last='' then raise exception 'First and last name are required' using errcode='22023'; end if;
  if not exists(
    select 1 from public.profiles p
    join public.athletes a on a.user_id=p.user_id
    where p.user_id=v_uid
      and p.role='athlete'::public.mw_app_role
      and p.account_status='active'::public.mw_account_status
  ) then raise exception 'Active athlete profile not found' using errcode='42501'; end if;
  update public.profiles set first_name=v_first,last_name=v_last,updated_at=now() where user_id=v_uid;
  return jsonb_build_object('ok',true,'firstName',v_first,'lastName',v_last);
end;
$function$;
revoke all on function public.mw_update_athlete_identity(text,text) from public;
grant execute on function public.mw_update_athlete_identity(text,text) to authenticated;
