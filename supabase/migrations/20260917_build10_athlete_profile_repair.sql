-- MW Dynasty Build 10 — Athlete profile/link repair

-- Ensure every athlete profile has its required athlete record.
insert into public.athletes (user_id)
select p.user_id
from public.profiles p
join auth.users u on u.id = p.user_id
where p.role = 'athlete'::public.mw_app_role
  and not exists (
    select 1
    from public.athletes a
    where a.user_id = p.user_id
  )
on conflict (user_id) do nothing;

-- Ensure every athlete has program state.
insert into public.athlete_program_state (athlete_id)
select a.id
from public.athletes a
where not exists (
  select 1
  from public.athlete_program_state aps
  where aps.athlete_id = a.id
)
on conflict (athlete_id) do nothing;

-- Ensure every athlete has settings.
insert into public.athlete_settings (athlete_id)
select a.id
from public.athletes a
where not exists (
  select 1
  from public.athlete_settings aset
  where aset.athlete_id = a.id
)
on conflict (athlete_id) do nothing;

-- Remove the Build 10 temporary trigger name if it was ever created.
drop trigger if exists mw_build10_provision_new_athlete on auth.users;

-- Ensure provisioning exists without creating a second trigger that calls
-- public.mw_provision_new_athlete(). Production already uses
-- mw_on_auth_user_created, so this block leaves that trigger untouched.
do $$
begin
  if not exists (
    select 1
    from pg_trigger t
    where t.tgrelid = 'auth.users'::regclass
      and not t.tgisinternal
      and t.tgfoid = 'public.mw_provision_new_athlete()'::regprocedure
  ) then
    create trigger mw_on_auth_user_created
    after insert on auth.users
    for each row
    execute function public.mw_provision_new_athlete();
  end if;
end
$$;
