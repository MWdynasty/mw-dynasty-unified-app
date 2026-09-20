-- MW Dynasty production migration
-- Applied to Supabase project keqgunlfwhjgcsurynef as 20260920140513 keep_zero_seat_stripe_memberships_out_of_sponsor_packages
-- Captured from supabase_migrations.schema_migrations on 2026-09-20.

do $migration$
declare
  v_oid oid;
  v_def text;
  v_old text := '    if v_has_access then
      select id into v_package_id';
  v_new text := '    if v_has_access and greatest(coalesce(p_sponsor_quantity,0),0)>0 then
      select id into v_package_id';
begin
  select p.oid into v_oid
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public'
    and p.proname='mw_apply_stripe_subscription'
    and pg_get_function_identity_arguments(p.oid) like 'p_event_id text, p_event_type text, p_user_id uuid%';

  if v_oid is null then raise exception 'mw_apply_stripe_subscription not found'; end if;
  v_def := pg_get_functiondef(v_oid);
  if position(v_old in v_def)=0 then raise exception 'Expected sponsorship block not found'; end if;
  v_def := replace(v_def,v_old,v_new);
  execute v_def;
end
$migration$;
