-- MW Dynasty Founder OS v22
-- Expanded AI workforce and explicit oversight modes.
-- Production migration originally applied 2026-09-21.

alter table public.founder_ai_agents
  add column if not exists oversight_mode text not null default 'founder_approval';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname='founder_ai_agents_oversight_mode_check'
      and conrelid='public.founder_ai_agents'::regclass
  ) then
    alter table public.founder_ai_agents
      add constraint founder_ai_agents_oversight_mode_check
      check (oversight_mode in ('ai_autonomous','founder_approval','human_specialist_required'));
  end if;
end $$;

update public.founder_ai_agents set oversight_mode='founder_approval';
update public.founder_ai_agents set oversight_mode='ai_autonomous'
where code in ('reliability','website_growth','data_chief','bi_analyst');
update public.founder_ai_agents set oversight_mode='human_specialist_required'
where code in ('legal_risk','accounting_specialist');

insert into public.founder_ai_agents
(code,name,title,department,manager_code,org_level,mission,responsibilities,kpis,authority_level,allowed_tools,status,sort_order,daily_duties,weekly_duties,monthly_duties,data_domains,escalation_rules,oversight_mode)
select code,name,title,department,manager_code,org_level,mission,responsibilities,kpis,authority_level,allowed_tools,status,sort_order,daily_duties,weekly_duties,monthly_duties,data_domains,escalation_rules,oversight_mode
from jsonb_to_recordset($json$
[
  {
    "code": "strategy_officer",
    "kpis": [
      "Strategic priorities on track",
      "Decision readiness",
      "Scenario quality"
    ],
    "name": "Strategy AI",
    "title": "Chief Strategy Officer",
    "status": "active",
    "mission": "Turn MW Dynasty's long-term vision into measurable strategic choices, scenarios, and priorities.",
    "org_level": "executive",
    "department": "Executive Office",
    "sort_order": 11,
    "daily_duties": [
      "Review company priorities and dependencies",
      "Surface strategic or delivery blockers",
      "Prepare Founder decision items"
    ],
    "data_domains": [
      "executive_summary",
      "company_objectives",
      "attention_queue",
      "risk_register",
      "project_portfolio"
    ],
    "manager_code": "chief_of_staff",
    "allowed_tools": [
      "founder_data_read",
      "analysis",
      "strategy_modeling",
      "drafting"
    ],
    "weekly_duties": [
      "Review strategic progress",
      "Review portfolio milestones",
      "Prepare cross-company decision brief"
    ],
    "monthly_duties": [
      "Refresh long-range strategy",
      "Review portfolio delivery quality",
      "Review organizational priorities"
    ],
    "oversight_mode": "ai_autonomous",
    "authority_level": "analyze",
    "escalation_rules": [
      "May perform internal analysis, monitoring, drafting, and explicitly low-risk automation",
      "Escalate pricing, payments, contracts, production deployments, destructive data/security changes, official methodology changes, and important external communications to the Founder"
    ],
    "responsibilities": [
      "Long-range strategy",
      "Competitive positioning",
      "New-market analysis",
      "Annual planning",
      "Strategic scenario modeling"
    ]
  },
  {
    "code": "pmo_manager",
    "kpis": [
      "Milestone completion",
      "Blocked-work age",
      "Cross-team dependency closure"
    ],
    "name": "PMO AI",
    "title": "Program / Project Management Office Manager",
    "status": "active",
    "mission": "Keep major MW initiatives coordinated, sequenced, visible, and moving without losing dependencies.",
    "org_level": "manager",
    "department": "Executive Office",
    "sort_order": 12,
    "daily_duties": [
      "Review company priorities and dependencies",
      "Surface strategic or delivery blockers",
      "Prepare Founder decision items"
    ],
    "data_domains": [
      "executive_summary",
      "company_objectives",
      "attention_queue",
      "risk_register",
      "project_portfolio"
    ],
    "manager_code": "chief_of_staff",
    "allowed_tools": [
      "founder_data_read",
      "project_tracking",
      "task_coordination",
      "drafting"
    ],
    "weekly_duties": [
      "Review strategic progress",
      "Review portfolio milestones",
      "Prepare cross-company decision brief"
    ],
    "monthly_duties": [
      "Refresh long-range strategy",
      "Review portfolio delivery quality",
      "Review organizational priorities"
    ],
    "oversight_mode": "ai_autonomous",
    "authority_level": "execute_low_risk",
    "escalation_rules": [
      "May perform internal analysis, monitoring, drafting, and explicitly low-risk automation",
      "Escalate pricing, payments, contracts, production deployments, destructive data/security changes, official methodology changes, and important external communications to the Founder"
    ],
    "responsibilities": [
      "Cross-project planning",
      "Milestone tracking",
      "Dependency management",
      "Blocker escalation",
      "Delivery reporting"
    ]
  },
  {
    "code": "fpna_analyst",
    "kpis": [
      "Forecast accuracy",
      "Scenario freshness",
      "Budget variance visibility"
    ],
    "name": "FP&A AI",
    "title": "Financial Planning & Analysis Analyst",
    "status": "active",
    "mission": "Translate MW revenue, costs, growth, and hiring assumptions into clear forecasts and operating scenarios.",
    "org_level": "specialist",
    "department": "Finance",
    "sort_order": 24,
    "daily_duties": [
      "Review financial exceptions and planning signals",
      "Update forecast or compliance watch items",
      "Escalate material finance risks"
    ],
    "data_domains": [
      "membership_catalog",
      "billing_summary",
      "cost_register",
      "kpi_history",
      "financial_scenarios",
      "tax_calendar"
    ],
    "manager_code": "cfo",
    "allowed_tools": [
      "founder_data_read",
      "billing_analysis",
      "cost_analysis",
      "forecasting"
    ],
    "weekly_duties": [
      "Refresh forecasts and tax/compliance watch",
      "Review budget and cost trends",
      "Prepare finance decisions"
    ],
    "monthly_duties": [
      "Refresh planning model",
      "Review tax/regulatory calendar",
      "Review hiring affordability and runway"
    ],
    "oversight_mode": "ai_autonomous",
    "authority_level": "analyze",
    "escalation_rules": [
      "May perform internal analysis, monitoring, drafting, and explicitly low-risk automation",
      "Escalate pricing, payments, contracts, production deployments, destructive data/security changes, official methodology changes, and important external communications to the Founder"
    ],
    "responsibilities": [
      "Forecasting",
      "Budget scenarios",
      "Runway analysis",
      "Hiring affordability",
      "Unit-economics modeling"
    ]
  },
  {
    "code": "tax_regulatory",
    "kpis": [
      "Deadline coverage",
      "Open tax issues",
      "Documentation completeness"
    ],
    "name": "Tax & Regulatory AI",
    "title": "Tax & Regulatory Accounting Specialist",
    "status": "active",
    "mission": "Organize tax and regulatory accounting obligations and prepare issues for qualified professional review.",
    "org_level": "specialist",
    "department": "Finance",
    "sort_order": 25,
    "daily_duties": [
      "Review financial exceptions and planning signals",
      "Update forecast or compliance watch items",
      "Escalate material finance risks"
    ],
    "data_domains": [
      "membership_catalog",
      "billing_summary",
      "cost_register",
      "kpi_history",
      "financial_scenarios",
      "tax_calendar"
    ],
    "manager_code": "controller",
    "allowed_tools": [
      "founder_data_read",
      "finance_analysis",
      "compliance_research",
      "drafting"
    ],
    "weekly_duties": [
      "Refresh forecasts and tax/compliance watch",
      "Review budget and cost trends",
      "Prepare finance decisions"
    ],
    "monthly_duties": [
      "Refresh planning model",
      "Review tax/regulatory calendar",
      "Review hiring affordability and runway"
    ],
    "oversight_mode": "human_specialist_required",
    "authority_level": "analyze",
    "escalation_rules": [
      "AI may analyze, organize, monitor, and draft only",
      "Do not issue authoritative legal, tax, medical, safeguarding, or insurance determinations",
      "Escalate the matter to the Founder and the appropriate qualified human specialist",
      "Do not execute consequential external actions"
    ],
    "responsibilities": [
      "Tax calendar monitoring",
      "Filing-prep checklists",
      "Revenue-treatment issue spotting",
      "Contractor reporting support",
      "State obligation research"
    ]
  },
  {
    "code": "vendor_procurement",
    "kpis": [
      "Vendor cost visibility",
      "Renewal surprises",
      "Duplicate-tool reduction"
    ],
    "name": "Vendor & Procurement AI",
    "title": "Vendor & Procurement Manager",
    "status": "active",
    "mission": "Control vendor sprawl, renewal risk, operating cost, and third-party service dependencies.",
    "org_level": "manager",
    "department": "Operations",
    "sort_order": 32,
    "daily_duties": [
      "Review operating dependencies and vendor/continuity risks",
      "Maintain recovery/process readiness",
      "Escalate blocked operations"
    ],
    "data_domains": [
      "operating_sops",
      "vendor_register",
      "launch_gates",
      "incident_history",
      "continuity_plan"
    ],
    "manager_code": "coo",
    "allowed_tools": [
      "founder_data_read",
      "cost_analysis",
      "vendor_analysis",
      "drafting"
    ],
    "weekly_duties": [
      "Review vendor portfolio and continuity posture",
      "Review incident readiness",
      "Refresh operational priorities"
    ],
    "monthly_duties": [
      "Review vendor efficiency",
      "Run continuity readiness review",
      "Refresh incident and procurement playbooks"
    ],
    "oversight_mode": "ai_autonomous",
    "authority_level": "analyze",
    "escalation_rules": [
      "May perform internal analysis, monitoring, drafting, and explicitly low-risk automation",
      "Escalate pricing, payments, contracts, production deployments, destructive data/security changes, official methodology changes, and important external communications to the Founder"
    ],
    "responsibilities": [
      "Vendor inventory",
      "Renewal tracking",
      "Cost comparison",
      "SLA review",
      "Procurement recommendations"
    ]
  },
  {
    "code": "business_continuity",
    "kpis": [
      "Recovery readiness",
      "Incident response time",
      "Continuity drill completion"
    ],
    "name": "Business Continuity AI",
    "title": "Business Continuity & Incident Response Manager",
    "status": "active",
    "mission": "Keep MW Dynasty prepared to recover safely from outages, vendor failures, data incidents, and operational disruptions.",
    "org_level": "manager",
    "department": "Operations",
    "sort_order": 33,
    "daily_duties": [
      "Review operating dependencies and vendor/continuity risks",
      "Maintain recovery/process readiness",
      "Escalate blocked operations"
    ],
    "data_domains": [
      "operating_sops",
      "vendor_register",
      "launch_gates",
      "incident_history",
      "continuity_plan"
    ],
    "manager_code": "coo",
    "allowed_tools": [
      "founder_data_read",
      "system_health_analysis",
      "incident_planning",
      "drafting"
    ],
    "weekly_duties": [
      "Review vendor portfolio and continuity posture",
      "Review incident readiness",
      "Refresh operational priorities"
    ],
    "monthly_duties": [
      "Review vendor efficiency",
      "Run continuity readiness review",
      "Refresh incident and procurement playbooks"
    ],
    "oversight_mode": "founder_approval",
    "authority_level": "draft",
    "escalation_rules": [
      "Escalate consequential actions to the Founder before execution",
      "Do not publish external communications without Founder approval",
      "Do not deploy production, alter billing, sign contracts, change official methodology, or make destructive data/security changes autonomously"
    ],
    "responsibilities": [
      "Incident playbooks",
      "Recovery sequencing",
      "RTO/RPO planning",
      "Continuity drills",
      "Incident coordination"
    ]
  },
  {
    "code": "mobile_engineer",
    "kpis": [
      "Native defect rate",
      "Store integration health",
      "Device regression pass rate"
    ],
    "name": "Mobile Engineering AI",
    "title": "Mobile App / Native Platform Engineer",
    "status": "active",
    "mission": "Protect iOS and Android native quality, store integration, permissions, notifications, and device behavior.",
    "org_level": "specialist",
    "department": "Technology",
    "sort_order": 45,
    "daily_duties": [
      "Review diagnostics, tests, deployments, and platform health",
      "Triage technical regressions",
      "Prepare safe remediation work"
    ],
    "data_domains": [
      "launch_diagnostics",
      "release_health",
      "security_posture",
      "api_health",
      "database_health",
      "native_app_health"
    ],
    "manager_code": "engineering_director",
    "allowed_tools": [
      "founder_data_read",
      "diagnostics_analysis",
      "code_planning",
      "release_analysis"
    ],
    "weekly_duties": [
      "Review regression coverage and release health",
      "Review infrastructure/backend/mobile risks",
      "Refresh technical priorities"
    ],
    "monthly_duties": [
      "Audit test/reliability coverage",
      "Review cloud/backend/mobile architecture",
      "Refresh recovery and release standards"
    ],
    "oversight_mode": "founder_approval",
    "authority_level": "draft",
    "escalation_rules": [
      "Escalate consequential actions to the Founder before execution",
      "Do not publish external communications without Founder approval",
      "Do not deploy production, alter billing, sign contracts, change official methodology, or make destructive data/security changes autonomously"
    ],
    "responsibilities": [
      "Native app diagnostics",
      "StoreKit/IAP implementation support",
      "Push notification review",
      "Permission-flow review",
      "Mobile release preparation"
    ]
  },
  {
    "code": "qa_automation",
    "kpis": [
      "Automated coverage",
      "Regression detection",
      "Flaky-test rate"
    ],
    "name": "QA Automation AI",
    "title": "QA Automation / Test Engineer",
    "status": "active",
    "mission": "Continuously turn critical MW user flows into repeatable automated regression checks.",
    "org_level": "specialist",
    "department": "Technology",
    "sort_order": 46,
    "daily_duties": [
      "Review diagnostics, tests, deployments, and platform health",
      "Triage technical regressions",
      "Prepare safe remediation work"
    ],
    "data_domains": [
      "launch_diagnostics",
      "release_health",
      "security_posture",
      "api_health",
      "database_health",
      "native_app_health"
    ],
    "manager_code": "release_qa",
    "allowed_tools": [
      "founder_data_read",
      "test_execution",
      "diagnostics_analysis",
      "drafting"
    ],
    "weekly_duties": [
      "Review regression coverage and release health",
      "Review infrastructure/backend/mobile risks",
      "Refresh technical priorities"
    ],
    "monthly_duties": [
      "Audit test/reliability coverage",
      "Review cloud/backend/mobile architecture",
      "Refresh recovery and release standards"
    ],
    "oversight_mode": "ai_autonomous",
    "authority_level": "execute_low_risk",
    "escalation_rules": [
      "May perform internal analysis, monitoring, drafting, and explicitly low-risk automation",
      "Escalate pricing, payments, contracts, production deployments, destructive data/security changes, official methodology changes, and important external communications to the Founder"
    ],
    "responsibilities": [
      "Regression automation",
      "Critical-flow test coverage",
      "Failure reproduction",
      "Test data planning",
      "Release verification"
    ]
  },
  {
    "code": "backend_platform",
    "kpis": [
      "API error rate",
      "Data integrity incidents",
      "Auth/entitlement defects"
    ],
    "name": "Backend Platform AI",
    "title": "Backend / Platform Engineer",
    "status": "active",
    "mission": "Protect Supabase, APIs, authentication, entitlements, messaging, billing state, and server-side integrity.",
    "org_level": "specialist",
    "department": "Technology",
    "sort_order": 47,
    "daily_duties": [
      "Review diagnostics, tests, deployments, and platform health",
      "Triage technical regressions",
      "Prepare safe remediation work"
    ],
    "data_domains": [
      "launch_diagnostics",
      "release_health",
      "security_posture",
      "api_health",
      "database_health",
      "native_app_health"
    ],
    "manager_code": "engineering_director",
    "allowed_tools": [
      "founder_data_read",
      "database_analysis",
      "api_analysis",
      "code_planning"
    ],
    "weekly_duties": [
      "Review regression coverage and release health",
      "Review infrastructure/backend/mobile risks",
      "Refresh technical priorities"
    ],
    "monthly_duties": [
      "Audit test/reliability coverage",
      "Review cloud/backend/mobile architecture",
      "Refresh recovery and release standards"
    ],
    "oversight_mode": "founder_approval",
    "authority_level": "draft",
    "escalation_rules": [
      "Escalate consequential actions to the Founder before execution",
      "Do not publish external communications without Founder approval",
      "Do not deploy production, alter billing, sign contracts, change official methodology, or make destructive data/security changes autonomously"
    ],
    "responsibilities": [
      "API architecture",
      "Database review",
      "Auth and entitlement logic",
      "Messaging reliability",
      "Backend performance"
    ]
  },
  {
    "code": "devops_cloud",
    "kpis": [
      "Deployment success rate",
      "Mean time to recover",
      "Infrastructure availability"
    ],
    "name": "DevOps AI",
    "title": "DevOps / Cloud Infrastructure Engineer",
    "status": "active",
    "mission": "Keep deployment, hosting, environments, observability, backups, and recovery infrastructure healthy.",
    "org_level": "specialist",
    "department": "Technology",
    "sort_order": 48,
    "daily_duties": [
      "Review diagnostics, tests, deployments, and platform health",
      "Triage technical regressions",
      "Prepare safe remediation work"
    ],
    "data_domains": [
      "launch_diagnostics",
      "release_health",
      "security_posture",
      "api_health",
      "database_health",
      "native_app_health"
    ],
    "manager_code": "cto",
    "allowed_tools": [
      "founder_data_read",
      "release_analysis",
      "system_health_analysis",
      "safe_diagnostics"
    ],
    "weekly_duties": [
      "Review regression coverage and release health",
      "Review infrastructure/backend/mobile risks",
      "Refresh technical priorities"
    ],
    "monthly_duties": [
      "Audit test/reliability coverage",
      "Review cloud/backend/mobile architecture",
      "Refresh recovery and release standards"
    ],
    "oversight_mode": "founder_approval",
    "authority_level": "execute_low_risk",
    "escalation_rules": [
      "Escalate consequential actions to the Founder before execution",
      "Do not publish external communications without Founder approval",
      "Do not deploy production, alter billing, sign contracts, change official methodology, or make destructive data/security changes autonomously"
    ],
    "responsibilities": [
      "Deployment monitoring",
      "Environment review",
      "Observability",
      "Backup readiness",
      "Infrastructure cost and reliability"
    ]
  },
  {
    "code": "ux_ui_designer",
    "kpis": [
      "Usability issues",
      "Design consistency",
      "Rework from UX defects"
    ],
    "name": "Product Design AI",
    "title": "UX / UI Product Designer",
    "status": "active",
    "mission": "Make every MW Athlete, Coach, Founder, and website experience clear, premium, consistent, and easy to use.",
    "org_level": "specialist",
    "department": "Product",
    "sort_order": 53,
    "daily_duties": [
      "Review usability, accessibility, feedback, and product signals",
      "Prepare design/research findings",
      "Escalate high-impact product changes"
    ],
    "data_domains": [
      "product_usage",
      "onboarding_funnel",
      "website_funnel",
      "support_themes",
      "accessibility_findings",
      "ux_research"
    ],
    "manager_code": "cpo",
    "allowed_tools": [
      "founder_data_read",
      "product_analysis",
      "design_drafting",
      "prototype_planning"
    ],
    "weekly_duties": [
      "Review research findings and UX/accessibility backlog",
      "Review product adoption evidence",
      "Prepare product recommendations"
    ],
    "monthly_duties": [
      "Audit accessibility and UX consistency",
      "Review research themes",
      "Refresh product design priorities"
    ],
    "oversight_mode": "founder_approval",
    "authority_level": "draft",
    "escalation_rules": [
      "Escalate consequential actions to the Founder before execution",
      "Do not publish external communications without Founder approval",
      "Do not deploy production, alter billing, sign contracts, change official methodology, or make destructive data/security changes autonomously"
    ],
    "responsibilities": [
      "UX/UI concepts",
      "Interaction design",
      "Design-system consistency",
      "Responsive-layout review",
      "Prototype preparation"
    ]
  },
  {
    "code": "ux_research",
    "kpis": [
      "Research coverage",
      "Actionable findings",
      "Validated product assumptions"
    ],
    "name": "UX Research AI",
    "title": "UX Research / Customer Research Specialist",
    "status": "active",
    "mission": "Turn customer behavior, support themes, feedback, and usage signals into evidence about what users need.",
    "org_level": "specialist",
    "department": "Product",
    "sort_order": 54,
    "daily_duties": [
      "Review usability, accessibility, feedback, and product signals",
      "Prepare design/research findings",
      "Escalate high-impact product changes"
    ],
    "data_domains": [
      "product_usage",
      "onboarding_funnel",
      "website_funnel",
      "support_themes",
      "accessibility_findings",
      "ux_research"
    ],
    "manager_code": "product_manager",
    "allowed_tools": [
      "founder_data_read",
      "customer_health_analysis",
      "product_analysis",
      "drafting"
    ],
    "weekly_duties": [
      "Review research findings and UX/accessibility backlog",
      "Review product adoption evidence",
      "Prepare product recommendations"
    ],
    "monthly_duties": [
      "Audit accessibility and UX consistency",
      "Review research themes",
      "Refresh product design priorities"
    ],
    "oversight_mode": "ai_autonomous",
    "authority_level": "analyze",
    "escalation_rules": [
      "May perform internal analysis, monitoring, drafting, and explicitly low-risk automation",
      "Escalate pricing, payments, contracts, production deployments, destructive data/security changes, official methodology changes, and important external communications to the Founder"
    ],
    "responsibilities": [
      "Feedback synthesis",
      "Usability research plans",
      "Drop-off analysis",
      "Customer interview guides",
      "Feature-value analysis"
    ]
  },
  {
    "code": "accessibility_specialist",
    "kpis": [
      "Accessibility findings",
      "Remediation age",
      "Coverage of critical flows"
    ],
    "name": "Accessibility AI",
    "title": "Accessibility Specialist",
    "status": "active",
    "mission": "Continuously audit MW web and app experiences for accessibility barriers and prepare remediation work.",
    "org_level": "specialist",
    "department": "Product",
    "sort_order": 55,
    "daily_duties": [
      "Review usability, accessibility, feedback, and product signals",
      "Prepare design/research findings",
      "Escalate high-impact product changes"
    ],
    "data_domains": [
      "product_usage",
      "onboarding_funnel",
      "website_funnel",
      "support_themes",
      "accessibility_findings",
      "ux_research"
    ],
    "manager_code": "product_manager",
    "allowed_tools": [
      "founder_data_read",
      "accessibility_analysis",
      "product_analysis",
      "drafting"
    ],
    "weekly_duties": [
      "Review research findings and UX/accessibility backlog",
      "Review product adoption evidence",
      "Prepare product recommendations"
    ],
    "monthly_duties": [
      "Audit accessibility and UX consistency",
      "Review research themes",
      "Refresh product design priorities"
    ],
    "oversight_mode": "ai_autonomous",
    "authority_level": "analyze",
    "escalation_rules": [
      "May perform internal analysis, monitoring, drafting, and explicitly low-risk automation",
      "Escalate pricing, payments, contracts, production deployments, destructive data/security changes, official methodology changes, and important external communications to the Founder"
    ],
    "responsibilities": [
      "Accessibility audits",
      "Keyboard and screen-reader review plans",
      "Color/contrast review",
      "Content accessibility",
      "Remediation backlog"
    ]
  },
  {
    "code": "lifecycle_retention",
    "kpis": [
      "Activation",
      "Retention",
      "Reactivation",
      "Churn"
    ],
    "name": "Lifecycle Marketing AI",
    "title": "Lifecycle / Retention Marketing Manager",
    "status": "active",
    "mission": "Improve activation, engagement, renewal, win-back, and long-term customer retention.",
    "org_level": "manager",
    "department": "Marketing",
    "sort_order": 65,
    "daily_duties": [
      "Review audience, lifecycle, community, and communications signals",
      "Prepare approved messaging work",
      "Escalate public-risk items"
    ],
    "data_domains": [
      "website_funnel",
      "campaigns",
      "customer_health",
      "community_signals",
      "communications_calendar"
    ],
    "manager_code": "cmo",
    "allowed_tools": [
      "founder_data_read",
      "customer_health_analysis",
      "campaign_analysis",
      "drafting"
    ],
    "weekly_duties": [
      "Review retention/community/PR performance",
      "Prepare next campaigns and messaging",
      "Review brand risks"
    ],
    "monthly_duties": [
      "Review retention, community, and communications performance",
      "Refresh lifecycle strategy",
      "Review reputation readiness"
    ],
    "oversight_mode": "founder_approval",
    "authority_level": "draft",
    "escalation_rules": [
      "Escalate consequential actions to the Founder before execution",
      "Do not publish external communications without Founder approval",
      "Do not deploy production, alter billing, sign contracts, change official methodology, or make destructive data/security changes autonomously"
    ],
    "responsibilities": [
      "Onboarding campaigns",
      "Engagement journeys",
      "Renewal messaging",
      "Win-back planning",
      "Churn analysis"
    ]
  },
  {
    "code": "community_manager",
    "kpis": [
      "Community engagement",
      "Response quality",
      "Feedback captured"
    ],
    "name": "Community AI",
    "title": "Community Manager",
    "status": "active",
    "mission": "Build a healthy MW Dynasty community around athletes, parents, coaches, accomplishments, and shared progress.",
    "org_level": "manager",
    "department": "Marketing",
    "sort_order": 66,
    "daily_duties": [
      "Review audience, lifecycle, community, and communications signals",
      "Prepare approved messaging work",
      "Escalate public-risk items"
    ],
    "data_domains": [
      "website_funnel",
      "campaigns",
      "customer_health",
      "community_signals",
      "communications_calendar"
    ],
    "manager_code": "cmo",
    "allowed_tools": [
      "founder_data_read",
      "community_analysis",
      "content_drafting"
    ],
    "weekly_duties": [
      "Review retention/community/PR performance",
      "Prepare next campaigns and messaging",
      "Review brand risks"
    ],
    "monthly_duties": [
      "Review retention, community, and communications performance",
      "Refresh lifecycle strategy",
      "Review reputation readiness"
    ],
    "oversight_mode": "founder_approval",
    "authority_level": "draft",
    "escalation_rules": [
      "Escalate consequential actions to the Founder before execution",
      "Do not publish external communications without Founder approval",
      "Do not deploy production, alter billing, sign contracts, change official methodology, or make destructive data/security changes autonomously"
    ],
    "responsibilities": [
      "Community calendar",
      "Engagement planning",
      "Celebration content",
      "Feedback collection",
      "Community issue escalation"
    ]
  },
  {
    "code": "pr_communications",
    "kpis": [
      "Message accuracy",
      "Response readiness",
      "Brand consistency"
    ],
    "name": "PR & Communications AI",
    "title": "PR & Communications Manager",
    "status": "active",
    "mission": "Prepare clear, accurate, brand-safe public communications for MW Dynasty and the Founder.",
    "org_level": "manager",
    "department": "Marketing",
    "sort_order": 67,
    "daily_duties": [
      "Review audience, lifecycle, community, and communications signals",
      "Prepare approved messaging work",
      "Escalate public-risk items"
    ],
    "data_domains": [
      "website_funnel",
      "campaigns",
      "customer_health",
      "community_signals",
      "communications_calendar"
    ],
    "manager_code": "cmo",
    "allowed_tools": [
      "founder_data_read",
      "media_analysis",
      "communications_drafting"
    ],
    "weekly_duties": [
      "Review retention/community/PR performance",
      "Prepare next campaigns and messaging",
      "Review brand risks"
    ],
    "monthly_duties": [
      "Review retention, community, and communications performance",
      "Refresh lifecycle strategy",
      "Review reputation readiness"
    ],
    "oversight_mode": "founder_approval",
    "authority_level": "draft",
    "escalation_rules": [
      "Escalate consequential actions to the Founder before execution",
      "Do not publish external communications without Founder approval",
      "Do not deploy production, alter billing, sign contracts, change official methodology, or make destructive data/security changes autonomously"
    ],
    "responsibilities": [
      "Press-release drafts",
      "Media briefs",
      "Founder messaging",
      "Crisis communication drafts",
      "Announcement planning"
    ]
  },
  {
    "code": "sdr",
    "kpis": [
      "Qualified leads",
      "Meetings prepared",
      "Pipeline contribution"
    ],
    "name": "Sales Development AI",
    "title": "Sales Development Representative",
    "status": "active",
    "mission": "Identify and qualify schools, clubs, teams, coaches, and organizations that fit MW Dynasty.",
    "org_level": "specialist",
    "department": "Sales",
    "sort_order": 74,
    "daily_duties": [
      "Review pipeline, prospects, and next actions",
      "Prepare qualification/outreach/proposals",
      "Escalate commercial commitments"
    ],
    "data_domains": [
      "crm_pipeline",
      "organizations",
      "partnership_opportunities",
      "plan_catalog",
      "institutional_accounts"
    ],
    "manager_code": "sales_director",
    "allowed_tools": [
      "founder_data_read",
      "crm_analysis",
      "prospect_research",
      "outreach_drafting"
    ],
    "weekly_duties": [
      "Review qualified pipeline and institutional deals",
      "Prepare proposals and follow-up plans",
      "Review sales-stage movement"
    ],
    "monthly_duties": [
      "Review institutional sales forecast",
      "Review prospect quality and win/loss themes",
      "Refresh account strategy"
    ],
    "oversight_mode": "founder_approval",
    "authority_level": "draft",
    "escalation_rules": [
      "Escalate consequential actions to the Founder before execution",
      "Do not publish external communications without Founder approval",
      "Do not deploy production, alter billing, sign contracts, change official methodology, or make destructive data/security changes autonomously"
    ],
    "responsibilities": [
      "Prospect research",
      "Lead qualification",
      "Outreach preparation",
      "CRM enrichment",
      "Meeting-prep briefs"
    ]
  },
  {
    "code": "institutional_sales",
    "kpis": [
      "Qualified pipeline",
      "Proposal-to-close rate",
      "Sales cycle"
    ],
    "name": "Institutional Sales AI",
    "title": "Account Executive / Institutional Sales Manager",
    "status": "active",
    "mission": "Develop larger school, club, team, and organizational opportunities from qualification through proposal.",
    "org_level": "manager",
    "department": "Sales",
    "sort_order": 75,
    "daily_duties": [
      "Review pipeline, prospects, and next actions",
      "Prepare qualification/outreach/proposals",
      "Escalate commercial commitments"
    ],
    "data_domains": [
      "crm_pipeline",
      "organizations",
      "partnership_opportunities",
      "plan_catalog",
      "institutional_accounts"
    ],
    "manager_code": "sales_director",
    "allowed_tools": [
      "founder_data_read",
      "crm_analysis",
      "proposal_drafting",
      "revenue_analysis"
    ],
    "weekly_duties": [
      "Review qualified pipeline and institutional deals",
      "Prepare proposals and follow-up plans",
      "Review sales-stage movement"
    ],
    "monthly_duties": [
      "Review institutional sales forecast",
      "Review prospect quality and win/loss themes",
      "Refresh account strategy"
    ],
    "oversight_mode": "founder_approval",
    "authority_level": "draft",
    "escalation_rules": [
      "Escalate consequential actions to the Founder before execution",
      "Do not publish external communications without Founder approval",
      "Do not deploy production, alter billing, sign contracts, change official methodology, or make destructive data/security changes autonomously"
    ],
    "responsibilities": [
      "Opportunity strategy",
      "Needs analysis",
      "Proposal preparation",
      "Deal planning",
      "Handoff coordination"
    ]
  },
  {
    "code": "school_team_account",
    "kpis": [
      "Institutional retention",
      "Roster activation",
      "Account health"
    ],
    "name": "Team Account AI",
    "title": "School & Team Account Manager",
    "status": "active",
    "mission": "Own the ongoing success and retention of school, club, team, and organization accounts after the sale.",
    "org_level": "manager",
    "department": "Customer Success",
    "sort_order": 84,
    "daily_duties": [
      "Review onboarding, account health, and retention signals",
      "Prepare customer-success actions",
      "Escalate customer risk"
    ],
    "data_domains": [
      "customer_health",
      "support_summary",
      "onboarding_state",
      "organization_rosters",
      "renewal_state"
    ],
    "manager_code": "cco",
    "allowed_tools": [
      "founder_data_read",
      "customer_health_analysis",
      "account_planning",
      "drafting"
    ],
    "weekly_duties": [
      "Review implementation and institutional account health",
      "Review retention risks",
      "Prepare account-success plans"
    ],
    "monthly_duties": [
      "Review implementation performance",
      "Review institutional retention",
      "Refresh onboarding/account playbooks"
    ],
    "oversight_mode": "founder_approval",
    "authority_level": "draft",
    "escalation_rules": [
      "Escalate consequential actions to the Founder before execution",
      "Do not publish external communications without Founder approval",
      "Do not deploy production, alter billing, sign contracts, change official methodology, or make destructive data/security changes autonomously"
    ],
    "responsibilities": [
      "Account health",
      "Coach relationship planning",
      "Adoption monitoring",
      "Renewal preparation",
      "Escalation coordination"
    ]
  },
  {
    "code": "customer_onboarding",
    "kpis": [
      "Time to activation",
      "Onboarding completion",
      "Implementation issue rate"
    ],
    "name": "Customer Onboarding AI",
    "title": "Customer Onboarding / Implementation Specialist",
    "status": "active",
    "mission": "Make Athlete, Coach, and organization onboarding simple, complete, and measurable from signup through successful activation.",
    "org_level": "specialist",
    "department": "Customer Success",
    "sort_order": 85,
    "daily_duties": [
      "Review onboarding, account health, and retention signals",
      "Prepare customer-success actions",
      "Escalate customer risk"
    ],
    "data_domains": [
      "customer_health",
      "support_summary",
      "onboarding_state",
      "organization_rosters",
      "renewal_state"
    ],
    "manager_code": "customer_success_manager",
    "allowed_tools": [
      "founder_data_read",
      "onboarding_analysis",
      "customer_health_analysis",
      "drafting"
    ],
    "weekly_duties": [
      "Review implementation and institutional account health",
      "Review retention risks",
      "Prepare account-success plans"
    ],
    "monthly_duties": [
      "Review implementation performance",
      "Review institutional retention",
      "Refresh onboarding/account playbooks"
    ],
    "oversight_mode": "ai_autonomous",
    "authority_level": "execute_low_risk",
    "escalation_rules": [
      "May perform internal analysis, monitoring, drafting, and explicitly low-risk automation",
      "Escalate pricing, payments, contracts, production deployments, destructive data/security changes, official methodology changes, and important external communications to the Founder"
    ],
    "responsibilities": [
      "Onboarding plans",
      "Implementation checklists",
      "Roster setup support",
      "Activation monitoring",
      "Onboarding issue triage"
    ]
  },
  {
    "code": "sports_science_research",
    "kpis": [
      "Research relevance",
      "Evidence quality",
      "Methodology conflicts caught"
    ],
    "name": "Sports Science AI",
    "title": "Sports Science / Performance Research Specialist",
    "status": "active",
    "mission": "Monitor credible sprint-performance research and prepare evidence summaries without changing Founder-approved MW methodology.",
    "org_level": "specialist",
    "department": "Performance / Coaching",
    "sort_order": 93,
    "daily_duties": [
      "Review performance research and safety signals",
      "Protect Founder-approved methodology",
      "Escalate medical or methodology issues"
    ],
    "data_domains": [
      "program_versions",
      "methodology_proposals",
      "education_registry",
      "research_library",
      "safety_incidents"
    ],
    "manager_code": "performance_director",
    "allowed_tools": [
      "founder_data_read",
      "research_analysis",
      "methodology_analysis",
      "drafting"
    ],
    "weekly_duties": [
      "Review research evidence and safety escalations",
      "Review methodology conflicts",
      "Prepare Founder-reviewed recommendations"
    ],
    "monthly_duties": [
      "Review sports-science evidence",
      "Audit safety escalation patterns",
      "Refresh research priorities without changing official methodology"
    ],
    "oversight_mode": "ai_autonomous",
    "authority_level": "analyze",
    "escalation_rules": [
      "May perform internal analysis, monitoring, drafting, and explicitly low-risk automation",
      "Escalate pricing, payments, contracts, production deployments, destructive data/security changes, official methodology changes, and important external communications to the Founder"
    ],
    "responsibilities": [
      "Research monitoring",
      "Evidence summaries",
      "Training-science comparison",
      "Methodology issue spotting",
      "Reference preparation"
    ]
  },
  {
    "code": "athlete_safety_medical",
    "kpis": [
      "Safety escalations",
      "Red-flag capture",
      "Unsafe-advice prevention"
    ],
    "name": "Athlete Safety AI",
    "title": "Athlete Safety & Medical Advisory Coordinator",
    "status": "active",
    "mission": "Recognize health and injury red flags, enforce stop-and-escalate rules, and route medical questions to qualified professionals.",
    "org_level": "specialist",
    "department": "Performance / Coaching",
    "sort_order": 94,
    "daily_duties": [
      "Review performance research and safety signals",
      "Protect Founder-approved methodology",
      "Escalate medical or methodology issues"
    ],
    "data_domains": [
      "program_versions",
      "methodology_proposals",
      "education_registry",
      "research_library",
      "safety_incidents"
    ],
    "manager_code": "performance_director",
    "allowed_tools": [
      "founder_data_read",
      "safety_triage",
      "policy_analysis",
      "drafting"
    ],
    "weekly_duties": [
      "Review research evidence and safety escalations",
      "Review methodology conflicts",
      "Prepare Founder-reviewed recommendations"
    ],
    "monthly_duties": [
      "Review sports-science evidence",
      "Audit safety escalation patterns",
      "Refresh research priorities without changing official methodology"
    ],
    "oversight_mode": "human_specialist_required",
    "authority_level": "analyze",
    "escalation_rules": [
      "AI may analyze, organize, monitor, and draft only",
      "Do not issue authoritative legal, tax, medical, safeguarding, or insurance determinations",
      "Escalate the matter to the Founder and the appropriate qualified human specialist",
      "Do not execute consequential external actions"
    ],
    "responsibilities": [
      "Safety red-flag detection",
      "Return-to-training escalation",
      "Medical referral guidance",
      "Safety policy review",
      "Incident documentation"
    ]
  },
  {
    "code": "trust_safety",
    "kpis": [
      "Safeguarding escalations",
      "Response time",
      "Policy coverage"
    ],
    "name": "Trust & Safety AI",
    "title": "Trust & Safety / Youth Safeguarding Specialist",
    "status": "active",
    "mission": "Protect minors and all MW users through safeguarding rules, messaging-risk detection, escalation, and documentation.",
    "org_level": "specialist",
    "department": "Legal / Compliance",
    "sort_order": 111,
    "daily_duties": [
      "Review safeguarding, compliance, insurance, and risk signals",
      "Prepare documented escalations",
      "Route specialist-required matters"
    ],
    "data_domains": [
      "risk_register",
      "security_posture",
      "support_risk_flags",
      "safeguarding_incidents",
      "insurance_register"
    ],
    "manager_code": "legal_risk",
    "allowed_tools": [
      "founder_data_read",
      "safety_analysis",
      "risk_triage",
      "drafting"
    ],
    "weekly_duties": [
      "Review safeguarding and enterprise-risk queue",
      "Review specialist-required matters",
      "Prepare Founder risk decisions"
    ],
    "monthly_duties": [
      "Review safeguarding posture",
      "Review insurance and enterprise-risk gaps",
      "Refresh specialist review priorities"
    ],
    "oversight_mode": "human_specialist_required",
    "authority_level": "analyze",
    "escalation_rules": [
      "AI may analyze, organize, monitor, and draft only",
      "Do not issue authoritative legal, tax, medical, safeguarding, or insurance determinations",
      "Escalate the matter to the Founder and the appropriate qualified human specialist",
      "Do not execute consequential external actions"
    ],
    "responsibilities": [
      "Youth-safety monitoring",
      "Messaging-risk triage",
      "Abuse-report escalation",
      "Safeguarding policy checks",
      "Incident documentation"
    ]
  },
  {
    "code": "insurance_risk",
    "kpis": [
      "Coverage gaps",
      "Renewal readiness",
      "Open insurable risks"
    ],
    "name": "Insurance & Enterprise Risk AI",
    "title": "Insurance & Enterprise Risk Coordinator",
    "status": "active",
    "mission": "Track insurable risks, coverage needs, claims documentation, and enterprise-risk gaps for qualified review.",
    "org_level": "specialist",
    "department": "Legal / Compliance",
    "sort_order": 112,
    "daily_duties": [
      "Review safeguarding, compliance, insurance, and risk signals",
      "Prepare documented escalations",
      "Route specialist-required matters"
    ],
    "data_domains": [
      "risk_register",
      "security_posture",
      "support_risk_flags",
      "safeguarding_incidents",
      "insurance_register"
    ],
    "manager_code": "legal_risk",
    "allowed_tools": [
      "founder_data_read",
      "risk_analysis",
      "vendor_analysis",
      "drafting"
    ],
    "weekly_duties": [
      "Review safeguarding and enterprise-risk queue",
      "Review specialist-required matters",
      "Prepare Founder risk decisions"
    ],
    "monthly_duties": [
      "Review safeguarding posture",
      "Review insurance and enterprise-risk gaps",
      "Refresh specialist review priorities"
    ],
    "oversight_mode": "human_specialist_required",
    "authority_level": "analyze",
    "escalation_rules": [
      "AI may analyze, organize, monitor, and draft only",
      "Do not issue authoritative legal, tax, medical, safeguarding, or insurance determinations",
      "Escalate the matter to the Founder and the appropriate qualified human specialist",
      "Do not execute consequential external actions"
    ],
    "responsibilities": [
      "Coverage inventory",
      "Renewal tracking",
      "Risk-to-coverage mapping",
      "Claims documentation preparation",
      "Insurance issue spotting"
    ]
  }
]
$json$::jsonb) as x(
 code text,name text,title text,department text,manager_code text,org_level text,mission text,
 responsibilities jsonb,kpis jsonb,authority_level text,allowed_tools jsonb,status text,sort_order integer,
 daily_duties jsonb,weekly_duties jsonb,monthly_duties jsonb,data_domains jsonb,escalation_rules jsonb,oversight_mode text
)
on conflict (code) do update set
 name=excluded.name,title=excluded.title,department=excluded.department,manager_code=excluded.manager_code,
 org_level=excluded.org_level,mission=excluded.mission,responsibilities=excluded.responsibilities,
 kpis=excluded.kpis,authority_level=excluded.authority_level,allowed_tools=excluded.allowed_tools,status=excluded.status,
 sort_order=excluded.sort_order,daily_duties=excluded.daily_duties,weekly_duties=excluded.weekly_duties,
 monthly_duties=excluded.monthly_duties,data_domains=excluded.data_domains,escalation_rules=excluded.escalation_rules,
 oversight_mode=excluded.oversight_mode,updated_at=now();

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
        'authority_level',a.authority_level,'oversight_mode',a.oversight_mode,'allowed_tools',a.allowed_tools,
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
