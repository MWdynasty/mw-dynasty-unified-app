-- One atomic, replay-safe approval for new PR groups. Existing groups stay intact.
create table if not exists public.coach_pr_group_receipts(
 coach_user_id uuid not null references auth.users(id) on delete cascade,
 request_id uuid not null,
 payload jsonb not null,
 result jsonb not null,
 created_at timestamptz not null default now(),
 primary key(coach_user_id,request_id)
);
alter table public.coach_pr_group_receipts enable row level security;
create policy coach_pr_group_receipts_read on public.coach_pr_group_receipts for select to authenticated
 using(coach_user_id=(select auth.uid()) and private.mw_coach_workspace_actor());
create policy coach_pr_group_receipts_insert on public.coach_pr_group_receipts for insert to authenticated
 with check(coach_user_id=(select auth.uid()) and private.mw_coach_workspace_actor());
revoke all on public.coach_pr_group_receipts from anon,authenticated;
grant select,insert on public.coach_pr_group_receipts to authenticated;
create or replace function public.mw_coach_create_pr_groups(p_request_id uuid,p_groups jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare g jsonb;v_id uuid;v_ids uuid[];v_seen uuid[]:='{}';v_name text;v_result jsonb:='[]';v_receipt public.coach_pr_group_receipts;
begin
 if auth.uid() is null or not private.mw_coach_workspace_actor() then raise exception 'Active coach access required' using errcode='42501';end if;
 if p_request_id is null or jsonb_typeof(p_groups) is distinct from 'array' then raise exception 'Invalid group proposal';end if;
 if jsonb_array_length(p_groups)<1 or jsonb_array_length(p_groups)>24 then raise exception 'Use 1 to 24 groups';end if;
 perform pg_advisory_xact_lock(hashtext(auth.uid()::text),hashtext(p_request_id::text));
 select * into v_receipt from public.coach_pr_group_receipts where coach_user_id=auth.uid() and request_id=p_request_id;
 if found then
  if v_receipt.payload<>p_groups then raise exception 'Approval request changed; generate a new preview';end if;
  return v_receipt.result||jsonb_build_object('replayed',true);
 end if;
 for g in select value from jsonb_array_elements(p_groups) loop
  v_id:=(g->>'id')::uuid;v_name:=btrim(g->>'name');
  if v_id is null or v_name is null or length(v_name)<1 or length(v_name)>80 then raise exception 'Invalid group name or ID';end if;
  if jsonb_typeof(g->'athlete_ids') is distinct from 'array' or jsonb_array_length(g->'athlete_ids')<1 or jsonb_array_length(g->'athlete_ids')>200 then raise exception 'Each group needs 1 to 200 athletes';end if;
  select array_agg(value::uuid) into v_ids from jsonb_array_elements_text(g->'athlete_ids');
  if exists(select 1 from unnest(v_ids) a where a is null or a=any(v_seen) or not coalesce(private.mw_can_manage_athlete(a),false)) then raise exception 'Every athlete must be assigned to this coach and appear in only one proposed group' using errcode='42501';end if;
  if cardinality(v_ids)<>(select count(distinct a) from unnest(v_ids) a) then raise exception 'Duplicate athlete in group';end if;
  v_seen:=v_seen||v_ids;
  insert into public.coach_groups(id,coach_user_id,name,archived) values(v_id,auth.uid(),v_name,false);
  insert into public.coach_group_members(group_id,athlete_id,added_by) select v_id,a,auth.uid() from unnest(v_ids) a;
  v_result:=v_result||jsonb_build_array(jsonb_build_object('id',v_id,'name',v_name));
 end loop;
 v_result:=jsonb_build_object('groups',v_result,'replayed',false);
 insert into public.coach_pr_group_receipts(coach_user_id,request_id,payload,result) values(auth.uid(),p_request_id,p_groups,v_result);
 return v_result;
end $$;
revoke all on function public.mw_coach_create_pr_groups(uuid,jsonb) from public,anon;
grant execute on function public.mw_coach_create_pr_groups(uuid,jsonb) to authenticated;
