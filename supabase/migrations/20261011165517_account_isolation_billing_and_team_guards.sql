-- Preserve current data; pin provider identifiers to their verified account owner.
begin;
create table private.mw_billing_provider_owners (
 provider text not null check (provider in ('stripe','apple')),
 provider_subscription_id text not null check (length(trim(provider_subscription_id))>0),
 user_id uuid not null references auth.users(id) on delete cascade,
 created_at timestamptz not null default now(),
 primary key(provider,provider_subscription_id)
);
alter table private.mw_billing_provider_owners enable row level security;
revoke all on private.mw_billing_provider_owners from public,anon,authenticated;
-- Refuse conflicting existing ownership instead of rewriting customer records.
do $$ begin
 if exists(select 1 from (
  select provider,provider_subscription_id,beneficiary_user_id user_id from public.billing_subscriptions where provider in ('stripe','apple')
  union all select provider,provider_subscription_id,coach_user_id from public.coach_sponsorship_packages where provider='stripe'
  union all select 'apple',original_transaction_id,user_id from private.apple_transaction_events
 ) owned where user_id is not null and nullif(trim(provider_subscription_id),'') is not null
 group by provider,provider_subscription_id having count(distinct user_id)>1) then
  raise exception 'Conflicting provider account ownership requires review before migration';
 end if;
end $$;
insert into private.mw_billing_provider_owners(provider,provider_subscription_id,user_id)
 select distinct owned.provider,owned.provider_subscription_id,owned.user_id from (
  select provider,provider_subscription_id,beneficiary_user_id user_id from public.billing_subscriptions where provider in ('stripe','apple')
  union all select provider,provider_subscription_id,coach_user_id from public.coach_sponsorship_packages where provider='stripe'
  union all select 'apple',original_transaction_id,user_id from private.apple_transaction_events
 ) owned join auth.users u on u.id=owned.user_id
 where nullif(trim(owned.provider_subscription_id),'') is not null
 on conflict(provider,provider_subscription_id) do nothing;
create function private.mw_guard_billing_provider_owner() returns trigger
 language plpgsql security definer set search_path='' as $$
declare verified_owner uuid;
begin
 if tg_op='UPDATE' and old.provider in ('stripe','apple')
  and old.beneficiary_user_id is distinct from new.beneficiary_user_id then
  raise exception 'Provider subscription ownership cannot be reassigned' using errcode='42501';
 end if;
 if new.provider not in ('stripe','apple') or nullif(trim(new.provider_subscription_id),'') is null then return new; end if;
 -- The primary-key conflict serializes concurrent attempts to bind the same ID.
 insert into private.mw_billing_provider_owners(provider,provider_subscription_id,user_id)
  values(new.provider,new.provider_subscription_id,new.beneficiary_user_id)
 on conflict(provider,provider_subscription_id) do update
  set user_id=excluded.user_id
  where private.mw_billing_provider_owners.user_id=excluded.user_id
 returning user_id into verified_owner;
 if verified_owner is null then
  raise exception 'This provider subscription is already bound to another MW account' using errcode='42501';
 end if;
 return new;
end $$;
revoke all on function private.mw_guard_billing_provider_owner() from public,anon,authenticated;
create trigger mw_guard_billing_provider_owner before insert or update on public.billing_subscriptions
 for each row execute function private.mw_guard_billing_provider_owner();
-- Provider billing email may belong to a payer; entitlement identity comes from Auth.
do $$ declare definition text; anchor text:=$anchor$v_email := lower(coalesce(nullif(trim(p_email), ''), v_email));$anchor$;
begin
 definition:=pg_get_functiondef('public.mw_apply_stripe_subscription(text,text,uuid,text,text,text,text,text,timestamptz,timestamptz,boolean,integer,jsonb)'::regprocedure);
 if position(anchor in definition)=0 then raise exception 'Stripe function changed; review canonical-email patch'; end if;
 execute replace(definition,anchor,$patch$v_email := lower(nullif(trim(v_email), ''));$patch$);
end $$;
create policy mw_invitation_team_scope on public.coach_invitations as restrictive for insert to authenticated
 with check(team_id is null or private.mw_is_admin_or_founder() or public.mw_is_coach_on_team(team_id));
-- Re-check previously issued team invitations if coach membership has since ended.
do $$ declare definition text; anchor text:=$anchor$  select id into v_athlete_id from public.athletes where user_id=v_uid limit 1;$anchor$;
begin
 definition:=pg_get_functiondef('public.mw_accept_coach_invitation(text)'::regprocedure);
 if position(anchor in definition)=0 then raise exception 'Invitation function changed; review team authorization patch'; end if;
 execute replace(definition,anchor,$patch$
  if v_inv.team_id is not null and not exists(
    select 1 from public.profiles p where p.user_id=v_inv.coach_user_id and p.account_status::text='active'
      and (p.role::text in ('admin','founder_owner') or exists(
       select 1 from public.team_members tm where tm.team_id=v_inv.team_id and tm.user_id=v_inv.coach_user_id and tm.member_role='coach'
      ))
  ) then raise exception 'This coach is no longer authorized for the invited team' using errcode='42501'; end if;
  select id into v_athlete_id from public.athletes where user_id=v_uid limit 1;$patch$);
end $$;
commit;
