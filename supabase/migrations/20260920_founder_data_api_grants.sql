-- Founder OS Data API privileges.
-- All founder_* tables already have RLS enabled and authenticated policies
-- that authorize access through private.mw_is_founder().

grant select, insert, update, delete on table
  public.founder_ai_agents,
  public.founder_ai_objectives,
  public.founder_ai_runs,
  public.founder_ai_tasks,
  public.founder_approvals,
  public.founder_cost_entries,
  public.founder_crm_leads,
  public.founder_department_briefs,
  public.founder_knowledge_proposals,
  public.founder_kpi_snapshots,
  public.founder_launch_gates,
  public.founder_marketing_campaigns,
  public.founder_notifications,
  public.founder_partnership_opportunities,
  public.founder_partnership_proposals,
  public.founder_people_roles,
  public.founder_program_releases,
  public.founder_risk_register,
  public.founder_sops,
  public.founder_support_triage,
  public.founder_web_events
to authenticated;

revoke select, insert, update, delete on table
  public.founder_ai_agents,
  public.founder_ai_objectives,
  public.founder_ai_runs,
  public.founder_ai_tasks,
  public.founder_approvals,
  public.founder_cost_entries,
  public.founder_crm_leads,
  public.founder_department_briefs,
  public.founder_knowledge_proposals,
  public.founder_kpi_snapshots,
  public.founder_launch_gates,
  public.founder_marketing_campaigns,
  public.founder_notifications,
  public.founder_partnership_opportunities,
  public.founder_partnership_proposals,
  public.founder_people_roles,
  public.founder_program_releases,
  public.founder_risk_register,
  public.founder_sops,
  public.founder_support_triage,
  public.founder_web_events
from anon;

notify pgrst, 'reload schema';
