-- MW Dynasty production migration
-- Applied to Supabase project keqgunlfwhjgcsurynef as 20260920135245 enforce_membership_role_and_apple_account_binding
-- Captured from supabase_migrations.schema_migrations on 2026-09-20.

create or replace function private.mw_guard_apple_transaction_identity()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
begin
  perform private.mw_validate_apple_membership_target(new.user_id,new.plan_code,new.original_transaction_id);
  return new;
end;
$function$;

drop trigger if exists mw_guard_apple_transaction_identity on private.apple_transaction_events;
create trigger mw_guard_apple_transaction_identity
before insert on private.apple_transaction_events
for each row execute function private.mw_guard_apple_transaction_identity();

create or replace function private.mw_guard_membership_audience_role()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
declare v_role text;
begin
  if new.billing_type<>'individual' or new.provider not in ('apple','stripe') then return new; end if;
  select role::text into v_role from public.profiles where user_id=new.beneficiary_user_id limit 1;
  if new.audience='athlete' and v_role<>'athlete' then
    raise exception 'Athlete billing cannot be attached to this MW account role' using errcode='23514';
  end if;
  if new.audience='coach' and v_role not in ('coach','admin','founder_owner') then
    raise exception 'Coach billing cannot be attached to this MW account role' using errcode='23514';
  end if;
  return new;
end;
$function$;

drop trigger if exists mw_guard_membership_audience_role on public.billing_subscriptions;
create trigger mw_guard_membership_audience_role
before insert or update on public.billing_subscriptions
for each row execute function private.mw_guard_membership_audience_role();

revoke all on function private.mw_guard_apple_transaction_identity() from public,anon,authenticated;
revoke all on function private.mw_guard_membership_audience_role() from public,anon,authenticated;
