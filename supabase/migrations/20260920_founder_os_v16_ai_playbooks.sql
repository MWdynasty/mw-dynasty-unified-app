-- MW Dynasty Founder OS v16
-- AI employee operating cadences, data/tool boundaries, escalation rules,
-- and durable department brief history.

alter table public.founder_ai_agents
  add column if not exists daily_duties jsonb not null default '[]'::jsonb,
  add column if not exists weekly_duties jsonb not null default '[]'::jsonb,
  add column if not exists monthly_duties jsonb not null default '[]'::jsonb,
  add column if not exists data_domains jsonb not null default '[]'::jsonb,
  add column if not exists escalation_rules jsonb not null default '[]'::jsonb;

create table if not exists public.founder_department_briefs (
  id uuid primary key default gen_random_uuid(),
  department text not null,
  lead_agent_code text references public.founder_ai_agents(code) on update cascade,
  brief_type text not null default 'department' check (brief_type in ('department','weekly','monthly','incident')),
  status text not null default 'completed' check (status in ('completed','failed')),
  model text,
  summary text not null,
  metrics jsonb not null default '{}'::jsonb,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);

create index if not exists founder_department_briefs_department_idx
  on public.founder_department_briefs(department,created_at desc);

alter table public.founder_department_briefs enable row level security;
drop policy if exists mw_founder_department_briefs_all on public.founder_department_briefs;
create policy mw_founder_department_briefs_all on public.founder_department_briefs
for all to authenticated using (private.mw_is_founder()) with check (private.mw_is_founder());

drop trigger if exists mw_audit_founder_department_briefs on public.founder_department_briefs;
create trigger mw_audit_founder_department_briefs
after insert or update or delete on public.founder_department_briefs
for each row execute function private.mw_audit_founder_os_change();

