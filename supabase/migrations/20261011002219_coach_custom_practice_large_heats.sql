-- Allow a four-lane heat to record the full 200-rep per-athlete prescription.
create or replace function public.mw_save_custom_coach_practice(p_session_id uuid,p_session_date date,p_results jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 v_uid uuid:=auth.uid(); v_role text; v_group record; v_assignment public.coach_program_assignments;
 v_program public.coach_programs; v_session jsonb; v_block jsonb; v_expected integer; v_rows jsonb;
 v_prior public.coach_custom_practice_results; v_week integer; v_day integer; v_count integer:=0; v_checkin uuid;
begin
 if v_uid is null or not private.mw_active_coach() then raise exception 'Coach access required' using errcode='42501'; end if;
 select role::text into v_role from public.profiles where user_id=v_uid and account_status::text='active';
 if p_session_id is null or p_session_date is null or p_session_date not between current_date-1 and current_date+1 or jsonb_typeof(p_results) is distinct from 'array' or jsonb_array_length(p_results) not between 1 and 800 then raise exception 'Invalid practice payload'; end if;
 if exists(select 1 from jsonb_array_elements(p_results) x where jsonb_typeof(x) is distinct from 'object' or not (x ?& array['athleteId','assignmentId','revision','customSessionId','blockIndex','repNumber','timeSeconds','distanceM','resultStatus','sessionDate']) or exists(select 1 from jsonb_each(x) e where e.key=any(array['athleteId','assignmentId','revision','customSessionId','blockIndex','repNumber','timeSeconds','distanceM','resultStatus','sessionDate']) and e.value='null'::jsonb)) then raise exception 'Missing rep fields'; end if;
 perform pg_advisory_xact_lock(hashtextextended(v_uid::text||p_session_date::text,0));
 for v_group in select (x->>'athleteId')::uuid athlete_id,(x->>'assignmentId')::uuid assignment_id,(x->>'revision')::uuid revision,x->>'customSessionId' workout_session_id,(x->>'blockIndex')::integer block_index from jsonb_array_elements(p_results) x group by 1,2,3,4,5 loop
  select * into v_assignment from public.coach_program_assignments where id=v_group.assignment_id and coach_user_id=v_uid and status='active';
  if v_assignment.id is null or not private.mw_can_manage_athlete(v_group.athlete_id)
   or not coalesce((v_assignment.athlete_id=v_group.athlete_id or (v_assignment.group_id is not null and exists(select 1 from public.coach_group_members gm join public.coach_groups g on g.id=gm.group_id and g.archived=false where gm.group_id=v_assignment.group_id and gm.athlete_id=v_group.athlete_id))),false) then raise exception 'Workout is not assigned to this athlete' using errcode='42501'; end if;
  select * into v_program from public.coach_programs where id=v_assignment.program_id and coach_user_id=v_uid and status='active';
  if v_program.id is null or v_program.content->>'reviewed' is distinct from 'true' or (v_program.content->>'revision')::uuid is distinct from v_group.revision then raise exception 'Program changed; reload practice'; end if;
  if v_assignment.start_date is null or p_session_date<v_assignment.start_date then raise exception 'Program has not started'; end if;
  v_week:=((p_session_date-(v_assignment.start_date-(extract(isodow from v_assignment.start_date)::integer-1)))/7)+1;
  v_day:=extract(isodow from p_session_date)::integer;
  select x into v_session from jsonb_array_elements(v_program.content->'sessions') x where x->>'id'=v_group.workout_session_id and (x->>'week')::integer=v_week and (x->>'day')::integer=v_day;
  v_block:=v_session->'blocks'->v_group.block_index;
  if v_session is null or v_block is null or v_group.block_index<0 then raise exception 'Workout day or timed block does not match today'; end if;
  v_expected:=(v_block->>'sets')::integer*(v_block->>'reps')::integer;
  if coalesce(v_expected,0) not between 1 and 200 then raise exception 'Invalid prescribed reps'; end if;
  select jsonb_agg(x order by (x->>'repNumber')::integer) into v_rows from jsonb_array_elements(p_results) x where (x->>'athleteId')::uuid=v_group.athlete_id and (x->>'assignmentId')::uuid=v_group.assignment_id and (x->>'revision')::uuid=v_group.revision and x->>'customSessionId'=v_group.workout_session_id and (x->>'blockIndex')::integer=v_group.block_index;
  if jsonb_array_length(v_rows)<>v_expected or (select count(distinct (x->>'repNumber')::integer) from jsonb_array_elements(v_rows) x)<>v_expected then raise exception 'Finish every prescribed rep before saving this workout block'; end if;
  if exists(select 1 from jsonb_array_elements(v_rows) x where (x->>'repNumber')::integer not between 1 and v_expected or (x->>'timeSeconds')::numeric<=0 or (x->>'timeSeconds')::numeric>86400 or x->>'timeSeconds' is null or (x->>'distanceM')::numeric<>(v_block->>'distance')::numeric or x->>'distanceM' is null or x->>'resultStatus' not in ('finished','manual','dnf') or (x->>'sessionDate')::date<>p_session_date) then raise exception 'Invalid rep results'; end if;
  select * into v_prior from public.coach_custom_practice_results where assignment_id=v_group.assignment_id and revision=v_group.revision and workout_session_id=v_group.workout_session_id and block_index=v_group.block_index and athlete_id=v_group.athlete_id and session_date=p_session_date;
  if v_prior.id is not null then
   if v_prior.results<>v_rows or v_prior.timing_session_id<>p_session_id then raise exception 'Workout already saved; this retry differs'; end if;
  else
   insert into public.coach_custom_practice_results(coach_user_id,athlete_id,assignment_id,revision,workout_session_id,block_index,session_date,timing_session_id,prescription,results) values(v_uid,v_group.athlete_id,v_group.assignment_id,v_group.revision,v_group.workout_session_id,v_group.block_index,p_session_date,p_session_id,v_session,v_rows);
   if (select count(*) from public.coach_custom_practice_results where assignment_id=v_group.assignment_id and revision=v_group.revision and workout_session_id=v_group.workout_session_id and athlete_id=v_group.athlete_id and session_date=p_session_date)=jsonb_array_length(v_session->'blocks') then
    insert into public.coach_assigned_training_checkins(athlete_id,assignment_id,status,pace_reps_total,athlete_note) select v_group.athlete_id,v_group.assignment_id,'completed',sum(jsonb_array_length(results)),left('Coach recorded: '||(v_session->>'title')||' - '||p_session_date::text,2000) from public.coach_custom_practice_results where assignment_id=v_group.assignment_id and revision=v_group.revision and workout_session_id=v_group.workout_session_id and athlete_id=v_group.athlete_id and session_date=p_session_date returning id into v_checkin;
   end if;
  end if;
  v_count:=v_count+v_expected;
 end loop;
 return jsonb_build_object('ok',true,'count',v_count,'sessionId',p_session_id);
end;$$;
revoke all on function public.mw_save_custom_coach_practice(uuid,date,jsonb) from public,anon;
grant execute on function public.mw_save_custom_coach_practice(uuid,date,jsonb) to authenticated;
