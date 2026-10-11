-- No account/training/billing rows are rewritten. Existing ownership policies remain in place.
begin;
create or replace function private.mw_authenticated_uid()
returns uuid language plpgsql stable security definer set search_path='' as $$
declare v_uid uuid:=auth.uid(); v_claims jsonb:=auth.jwt(); v_session uuid;
begin
  -- Only server credentials may intentionally use a non-user session.
  if v_claims->>'role'='service_role' then return v_uid; end if;
  if v_uid is null then return null; end if;
  begin v_session:=nullif(v_claims->>'session_id','')::uuid;
  exception when invalid_text_representation then return null; end;
  if v_session is null then return null; end if;
  if exists(select 1 from auth.sessions s where s.id=v_session and s.user_id=v_uid
    and (s.not_after is null or s.not_after>now())) then return v_uid; end if;
  return null;
end $$;
revoke all on function private.mw_authenticated_uid() from public,anon;
grant execute on function private.mw_authenticated_uid() to authenticated,service_role;

create or replace function public.mw_current_session_active()
returns boolean language sql stable security definer set search_path='' as $$
 select private.mw_authenticated_uid() is not null
$$;
revoke all on function public.mw_current_session_active() from public,anon;
grant execute on function public.mw_current_session_active() to authenticated,service_role;

-- SECURITY DEFINER functions bypass table RLS. Keep their existing authorization logic,
-- but resolve their user identity through a live session instead of a still-valid old JWT.
do $$ declare f record; definition text;
begin
 for f in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname in ('public','private') and p.prokind='f'
   and p.proname<>'mw_authenticated_uid' and p.prosrc~'auth[.]uid[[:space:]]*[(]'
 loop
  definition:=regexp_replace(pg_get_functiondef(f.oid),'auth[.]uid[[:space:]]*[(][[:space:]]*[)]','private.mw_authenticated_uid()','g');
  execute definition;
 end loop;
end $$;

-- Restrictive policies combine with (rather than replace) each table's ownership rules.
do $$ declare t record;
begin
 for t in select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relkind in ('r','p') and c.relrowsecurity
 loop
  execute format('create policy mw_live_session_required on public.%I as restrictive for all to authenticated using ((select public.mw_current_session_active())) with check ((select public.mw_current_session_active()))',t.relname);
 end loop;
end $$;

-- Direct REST reads must require the same active connection as the message RPC.
drop policy if exists mw_athlete_messages_select on public.coach_messages;
create policy mw_athlete_messages_select on public.coach_messages for select to authenticated using (
 private.mw_athlete_feature_enabled('messaging') and exists(
  select 1 from public.athletes a join public.coach_assignments ca on ca.athlete_id=a.id
  where a.user_id=private.mw_authenticated_uid() and ca.coach_user_id=coach_messages.coach_user_id
   and ca.status::text='active' and (
    (coach_messages.audience_type='athlete' and coach_messages.athlete_id=a.id)
    or (coach_messages.audience_type='all_assigned' and coach_messages.athlete_id is null and coach_messages.group_id is null)
    or (coach_messages.audience_type='group' and exists(select 1 from public.coach_group_members gm
     join public.coach_groups g on g.id=gm.group_id where gm.group_id=coach_messages.group_id and gm.athlete_id=a.id
      and g.coach_user_id=coach_messages.coach_user_id and not g.archived))
   )
 )
);
CREATE OR REPLACE FUNCTION public.mw_athlete_content_assignments()
 RETURNS TABLE(id uuid, coach_user_id uuid, coach_name text, content_type text, content_key text, status text, assigned_at timestamp with time zone, completed_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  with me as (
    select a.id as my_athlete_id
    from public.athletes a
    where a.user_id=private.mw_authenticated_uid()
      and private.mw_athlete_feature_enabled('sprint_school')
    limit 1
  )
  select ca.id,ca.coach_user_id,coalesce(nullif(trim(concat_ws(' ',p.first_name,p.last_name)),''),'MW Coach'),ca.content_type,ca.content_key,
         case when cc.assignment_id is not null then 'completed' else ca.status end,
         ca.assigned_at,cc.completed_at
  from public.coach_content_assignments ca
  left join public.profiles p on p.user_id=ca.coach_user_id
  cross join me
  left join public.coach_content_completions cc on cc.assignment_id=ca.id and cc.athlete_id=me.my_athlete_id
  where ca.status<>'dismissed' and exists(select 1 from public.coach_assignments connection where connection.coach_user_id=ca.coach_user_id and connection.athlete_id=me.my_athlete_id and connection.status::text='active')
    and (ca.athlete_id=me.my_athlete_id or (ca.group_id is not null and exists(
      select 1 from public.coach_group_members gm where gm.group_id=ca.group_id and gm.athlete_id=me.my_athlete_id
    )))
  order by ca.assigned_at desc
  limit 100
$function$
;
-- Match direct database workspace access to the already protected paid-access RPC.
create or replace function private.mw_active_coach() returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.profiles p where p.user_id=private.mw_authenticated_uid()
  and p.account_status::text='active' and (p.role::text in ('founder_owner','admin')
   or (p.role::text='coach' and public.mw_coach_access_tier() is not null)))
