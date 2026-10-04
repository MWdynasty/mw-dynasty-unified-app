begin;

-- Patch the reviewed live function without replacing its identity, owner, grants,
-- entitlement checks, history handling, or SECURITY DEFINER search_path.
do $migration$
declare
  v_before text := pg_get_functiondef('public.mw_refresh_own_program_state_local_core()'::regprocedure);
  v_after text;
begin
  if position('v_start_week := coalesce(v_state.starting_week,v_state.current_week,1);' in v_before)=0 then
    raise exception 'Unexpected legacy program refresh definition; review before applying';
  end if;
  v_after := replace(v_before,
    'v_start_week := coalesce(v_state.starting_week,v_state.current_week,1);',
    'v_start_week := coalesce(v_state.starting_week,1);');
  v_after := replace(v_after,'v_today date := current_date;',
    'v_today date := (now() at time zone private.mw_request_time_zone())::date;');
  v_after := replace(v_after,'v_iso_day integer := extract(isodow from current_date)::integer;',
    'v_iso_day integer := extract(isodow from v_today)::integer;');
  v_after := replace(v_after,'current_day=1,','current_day=v_iso_day,');
  if position('  if v_state.start_date is not null' in v_after)=0 then
    raise exception 'Legacy program refresh schedule guard is missing';
  end if;
  v_after := replace(v_after,'  if v_state.start_date is not null',
    '  if v_state.start_date is null then
    update public.athlete_program_state
    set current_day=v_iso_day,updated_at=now()
    where athlete_id=v_athlete and current_day is distinct from v_iso_day;
    v_state.current_day := v_iso_day;
  end if;

  if v_state.start_date is not null');
  execute v_after;
end
$migration$;

commit;
