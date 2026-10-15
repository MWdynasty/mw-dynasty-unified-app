-- Activity is a bounded, one-row-per-account summary. No content or device IDs.
create table private.mw_account_activity (
  user_id uuid primary key references auth.users(id) on delete cascade,
  last_active_at timestamptz not null,
  last_active_surface text not null check (last_active_surface in ('coach','athlete')),
  last_active_platform text not null check (last_active_platform in ('web','ios'))
);
alter table private.mw_account_activity enable row level security;
-- Intentionally no direct client access/policies. Only checked functions may access this ledger.
revoke all on private.mw_account_activity from public,anon,authenticated;

create function private.mw_record_account_activity(p_platform text default 'web')
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.mw_authenticated_uid();
  v_role text;
  v_now timestamptz := clock_timestamp();
begin
  if auth.uid() is null or v_uid is null then
    raise exception 'Active authenticated session required' using errcode='42501';
  end if;
  select p.role::text into v_role from public.profiles p
    where p.user_id=v_uid and p.account_status::text='active';
  if v_role is null or v_role not in ('coach','athlete') then
    raise exception 'Active Coach or Athlete account required' using errcode='42501';
  end if;
  if p_platform is null or p_platform not in ('web','ios') then
    raise exception 'Unknown app platform' using errcode='22023';
  end if;
  insert into private.mw_account_activity as activity(user_id,last_active_at,last_active_surface,last_active_platform)
    values(v_uid,v_now,v_role,p_platform)
    on conflict(user_id) do update set
      last_active_at=excluded.last_active_at,
      last_active_surface=excluded.last_active_surface,
      last_active_platform=excluded.last_active_platform
    where activity.last_active_at < excluded.last_active_at - interval '60 seconds';
  return true;
end $$;

create function public.mw_record_account_activity(p_platform text default 'web')
returns boolean language sql security invoker set search_path = '' as $$
  select private.mw_record_account_activity(p_platform);
$$;

create function private.mw_founder_account_activity()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null or private.mw_authenticated_uid() is null
    or not private.mw_is_founder()
    or not exists(select 1 from public.profiles p where p.user_id=auth.uid()
      and p.role::text='founder_owner' and p.account_status::text='active') then
    raise exception 'Founder / Owner access required' using errcode='42501';
  end if;
  return jsonb_build_object('generated_at',now(),'items',coalesce((
    select jsonb_agg(jsonb_build_object(
      'user_id',p.user_id,
      'last_sign_in_at',u.last_sign_in_at,
      'last_active_at',a.last_active_at,
      'last_active_surface',a.last_active_surface,
      'last_active_platform',a.last_active_platform
    ) order by p.user_id)
    from public.profiles p
    join auth.users u on u.id=p.user_id
    left join private.mw_account_activity a on a.user_id=p.user_id
    where p.role::text in ('coach','athlete')
  ),'[]'::jsonb));
end $$;

create function public.mw_founder_account_activity()
returns jsonb language sql stable security invoker set search_path = '' as $$
  select private.mw_founder_account_activity();
$$;

revoke all on function private.mw_record_account_activity(text) from public,anon;
revoke all on function public.mw_record_account_activity(text) from public,anon;
revoke all on function private.mw_founder_account_activity() from public,anon;
revoke all on function public.mw_founder_account_activity() from public,anon;
grant execute on function private.mw_record_account_activity(text), public.mw_record_account_activity(text),
  private.mw_founder_account_activity(), public.mw_founder_account_activity() to authenticated;