$$;
create or replace function private.mw_coach_has_tier(p_allowed text[]) returns boolean
language sql stable security definer set search_path='' as $$
 select coalesce(private.mw_is_admin_or_founder(),false)
  or (private.mw_active_coach() and public.mw_coach_access_tier()=any(p_allowed))
$$;
create or replace function private.mw_current_coach_has_sprint_performance() returns boolean
language sql stable security definer set search_path='' as $$
 select private.mw_coach_has_tier(array['mw_sprint_performance'])
$$;
create or replace function public.mw_end_coach_connection(p_coach_user_id uuid,p_athlete_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_uid uuid:=private.mw_authenticated_uid(); v_count integer;
begin
 if v_uid is null then raise exception 'Authentication required' using errcode='42501'; end if;
 if not (coalesce(private.mw_is_admin_or_founder(),false)
  or (v_uid=p_coach_user_id and private.mw_active_coach())
  or exists(select 1 from public.athletes a where a.id=p_athlete_id and a.user_id=v_uid)) then
  raise exception 'This connection does not belong to your account' using errcode='42501';
 end if;
 -- Lock the active relationship before withdrawing access. Retain its history.
 perform 1 from public.coach_assignments where coach_user_id=p_coach_user_id
  and athlete_id=p_athlete_id and status::text='active' for update;
 update public.coach_assignments set status='ended',ended_at=now()
  where coach_user_id=p_coach_user_id and athlete_id=p_athlete_id and status::text='active';
 get diagnostics v_count=row_count;
 delete from public.coach_group_members gm using public.coach_groups g
  where gm.group_id=g.id and g.coach_user_id=p_coach_user_id and gm.athlete_id=p_athlete_id;
 update public.coach_program_assignments set status='ended'
  where coach_user_id=p_coach_user_id and athlete_id=p_athlete_id and status in ('active','paused');
 -- Subscription ownership and existing athlete/team results are deliberately retained.
 return jsonb_build_object('ok',true,'ended',v_count,'coach_user_id',p_coach_user_id,'athlete_id',p_athlete_id);
end $$;
revoke all on function public.mw_end_coach_connection(uuid,uuid) from public,anon;
grant execute on function public.mw_end_coach_connection(uuid,uuid) to authenticated;
-- Existing team SELECT policies were inaccessible because SELECT grants were missing.
-- Memberships remain writable only through trusted administration.
grant select on public.teams,public.team_members to authenticated;
create or replace function public.mw_is_coach_on_team(p_team_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select private.mw_active_coach() and exists(select 1 from public.team_members tm
  where tm.team_id=p_team_id and tm.user_id=private.mw_authenticated_uid() and tm.member_role='coach')
$$;
revoke all on function public.mw_is_coach_on_team(uuid) from public,anon;
grant execute on function public.mw_is_coach_on_team(uuid) to authenticated;
commit;
