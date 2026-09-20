-- MW Dynasty Founder OS v3
-- Audited AI employee work runs.

create table if not exists public.founder_ai_runs (
  id uuid primary key default gen_random_uuid(),
  task_id uuid references public.founder_ai_tasks(id) on delete cascade,
  agent_code text references public.founder_ai_agents(code) on update cascade,
  run_type text not null default 'analysis' check (run_type in ('analysis','draft','briefing','planning')),
  status text not null default 'completed' check (status in ('completed','failed')),
  model text,
  output_summary text,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
alter table public.founder_ai_runs enable row level security;
drop policy if exists mw_founder_select_ai_runs on public.founder_ai_runs;
create policy mw_founder_select_ai_runs on public.founder_ai_runs
for select to authenticated using (private.mw_is_founder());
drop policy if exists mw_founder_modify_ai_runs on public.founder_ai_runs;
create policy mw_founder_modify_ai_runs on public.founder_ai_runs
for all to authenticated using (private.mw_is_founder()) with check (private.mw_is_founder());
create index if not exists founder_ai_runs_task_idx on public.founder_ai_runs(task_id,created_at desc);
create index if not exists founder_ai_runs_agent_idx on public.founder_ai_runs(agent_code,created_at desc);
