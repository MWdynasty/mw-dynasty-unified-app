begin;

-- Classification is part of saved rep evidence. The optional intelligence RPC
-- must not be responsible for copying it into the athlete's history.
-- Keep the existing function identity, privileges, assignment checks and locks.
do $migration$
declare
  v_before text := pg_get_functiondef('public.mw_coach_sync_practice_session_to_athlete(uuid,uuid,integer,integer,integer,text,integer,uuid,uuid)'::regprocedure);
  v_after text;
begin
  if position('mw_intent' in v_before)>0 then
    raise exception 'Practice sync already handles intent; review before applying';
  end if;
  v_after := regexp_replace(v_before,
    '(lane_number\s*,\s*division)(\s*\)\s*select)',
    '\1,mw_intent,mw_interpretation\2');
  if v_after=v_before then raise exception 'Practice rep insert columns changed'; end if;
  v_before := v_after;
  v_after := regexp_replace(v_after,
    'r\.division(\s+from public\.coach_practice_timing_results r)',
    'r.division,r.mw_intent,r.mw_interpretation\1');
  if v_after=v_before then raise exception 'Practice rep select changed'; end if;
  v_before := v_after;
  v_after := replace(v_after,'division=excluded.division;',
    'division=excluded.division,mw_intent=excluded.mw_intent,mw_interpretation=excluded.mw_interpretation;');
  if v_after=v_before then raise exception 'Practice rep update changed'; end if;
  execute v_after;
end
$migration$;

commit;
