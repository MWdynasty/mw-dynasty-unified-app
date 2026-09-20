-- MW Dynasty Founder OS v15
-- Company objectives, task sequencing, and cross-department execution tracking.

create table if not exists public.founder_ai_objectives (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  priority text not null default 'normal' check (priority in ('low','normal','high','urgent')),
  status text not null default 'active' check (status in ('draft','active','paused','completed','cancelled')),
  owner_agent_code text references public.founder_ai_agents(code) on update cascade,
  target_date date,
  success_definition text,
  source text not null default 'founder',
  created_by uuid default auth.uid(),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.founder_ai_tasks
  add column if not exists objective_id uuid references public.founder_ai_objectives(id) on delete set null,
  add column if not exists parent_task_id uuid references public.founder_ai_tasks(id) on delete set null,
  add column if not exists sequence_no integer,
  add column if not exists depends_on jsonb not null default '[]'::jsonb;

alter table public.founder_approvals
  add column if not exists objective_id uuid references public.founder_ai_objectives(id) on delete set null;

create index if not exists founder_ai_objectives_status_idx
  on public.founder_ai_objectives(status,priority,updated_at desc);
create index if not exists founder_ai_tasks_objective_idx
  on public.founder_ai_tasks(objective_id,status,sequence_no,created_at);
create index if not exists founder_approvals_objective_idx
  on public.founder_approvals(objective_id,status,created_at desc);

alter table public.founder_ai_objectives enable row level security;
drop policy if exists mw_founder_ai_objectives_all on public.founder_ai_objectives;
create policy mw_founder_ai_objectives_all on public.founder_ai_objectives
for all to authenticated using (private.mw_is_founder()) with check (private.mw_is_founder());

drop trigger if exists mw_audit_founder_ai_objectives on public.founder_ai_objectives;
create trigger mw_audit_founder_ai_objectives
after insert or update or delete on public.founder_ai_objectives
for each row execute function private.mw_audit_founder_os_change();

create or replace function public.mw_founder_ai_objectives_snapshot()
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
    'objectives',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',o.id,
        'title',o.title,
        'description',o.description,
        'priority',o.priority,
        'status',o.status,
        'owner_agent_code',o.owner_agent_code,
        'target_date',o.target_date,
        'success_definition',o.success_definition,
        'source',o.source,
        'created_at',o.created_at,
        'updated_at',o.updated_at,
        'completed_at',o.completed_at,
        'task_total',coalesce(t.task_total,0),
        'task_completed',coalesce(t.task_completed,0),
        'task_waiting_approval',coalesce(t.task_waiting_approval,0),
        'task_blocked',coalesce(t.task_blocked,0),
        'task_open',coalesce(t.task_open,0),
        'progress_percent',case when coalesce(t.task_total,0)>0
          then round((coalesce(t.task_completed,0)::numeric/t.task_total::numeric)*100)::integer
          else 0 end,
        'approval_pending',coalesce(a.approval_pending,0),
        'tasks',coalesce(t.tasks,'[]'::jsonb)
      ) order by
        case o.status when 'active' then 1 when 'draft' then 2 when 'paused' then 3 when 'completed' then 4 else 5 end,
        case o.priority when 'urgent' then 1 when 'high' then 2 when 'normal' then 3 else 4 end,
        o.updated_at desc)
      from public.founder_ai_objectives o
      left join lateral (
        select
          count(*) task_total,
          count(*) filter(where x.status='completed') task_completed,
          count(*) filter(where x.status='waiting_approval') task_waiting_approval,
          count(*) filter(where x.status='blocked') task_blocked,
          count(*) filter(where x.status in ('queued','in_progress','waiting_approval','blocked')) task_open,
          jsonb_agg(jsonb_build_object(
            'id',x.id,'agent_code',x.agent_code,'title',x.title,'description',x.description,
            'department',x.department,'priority',x.priority,'status',x.status,
            'requires_approval',x.requires_approval,'approval_status',x.approval_status,
            'sequence_no',x.sequence_no,'depends_on',x.depends_on,'output_summary',x.output_summary,
            'created_at',x.created_at,'completed_at',x.completed_at
          ) order by coalesce(x.sequence_no,9999),x.created_at) tasks
        from public.founder_ai_tasks x
        where x.objective_id=o.id and x.status<>'cancelled'
      ) t on true
      left join lateral (
        select count(*) approval_pending
        from public.founder_approvals a
        where a.objective_id=o.id and a.status='pending'
      ) a on true
    ),'[]'::jsonb),
    'summary',jsonb_build_object(
      'active',(select count(*) from public.founder_ai_objectives where status='active'),
      'waiting_approval',(select count(distinct objective_id) from public.founder_ai_tasks where objective_id is not null and status='waiting_approval'),
      'completed_30d',(select count(*) from public.founder_ai_objectives where status='completed' and completed_at>now()-interval '30 days')
    )
  );
end $$;

revoke all on function public.mw_founder_ai_objectives_snapshot() from public;
grant execute on function public.mw_founder_ai_objectives_snapshot() to authenticated;
