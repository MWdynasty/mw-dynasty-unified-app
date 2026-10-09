-- Extend the existing authenticated profile updater without changing its access checks.
do $migration$
declare
  definition text;
begin
  select pg_get_functiondef('public.mw_update_athlete_profile(text,jsonb)'::regprocedure)
    into definition;
  if position('array[''60m'',''100m'',''200m'',''300m'',''400m'']' in definition) = 0 then
    raise exception 'Unexpected athlete profile updater; review before extending PR distances';
  end if;
  definition := replace(definition,
    'array[''60m'',''100m'',''200m'',''300m'',''400m'']',
    'array[''60m'',''100m'',''150m'',''200m'',''300m'',''400m'',''500m'']');
  execute definition;
end;
$migration$;
