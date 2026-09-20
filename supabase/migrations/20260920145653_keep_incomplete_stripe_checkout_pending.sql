-- MW Dynasty production migration
-- Applied to Supabase project keqgunlfwhjgcsurynef as 20260920145653 keep_incomplete_stripe_checkout_pending
-- Captured from supabase_migrations.schema_migrations on 2026-09-20.

do $migration$
declare v_oid oid; v_def text;
begin
  select p.oid into v_oid
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public'
    and p.proname='mw_apply_stripe_subscription'
    and pg_get_function_identity_arguments(p.oid) like 'p_event_id text, p_event_type text, p_user_id uuid%';
  if v_oid is null then raise exception 'mw_apply_stripe_subscription not found'; end if;
  v_def:=pg_get_functiondef(v_oid);
  if position('when p_status in (''active'', ''incomplete'') then ''active''' in v_def)=0 then
    raise exception 'Expected incomplete status mapping not found';
  end if;
  v_def:=replace(v_def,
    'when p_status in (''active'', ''incomplete'') then ''active''',
    'when p_status = ''active'' then ''active'' when p_status = ''incomplete'' then ''pending_payment'''
  );
  execute v_def;
end
$migration$;
