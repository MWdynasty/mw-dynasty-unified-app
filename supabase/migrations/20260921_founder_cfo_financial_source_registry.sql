-- MW Dynasty CFO financial source registry.
create table if not exists public.founder_financial_sources (
  id uuid primary key default gen_random_uuid(),
  source_code text not null unique,
  source_name text not null,
  source_type text not null,
  category text not null,
  connection_status text not null default 'needs_connection'
    check (connection_status in ('connected','manual','needs_connection','planned','not_applicable')),
  tracking_mode text not null default 'manual'
    check (tracking_mode in ('internal_ledger','api','bank_feed','manual','recurring','usage','transaction_fee','mixed')),
  critical boolean not null default false,
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  last_synced_at timestamptz,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.founder_financial_sources enable row level security;
drop policy if exists mw_founder_financial_sources_all on public.founder_financial_sources;
create policy mw_founder_financial_sources_all on public.founder_financial_sources
for all to authenticated using (private.mw_is_founder()) with check (private.mw_is_founder());

grant select, insert, update, delete on table public.founder_financial_sources to authenticated;
grant select, insert, update, delete on table public.founder_financial_sources to service_role;
revoke select, insert, update, delete, truncate on table public.founder_financial_sources from anon;

do $$
begin
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='private' and p.proname='mw_audit_founder_os_change'
  ) then
    execute 'drop trigger if exists mw_audit_founder_financial_sources on public.founder_financial_sources';
    execute 'create trigger mw_audit_founder_financial_sources after insert or update or delete on public.founder_financial_sources for each row execute function private.mw_audit_founder_os_change()';
  end if;
end $$;

insert into public.founder_financial_sources
(source_code,source_name,source_type,category,connection_status,tracking_mode,critical,notes,metadata)
values
('mw_billing_ledger','MW Billing Ledger','revenue','subscriptions','connected','internal_ledger',true,'Internal subscription and sponsorship billing records already feed the CFO snapshot.',jsonb_build_object('system','supabase')),
('stripe','Stripe','payment_processor','revenue_and_fees','needs_connection','api',true,'Connect live processor revenue, refunds, disputes, fees, and payouts when Stripe production billing is activated.',jsonb_build_object('current_internal_provider_state','unconfigured')),
('apple_app_store','Apple App Store Connect','app_store','revenue_and_fees','needs_connection','api',true,'Track App Store proceeds, subscription events, commissions, refunds, and settlement data.','{}'::jsonb),
('business_bank','MW Dynasty Business Bank','banking','cash','needs_connection','bank_feed',true,'Connect the dedicated business operating account so the CFO can reconcile cash inflows and outflows.','{}'::jsonb),
('openai','OpenAI API','ai_infrastructure','software_and_usage','manual','usage',true,'Track API usage and AI operating cost using actual billed usage.','{}'::jsonb),
('vercel','Vercel','hosting','infrastructure','manual','mixed',true,'Track hosting, deployment, bandwidth, and paid plan charges.','{}'::jsonb),
('supabase','Supabase','backend','infrastructure','manual','mixed',true,'Track database, auth, storage, edge/runtime, and paid plan usage.','{}'::jsonb),
('github','GitHub','development','software','manual','recurring',false,'Track any paid repository, Actions, or developer-tool charges.','{}'::jsonb),
('domain_dns','Domain & DNS','web_infrastructure','software','manual','recurring',true,'Track domain registration/renewal and paid DNS services.',jsonb_build_object('domain','mwdynasty.com')),
('apple_developer','Apple Developer Program','app_store','software','manual','recurring',true,'Track Apple Developer membership and distribution costs using actual invoices.','{}'::jsonb),
('canva','Canva','creative','software','manual','recurring',false,'Track any Canva plan or asset costs used by MW Dynasty.','{}'::jsonb),
('tax_accounting','Tax & Accounting','compliance','professional_services','needs_connection','manual',true,'Track bookkeeping, tax preparation, filing, and accounting costs; qualified human review remains required.','{}'::jsonb),
('business_insurance','Business Insurance','risk','insurance','planned','manual',true,'Track applicable business insurance premiums once coverage is selected.','{}'::jsonb),
('contractors_payroll','Contractors & Payroll','people','labor','planned','manual',true,'Track contractor invoices, payroll, payroll taxes, and employer costs when applicable.','{}'::jsonb)
on conflict (source_code) do update set
  source_name=excluded.source_name,
  source_type=excluded.source_type,
  category=excluded.category,
  critical=excluded.critical,
  notes=excluded.notes,
  updated_at=now();

create or replace function public.mw_founder_finance_snapshot()
returns jsonb language plpgsql security definer set search_path to ''
as $function$
declare
  v_mrr bigint := 0; v_fixed bigint := 0; v_usage_30d bigint := 0; v_one_time_30d bigint := 0;
