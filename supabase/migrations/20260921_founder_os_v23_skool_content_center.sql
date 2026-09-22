-- MW Dynasty Founder OS v23
-- Skool Content Center: AI-managed content calendar with human posting.

create table if not exists public.founder_skool_posts (
  id uuid primary key default gen_random_uuid(),
  scheduled_for date not null,
  title text not null,
  body text not null,
  category text not null default 'Community',
  post_type text not null default 'discussion'
    check (post_type in ('discussion','education','challenge','announcement','poll','spotlight','recap')),
  audience text not null default 'athletes_and_coaches'
    check (audience in ('athletes','coaches','parents','athletes_and_coaches','everyone')),
  objective text,
  cta text,
  asset_brief text,
  status text not null default 'draft'
    check (status in ('draft','approved','posted','skipped')),
  source text not null default 'ai'
    check (source in ('ai','founder')),
  ai_agent_code text references public.founder_ai_agents(code) on update cascade,
  approved_by uuid,
  approved_at timestamptz,
  posted_at timestamptz,
  generation_metadata jsonb not null default '{}'::jsonb,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists founder_skool_posts_schedule_idx
  on public.founder_skool_posts(scheduled_for,status);
create index if not exists founder_skool_posts_status_idx
  on public.founder_skool_posts(status,scheduled_for);

alter table public.founder_skool_posts enable row level security;

drop policy if exists mw_founder_skool_posts_all on public.founder_skool_posts;
create policy mw_founder_skool_posts_all on public.founder_skool_posts
for all to authenticated
using (private.mw_is_founder())
with check (private.mw_is_founder());

drop trigger if exists mw_audit_founder_skool_posts on public.founder_skool_posts;
create trigger mw_audit_founder_skool_posts
after insert or update or delete on public.founder_skool_posts
for each row execute function private.mw_audit_founder_os_change();

grant select,insert,update,delete on public.founder_skool_posts to authenticated;
