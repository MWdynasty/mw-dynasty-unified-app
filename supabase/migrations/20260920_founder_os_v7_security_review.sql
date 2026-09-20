-- MW Dynasty Founder OS v7
-- Record current Supabase security-review items without making unsafe blanket permission changes.

insert into public.founder_risk_register(category,title,description,severity,likelihood,status,owner_agent_code,mitigation)
select * from (values
  (
    'Security',
    'RLS-enabled tables without direct policies need intentionality review',
    'Supabase currently reports seven RLS-enabled tables with no direct policies. Some are intentionally reached only through scoped SECURITY DEFINER RPCs or service-side flows, but each table should be documented and verified rather than changed blindly.',
    'medium','possible','open','security_specialist',
    'Review coach_assigned_training_checkins, coach_upgrade_requests, coach_verification_blocks, membership_entitlements, membership_events, membership_webhook_keys, and public_support_requests one by one. Add direct policies only where client table access is intentionally required.'
  ),
  (
    'Security',
    'Authenticated SECURITY DEFINER RPC surface requires function-by-function audit',
    'Supabase reports multiple SECURITY DEFINER functions callable by authenticated users. Many are intentionally user-scoped business RPCs, so a bulk revoke or conversion could break MW access controls and billing flows.',
    'medium','possible','open','security_specialist',
    'Maintain an allowlist of intentional authenticated RPCs, verify each checks auth.uid(), role, ownership, or service authority as appropriate, and revoke execution only for functions that do not need client access.'
  ),
  (
    'Security',
    'Public website analytics RPC is intentionally anonymous but abuse controls should be reviewed',
    'mw_record_web_event is callable anonymously because the public website needs pre-login analytics. The function restricts event types, strips sensitive metadata, and de-duplicates rapid duplicate events, but anonymous event ingestion can still be abused by high-volume synthetic sessions.',
    'low','possible','open','security_specialist',
    'Keep the constrained event allowlist and metadata stripping. Add edge/rate-limit protection or server-mediated ingestion if public traffic volume makes abuse or analytics pollution material.'
  )
) as x(category,title,description,severity,likelihood,status,owner_agent_code,mitigation)
where not exists (
  select 1 from public.founder_risk_register r where lower(r.title)=lower(x.title)
);
