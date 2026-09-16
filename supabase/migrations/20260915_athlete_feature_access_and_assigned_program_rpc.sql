-- MW Dynasty 3.0.14: athlete feature-access source of truth + safe coach-assigned training read path.
create or replace function public.mw_my_feature_access()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$ select private.mw_athlete_access_profile(); $$;
revoke all on function public.mw_my_feature_access() from public, anon;
grant execute on function public.mw_my_feature_access() to authenticated;

create or replace function public.mw_my_coach_assigned_programs()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_athlete_id uuid;
  v_access jsonb;
  v_result jsonb;
begin
  if v_uid is null then raise exception 'Authentication required' using errcode='42501'; end if;
  v_access := private.mw_athlete_access_profile();
  if coalesce((v_access->>'has_access')::boolean,false) is not true
     or coalesce((v_access->>'coach_assigned_training')::boolean,false) is not true then return '[]'::jsonb; end if;
  select a.id into v_athlete_id from public.athletes a where a.user_id=v_uid limit 1;
  if v_athlete_id is null then return '[]'::jsonb; end if;
  with assigned as (
    select cpa.id assignment_id,cpa.coach_user_id,cpa.program_id,cpa.start_date,cpa.created_at assigned_at,'direct'::text assignment_source,null::text group_name
    from public.coach_program_assignments cpa
    join public.coach_assignments ca on ca.athlete_id=v_athlete_id and ca.coach_user_id=cpa.coach_user_id and ca.status::text='active'
    where cpa.status='active' and cpa.athlete_id=v_athlete_id
    union all
    select cpa.id,cpa.coach_user_id,cpa.program_id,cpa.start_date,cpa.created_at,'group'::text,cg.name
    from public.coach_program_assignments cpa
    join public.coach_group_members cgm on cgm.group_id=cpa.group_id
    join public.coach_groups cg on cg.id=cpa.group_id and cg.archived=false
    join public.coach_assignments ca on ca.athlete_id=v_athlete_id and ca.coach_user_id=cpa.coach_user_id and ca.status::text='active'
    where cpa.status='active' and cgm.athlete_id=v_athlete_id
  )
  select coalesce(jsonb_agg(jsonb_build_object('assignment_id',x.assignment_id,'assignment_source',x.assignment_source,'group_name',x.group_name,'start_date',x.start_date,'assigned_at',x.assigned_at,'coach_user_id',x.coach_user_id,'coach_name',x.coach_name,'program_id',x.program_id,'program_name',x.program_name,'program_type',x.program_type,'content',x.content,'updated_at',x.updated_at) order by x.assigned_at desc),'[]'::jsonb)
  into v_result
  from (select a.*,cp.name program_name,cp.program_type,cp.content,cp.updated_at,trim(concat_ws(' ',p.first_name,p.last_name)) coach_name from assigned a join public.coach_programs cp on cp.id=a.program_id and cp.coach_user_id=a.coach_user_id and cp.status='active' left join public.profiles p on p.user_id=a.coach_user_id) x;
  return coalesce(v_result,'[]'::jsonb);
end;$$;
revoke all on function public.mw_my_coach_assigned_programs() from public, anon;
grant execute on function public.mw_my_coach_assigned_programs() to authenticated;
