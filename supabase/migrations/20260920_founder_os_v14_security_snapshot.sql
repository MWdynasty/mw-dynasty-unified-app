-- MW Dynasty Founder OS v14
-- Founder-only live database security posture snapshot.

CREATE OR REPLACE FUNCTION public.mw_founder_security_snapshot()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_auth_count integer;
  v_anon_count integer;
  v_rls_no_policy integer;
  v_client_grants integer;
begin
  if auth.uid() is null or not private.mw_is_founder() then
    raise exception 'Founder / Owner access required' using errcode='42501';
  end if;

  select count(*) into v_auth_count
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public'
    and p.prosecdef
    and pg_catalog.has_function_privilege('authenticated',p.oid,'EXECUTE');

  select count(*) into v_anon_count
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public'
    and p.prosecdef
    and pg_catalog.has_function_privilege('anon',p.oid,'EXECUTE');

  select count(*) into v_rls_no_policy
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public'
    and c.relkind='r'
    and c.relrowsecurity
    and not exists(select 1 from pg_catalog.pg_policy pol where pol.polrelid=c.oid);

  select count(*) into v_client_grants
  from information_schema.role_table_grants g
  where g.table_schema='public'
    and g.grantee in ('anon','authenticated')
    and g.table_name in (
      select c.relname
      from pg_catalog.pg_class c
      join pg_catalog.pg_namespace n on n.oid=c.relnamespace
      where n.nspname='public'
        and c.relkind='r'
        and c.relrowsecurity
        and not exists(select 1 from pg_catalog.pg_policy pol where pol.polrelid=c.oid)
    );

  return jsonb_build_object(
    'generated_at',now(),
    'authenticated_security_definer_count',v_auth_count,
    'anon_security_definer_count',v_anon_count,
    'rls_no_policy_count',v_rls_no_policy,
    'rls_no_policy_direct_client_grants',v_client_grants,
    'rls_no_policy_tables',coalesce((
      select jsonb_agg(jsonb_build_object(
        'table',q.relname,
        'anon_grants',coalesce(q.anon_grants,'[]'::jsonb),
        'authenticated_grants',coalesce(q.auth_grants,'[]'::jsonb),
        'assessment',case
          when jsonb_array_length(coalesce(q.anon_grants,'[]'::jsonb))=0
           and jsonb_array_length(coalesce(q.auth_grants,'[]'::jsonb))=0
          then 'fail_closed_no_direct_client_grants'
          else 'direct_client_grants_present'
        end
      ) order by q.relname)
      from (
        select c.relname,
          coalesce((
            select jsonb_agg(g.privilege_type order by g.privilege_type)
            from information_schema.role_table_grants g
            where g.table_schema='public' and g.table_name=c.relname and g.grantee='anon'
          ),'[]'::jsonb) anon_grants,
          coalesce((
            select jsonb_agg(g.privilege_type order by g.privilege_type)
            from information_schema.role_table_grants g
            where g.table_schema='public' and g.table_name=c.relname and g.grantee='authenticated'
          ),'[]'::jsonb) auth_grants
        from pg_catalog.pg_class c
        join pg_catalog.pg_namespace n on n.oid=c.relnamespace
        where n.nspname='public'
          and c.relkind='r'
          and c.relrowsecurity
          and not exists(select 1 from pg_catalog.pg_policy pol where pol.polrelid=c.oid)
      ) q
    ),'[]'::jsonb),
    'security_definer_functions',coalesce((
      select jsonb_agg(jsonb_build_object(
        'name',q.proname,
        'args',q.args,
        'authenticated',q.authenticated,
        'anon',q.anon,
        'has_auth_uid',q.has_auth_uid,
        'has_private_guard',q.has_private_guard,
        'has_founder_guard',q.has_founder_guard,
        'review_signal',case
          when q.anon and q.proname='mw_record_web_event' then 'intentional_public_analytics'
          when q.has_founder_guard then 'founder_gated'
          when q.has_auth_uid or q.has_private_guard then 'identity_or_scope_guard_present'
          else 'manual_review_required'
        end
      ) order by q.proname,q.args)
      from (
        select p.proname,
               pg_catalog.pg_get_function_identity_arguments(p.oid) args,
               pg_catalog.has_function_privilege('authenticated',p.oid,'EXECUTE') authenticated,
               pg_catalog.has_function_privilege('anon',p.oid,'EXECUTE') anon,
               lower(pg_catalog.pg_get_functiondef(p.oid)) like '%auth.uid()%' has_auth_uid,
               lower(pg_catalog.pg_get_functiondef(p.oid)) like '%private.mw_%' has_private_guard,
               (
                 lower(pg_catalog.pg_get_functiondef(p.oid)) like '%private.mw_is_founder()%'
                 or lower(pg_catalog.pg_get_functiondef(p.oid)) like '%mw_is_active_founder()%'
                 or lower(pg_catalog.pg_get_functiondef(p.oid)) like '%founder_owner%'
               ) has_founder_guard
        from pg_catalog.pg_proc p
        join pg_catalog.pg_namespace n on n.oid=p.pronamespace
        where n.nspname='public'
          and p.prosecdef
          and (
            pg_catalog.has_function_privilege('authenticated',p.oid,'EXECUTE')
            or pg_catalog.has_function_privilege('anon',p.oid,'EXECUTE')
          )
      ) q
    ),'[]'::jsonb),
    'open_security_risks',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',r.id,'title',r.title,'severity',r.severity,'status',r.status,'mitigation',r.mitigation,'updated_at',r.updated_at
      ) order by case r.severity when 'critical' then 1 when 'high' then 2 when 'medium' then 3 else 4 end,r.updated_at desc)
      from public.founder_risk_register r
      where r.category='Security' and r.status not in ('resolved','closed')
    ),'[]'::jsonb),
    'resolved_security_risks',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',r.id,'title',r.title,'severity',r.severity,'status',r.status,'mitigation',r.mitigation,'updated_at',r.updated_at
      ) order by r.updated_at desc)
      from public.founder_risk_register r
      where r.category='Security' and r.status='resolved'
    ),'[]'::jsonb)
  );
end $function$
;

revoke all on function public.mw_founder_security_snapshot() from public;
grant execute on function public.mw_founder_security_snapshot() to authenticated;
