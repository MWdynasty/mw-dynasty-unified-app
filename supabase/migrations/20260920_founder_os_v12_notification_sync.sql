-- MW Dynasty Founder OS v12
-- Synchronize current Coach review, billing, support, deletion, and diagnostic states
-- into the persistent Founder notification center.

create or replace function private.mw_sync_founder_notifications()
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  r record;
begin
  for r in
    select *
    from public.coach_access_applications
    where status='pending' and verification_status='needs_review'
  loop
    perform private.mw_founder_notify(
      'coach_application:'||r.id::text||':needs_review',
      'coach_application','high','Coach application needs review',
      concat_ws(' · ',trim(coalesce(r.first_name,'')||' '||coalesce(r.last_name,'')),r.organization),
      'coach_access_application',r.id::text,'applications',
      jsonb_build_object('decision_mode',r.decision_mode)
    );
  end loop;

  for r in
    select *
    from public.billing_subscriptions
    where status in ('active','trialing','cancelled','past_due','unpaid','incomplete','incomplete_expired','cancel_at_period_end')
  loop
    perform private.mw_founder_notify(
      'billing_subscription:'||r.id::text||':'||r.status,
      'billing',
      case when r.status in ('past_due','unpaid','incomplete','incomplete_expired') then 'urgent'
           when r.status in ('cancelled','cancel_at_period_end') then 'high'
           else 'low' end,
      case when r.status in ('active','trialing') then 'Membership activated'
           when r.status in ('cancelled','cancel_at_period_end') then 'Membership cancellation update'
           else 'Billing needs attention' end,
      concat_ws(' · ',coalesce(r.audience,'membership'),coalesce(r.plan_code,'plan'),coalesce(r.provider,'provider'),r.status),
      'billing_subscription',r.id::text,'revenue',
      jsonb_build_object('audience',r.audience,'plan_code',r.plan_code,'provider',r.provider,'status',r.status)
    );
  end loop;

  for r in
    select *
    from public.support_requests
    where coalesce(status,'open') not in ('resolved','closed')
  loop
    perform private.mw_founder_notify(
      'member_support:'||r.id::text,
      'support',
      case when lower(coalesce(r.category,'')) in ('privacy','security','billing','account_deletion') then 'high'
           when r.created_at<now()-interval '48 hours' then 'high'
           else 'normal' end,
      'Member support request open',
      coalesce(r.category,'Support request'),
      'support_request',r.id::text,'support',
      jsonb_build_object('category',r.category,'app_version',r.app_version)
    );
  end loop;

  for r in
    select *
    from public.public_support_requests
    where coalesce(status,'open') not in ('resolved','closed')
  loop
    perform private.mw_founder_notify(
      'public_support:'||r.id::text,
      'public_support',
      case when lower(coalesce(r.category,'')) in ('privacy','security','billing','account_deletion') then 'high'
           when r.created_at<now()-interval '48 hours' then 'high'
           else 'normal' end,
      'Public website support request open',
      coalesce(r.category,'Website support request'),
      'public_support_request',r.id::text,'support',
      jsonb_build_object('category',r.category,'app_version',r.app_version)
    );
  end loop;

  for r in
    select *
    from public.account_deletion_requests
    where status not in ('completed','cancelled')
  loop
    perform private.mw_founder_notify(
      'account_deletion:'||r.id::text,
      'account_deletion','high','Account deletion request pending',
      'A member requested account deletion. Review the high-trust deletion workflow.',
      'account_deletion_request',r.id::text,'support','{}'::jsonb
    );
  end loop;

  for r in
    select *
    from public.launch_diagnostics
    where severity='error' and created_at>now()-interval '24 hours'
  loop
    perform private.mw_founder_notify(
      'launch_diagnostic:'||r.id::text,
      'diagnostic','urgent','Launch diagnostic error',
      concat_ws(' · ',r.surface,r.code,r.route),
      'launch_diagnostic',r.id::text,'system',
      jsonb_build_object('surface',r.surface,'code',r.code,'route',r.route,'app_version',r.app_version,'ios_build',r.ios_build)
    );
  end loop;
end $$;

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

  perform private.mw_sync_founder_notifications();

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
