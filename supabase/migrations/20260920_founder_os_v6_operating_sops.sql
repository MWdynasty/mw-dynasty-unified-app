-- MW Dynasty Founder OS v6
-- Seed review-stage operating procedures and known launch/growth risk.

insert into public.founder_sops(title,department,status,version,purpose,procedure,owner_agent_code)
select x.title,x.department,'review',1,x.purpose,x.procedure,x.owner
from (values
  (
    'App Store / TestFlight Release Gate',
    'Technology',
    'Prevent an unverified iOS build from reaching App Review.',
    '1. Confirm App Store Connect subscriptions, pricing, groups, and purchase options. 2. Confirm Apple server credentials and Server Notifications V2. 3. Produce the signed build. 4. Install through TestFlight on a real device. 5. Run Athlete and Coach purchase/restore/cancel/upgrade/downgrade scenarios. 6. Review TestFlight and MW Launch Diagnostics. 7. Run billing-integrity audit. 8. Resolve all release blockers. 9. Founder approves submission.',
    'release_qa'
  ),
  (
    'Coach Verification & Activation',
    'Operations',
    'Keep Coach verification, membership selection, payment, and access activation in the correct order.',
    '1. Receive Coach application. 2. Apply deterministic verification rules. 3. Auto-approve only strong evidence; ambiguous cases go to Founder review. 4. Do not charge before verification. 5. Approved Coach chooses membership and optional sponsored seats. 6. Payment confirmation activates access. 7. Verify Coach entitlement, tier, and sponsor-seat state. 8. Escalate mismatches to Founder.',
    'operations_director'
  ),
  (
    'Billing & Entitlement Incident Response',
    'Finance',
    'Resolve membership-access mismatches without creating duplicate billing or unauthorized access.',
    '1. Identify beneficiary, payer, provider, plan, and billing state. 2. Run MW billing-integrity audit. 3. Compare provider record with MW subscription and entitlement. 4. Do not manually grant production access without verified paid state. 5. Preserve Apple/Stripe provider authority. 6. Record the exception and corrective action. 7. Escalate refunds, charge disputes, cross-account restore issues, or destructive corrections to Founder.',
    'controller'
  ),
  (
    'Customer Support Triage & Escalation',
    'Customer Success',
    'Give customers fast, consistent support while keeping sensitive or consequential decisions under human control.',
    '1. Categorize and prioritize the request. 2. Support Manager AI may summarize and draft a response but never send automatically. 3. Route privacy, security, legal, payment disputes, refunds, account deletion, safety, or medical issues to Founder review. 4. Never request passwords, card data, or unnecessary health information. 5. Confirm resolution before closing. 6. Tag recurring issues for Product or Operations review.',
    'support_manager'
  ),
  (
    'MW Methodology Change Control',
    'Performance / Coaching',
    'Protect the integrity of official MW Dynasty sprint, strength, Sprint School, and Coach MW methodology.',
    '1. Founder submits the coaching principle or proposed change. 2. Methodology AI structures the proposal and maps affected weeks, systems, and conflicts. 3. Performance AI reviews consistency with current MW rules. 4. No AI or Coach publishes an official methodology change. 5. Founder approves or rejects. 6. Approved change receives a version and release record. 7. Update affected program content and Coach MW knowledge together.',
    'methodology_manager'
  ),
  (
    'Website Deployment & Conversion QA',
    'Product',
    'Protect the public MW Dynasty website and measure the path from visitor to paid member.',
    '1. Verify mwdynasty.com and app.mwdynasty.com uptime and SSL. 2. Confirm Athlete and Coach CTAs point to the correct flows. 3. Validate responsive desktop/mobile layouts. 4. Confirm signup, checkout, and support events are tracked where source access exists. 5. Verify displayed pricing matches the live membership catalog. 6. Check broken routes and failed signup/payment events. 7. Founder approves major public-site changes before production.',
    'website_growth'
  )
) as x(title,department,purpose,procedure,owner)
where not exists (
  select 1 from public.founder_sops s where lower(s.title)=lower(x.title)
);

insert into public.founder_risk_register(category,title,description,severity,likelihood,status,owner_agent_code,mitigation)
select
  'Website Analytics',
  'Public marketing-site page analytics are not fully connected',
  'Founder OS can monitor both live domains and the app-side funnel, but the standalone public marketing-site source is not currently available through the connected repository/workspace, so full page-level public-site analytics are incomplete.',
  'medium','possible','open','website_growth',
  'When the public marketing-site source is accessible, add the shared MW Growth tracker and verify page-view/CTA events in Founder OS.'
where not exists (
  select 1 from public.founder_risk_register
  where lower(title)=lower('Public marketing-site page analytics are not fully connected')
);
