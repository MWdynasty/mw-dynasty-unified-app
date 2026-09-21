-- MW Dynasty Founder OS v20
-- Preserve completed AI operating work as Founder-review SOP drafts without duplicating source tasks.

alter table public.founder_sops
  add column if not exists source_ai_task_id uuid references public.founder_ai_tasks(id) on delete set null;

create unique index if not exists founder_sops_source_ai_task_id_uidx
  on public.founder_sops(source_ai_task_id)
  where source_ai_task_id is not null;

comment on column public.founder_sops.source_ai_task_id is
  'Completed Founder AI task promoted into this Founder-review SOP draft. One SOP draft per AI task.';
