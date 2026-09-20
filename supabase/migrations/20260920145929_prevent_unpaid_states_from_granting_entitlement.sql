-- MW Dynasty production migration
-- Applied to Supabase project keqgunlfwhjgcsurynef as 20260920145929 prevent_unpaid_states_from_granting_entitlement
-- Captured from supabase_migrations.schema_migrations on 2026-09-20.

do $migration$
declare v_oid oid; v_def text;
begin
  select p.oid into v_oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='mw_apply_stripe_subscription'
    and pg_get_function_identity_arguments(p.oid) like 'p_event_id text, p_event_type text, p_user_id uuid%';
  v_def:=pg_get_functiondef(v_oid);
  v_def:=replace(v_def,
$old$  v_membership_status := case
    when v_has_access and p_status = 'trialing' then 'trialing'
    when v_has_access then 'active'
    when p_status = 'past_due' then 'past_due'
    else 'cancelled'
  end;$old$,
$new$  v_membership_status := case
    when v_has_access and p_status = 'trialing' then 'trialing'
    when v_has_access then 'active'
    when p_status = 'past_due' then 'past_due'
    when p_status = 'incomplete' then 'paused'
    when p_status in ('unpaid','incomplete_expired') then 'expired'
    else 'cancelled'
  end;$new$);
  execute v_def;

  select p.oid into v_oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='mw_apply_apple_subscription';
  v_def:=pg_get_functiondef(v_oid);
  v_def:=replace(v_def,
$old$  v_membership_status:=case when v_has_access then 'active' when lower(p_status)='billing_retry' then 'past_due' else 'cancelled' end;$old$,
$new$  v_membership_status:=case
    when v_has_access then 'active'
    when lower(p_status)='billing_retry' then 'past_due'
    when lower(p_status)='revoked' then 'refunded'
    else 'expired'
  end;$new$);
  execute v_def;

  select p.oid into v_oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='mw_apply_stripe_sponsorship_subscription';
  v_def:=pg_get_functiondef(v_oid);
  v_def:=replace(v_def,
$old$    update public.membership_entitlements
    set status='cancelled',
        access_ends_at=coalesce(p_period_end,now()),$old$,
$new$    update public.membership_entitlements
    set status=case
          when p_status='past_due' then 'past_due'
          when p_status in ('unpaid','incomplete_expired') then 'expired'
          else 'cancelled'
        end,
        access_ends_at=case
          when p_status in ('past_due','unpaid','incomplete_expired') then now()
          else coalesce(p_period_end,now())
        end,$new$);
  execute v_def;
end
$migration$;
