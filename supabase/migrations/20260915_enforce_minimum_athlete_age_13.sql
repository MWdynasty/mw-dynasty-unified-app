-- MW Dynasty athlete accounts require age 13+.
create or replace function private.mw_enforce_athlete_min_age()
returns trigger
language plpgsql
set search_path=''
as $$
begin
  if new.date_of_birth is not null and new.date_of_birth > current_date - interval '13 years' then
    raise exception 'MW Dynasty requires athletes to be at least 13 years old' using errcode='22023';
  end if;
  return new;
end;
$$;

drop trigger if exists mw_athletes_min_age_13 on public.athletes;
create trigger mw_athletes_min_age_13
before insert or update of date_of_birth on public.athletes
for each row execute function private.mw_enforce_athlete_min_age();
