-- MW Dynasty production migration
-- Applied to Supabase project keqgunlfwhjgcsurynef as 20260920124600 sponsor_seat_allocator
-- Captured from supabase_migrations.schema_migrations on 2026-09-20.

create or replace function private.mw_sync_sponsor_seats(p_package_id uuid)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  v_requested integer;
  v_current integer;
  v_next integer;
begin
  select requested_seats into v_requested
  from public.coach_sponsorship_packages
  where id=p_package_id
  for update;

  if v_requested is null then
    raise exception 'Sponsorship package not found';
  end if;

  select count(*)::integer into v_current
  from public.coach_sponsor_seats
  where package_id=p_package_id
    and status not in ('ended');

  if v_current < v_requested then
    for v_next in 1..v_requested loop
      insert into public.coach_sponsor_seats(package_id,seat_number,status)
      values(p_package_id,v_next,'available')
      on conflict(package_id,seat_number) do nothing;
    end loop;
  elsif v_current > v_requested then
    -- Only unused seats may be removed automatically. Active/invited seats are preserved
    -- so a quantity reduction can never silently remove an athlete.
    delete from public.coach_sponsor_seats s
    where s.package_id=p_package_id
      and s.status='available'
      and s.seat_number > v_requested;
  end if;
end;
$$;

revoke all on function private.mw_sync_sponsor_seats(uuid) from public, anon, authenticated;
grant execute on function private.mw_sync_sponsor_seats(uuid) to service_role;

comment on function private.mw_sync_sponsor_seats(uuid) is
'Server-only seat allocator used after paid coach package creation or quantity changes. Never removes claimed/active/invited athletes automatically.';
