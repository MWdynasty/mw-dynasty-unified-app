-- MW Dynasty Founder OS v17
-- Dedicated school/club/team partnership pipeline and Founder-controlled proposals.

create table if not exists public.founder_partnership_opportunities (
  id uuid primary key default gen_random_uuid(),
  organization_name text not null,
  opportunity_type text not null default 'school' check (opportunity_type in ('school','district','club','team','brand','partner','other')),
  stage text not null default 'research' check (stage in ('research','qualified','discovery','pilot','proposal','legal','won','lost')),
  contact_name text,
  contact_email text,
  estimated_coaches integer not null default 0 check (estimated_coaches>=0),
  estimated_athletes integer not null default 0 check (estimated_athletes>=0),
  estimated_monthly_value_cents integer not null default 0 check (estimated_monthly_value_cents>=0),
  assigned_agent_code text references public.founder_ai_agents(code) on update cascade,
  next_action text,
  notes text,
  linked_organization_id uuid references public.organizations(id) on delete set null,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.founder_partnership_proposals (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null references public.founder_partnership_opportunities(id) on delete cascade,
  title text not null,
  scope_summary text,
  pricing_notes text,
  terms_notes text,
  draft_content text,
  status text not null default 'draft' check (status in ('draft','review','approved','sent','accepted','rejected','retired')),
  requires_founder boolean not null default true,
  approved_by uuid,
  approved_at timestamptz,
  sent_at timestamptz,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists founder_partnership_stage_idx
  on public.founder_partnership_opportunities(stage,updated_at desc);
create index if not exists founder_partnership_proposal_status_idx
  on public.founder_partnership_proposals(status,updated_at desc);

alter table public.founder_partnership_opportunities enable row level security;
alter table public.founder_partnership_proposals enable row level security;

drop policy if exists mw_founder_partnership_opportunities_all on public.founder_partnership_opportunities;
create policy mw_founder_partnership_opportunities_all on public.founder_partnership_opportunities
for all to authenticated using (private.mw_is_founder()) with check (private.mw_is_founder());

drop policy if exists mw_founder_partnership_proposals_all on public.founder_partnership_proposals;
create policy mw_founder_partnership_proposals_all on public.founder_partnership_proposals
for all to authenticated using (private.mw_is_founder()) with check (private.mw_is_founder());

drop trigger if exists mw_audit_founder_partnership_opportunities on public.founder_partnership_opportunities;
create trigger mw_audit_founder_partnership_opportunities
after insert or update or delete on public.founder_partnership_opportunities
for each row execute function private.mw_audit_founder_os_change();

drop trigger if exists mw_audit_founder_partnership_proposals on public.founder_partnership_proposals;
create trigger mw_audit_founder_partnership_proposals
after insert or update or delete on public.founder_partnership_proposals
for each row execute function private.mw_audit_founder_os_change();

create or replace function public.mw_founder_partnerships_snapshot()
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
    'pipeline_value_cents',(
      select coalesce(sum(estimated_monthly_value_cents),0)
      from public.founder_partnership_opportunities
      where stage not in ('won','lost')
    ),
    'won_value_cents',(
      select coalesce(sum(estimated_monthly_value_cents),0)
      from public.founder_partnership_opportunities
      where stage='won'
    ),
    'estimated_athletes_open',(
      select coalesce(sum(estimated_athletes),0)
      from public.founder_partnership_opportunities
      where stage not in ('won','lost')
    ),
    'opportunities',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',o.id,'organization_name',o.organization_name,'opportunity_type',o.opportunity_type,
        'stage',o.stage,'estimated_coaches',o.estimated_coaches,'estimated_athletes',o.estimated_athletes,
        'estimated_monthly_value_cents',o.estimated_monthly_value_cents,
        'assigned_agent_code',o.assigned_agent_code,'next_action',o.next_action,'notes',o.notes,
        'linked_organization_id',o.linked_organization_id,'created_at',o.created_at,'updated_at',o.updated_at,
        'proposal_count',coalesce(p.proposal_count,0),'latest_proposal_status',p.latest_status
      ) order by
        case o.stage when 'legal' then 1 when 'proposal' then 2 when 'pilot' then 3 when 'discovery' then 4 when 'qualified' then 5 when 'research' then 6 when 'won' then 7 else 8 end,
        o.updated_at desc)
      from public.founder_partnership_opportunities o
      left join lateral (
        select count(*) proposal_count,
               (array_agg(x.status order by x.updated_at desc))[1] latest_status
        from public.founder_partnership_proposals x where x.opportunity_id=o.id
      ) p on true
    ),'[]'::jsonb),
    'proposals',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',p.id,'opportunity_id',p.opportunity_id,'organization_name',o.organization_name,
        'title',p.title,'scope_summary',p.scope_summary,'pricing_notes',p.pricing_notes,'terms_notes',p.terms_notes,
        'draft_content',p.draft_content,'status',p.status,'requires_founder',p.requires_founder,
        'approved_at',p.approved_at,'sent_at',p.sent_at,'created_at',p.created_at,'updated_at',p.updated_at
      ) order by p.updated_at desc)
      from public.founder_partnership_proposals p
      join public.founder_partnership_opportunities o on o.id=p.opportunity_id
    ),'[]'::jsonb)
  );
end $$;

revoke all on function public.mw_founder_partnerships_snapshot() from public;
grant execute on function public.mw_founder_partnerships_snapshot() to authenticated;
