-- MW Dynasty Founder OS v23
-- Website Design Studio: request -> AI proposal -> approved build -> preview -> approved publish.

create table if not exists public.founder_website_projects (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  request_text text not null,
  target_scope text not null default 'public website',
  source_system text not null default 'auto'
    check (source_system in ('auto','github_vercel','chatgpt_site','external')),
  source_reference text,
  status text not null default 'requested'
    check (status in (
      'requested','proposal_ready','approved_for_build','building','preview_ready',
      'approved_for_publish','publishing','published','blocked_external_editor','failed','cancelled'
    )),
  proposal_summary text,
  proposed_changes jsonb not null default '[]'::jsonb,
  acceptance_criteria jsonb not null default '[]'::jsonb,
  design_notes text,
  build_notes text,
  preview_url text,
  preview_commit_sha text,
  production_commit_sha text,
  production_url text,
  requires_founder_publish_approval boolean not null default true,
  created_by uuid default auth.uid(),
  approved_build_by uuid,
  approved_build_at timestamptz,
  approved_publish_by uuid,
  approved_publish_at timestamptz,
  published_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists founder_website_projects_status_idx
  on public.founder_website_projects(status,updated_at desc);

alter table public.founder_website_projects enable row level security;

drop policy if exists mw_founder_website_projects_all on public.founder_website_projects;
create policy mw_founder_website_projects_all on public.founder_website_projects
for all to authenticated
using (private.mw_is_founder())
with check (private.mw_is_founder());

do $$
begin
  if exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='private' and p.proname='mw_audit_founder_os_change'
  ) then
    execute 'drop trigger if exists mw_audit_founder_website_projects on public.founder_website_projects';
    execute 'create trigger mw_audit_founder_website_projects after insert or update or delete on public.founder_website_projects for each row execute function private.mw_audit_founder_os_change()';
  end if;
end $$;
