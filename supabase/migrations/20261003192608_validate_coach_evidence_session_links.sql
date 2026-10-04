begin;

-- A new linkage is also evidence: reject forged links on otherwise editable
-- athlete drafts. The legitimate bridge has already written its exact raw row.
do $migration$
declare
  v_before text := pg_get_functiondef('private.mw_protect_completed_practice_evidence()'::regprocedure);
  v_after text;
begin
  v_after:=replace(v_before, E'  if v_key is not null then', $guard$
  if tg_table_name='athlete_practice_rep_results' and tg_op<>'DELETE' and (v_row->>'coach_session_id') is not null then
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('mw-practice-session|' || new.coach_session_id::text,0));
    if private.mw_current_role()::text not in ('coach','admin','founder_owner') or not exists (
      select 1 from public.coach_practice_timing_results r
      where r.session_id=new.coach_session_id and r.coach_user_id=new.coach_user_id
        and r.athlete_id=new.athlete_id and r.workout_key=new.workout_key and r.rep_number=new.rep_number
    ) then raise exception 'Coach evidence session linkage is immutable' using errcode='42501'; end if;
  end if;
  if v_key is not null then$guard$);
  if v_after=v_before then raise exception 'Evidence trigger lock block changed'; end if;
  execute v_after;
end
$migration$;

-- Compare using the athlete table's actual numeric types/precision. Older
-- installations store hundredths while coach receipts retain milliseconds.
do $migration$
declare
  v_before text := pg_get_functiondef('public.mw_coach_sync_practice_session_to_athlete(uuid,uuid,integer,integer,integer,text,integer,uuid,uuid)'::regprocedure);
  v_after text;
begin
  v_after:=replace(v_before,E'      left join public.athlete_practice_rep_results ar on ar.athlete_id=r.athlete_id',E'      cross join lateral jsonb_populate_record(null::public.athlete_practice_rep_results,to_jsonb(r)) normalized\n      left join public.athlete_practice_rep_results ar on ar.athlete_id=r.athlete_id');
  if v_after=v_before then raise exception 'Completed sync comparison join changed'; end if;
  v_before:=v_after;
  v_after:=replace(v_after,'row(r.time_seconds,r.target_seconds,r.target_min_seconds,r.target_max_seconds,r.actual_rest_seconds,', 'row(normalized.time_seconds,normalized.target_seconds,normalized.target_min_seconds,normalized.target_max_seconds,normalized.actual_rest_seconds,');
  if v_after=v_before then raise exception 'Completed sync numeric comparison changed'; end if;
  execute v_after;
end
$migration$;

commit;
