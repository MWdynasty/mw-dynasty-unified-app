-- MW Dynasty production migration
-- Applied to Supabase project keqgunlfwhjgcsurynef as 20260920145427 retire_combined_sponsor_access_when_base_stripe_ends
-- Captured from supabase_migrations.schema_migrations on 2026-09-20.

do $migration$
declare
  v_oid oid;
  v_def text;
  v_old text := '    if v_has_access and greatest(coalesce(p_sponsor_quantity,0),0)>0 then';
  v_new text := $patch$
    if not v_has_access and greatest(coalesce(p_sponsor_quantity,0),0)>0 then
      update public.coach_sponsorship_packages
      set status='cancelled',
          cancel_at_period_end=false,
          current_period_end=coalesce(p_period_end,current_period_end,now()),
          updated_at=now()
      where coach_user_id=p_user_id
        and provider='stripe'
        and provider_subscription_id=p_subscription_id
        and status in ('active','past_due','cancel_at_period_end');

      update public.coach_sponsor_seats s
      set status=case when s.status='available' then 'ended' else 'scheduled_to_end' end,
          scheduled_end_at=coalesce(s.scheduled_end_at,p_period_end,now()),
          ended_at=case when s.status='available' then coalesce(s.ended_at,now()) else s.ended_at end,
          updated_at=now()
      where s.package_id in (
        select sp.id from public.coach_sponsorship_packages sp
        where sp.coach_user_id=p_user_id
          and sp.provider='stripe'
          and sp.provider_subscription_id=p_subscription_id
      )
      and s.status<>'ended';

      update public.membership_entitlements
      set status='cancelled',
          access_ends_at=least(coalesce(access_ends_at,'infinity'::timestamptz),coalesce(p_period_end,now())),
          metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('coach_base_membership_ended',true),
          updated_at=now()
      where source='coach_sponsored'
        and metadata->>'responsible_coach_user_id'=p_user_id::text
        and status in ('active','trialing','cancelled');
    end if;

    if v_has_access and greatest(coalesce(p_sponsor_quantity,0),0)>0 then
$patch$;
begin
  select p.oid into v_oid
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public'
    and p.proname='mw_apply_stripe_subscription'
    and pg_get_function_identity_arguments(p.oid) like 'p_event_id text, p_event_type text, p_user_id uuid%';
  if v_oid is null then raise exception 'mw_apply_stripe_subscription not found'; end if;
  v_def:=pg_get_functiondef(v_oid);
  if position(v_old in v_def)=0 then raise exception 'Expected sponsorship block not found'; end if;
  v_def:=replace(v_def,v_old,v_new);
  execute v_def;
end
$migration$;