update public.founder_ai_agents
set
  daily_duties = case department
    when 'Executive Office' then '["Review Founder attention queue","Review active company objectives","Escalate cross-functional blockers"]'::jsonb
    when 'Finance' then '["Review billing exceptions","Review revenue and cost changes","Flag material financial anomalies"]'::jsonb
    when 'Operations' then '["Review operating blockers","Review SOP exceptions","Coordinate unresolved cross-team work"]'::jsonb
    when 'Technology' then '["Review diagnostics and reliability","Review security/release blockers","Triage technical failures"]'::jsonb
    when 'Product' then '["Review user-flow issues","Review product feedback/signals","Prioritize product blockers"]'::jsonb
    when 'Marketing' then '["Review campaign activity","Review website/acquisition signals","Flag brand or funnel issues"]'::jsonb
    when 'Sales' then '["Review pipeline and next actions","Review stalled opportunities","Prepare follow-up priorities"]'::jsonb
    when 'Customer Success' then '["Review support queue","Review customer-health warnings","Escalate retention risks"]'::jsonb
    when 'Performance / Coaching' then '["Review methodology conflicts","Review program quality signals","Protect Founder-approved training standards"]'::jsonb
    when 'Data & Analytics' then '["Review KPI freshness","Review data-quality issues","Surface material operating changes"]'::jsonb
    when 'Legal / Compliance' then '["Review high-risk items","Review privacy/compliance escalations","Flag policy deadlines"]'::jsonb
    when 'People / HR' then '["Review organizational gaps","Review role/hiring priorities","Flag people-process issues"]'::jsonb
    else '["Review assigned tasks","Review relevant business signals","Escalate exceptions"]'::jsonb
  end,
  weekly_duties = case department
    when 'Executive Office' then '["Prepare cross-functional operating review","Review objective progress","Prepare Founder decision agenda"]'::jsonb
    when 'Finance' then '["Reconcile subscription/revenue trends","Review cost register","Prepare unit-economics summary"]'::jsonb
    when 'Operations' then '["Review SOP coverage and exceptions","Review operating SLA","Coordinate department dependencies"]'::jsonb
    when 'Technology' then '["Review release readiness","Review reliability trends","Review security findings and technical debt"]'::jsonb
    when 'Product' then '["Review roadmap and adoption","Review conversion/drop-off","Prepare next product priorities"]'::jsonb
    when 'Marketing' then '["Review campaign performance","Review traffic/conversion","Prepare growth experiments"]'::jsonb
    when 'Sales' then '["Review pipeline stage movement","Review partnership opportunities","Prepare forecast and next actions"]'::jsonb
    when 'Customer Success' then '["Review activation/retention","Review recurring support themes","Prepare at-risk follow-up list"]'::jsonb
    when 'Performance / Coaching' then '["Review program consistency","Review education/content quality","Review methodology proposals"]'::jsonb
    when 'Data & Analytics' then '["Prepare KPI trend review","Review metric definitions","Review cohort/funnel evidence"]'::jsonb
    when 'Legal / Compliance' then '["Review risk register","Review compliance obligations","Prepare Founder legal/risk decisions"]'::jsonb
    when 'People / HR' then '["Review org coverage","Review hiring readiness","Review role clarity and onboarding systems"]'::jsonb
    else '["Review weekly results","Review blockers","Prepare next-week priorities"]'::jsonb
  end,
  monthly_duties = case department
    when 'Executive Office' then '["Review company strategy against results","Review capital/priority allocation","Refresh executive operating priorities"]'::jsonb
    when 'Finance' then '["Prepare management close","Review MRR/cost/margin quality","Refresh financial scenarios"]'::jsonb
    when 'Operations' then '["Audit core operating processes","Retire or update stale SOPs","Review vendor/process efficiency"]'::jsonb
    when 'Technology' then '["Review architecture and security posture","Review release quality","Refresh reliability priorities"]'::jsonb
    when 'Product' then '["Review product portfolio","Review adoption/retention evidence","Refresh roadmap sequencing"]'::jsonb
    when 'Marketing' then '["Review acquisition economics","Review channel performance","Refresh campaign portfolio"]'::jsonb
    when 'Sales' then '["Review revenue forecast","Review win/loss patterns","Refresh partnership strategy"]'::jsonb
    when 'Customer Success' then '["Review retention/churn themes","Review support quality","Refresh customer-success playbooks"]'::jsonb
    when 'Performance / Coaching' then '["Audit methodology consistency","Review program/version quality","Refresh education priorities"]'::jsonb
    when 'Data & Analytics' then '["Audit KPI trust","Review data gaps","Refresh executive metric definitions"]'::jsonb
    when 'Legal / Compliance' then '["Review compliance posture","Review open contractual/privacy risks","Refresh risk mitigations"]'::jsonb
    when 'People / HR' then '["Review workforce plan","Review hiring thresholds","Refresh role scorecards"]'::jsonb
    else '["Review monthly outcomes","Review KPI performance","Refresh operating plan"]'::jsonb
  end,
  data_domains = case department
    when 'Finance' then '["membership_catalog","billing_summary","sponsorship_summary","cost_register","kpi_history"]'::jsonb
    when 'Technology' then '["launch_diagnostics","release_health","security_posture","billing_integrity","launch_gates"]'::jsonb
    when 'Product' then '["product_usage","onboarding_funnel","website_funnel","support_themes","customer_health"]'::jsonb
    when 'Marketing' then '["website_funnel","campaigns","traffic_attribution","conversion_metrics"]'::jsonb
    when 'Sales' then '["crm_pipeline","organizations","partnership_opportunities","plan_catalog"]'::jsonb
    when 'Customer Success' then '["customer_health","support_summary","onboarding_state","access_state"]'::jsonb
    when 'Performance / Coaching' then '["program_versions","methodology_proposals","athlete_program_distribution","education_registry"]'::jsonb
    when 'Data & Analytics' then '["kpi_history","website_funnel","revenue_summary","customer_health","system_health"]'::jsonb
    when 'Legal / Compliance' then '["risk_register","security_posture","support_risk_flags","launch_compliance_gates"]'::jsonb
    when 'People / HR' then '["human_org_plan","ai_org","role_scorecards","operating_sops"]'::jsonb
    when 'Operations' then '["operating_sops","attention_queue","support_summary","launch_gates","company_objectives"]'::jsonb
    else '["executive_summary","company_objectives","attention_queue","risk_register"]'::jsonb
  end,
  escalation_rules = '["Escalate pricing changes to Founder","Escalate payments/refunds/financial transfers to Founder","Escalate contracts/legal commitments to Founder","Escalate production deployments or destructive data/security changes to Founder","Escalate official MW methodology changes to Founder","Escalate important external communications to Founder"]'::jsonb,
  allowed_tools = case department
    when 'Finance' then '["founder_data_read","billing_analysis","cost_analysis","drafting"]'::jsonb
    when 'Technology' then '["founder_data_read","diagnostics_analysis","security_analysis","release_analysis","drafting"]'::jsonb
    when 'Marketing' then '["founder_data_read","funnel_analysis","campaign_analysis","drafting"]'::jsonb
    when 'Sales' then '["founder_data_read","crm_analysis","proposal_drafting","drafting"]'::jsonb
    when 'Customer Success' then '["founder_data_read","customer_health_analysis","support_drafting"]'::jsonb
    when 'Performance / Coaching' then '["founder_data_read","methodology_analysis","education_drafting"]'::jsonb
    else '["founder_data_read","analysis","drafting"]'::jsonb
  end,
  updated_at=now();

create or replace function public.mw_founder_ai_playbooks_snapshot()
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
    'agents',coalesce((
      select jsonb_agg(jsonb_build_object(
        'code',a.code,'name',a.name,'title',a.title,'department',a.department,'manager_code',a.manager_code,
        'org_level',a.org_level,'mission',a.mission,'responsibilities',a.responsibilities,'kpis',a.kpis,
        'authority_level',a.authority_level,'allowed_tools',a.allowed_tools,
        'daily_duties',a.daily_duties,'weekly_duties',a.weekly_duties,'monthly_duties',a.monthly_duties,
        'data_domains',a.data_domains,'escalation_rules',a.escalation_rules,'status',a.status,'sort_order',a.sort_order
      ) order by a.sort_order,a.department,a.title)
      from public.founder_ai_agents a
      where a.status<>'retired'
    ),'[]'::jsonb),
    'department_briefs',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',b.id,'department',b.department,'lead_agent_code',b.lead_agent_code,'brief_type',b.brief_type,
        'status',b.status,'model',b.model,'summary',b.summary,'metrics',b.metrics,'created_at',b.created_at
      ) order by b.created_at desc)
      from (select * from public.founder_department_briefs order by created_at desc limit 100) b
    ),'[]'::jsonb)
  );
end $$;

revoke all on function public.mw_founder_ai_playbooks_snapshot() from public;
grant execute on function public.mw_founder_ai_playbooks_snapshot() to authenticated;
