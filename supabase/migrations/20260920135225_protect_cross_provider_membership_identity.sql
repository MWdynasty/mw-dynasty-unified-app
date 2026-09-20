-- MW Dynasty production migration
-- Applied to Supabase project keqgunlfwhjgcsurynef as 20260920135225 protect_cross_provider_membership_identity
-- Captured from supabase_migrations.schema_migrations on 2026-09-20.

create or replace function private.mw_guard_base_membership_provider()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
begin
  if tg_op='UPDATE'
     and old.billing_type='individual'
     and new.billing_type='individual'
     and old.provider in ('apple','stripe')
     and new.provider in ('apple','stripe')
     and old.provider<>new.provider
     and old.status in ('active','trialing','cancel_at_period_end')
     and (old.current_period_end is null or old.current_period_end>now())
  then
    raise exception 'Active MW base membership is already managed by %. Cancel it and wait for the paid period to end before changing providers.', old.provider
      using errcode='23514';
  end if;
  return new;
end;
$function$;

drop trigger if exists mw_guard_base_membership_provider on public.billing_subscriptions;
create trigger mw_guard_base_membership_provider
before update on public.billing_subscriptions
for each row execute function private.mw_guard_base_membership_provider();

revoke all on function private.mw_guard_base_membership_provider() from public,anon,authenticated;

create or replace function private.mw_validate_apple_membership_target(p_user_id uuid,p_plan_code text,p_original_transaction_id text)
returns void
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_role text;
  v_existing_user uuid;
begin
  select role::text into v_role from public.profiles where user_id=p_user_id limit 1;
  if v_role is null then raise exception 'MW profile not found'; end if;

  if p_plan_code='mw_athlete' and v_role<>'athlete' then
    raise exception 'Athlete membership cannot be activated on a Coach account';
  end if;
  if p_plan_code<>'mw_athlete' and v_role not in ('coach','admin','founder_owner') then
    raise exception 'Coach membership cannot be activated on an Athlete account';
  end if;

  select e.user_id into v_existing_user
  from private.apple_transaction_events e
  where e.original_transaction_id=p_original_transaction_id
    and e.user_id is not null
  order by e.processed_at asc
  limit 1;

  if v_existing_user is not null and v_existing_user<>p_user_id then
    raise exception 'This App Store subscription is already bound to another MW account';
  end if;
end;
$function$;

revoke all on function private.mw_validate_apple_membership_target(uuid,text,text) from public,anon,authenticated;
grant execute on function private.mw_validate_apple_membership_target(uuid,text,text) to service_role;
