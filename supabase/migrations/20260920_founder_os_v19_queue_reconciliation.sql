-- MW Dynasty Founder OS v19
-- Reconcile proactive AI operating tasks when their source condition is resolved.

create or replace function private.mw_sync_ai_operating_queue()
returns integer
language plpgsql
security definer
set search_path=''
as $$
declare
  v_created integer := 0;
  v_count integer := 0;
begin
  if auth.uid() is null or not private.mw_is_founder() then
    raise exception 'Founder / Owner access required' using errcode='42501';
  end if;

  update public.founder_ai_tasks t
  set status='completed',
      completed_at=coalesce(t.completed_at,now()),
      output_summary=coalesce(t.output_summary,'System signal resolved: the associated launch gate is now verified.'),
      updated_at=now()
  from public.founder_launch_gates g
  where t.source_key='launch_gate:'||g.gate_code
    and g.status='verified'
    and t.status in ('queued','in_progress','blocked');

  update public.founder_ai_tasks t
  set status='completed',
      completed_at=coalesce(t.completed_at,now()),
      output_summary=coalesce(t.output_summary,'System signal resolved: the associated risk is resolved or closed.'),
      updated_at=now()
  from public.founder_risk_register r
  where t.source_key='risk:'||r.id::text
    and r.status in ('resolved','closed')
    and t.status in ('queued','in_progress','blocked');

  update public.founder_ai_tasks t
  set status='cancelled',
      output_summary=coalesce(t.output_summary,'Source notification was dismissed by the Founder.'),
      updated_at=now()
  from public.founder_notifications n
  where t.source_key='notification:'||n.id::text
    and n.status='dismissed'
    and t.status in ('queued','in_progress','blocked');

  insert into public.founder_ai_tasks(
    agent_code,title,description,department,priority,status,source,source_key,
    requires_approval,approval_status,metadata
  )
  select
    case n.notification_type
      when 'coach_application' then 'operations_director'
      when 'billing' then 'controller'
      when 'support' then 'support_manager'
      when 'public_support' then 'support_manager'
      when 'account_deletion' then 'legal_risk'
      when 'diagnostic' then 'release_qa'
      else 'chief_of_staff'
    end,
    case n.notification_type
      when 'coach_application' then 'Analyze Coach application review item'
      when 'billing' then 'Analyze billing exception'
      when 'support' then 'Triage member support signal'
      when 'public_support' then 'Triage website support signal'
      when 'account_deletion' then 'Prepare account-deletion compliance review'
      when 'diagnostic' then 'Analyze launch diagnostic error'
      else 'Analyze Founder notification'
    end,
    concat(n.title,case when coalesce(n.detail,'')<>'' then E'\n' || n.detail else '' end),
    case n.notification_type
      when 'coach_application' then 'Operations'
      when 'billing' then 'Finance'
      when 'support' then 'Customer Success'
      when 'public_support' then 'Customer Success'
      when 'account_deletion' then 'Legal / Compliance'
      when 'diagnostic' then 'Technology'
      else 'Executive Office'
    end,
    case when n.severity='urgent' then 'urgent' when n.severity='high' then 'high' else 'normal' end,
    'queued','system_signal','notification:'||n.id::text,
    false,null,
    jsonb_build_object('signal_type','founder_notification','notification_id',n.id,'action_view',n.action_view)
  from public.founder_notifications n
  where n.status='unread'
    and n.severity in ('urgent','high')
    and not exists(
      select 1 from public.founder_ai_tasks t where t.source_key='notification:'||n.id::text
    )
  on conflict (source_key) where source_key is not null do nothing;
  get diagnostics v_count = row_count;
  v_created := v_created + v_count;

  insert into public.founder_ai_tasks(
    agent_code,title,description,department,priority,status,source,source_key,
    requires_approval,approval_status,metadata
  )
  select
    coalesce(r.owner_agent_code,'legal_risk'),
    'Analyze risk: '||r.title,
    concat(coalesce(r.description,''),case when coalesce(r.mitigation,'')<>'' then E'\nCurrent mitigation: '||r.mitigation else '' end),
    case
      when r.category ilike '%security%' or r.category ilike '%deployment%' then 'Technology'
      when r.category ilike '%app store%' or r.category ilike '%legal%' or r.category ilike '%privacy%' then 'Legal / Compliance'
      when r.category ilike '%website%' then 'Product'
      else 'Executive Office'
    end,
    case when r.severity='critical' then 'urgent' else 'high' end,
    'queued','system_signal','risk:'||r.id::text,
    false,null,
    jsonb_build_object('signal_type','risk','risk_id',r.id,'severity',r.severity)
  from public.founder_risk_register r
  where r.status in ('open','mitigating')
    and r.severity in ('high','critical')
    and not exists(
      select 1 from public.founder_ai_tasks t where t.source_key='risk:'||r.id::text
    )
  on conflict (source_key) where source_key is not null do nothing;
  get diagnostics v_count = row_count;
  v_created := v_created + v_count;

  insert into public.founder_ai_tasks(
    agent_code,title,description,department,priority,status,source,source_key,
    requires_approval,approval_status,metadata
  )
  select
    coalesce(g.owner_agent_code,'release_qa'),
    'Prepare launch gate: '||g.title,
    concat(coalesce(g.description,''),case when coalesce(g.evidence,'')<>'' then E'\nCurrent evidence: '||g.evidence else '' end),
    case
      when g.category ilike '%app store%' or g.category ilike '%compliance%' then 'Legal / Compliance'
      when g.category ilike '%billing%' then 'Finance'
      when g.category ilike '%website%' then 'Product'
      else 'Technology'
    end,
    case when g.status='blocked' then 'urgent' else 'high' end,
    'queued','system_signal','launch_gate:'||g.gate_code,
    false,null,
    jsonb_build_object('signal_type','launch_gate','gate_code',g.gate_code,'gate_status',g.status)
  from public.founder_launch_gates g
  where g.required
    and g.status in ('pending','blocked')
    and g.gate_code<>'founder_go_live'
    and not exists(
      select 1 from public.founder_ai_tasks t where t.source_key='launch_gate:'||g.gate_code
    )
  on conflict (source_key) where source_key is not null do nothing;
  get diagnostics v_count = row_count;
  v_created := v_created + v_count;

  return v_created;
end $$;
