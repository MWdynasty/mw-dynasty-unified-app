-- Persist MW workout-intent interpretation with canonical practice history.
alter table public.athlete_practice_rep_results
  add column if not exists mw_intent text,
  add column if not exists mw_interpretation text;

alter table public.coach_practice_timing_results
  add column if not exists mw_intent text,
  add column if not exists mw_interpretation text;

create or replace function public.mw_coach_sync_practice_intelligence(p_session_id uuid,p_athlete_id uuid,p_workout_key text)
returns integer language plpgsql security definer set search_path='' as $$
declare v_uid uuid:=auth.uid(); v_role text; v_count integer;
begin
 if v_uid is null then raise exception 'Authentication required' using errcode='42501'; end if;
 v_role:=private.mw_current_role()::text;
 if v_role not in ('coach','admin','founder_owner') then raise exception 'Coach access required' using errcode='42501'; end if;
 if v_role='coach' and not private.mw_coach_is_assigned(p_athlete_id) then raise exception 'Athlete not assigned' using errcode='42501'; end if;
 update public.athlete_practice_rep_results a
 set mw_intent=c.mw_intent,mw_interpretation=c.mw_interpretation,
 pace_status=case when c.mw_interpretation in ('above_target','on_target') then 'on_pace' when c.pace_status in ('fast','slow') then 'outside_target' else coalesce(c.pace_status,a.pace_status) end
 from public.coach_practice_timing_results c
 where c.session_id=p_session_id and c.athlete_id=p_athlete_id and c.rep_number=a.rep_number
 and a.athlete_id=p_athlete_id and a.workout_key=p_workout_key and (c.coach_user_id=v_uid or v_role in ('admin','founder_owner'));
 get diagnostics v_count=row_count; return v_count;
end $$;
revoke all on function public.mw_coach_sync_practice_intelligence(uuid,uuid,text) from public,anon;
grant execute on function public.mw_coach_sync_practice_intelligence(uuid,uuid,text) to authenticated;