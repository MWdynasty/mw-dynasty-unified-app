-- MW Dynasty Founder OS v11
-- Persistent Founder notifications for Coach review, billing, support,
-- account deletion, and launch diagnostic events.

create table if not exists public.founder_notifications (
  id uuid primary key default gen_random_uuid(),
  fingerprint text not null unique,
  notification_type text not null,
  severity text not null default 'normal' check (severity in ('low','normal','high','urgent')),
  title text not null,
  detail text,
  entity_type text,
  entity_id text,
  action_view text,
  status text not null default 'unread' check (status in ('unread','read','dismissed')),
  metadata jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists founder_notifications_status_idx
  on public.founder_notifications(status,severity,created_at desc);

alter table public.founder_notifications enable row level security;
drop policy if exists mw_founder_notifications_all on public.founder_notifications;
create policy mw_founder_notifications_all on public.founder_notifications
for all to authenticated using (private.mw_is_founder()) with check (private.mw_is_founder());

create or replace function private.mw_founder_notify(
  p_fingerprint text,
  p_type text,
  p_severity text,
  p_title text,
  p_detail text,
  p_entity_type text,
  p_entity_id text,
  p_action_view text,
  p_metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path=''
as $$
begin
  insert into public.founder_notifications(
    fingerprint,notification_type,severity,title,detail,entity_type,entity_id,action_view,metadata,status,created_at,updated_at
  ) values (
    left(coalesce(p_fingerprint,''),500),
    left(coalesce(p_type,'event'),80),
    case when p_severity in ('low','normal','high','urgent') then p_severity else 'normal' end,
    left(coalesce(p_title,'MW Dynasty notification'),180),
    left(coalesce(p_detail,''),1200),
    left(coalesce(p_entity_type,''),100),
    left(coalesce(p_entity_id,''),200),
    left(coalesce(p_action_view,''),100),
    coalesce(p_metadata,'{}'::jsonb),
    'unread',now(),now()
  )
  on conflict (fingerprint) do update set
    severity=excluded.severity,
    title=excluded.title,
    detail=excluded.detail,
    action_view=excluded.action_view,
    metadata=excluded.metadata,
    updated_at=now(),
    status=case
      when public.founder_notifications.status='dismissed' then public.founder_notifications.status
      else public.founder_notifications.status
    end;
end $$;

create or replace function private.mw_founder_notify_coach_application()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  if new.status='pending'
     and new.verification_status='needs_review'
     and (tg_op='INSERT' or old.verification_status is distinct from new.verification_status or old.status is distinct from new.status)
  then
    perform private.mw_founder_notify(
      'coach_application:'||new.id::text||':needs_review',
      'coach_application','high','Coach application needs review',
      concat_ws(' · ',trim(coalesce(new.first_name,'')||' '||coalesce(new.last_name,'')),new.organization),
      'coach_access_application',new.id::text,'applications',
      jsonb_build_object('decision_mode',new.decision_mode)
    );
  end if;
  return new;
end $$;

drop trigger if exists mw_founder_notify_coach_application on public.coach_access_applications;
create trigger mw_founder_notify_coach_application
after insert or update on public.coach_access_applications
for each row execute function private.mw_founder_notify_coach_application();

create or replace function private.mw_founder_notify_billing()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  v_severity text;
  v_title text;
begin
  if tg_op='UPDATE' and old.status is not distinct from new.status then return new; end if;
  if new.status not in ('active','trialing','cancelled','past_due','unpaid','incomplete','incomplete_expired','cancel_at_period_end') then return new; end if;

  v_severity := case
    when new.status in ('past_due','unpaid','incomplete','incomplete_expired') then 'urgent'
    when new.status in ('cancelled','cancel_at_period_end') then 'high'
    else 'low'
  end;
  v_title := case
    when new.status in ('active','trialing') then 'Membership activated'
    when new.status in ('cancelled','cancel_at_period_end') then 'Membership cancellation update'
    else 'Billing needs attention'
  end;

  perform private.mw_founder_notify(
    'billing_subscription:'||new.id::text||':'||new.status,
    'billing',v_severity,v_title,
    concat_ws(' · ',coalesce(new.audience,'membership'),coalesce(new.plan_code,'plan'),coalesce(new.provider,'provider'),new.status),
    'billing_subscription',new.id::text,'revenue',
    jsonb_build_object('audience',new.audience,'plan_code',new.plan_code,'provider',new.provider,'status',new.status)
  );
  return new;
end $$;

drop trigger if exists mw_founder_notify_billing on public.billing_subscriptions;
create trigger mw_founder_notify_billing
after insert or update on public.billing_subscriptions
for each row execute function private.mw_founder_notify_billing();

create or replace function private.mw_founder_notify_member_support()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  perform private.mw_founder_notify(
    'member_support:'||new.id::text,'support',
    case when lower(coalesce(new.category,'')) in ('privacy','security','billing','account_deletion') then 'high' else 'normal' end,
    'New member support request',coalesce(new.category,'Support request'),
    'support_request',new.id::text,'support',
    jsonb_build_object('category',new.category,'app_version',new.app_version)
  );
  return new;
end $$;

drop trigger if exists mw_founder_notify_member_support on public.support_requests;
create trigger mw_founder_notify_member_support
after insert on public.support_requests
for each row execute function private.mw_founder_notify_member_support();

create or replace function private.mw_founder_notify_public_support()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  perform private.mw_founder_notify(
    'public_support:'||new.id::text,'public_support',
    case when lower(coalesce(new.category,'')) in ('privacy','security','billing','account_deletion') then 'high' else 'normal' end,
    'New public website support request',coalesce(new.category,'Website support request'),
    'public_support_request',new.id::text,'support',
    jsonb_build_object('category',new.category,'app_version',new.app_version)
  );
  return new;
end $$;

drop trigger if exists mw_founder_notify_public_support on public.public_support_requests;
create trigger mw_founder_notify_public_support
after insert on public.public_support_requests
for each row execute function private.mw_founder_notify_public_support();

create or replace function private.mw_founder_notify_deletion()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  perform private.mw_founder_notify(
    'account_deletion:'||new.id::text,'account_deletion','high','Account deletion request received',
    'A member requested account deletion. Review the high-trust deletion workflow.',
    'account_deletion_request',new.id::text,'support','{}'::jsonb
  );
  return new;
end $$;

drop trigger if exists mw_founder_notify_deletion on public.account_deletion_requests;
create trigger mw_founder_notify_deletion
after insert on public.account_deletion_requests
for each row execute function private.mw_founder_notify_deletion();

create or replace function private.mw_founder_notify_diagnostic()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  if new.severity='error' then
    perform private.mw_founder_notify(
      'launch_diagnostic:'||new.id::text,'diagnostic','urgent','Launch diagnostic error',
      concat_ws(' · ',new.surface,new.code,new.route),
      'launch_diagnostic',new.id::text,'system',
      jsonb_build_object('surface',new.surface,'code',new.code,'route',new.route,'app_version',new.app_version,'ios_build',new.ios_build)
    );
  end if;
  return new;
end $$;

drop trigger if exists mw_founder_notify_diagnostic on public.launch_diagnostics;
create trigger mw_founder_notify_diagnostic
after insert on public.launch_diagnostics
for each row execute function private.mw_founder_notify_diagnostic();

create or replace function public.mw_founder_notifications_snapshot()
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
begin
  if auth.uid() is null or not private.mw_is_founder() then
    raise exception 'Founder / Owner access required' using errcode='42501';
  end if;

  return jsonb_build_object(
    'generated_at',now(),
    'unread_count',(select count(*) from public.founder_notifications where status='unread'),
    'urgent_unread',(select count(*) from public.founder_notifications where status='unread' and severity='urgent'),
    'high_unread',(select count(*) from public.founder_notifications where status='unread' and severity='high'),
    'items',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',n.id,'notification_type',n.notification_type,'severity',n.severity,'title',n.title,'detail',n.detail,
        'entity_type',n.entity_type,'entity_id',n.entity_id,'action_view',n.action_view,'status',n.status,
        'metadata',n.metadata,'read_at',n.read_at,'created_at',n.created_at,'updated_at',n.updated_at
      ) order by
        case n.status when 'unread' then 1 when 'read' then 2 else 3 end,
        case n.severity when 'urgent' then 1 when 'high' then 2 when 'normal' then 3 else 4 end,
        n.created_at desc)
      from (
        select * from public.founder_notifications
        where status<>'dismissed'
        order by created_at desc
        limit 200
      ) n
    ),'[]'::jsonb)
  );
end $$;

revoke all on function public.mw_founder_notifications_snapshot() from public;
grant execute on function public.mw_founder_notifications_snapshot() to authenticated;

drop trigger if exists mw_audit_founder_notifications on public.founder_notifications;
create trigger mw_audit_founder_notifications
after insert or update or delete on public.founder_notifications
for each row execute function private.mw_audit_founder_os_change();
