-- MW Dynasty production migration
-- Applied to Supabase project keqgunlfwhjgcsurynef as 20260920140648 make_billing_status_fail_closed_for_unpaid_coaches
-- Captured from supabase_migrations.schema_migrations on 2026-09-20.

do $migration$
declare
  v_oid oid;
  v_def text;
begin
  select p.oid into v_oid
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='mw_billing_status'
    and pg_get_function_identity_arguments(p.oid)='';

  if v_oid is null then raise exception 'mw_billing_status not found'; end if;
  v_def:=pg_get_functiondef(v_oid);

  if position('audience=case when v_profile.role::text=''coach'' then ''coach'' else ''athlete'' end' in v_def)=0 then
    raise exception 'Expected audience role branch not found';
  end if;
  v_def:=replace(v_def,
    'audience=case when v_profile.role::text=''coach'' then ''coach'' else ''athlete'' end',
    'audience=case when v_profile.role::text in (''coach'',''admin'',''founder_owner'') then ''coach'' else ''athlete'' end');

  if position('if v_profile.role::text=''coach'' then' in v_def)=0 then
    raise exception 'Expected coach role branch not found';
  end if;
  v_def:=replace(v_def,
    'if v_profile.role::text=''coach'' then',
    'if v_profile.role::text in (''coach'',''admin'',''founder_owner'') then');

  if position('''subscription_status'',coalesce(v_sub.status,''active'')' in v_def)=0 then
    raise exception 'Expected coach subscription fallback not found';
  end if;
  v_def:=replace(v_def,
    '''subscription_status'',coalesce(v_sub.status,''active'')',
    '''subscription_status'',coalesce(v_sub.status,''awaiting_activation'')');

  execute v_def;
end
$migration$;
