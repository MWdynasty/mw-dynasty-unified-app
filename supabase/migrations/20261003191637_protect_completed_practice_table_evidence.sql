begin;

-- Keep existing grants/RLS intact; enforce durable evidence on every write path,
-- including direct PostgREST mutations. Draft athlete reps remain editable.
create function private.mw_protect_completed_practice_evidence()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_row jsonb;
  v_athlete uuid;
  v_key text;
  v_session uuid;
  v_protected boolean;
begin
  if tg_op='UPDATE' and to_jsonb(new)=to_jsonb(old) then return new; end if;
  v_row:=case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end;
  v_athlete:=(v_row->>'athlete_id')::uuid;
  v_key:=v_row->>'workout_key';
  if tg_table_name='coach_practice_timing_results' then
    v_session:=(v_row->>'session_id')::uuid;
    if v_session is not null then
      perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('mw-practice-session|' || v_session::text,0));
    end if;
  end if;
  if v_key is not null then
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_athlete::text || '|' || v_key,0));
  end if;
  v_protected:=exists(select 1 from public.workout_completions where athlete_id=v_athlete and workout_key=v_key and completion_status='completed');
  if tg_table_name='coach_practice_timing_results' then
    v_protected:=v_protected or exists(select 1 from public.athlete_practice_rep_results where coach_session_id=v_session);
    if tg_op='UPDATE' then
      v_protected:=v_protected or exists(select 1 from public.athlete_practice_rep_results where coach_session_id=old.session_id);
    end if;
  elsif tg_op in ('UPDATE','DELETE') then
    -- Even removing/changing the session linkage cannot unlock coach evidence.
    v_protected:=v_protected or old.coach_session_id is not null;
    if tg_op='UPDATE' then
      v_protected:=v_protected or exists(select 1 from public.workout_completions where athlete_id=old.athlete_id and workout_key=old.workout_key and completion_status='completed');
    end if;
  end if;
  if v_protected then raise exception 'Completed practice evidence is immutable' using errcode='42501'; end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end
$function$;
revoke all on function private.mw_protect_completed_practice_evidence() from public,anon,authenticated;

-- Names sort after the canonical identity triggers, so aliases are normalized.
create trigger mw_protect_completed_coach_evidence
before insert or update or delete on public.coach_practice_timing_results
for each row execute function private.mw_protect_completed_practice_evidence();
create trigger mw_protect_completed_athlete_evidence
before insert or update or delete on public.athlete_practice_rep_results
for each row execute function private.mw_protect_completed_practice_evidence();

commit;
