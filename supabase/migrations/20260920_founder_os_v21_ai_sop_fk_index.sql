-- MW Dynasty Founder OS v21
-- Give the AI-work-to-SOP foreign key full index coverage while retaining one SOP per source task.

drop index if exists public.founder_sops_source_ai_task_id_uidx;

create unique index founder_sops_source_ai_task_id_uidx
  on public.founder_sops(source_ai_task_id);
