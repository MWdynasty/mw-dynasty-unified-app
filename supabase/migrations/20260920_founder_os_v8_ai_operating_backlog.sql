-- MW Dynasty Founder OS v8
-- Seed real launch/operating AI work without inventing completion or external-provider state.

insert into public.founder_ai_tasks(agent_code,title,description,department,priority,status,source,requires_approval,approval_status,metadata)
select x.agent_code,x.title,x.description,x.department,x.priority,x.status,'founder_os_bootstrap',x.requires_approval,
       case when x.requires_approval then 'pending' else null end,
       jsonb_build_object('origin','Founder OS launch build','created_for','MW Dynasty operating readiness')
from (values
  (
    'release_qa',
    'Complete Build 13 TestFlight release gate',
    'Prepare and maintain the exact release checklist from signed Build 13 through real-device TestFlight QA, StoreKit sandbox validation, diagnostics review, billing-integrity review, and App Review readiness. Do not claim completion until external Apple/Codemagic evidence is verified.',
    'Technology','high','queued',false
  ),
  (
    'security_specialist',
    'Audit authenticated SECURITY DEFINER RPC surface',
    'Review the current Supabase authenticated SECURITY DEFINER findings function by function. Classify intentional user-scoped RPCs versus functions that should have execution revoked or redesigned. Do not make blanket permission changes.',
    'Technology','high','queued',false
  ),
  (
    'website_growth',
    'Close public website analytics coverage gap',
    'Prepare the exact integration plan for adding the shared MW Growth tracker to the standalone public marketing-site source once that source becomes accessible. Include page-view, CTA, signup-entry, attribution, and validation requirements.',
    'Product','high','queued',false
  ),
  (
    'cfo',
    'Establish MW operating cost baseline',
    'Create a Founder checklist of real recurring and usage-based operating costs that should be entered into the Cost Register, including hosting, database, AI, email, Apple Developer, contractors, and other infrastructure. Do not invent amounts.',
    'Finance','normal','queued',false
  ),
  (
    'legal_risk',
    'Prepare App Store launch compliance review',
    'Review MW Dynasty App Store launch requirements against the current product architecture and produce a concise Founder checklist for subscriptions, privacy, age rating, review credentials, purchase disclosures, account deletion, and server notifications.',
    'Legal / Compliance','high','queued',false
  ),
  (
    'support_manager',
    'Define MW customer support SLA and escalation matrix',
    'Draft response-time targets, priority definitions, escalation paths, and handoff rules for Athlete, Coach, billing, privacy, security, safety, account deletion, and technical support.',
    'Customer Success','normal','queued',false
  ),
  (
    'operations_director',
    'Review Founder OS operating SOP set',
    'Review the seeded launch, Coach verification, billing incident, support, methodology, and website QA SOPs for gaps and consistency before Founder activation.',
    'Operations','normal','queued',false
  ),
  (
    'data_chief',
    'Define Founder KPI dictionary',
    'Define precise business meanings and calculation rules for MRR, ARR, active Athlete, active Coach, sponsored seat utilization, churn, conversion, support SLA, customer-health watch, and launch reliability metrics so reports stay consistent.',
    'Data & Analytics','normal','queued',false
  )
) as x(agent_code,title,description,department,priority,status,requires_approval)
where not exists (
  select 1 from public.founder_ai_tasks t
  where lower(t.title)=lower(x.title) and t.status<>'cancelled'
);
