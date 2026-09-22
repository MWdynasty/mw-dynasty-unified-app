-- Expand MW Dynasty CFO cost-source coverage.
insert into public.founder_financial_sources
(source_code,source_name,source_type,category,connection_status,tracking_mode,critical,notes,metadata)
values
('chatgpt_workspace','ChatGPT','ai_workspace','software','manual','recurring',true,'Track the actual ChatGPT subscription used to build and operate MW Dynasty separately from OpenAI API usage. Use the real invoice/charge; do not assume plan pricing.', '{"business_scope":"mw_dynasty","amount_policy":"actual_only"}'::jsonb),
('skool','Skool','community_platform','software','manual','recurring',false,'Track the actual Skool community subscription and any platform-related charges used by MW Dynasty.', '{"business_scope":"mw_dynasty","amount_policy":"actual_only"}'::jsonb),
('codemagic','Codemagic','ci_cd','development','manual','mixed',false,'Track build minutes, CI/CD plan charges, or iOS build service costs when billed.', '{"business_scope":"mw_dynasty","amount_policy":"actual_only"}'::jsonb),
('email_delivery','Email Delivery','communications','software_and_usage','planned','usage',false,'Track paid transactional email, verification email, support email, and campaign delivery costs when a provider is activated.', '{"business_scope":"mw_dynasty","amount_policy":"actual_only"}'::jsonb),
('sms_notifications','SMS & Messaging','communications','software_and_usage','planned','usage',false,'Track SMS, phone verification, or paid messaging costs only when MW Dynasty activates a provider.', '{"business_scope":"mw_dynasty","amount_policy":"actual_only"}'::jsonb),
('monitoring_observability','Monitoring & Observability','operations','software_and_usage','planned','usage',false,'Track paid uptime, error monitoring, logging, analytics, and observability tools if activated.', '{"business_scope":"mw_dynasty","amount_policy":"actual_only"}'::jsonb),
('legal_filings','Legal, Filing & Registered Agent','compliance','professional_services','planned','mixed',true,'Track entity formation, registered-agent, licenses, filing fees, contract/legal review, and other company compliance costs using actual invoices.', '{"business_scope":"mw_dynasty","amount_policy":"actual_only","human_specialist_review":true}'::jsonb),
('marketing_ad_spend','Paid Marketing & Advertising','marketing','marketing','planned','usage',false,'Track paid social, search, sponsorship promotion, creative media buying, and campaign spend when activated.', '{"business_scope":"mw_dynasty","amount_policy":"actual_only"}'::jsonb),
('customer_support_tools','Customer Support Tools','support','software','planned','recurring',false,'Track any paid helpdesk, chat, ticketing, or customer-success software when activated.', '{"business_scope":"mw_dynasty","amount_policy":"actual_only"}'::jsonb)
on conflict (source_code) do update set
 source_name=excluded.source_name,
 source_type=excluded.source_type,
 category=excluded.category,
 tracking_mode=excluded.tracking_mode,
 critical=excluded.critical,
 notes=excluded.notes,
 metadata=coalesce(public.founder_financial_sources.metadata,'{}'::jsonb)||excluded.metadata,
 updated_at=now();

update public.founder_financial_sources
set notes='A ChatGPT Finances account link does not automatically feed Founder OS. Connect or approve a business-only reconciliation bridge before the CFO treats bank activity as company financial data.',
    metadata=coalesce(metadata,'{}'::jsonb)||'{"business_only":true,"do_not_import_personal_spend":true}'::jsonb,
    updated_at=now()
where source_code='business_bank';