begin
  if auth.uid() is null or not private.mw_is_founder() then
    raise exception 'Founder / Owner access required' using errcode='42501';
  end if;

  select coalesce((select sum(mp.monthly_price_cents)
    from public.billing_subscriptions b join public.membership_plans mp on mp.plan_code=b.plan_code
    where b.billing_type='individual' and b.status in ('active','trialing','cancel_at_period_end')
      and (b.current_period_end is null or b.current_period_end>now())),0)
    + coalesce((select sum(greatest(p.requested_seats,0)*greatest(p.seat_price_cents,0))
      from public.coach_sponsorship_packages p where p.status in ('active','cancel_at_period_end')
      and (p.current_period_end is null or p.current_period_end>now())),0)
  into v_mrr;

  select coalesce(sum(case cadence when 'monthly' then amount_cents when 'annual' then round(amount_cents/12.0)::integer else 0 end),0)
    into v_fixed from public.founder_cost_entries where status='active';
  select coalesce(sum(amount_cents),0) into v_usage_30d from public.founder_cost_entries
    where status='active' and cadence='usage' and coalesce(incurred_on,created_at::date)>=current_date-30;
  select coalesce(sum(amount_cents),0) into v_one_time_30d from public.founder_cost_entries
    where status='active' and cadence='one_time' and coalesce(incurred_on,created_at::date)>=current_date-30;

  return jsonb_build_object(
    'generated_at',now(),'estimated_mrr_cents',v_mrr,'estimated_arr_cents',v_mrr*12,
    'tracked_fixed_monthly_cost_cents',v_fixed,'tracked_usage_cost_cents_30d',v_usage_30d,
    'tracked_one_time_cost_cents_30d',v_one_time_30d,
    'tracked_monthly_operating_cost_proxy_cents',v_fixed+v_usage_30d,
    'tracked_operating_contribution_cents',v_mrr-v_fixed-v_usage_30d,
    'tracked_operating_margin_percent',case when v_mrr>0 then round(((v_mrr-v_fixed-v_usage_30d)::numeric/v_mrr::numeric)*100,1) else null end,
    'cost_register_entries',(select count(*) from public.founder_cost_entries),
    'financial_source_summary',jsonb_build_object(
      'total',(select count(*) from public.founder_financial_sources where connection_status<>'not_applicable'),
      'connected',(select count(*) from public.founder_financial_sources where connection_status='connected'),
      'manual',(select count(*) from public.founder_financial_sources where connection_status='manual'),
      'needs_connection',(select count(*) from public.founder_financial_sources where connection_status='needs_connection'),
      'planned',(select count(*) from public.founder_financial_sources where connection_status='planned'),
      'critical_missing',(select count(*) from public.founder_financial_sources where critical and connection_status in ('needs_connection','planned'))
    ),
    'financial_sources',coalesce((select jsonb_agg(jsonb_build_object(
      'id',s.id,'source_code',s.source_code,'source_name',s.source_name,'source_type',s.source_type,
      'category',s.category,'connection_status',s.connection_status,'tracking_mode',s.tracking_mode,
      'critical',s.critical,'notes',s.notes,'last_synced_at',s.last_synced_at,'metadata',s.metadata,'updated_at',s.updated_at
    ) order by s.critical desc,s.source_name) from public.founder_financial_sources s),'[]'::jsonb),
    'active_paying_subscriptions',(select count(*) from public.billing_subscriptions b where b.status in ('active','trialing','cancel_at_period_end') and (b.current_period_end is null or b.current_period_end>now())),
    'new_subscriptions_30d',(select count(*) from public.billing_subscriptions b where b.created_at>now()-interval '30 days' and b.status in ('active','trialing','cancel_at_period_end')),
    'cancelled_subscriptions_30d',(select count(*) from public.billing_subscriptions b where b.status='cancelled' and b.updated_at>now()-interval '30 days'),
    'plan_mix',coalesce((select jsonb_agg(jsonb_build_object('audience',q.audience,'plan_code',q.plan_code,'provider',q.provider,'status',q.status,'count',q.count,'base_mrr_cents',q.base_mrr_cents) order by q.audience,q.plan_code,q.provider)
      from (select b.audience,b.plan_code,b.provider,b.status,count(*) count,sum(case when b.billing_type='individual' then coalesce(mp.monthly_price_cents,0) else 0 end) base_mrr_cents
      from public.billing_subscriptions b left join public.membership_plans mp on mp.plan_code=b.plan_code group by b.audience,b.plan_code,b.provider,b.status) q),'[]'::jsonb),
    'costs',coalesce((select jsonb_agg(jsonb_build_object(
      'id',c.id,'vendor',c.vendor,'category',c.category,'description',c.description,'amount_cents',c.amount_cents,'cadence',c.cadence,'status',c.status,'incurred_on',c.incurred_on,
      'monthly_equivalent_cents',case when c.cadence='monthly' then c.amount_cents when c.cadence='annual' then round(c.amount_cents/12.0)::integer when c.cadence='usage' and coalesce(c.incurred_on,c.created_at::date)>=current_date-30 then c.amount_cents else 0 end,
      'source',c.source,'updated_at',c.updated_at) order by c.updated_at desc) from public.founder_cost_entries c),'[]'::jsonb)
  );
end
$function$;
