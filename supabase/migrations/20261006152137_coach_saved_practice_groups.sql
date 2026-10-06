-- Save a team's name and membership as one transaction, with existing coach RLS.
create or replace function public.mw_coach_save_training_group(
 p_group_id uuid,p_name text,p_athlete_ids uuid[]
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare v_id uuid;v_name text:=btrim(p_name);v_ids uuid[];
begin
 if auth.uid() is null or not private.mw_coach_workspace_actor() then
  raise exception 'Active coach access required' using errcode='42501';
 end if;
 if v_name is null or length(v_name)<1 or length(v_name)>80 then
  raise exception 'Group name must contain 1 to 80 characters' using errcode='22023';
 end if;
 select array_agg(distinct a) into v_ids from unnest(p_athlete_ids) a where a is not null;
 if coalesce(cardinality(v_ids),0)=0 then
  raise exception 'Select at least one assigned athlete' using errcode='22023';
 end if;
 if exists(select 1 from unnest(v_ids) a where not coalesce(private.mw_can_manage_athlete(a),false)) then
  raise exception 'Every athlete must be assigned to this coach' using errcode='42501';
 end if;
 if p_group_id is null then
  insert into public.coach_groups(coach_user_id,name,archived) values(auth.uid(),v_name,false) returning id into v_id;
 else
  update public.coach_groups set name=v_name,updated_at=now()
   where id=p_group_id and coach_user_id=auth.uid() and archived=false returning id into v_id;
  if v_id is null then raise exception 'Group not found for this coach' using errcode='42501';end if;
 end if;
 delete from public.coach_group_members where group_id=v_id and not (athlete_id=any(v_ids));
 insert into public.coach_group_members(group_id,athlete_id,added_by)
  select v_id,a,auth.uid() from unnest(v_ids) a on conflict(group_id,athlete_id) do nothing;
 return jsonb_build_object('id',v_id,'name',v_name);
end $$;
revoke all on function public.mw_coach_save_training_group(uuid,text,uuid[]) from public,anon;
grant execute on function public.mw_coach_save_training_group(uuid,text,uuid[]) to authenticated;
