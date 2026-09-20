-- MW Dynasty Founder OS v4
-- Management foundation, finance/unit economics, customer-success health,
-- AI support triage, and daily KPI history.
-- Production-safe and idempotent.

alter table public.founder_approvals
  add column if not exists task_id uuid references public.founder_ai_tasks(id) on delete set null;

create table if not exists public.founder_cost_entries (
  id uuid primary key default gen_random_uuid(),
  vendor text,
  category text not null,
  description text,
  amount_cents integer not null default 0 check (amount_cents>=0),
  cadence text not null default 'monthly' check (cadence in ('monthly','annual','one_time','usage')),
  status text not null default 'active' check (status in ('active','inactive','planned')),
  incurred_on date,
  source text not null default 'manual',
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.founder_risk_register (
  id uuid primary key default gen_random_uuid(),
  category text not null,
  title text not null,
  description text,
  severity text not null default 'medium' check (severity in ('low','medium','high','critical')),
  likelihood text not null default 'possible' check (likelihood in ('unlikely','possible','likely')),
  status text not null default 'open' check (status in ('open','mitigating','accepted','resolved','closed')),
  owner_agent_code text references public.founder_ai_agents(code) on update cascade,
  mitigation text,
  due_at timestamptz,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.founder_people_roles (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  department text not null,
  role_type text not null default 'future_hire' check (role_type in ('founder','human','ai','future_hire','contractor')),
  status text not null default 'planned' check (status in ('active','planned','hiring','filled','paused','closed')),
  reports_to text,
  mission text,
  responsibilities jsonb not null default '[]'::jsonb,
  scorecard jsonb not null default '[]'::jsonb,
  priority text not null default 'normal' check (priority in ('low','normal','high','urgent')),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.founder_sops (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  department text not null,
  status text not null default 'review' check (status in ('draft','review','approved','active','retired')),
  version integer not null default 1,
  purpose text,
  procedure text,
  owner_agent_code text references public.founder_ai_agents(code) on update cascade,
  approved_by uuid,
  approved_at timestamptz,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.founder_support_triage (
  id uuid primary key default gen_random_uuid(),
  request_source text not null check (request_source in ('member','public')),
  request_id uuid not null,
  priority text not null default 'normal' check (priority in ('low','normal','high','urgent')),
  triage_status text not null default 'new' check (triage_status in ('new','reviewed','draft_ready','waiting_founder','resolved')),
  owner_agent_code text references public.founder_ai_agents(code) on update cascade,
  issue_summary text,
  suggested_next_action text,
  response_draft text,
  requires_founder boolean not null default false,
  risk_flags jsonb not null default '[]'::jsonb,
  last_triaged_at timestamptz,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(request_source,request_id)
);

create table if not exists public.founder_kpi_snapshots (
  snapshot_date date primary key default current_date,
  estimated_mrr_cents integer not null default 0,
  recurring_cost_cents integer not null default 0,
  operating_contribution_cents integer not null default 0,
  athletes_active integer not null default 0,
  coaches_active integer not null default 0,
  accounts_total integer not null default 0,
  sponsored_seats_active integer not null default 0,
  open_support integer not null default 0,
  website_sessions_30d integer not null default 0,
  website_signup_starts_30d integer not null default 0,
  website_checkout_starts_30d integer not null default 0,
  diagnostic_errors_24h integer not null default 0,
  metrics jsonb not null default '{}'::jsonb,
  captured_by uuid default auth.uid(),
  captured_at timestamptz not null default now()
);

create index if not exists founder_cost_entries_status_idx on public.founder_cost_entries(status,category,updated_at desc);
create index if not exists founder_risk_register_status_idx on public.founder_risk_register(status,severity,updated_at desc);
create index if not exists founder_people_roles_status_idx on public.founder_people_roles(status,department,priority);
create index if not exists founder_sops_status_idx on public.founder_sops(status,department,updated_at desc);
create index if not exists founder_support_triage_status_idx on public.founder_support_triage(triage_status,priority,updated_at desc);
create index if not exists founder_kpi_snapshots_date_idx on public.founder_kpi_snapshots(snapshot_date desc);

alter table public.founder_cost_entries enable row level security;
alter table public.founder_risk_register enable row level security;
alter table public.founder_people_roles enable row level security;
alter table public.founder_sops enable row level security;
alter table public.founder_support_triage enable row level security;
alter table public.founder_kpi_snapshots enable row level security;

drop policy if exists mw_founder_all_founder_cost_entries on public.founder_cost_entries;
create policy mw_founder_all_founder_cost_entries on public.founder_cost_entries
for all to authenticated using (private.mw_is_founder()) with check (private.mw_is_founder());

drop policy if exists mw_founder_all_founder_risk_register on public.founder_risk_register;
create policy mw_founder_all_founder_risk_register on public.founder_risk_register
for all to authenticated using (private.mw_is_founder()) with check (private.mw_is_founder());

drop policy if exists mw_founder_all_founder_people_roles on public.founder_people_roles;
create policy mw_founder_all_founder_people_roles on public.founder_people_roles
for all to authenticated using (private.mw_is_founder()) with check (private.mw_is_founder());

drop policy if exists mw_founder_all_founder_sops on public.founder_sops;
create policy mw_founder_all_founder_sops on public.founder_sops
for all to authenticated using (private.mw_is_founder()) with check (private.mw_is_founder());

drop policy if exists mw_founder_support_triage_all on public.founder_support_triage;
create policy mw_founder_support_triage_all on public.founder_support_triage
for all to authenticated using (private.mw_is_founder()) with check (private.mw_is_founder());

drop policy if exists mw_founder_kpi_snapshots_all on public.founder_kpi_snapshots;
create policy mw_founder_kpi_snapshots_all on public.founder_kpi_snapshots
for all to authenticated using (private.mw_is_founder()) with check (private.mw_is_founder());


CREATE OR REPLACE FUNCTION public.mw_founder_capture_kpi_snapshot()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_fin jsonb;
  v_over jsonb;
  v_m jsonb;
  v_row public.founder_kpi_snapshots%rowtype;
begin
  if auth.uid() is null or not private.mw_is_founder() then
    raise exception 'Founder / Owner access required' using errcode='42501';
  end if;

  v_fin := public.mw_founder_finance_snapshot();
  v_over := public.mw_founder_os_snapshot('overview');
  v_m := coalesce(v_over->'metrics','{}'::jsonb);

  insert into public.founder_kpi_snapshots(
    snapshot_date,estimated_mrr_cents,recurring_cost_cents,operating_contribution_cents,
    athletes_active,coaches_active,accounts_total,sponsored_seats_active,open_support,
    website_sessions_30d,website_signup_starts_30d,website_checkout_starts_30d,
    diagnostic_errors_24h,metrics,captured_by,captured_at
  ) values (
    current_date,
    coalesce((v_fin->>'estimated_mrr_cents')::integer,0),
    coalesce((v_fin->>'tracked_monthly_operating_cost_proxy_cents')::integer,0),
    coalesce((v_fin->>'tracked_operating_contribution_cents')::integer,0),
    coalesce((v_m->>'athletes_active')::integer,0),
    coalesce((v_m->>'coaches_active')::integer,0),
    coalesce((v_m->>'athletes_total')::integer,0)+coalesce((v_m->>'coaches_total')::integer,0),
    coalesce((v_m->>'sponsored_seats_active')::integer,0),
    coalesce((v_m->>'open_support')::integer,0),
    coalesce((v_m->>'web_sessions_30d')::integer,0),
    (select count(*) from public.founder_web_events where event_type='signup_start' and created_at>now()-interval '30 days'),
    (select count(*) from public.founder_web_events where event_type='checkout_start' and created_at>now()-interval '30 days'),
    coalesce((v_m->>'diagnostic_errors_24h')::integer,0),
    jsonb_build_object('overview',v_m,'finance',v_fin),
    auth.uid(),now()
  )
  on conflict (snapshot_date) do update set
    estimated_mrr_cents=excluded.estimated_mrr_cents,
    recurring_cost_cents=excluded.recurring_cost_cents,
    operating_contribution_cents=excluded.operating_contribution_cents,
    athletes_active=excluded.athletes_active,
    coaches_active=excluded.coaches_active,
    accounts_total=excluded.accounts_total,
    sponsored_seats_active=excluded.sponsored_seats_active,
    open_support=excluded.open_support,
    website_sessions_30d=excluded.website_sessions_30d,
    website_signup_starts_30d=excluded.website_signup_starts_30d,
    website_checkout_starts_30d=excluded.website_checkout_starts_30d,
    diagnostic_errors_24h=excluded.diagnostic_errors_24h,
    metrics=excluded.metrics,
    captured_by=excluded.captured_by,
    captured_at=excluded.captured_at
  returning * into v_row;

  return to_jsonb(v_row);
end $function$
;
revoke all on function public.mw_founder_capture_kpi_snapshot() from public;
grant execute on function public.mw_founder_capture_kpi_snapshot() to authenticated;

CREATE OR REPLACE FUNCTION public.mw_founder_customer_health()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if auth.uid() is null or not private.mw_is_founder() then
    raise exception 'Founder / Owner access required' using errcode='42501';
  end if;

  return jsonb_build_object(
    'generated_at',now(),
    'athletes',coalesce((
      select jsonb_agg(jsonb_build_object(
        'athlete_id',x.athlete_id,
        'user_id',x.user_id,
        'name',x.name,
        'score',greatest(0,least(100,x.score)),
        'health',case when x.score<50 then 'high_risk' when x.score<70 then 'watch' else 'healthy' end,
        'membership_status',x.membership_status,
        'membership_source',x.membership_source,
        'access_ends_at',x.access_ends_at,
        'assessment_complete',x.assessment_complete,
        'last_workout_at',x.last_workout_at,
        'open_support',x.open_support,
        'diagnostic_errors_7d',x.diagnostic_errors_7d,
        'signals',x.signals
      ) order by x.score asc,x.name)
      from (
        select
          a.id athlete_id,
          a.user_id,
          trim(coalesce(p.first_name,'')||' '||coalesce(p.last_name,'')) name,
          me.status membership_status,
          me.source membership_source,
          me.access_ends_at,
          ps.onboarding_assessment_completed_at is not null assessment_complete,
          ps.last_completed_workout_at last_workout_at,
          coalesce(sr.open_support,0) open_support,
          coalesce(diag.errors_7d,0) diagnostic_errors_7d,
          100
            -case when p.account_status::text<>'active' then 50 else 0 end
            -case when me.id is null or me.status not in ('active','trialing','cancelled') or (me.access_ends_at is not null and me.access_ends_at<=now()) then 35 else 0 end
            -case when ps.onboarding_assessment_completed_at is null then 15 else 0 end
            -case
               when ps.last_completed_workout_at is null and a.created_at<now()-interval '7 days' then 20
               when ps.last_completed_workout_at<now()-interval '14 days' then 20
               when ps.last_completed_workout_at<now()-interval '7 days' then 10
               else 0
             end
            -case when coalesce(sr.open_support,0)>0 then 10 else 0 end
            -least(15,coalesce(diag.errors_7d,0)*5) score,
          array_remove(array[
            case when p.account_status::text<>'active' then 'account_inactive' end,
            case when me.id is null or me.status not in ('active','trialing','cancelled') or (me.access_ends_at is not null and me.access_ends_at<=now()) then 'no_current_access' end,
            case when ps.onboarding_assessment_completed_at is null then 'assessment_incomplete' end,
            case when ps.last_completed_workout_at is null and a.created_at<now()-interval '7 days' then 'no_workout_activity' end,
            case when ps.last_completed_workout_at<now()-interval '14 days' then 'workout_inactive_14d' end,
            case when coalesce(sr.open_support,0)>0 then 'open_support' end,
            case when coalesce(diag.errors_7d,0)>0 then 'recent_app_errors' end,
            case when me.access_ends_at between now() and now()+interval '7 days' then 'access_ending_7d' end
          ],null) signals
        from public.athletes a
        join public.profiles p on p.user_id=a.user_id
        left join public.athlete_program_state ps on ps.athlete_id=a.id
        left join lateral (
          select e.*
          from public.membership_entitlements e
          where e.user_id=a.user_id
          order by case when e.status in ('active','trialing','cancelled') and (e.access_ends_at is null or e.access_ends_at>now()) then 0 else 1 end,
                   e.updated_at desc
          limit 1
        ) me on true
        left join lateral (
          select count(*) open_support
          from public.support_requests s
          where s.user_id=a.user_id and coalesce(s.status,'open') not in ('resolved','closed')
        ) sr on true
        left join lateral (
          select count(*) errors_7d
          from public.launch_diagnostics d
          where d.user_id=a.user_id and d.severity='error' and d.created_at>now()-interval '7 days'
        ) diag on true
      ) x
    ),'[]'::jsonb),
    'coaches',coalesce((
      select jsonb_agg(jsonb_build_object(
        'user_id',x.user_id,
        'name',x.name,
        'organization',x.organization,
        'tier',x.tier,
        'score',greatest(0,least(100,x.score)),
        'health',case when x.score<50 then 'high_risk' when x.score<70 then 'watch' else 'healthy' end,
        'billing_status',x.billing_status,
        'provider',x.provider,
        'access_source',x.access_source,
        'last_activity_at',x.last_activity_at,
        'assigned_athletes',x.assigned_athletes,
        'open_support',x.open_support,
        'diagnostic_errors_7d',x.diagnostic_errors_7d,
        'signals',x.signals
      ) order by x.score asc,x.name)
      from (
        select
          p.user_id,
          trim(coalesce(p.first_name,'')||' '||coalesce(p.last_name,'')) name,
          p.coach_organization organization,
          ce.access_tier tier,
          ce.access_source,
          b.status billing_status,
          b.provider,
          act.last_activity_at,
          coalesce(ca.assigned_athletes,0) assigned_athletes,
          coalesce(sr.open_support,0) open_support,
          coalesce(diag.errors_7d,0) diagnostic_errors_7d,
          100
            -case when p.account_status::text<>'active' then 50 else 0 end
            -case when ce.coach_user_id is null or ce.status<>'active' then 35 else 0 end
            -case when ce.access_source<>'internal_test' and coalesce(b.status,'missing') in ('past_due','unpaid','incomplete','incomplete_expired','missing') then 35 else 0 end
            -case
               when act.last_activity_at is null and p.created_at<now()-interval '14 days' then 20
               when act.last_activity_at<now()-interval '30 days' then 25
               when act.last_activity_at<now()-interval '14 days' then 15
               else 0
             end
            -case when coalesce(sr.open_support,0)>0 then 10 else 0 end
            -least(15,coalesce(diag.errors_7d,0)*5) score,
          array_remove(array[
            case when p.account_status::text<>'active' then 'account_inactive' end,
            case when ce.coach_user_id is null or ce.status<>'active' then 'coach_access_inactive' end,
            case when ce.access_source<>'internal_test' and coalesce(b.status,'missing') in ('past_due','unpaid','incomplete','incomplete_expired','missing') then 'billing_attention' end,
            case when act.last_activity_at is null and p.created_at<now()-interval '14 days' then 'no_coach_activity' end,
            case when act.last_activity_at<now()-interval '30 days' then 'coach_inactive_30d' end,
            case when coalesce(sr.open_support,0)>0 then 'open_support' end,
            case when coalesce(diag.errors_7d,0)>0 then 'recent_app_errors' end
          ],null) signals
        from public.profiles p
        left join lateral (
          select e.*
          from public.coach_access_entitlements e
          where e.coach_user_id=p.user_id
          order by case when e.status='active' then 0 else 1 end,e.updated_at desc
          limit 1
        ) ce on true
        left join lateral (
          select bs.*
          from public.billing_subscriptions bs
          where bs.beneficiary_user_id=p.user_id and bs.audience='coach'
          order by bs.updated_at desc
          limit 1
        ) b on true
        left join lateral (
          select max(c.created_at) last_activity_at
          from public.coach_activity_log c
          where c.coach_user_id=p.user_id
        ) act on true
        left join lateral (
          select count(*) assigned_athletes
          from public.coach_assignments c
          where c.coach_user_id=p.user_id and c.status::text='active'
        ) ca on true
        left join lateral (
          select count(*) open_support
          from public.support_requests s
          where s.user_id=p.user_id and coalesce(s.status,'open') not in ('resolved','closed')
        ) sr on true
        left join lateral (
          select count(*) errors_7d
          from public.launch_diagnostics d
          where d.user_id=p.user_id and d.severity='error' and d.created_at>now()-interval '7 days'
        ) diag on true
        where p.role::text='coach'
      ) x
    ),'[]'::jsonb)
  );
end $function$
;
revoke all on function public.mw_founder_customer_health() from public;
grant execute on function public.mw_founder_customer_health() to authenticated;

CREATE OR REPLACE FUNCTION public.mw_founder_finance_snapshot()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_mrr bigint := 0;
  v_fixed bigint := 0;
  v_usage_30d bigint := 0;
  v_one_time_30d bigint := 0;
begin
  if auth.uid() is null or not private.mw_is_founder() then
    raise exception 'Founder / Owner access required' using errcode='42501';
  end if;

  select
    coalesce((
      select sum(mp.monthly_price_cents)
      from public.billing_subscriptions b
      join public.membership_plans mp on mp.plan_code=b.plan_code
      where b.billing_type='individual'
        and b.status in ('active','trialing','cancel_at_period_end')
        and (b.current_period_end is null or b.current_period_end>now())
    ),0)
    +coalesce((
      select sum(greatest(p.requested_seats,0)*greatest(p.seat_price_cents,0))
      from public.coach_sponsorship_packages p
      where p.status in ('active','cancel_at_period_end')
        and (p.current_period_end is null or p.current_period_end>now())
    ),0)
  into v_mrr;

  select coalesce(sum(
    case cadence
      when 'monthly' then amount_cents
      when 'annual' then round(amount_cents/12.0)::integer
      else 0
    end
  ),0)
  into v_fixed
  from public.founder_cost_entries
  where status='active';

  select coalesce(sum(amount_cents),0)
  into v_usage_30d
  from public.founder_cost_entries
  where status='active'
    and cadence='usage'
    and coalesce(incurred_on,created_at::date)>=current_date-30;

  select coalesce(sum(amount_cents),0)
  into v_one_time_30d
  from public.founder_cost_entries
  where status='active'
    and cadence='one_time'
    and coalesce(incurred_on,created_at::date)>=current_date-30;

  return jsonb_build_object(
    'generated_at',now(),
    'estimated_mrr_cents',v_mrr,
    'estimated_arr_cents',v_mrr*12,
    'tracked_fixed_monthly_cost_cents',v_fixed,
    'tracked_usage_cost_cents_30d',v_usage_30d,
    'tracked_one_time_cost_cents_30d',v_one_time_30d,
    'tracked_monthly_operating_cost_proxy_cents',v_fixed+v_usage_30d,
    'tracked_operating_contribution_cents',v_mrr-v_fixed-v_usage_30d,
    'tracked_operating_margin_percent',
      case when v_mrr>0 then round(((v_mrr-v_fixed-v_usage_30d)::numeric/v_mrr::numeric)*100,1) else null end,
    'active_paying_subscriptions',(
      select count(*)
      from public.billing_subscriptions b
      where b.status in ('active','trialing','cancel_at_period_end')
        and (b.current_period_end is null or b.current_period_end>now())
    ),
    'new_subscriptions_30d',(
      select count(*)
      from public.billing_subscriptions b
      where b.created_at>now()-interval '30 days'
        and b.status in ('active','trialing','cancel_at_period_end')
    ),
    'cancelled_subscriptions_30d',(
      select count(*)
      from public.billing_subscriptions b
      where b.status='cancelled'
        and b.updated_at>now()-interval '30 days'
    ),
    'plan_mix',coalesce((
      select jsonb_agg(jsonb_build_object(
        'audience',q.audience,'plan_code',q.plan_code,'provider',q.provider,'status',q.status,
        'count',q.count,'base_mrr_cents',q.base_mrr_cents
      ) order by q.audience,q.plan_code,q.provider)
      from (
        select b.audience,b.plan_code,b.provider,b.status,count(*) count,
               sum(case when b.billing_type='individual' then coalesce(mp.monthly_price_cents,0) else 0 end) base_mrr_cents
        from public.billing_subscriptions b
        left join public.membership_plans mp on mp.plan_code=b.plan_code
        group by b.audience,b.plan_code,b.provider,b.status
      ) q
    ),'[]'::jsonb),
    'costs',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',c.id,'vendor',c.vendor,'category',c.category,'description',c.description,
        'amount_cents',c.amount_cents,'cadence',c.cadence,'status',c.status,'incurred_on',c.incurred_on,
        'monthly_equivalent_cents',
          case when c.cadence='monthly' then c.amount_cents
               when c.cadence='annual' then round(c.amount_cents/12.0)::integer
               when c.cadence='usage' and coalesce(c.incurred_on,c.created_at::date)>=current_date-30 then c.amount_cents
               else 0 end,
        'source',c.source,'updated_at',c.updated_at
      ) order by c.updated_at desc)
      from public.founder_cost_entries c
    ),'[]'::jsonb)
  );
end $function$
;
revoke all on function public.mw_founder_finance_snapshot() from public;
grant execute on function public.mw_founder_finance_snapshot() to authenticated;

CREATE OR REPLACE FUNCTION public.mw_founder_kpi_history(p_days integer DEFAULT 90)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_days integer := greatest(1,least(coalesce(p_days,90),365));
begin
  if auth.uid() is null or not private.mw_is_founder() then
    raise exception 'Founder / Owner access required' using errcode='42501';
  end if;

  return jsonb_build_object(
    'generated_at',now(),
    'items',coalesce((
      select jsonb_agg(jsonb_build_object(
        'snapshot_date',k.snapshot_date,
        'estimated_mrr_cents',k.estimated_mrr_cents,
        'recurring_cost_cents',k.recurring_cost_cents,
        'operating_contribution_cents',k.operating_contribution_cents,
        'athletes_active',k.athletes_active,
        'coaches_active',k.coaches_active,
        'accounts_total',k.accounts_total,
        'sponsored_seats_active',k.sponsored_seats_active,
        'open_support',k.open_support,
        'website_sessions_30d',k.website_sessions_30d,
        'website_signup_starts_30d',k.website_signup_starts_30d,
        'website_checkout_starts_30d',k.website_checkout_starts_30d,
        'diagnostic_errors_24h',k.diagnostic_errors_24h,
        'captured_at',k.captured_at
      ) order by k.snapshot_date asc)
      from public.founder_kpi_snapshots k
      where k.snapshot_date>=current_date-v_days
    ),'[]'::jsonb)
  );
end $function$
;
revoke all on function public.mw_founder_kpi_history(integer) from public;
grant execute on function public.mw_founder_kpi_history(integer) to authenticated;

CREATE OR REPLACE FUNCTION public.mw_founder_management_snapshot(p_section text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_section text := lower(trim(coalesce(p_section,'')));
begin
  if auth.uid() is null or not private.mw_is_founder() then
    raise exception 'Founder / Owner access required' using errcode='42501';
  end if;

  if v_section='finance_costs' then
    return jsonb_build_object(
      'generated_at',now(),
      'monthly_cost_estimate_cents',coalesce((
        select sum(case cadence when 'monthly' then amount_cents when 'annual' then round(amount_cents/12.0)::int else 0 end)
        from public.founder_cost_entries where status='active'
      ),0),
      'one_time_costs_30d_cents',coalesce((
        select sum(amount_cents) from public.founder_cost_entries
        where status='active' and cadence='one_time' and coalesce(incurred_on,created_at::date)>=current_date-30
      ),0),
      'items',coalesce((
        select jsonb_agg(jsonb_build_object(
          'id',c.id,'vendor',c.vendor,'category',c.category,'description',c.description,
          'amount_cents',c.amount_cents,'cadence',c.cadence,'status',c.status,'incurred_on',c.incurred_on,
          'source',c.source,'updated_at',c.updated_at
        ) order by c.updated_at desc)
        from (select * from public.founder_cost_entries order by updated_at desc limit 150) c
      ),'[]'::jsonb)
    );

  elsif v_section='people' then
    return jsonb_build_object(
      'generated_at',now(),
      'roles',coalesce((
        select jsonb_agg(jsonb_build_object(
          'id',r.id,'title',r.title,'department',r.department,'role_type',r.role_type,'status',r.status,
          'reports_to',r.reports_to,'mission',r.mission,'responsibilities',r.responsibilities,
          'scorecard',r.scorecard,'priority',r.priority,'updated_at',r.updated_at
        ) order by case r.priority when 'urgent' then 1 when 'high' then 2 when 'normal' then 3 else 4 end,r.department,r.title)
        from public.founder_people_roles r
      ),'[]'::jsonb),
      'ai_headcount',(select count(*) from public.founder_ai_agents where status='active'),
      'planned_human_roles',(select count(*) from public.founder_people_roles where role_type in ('human','future_hire','contractor') and status in ('planned','hiring'))
    );

  elsif v_section='risk' then
    return jsonb_build_object(
      'generated_at',now(),
      'open_high_risk',(select count(*) from public.founder_risk_register where status in ('open','mitigating','accepted') and severity in ('high','critical')),
      'items',coalesce((
        select jsonb_agg(jsonb_build_object(
          'id',r.id,'category',r.category,'title',r.title,'description',r.description,
          'severity',r.severity,'likelihood',r.likelihood,'status',r.status,
          'owner_agent_code',r.owner_agent_code,'mitigation',r.mitigation,'due_at',r.due_at,'updated_at',r.updated_at
        ) order by case r.severity when 'critical' then 1 when 'high' then 2 when 'medium' then 3 else 4 end,r.updated_at desc)
        from (select * from public.founder_risk_register where status<>'closed' order by updated_at desc limit 150) r
      ),'[]'::jsonb)
    );

  elsif v_section='operations' then
    return jsonb_build_object(
      'generated_at',now(),
      'active_sops',(select count(*) from public.founder_sops where status='active'),
      'review_sops',(select count(*) from public.founder_sops where status in ('draft','review')),
      'items',coalesce((
        select jsonb_agg(jsonb_build_object(
          'id',s.id,'title',s.title,'department',s.department,'status',s.status,'version',s.version,
          'purpose',s.purpose,'owner_agent_code',s.owner_agent_code,'approved_at',s.approved_at,'updated_at',s.updated_at
        ) order by s.department,s.updated_at desc)
        from (select * from public.founder_sops order by updated_at desc limit 150) s
      ),'[]'::jsonb)
    );
  else
    raise exception 'Unknown Founder management section: %',v_section using errcode='22023';
  end if;
end $function$
;
revoke all on function public.mw_founder_management_snapshot(text) from public;
grant execute on function public.mw_founder_management_snapshot(text) to authenticated;

CREATE OR REPLACE FUNCTION public.mw_founder_support_triage_snapshot()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if auth.uid() is null or not private.mw_is_founder() then
    raise exception 'Founder / Owner access required' using errcode='42501';
  end if;

  insert into public.founder_support_triage(
    request_source,request_id,priority,triage_status,owner_agent_code,requires_founder,risk_flags,last_triaged_at
  )
  select
    'member',s.id,
    case
      when s.created_at<now()-interval '7 days' then 'urgent'
      when lower(coalesce(s.category,''))='privacy' or s.created_at<now()-interval '48 hours' then 'high'
      else 'normal'
    end,
    'new','support_manager',
    lower(coalesce(s.category,''))='privacy',
    array_to_json(array_remove(array[
      case when lower(coalesce(s.category,''))='privacy' then 'privacy' end,
      case when s.created_at<now()-interval '48 hours' then 'aged_48h' end,
      case when s.created_at<now()-interval '7 days' then 'aged_7d' end
    ],null))::jsonb,
    now()
  from public.support_requests s
  where coalesce(s.status,'open') not in ('resolved','closed')
  on conflict (request_source,request_id) do nothing;

  insert into public.founder_support_triage(
    request_source,request_id,priority,triage_status,owner_agent_code,requires_founder,risk_flags,last_triaged_at
  )
  select
    'public',s.id,
    case
      when s.created_at<now()-interval '7 days' then 'urgent'
      when lower(coalesce(s.category,''))='privacy' or s.created_at<now()-interval '48 hours' then 'high'
      else 'normal'
    end,
    'new','support_manager',
    lower(coalesce(s.category,''))='privacy',
    array_to_json(array_remove(array[
      case when lower(coalesce(s.category,''))='privacy' then 'privacy' end,
      case when s.created_at<now()-interval '48 hours' then 'aged_48h' end,
      case when s.created_at<now()-interval '7 days' then 'aged_7d' end
    ],null))::jsonb,
    now()
  from public.public_support_requests s
  where coalesce(s.status,'open') not in ('resolved','closed')
  on conflict (request_source,request_id) do nothing;

  return jsonb_build_object(
    'generated_at',now(),
    'items',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',t.id,
        'request_source',t.request_source,
        'request_id',t.request_id,
        'priority',t.priority,
        'triage_status',t.triage_status,
        'owner_agent_code',t.owner_agent_code,
        'issue_summary',t.issue_summary,
        'suggested_next_action',t.suggested_next_action,
        'response_draft',t.response_draft,
        'requires_founder',t.requires_founder,
        'risk_flags',t.risk_flags,
        'category',coalesce(ms.category,ps.category),
        'request_status',coalesce(ms.status,ps.status),
        'message_excerpt',left(coalesce(ms.message,ps.message,''),600),
        'contact',case when t.request_source='public' then ps.contact_email else null end,
        'created_at',coalesce(ms.created_at,ps.created_at),
        'updated_at',t.updated_at
      ) order by
        case t.priority when 'urgent' then 1 when 'high' then 2 when 'normal' then 3 else 4 end,
        coalesce(ms.created_at,ps.created_at) asc)
      from public.founder_support_triage t
      left join public.support_requests ms on t.request_source='member' and ms.id=t.request_id
      left join public.public_support_requests ps on t.request_source='public' and ps.id=t.request_id
      where coalesce(ms.status,ps.status,'open') not in ('resolved','closed')
    ),'[]'::jsonb)
  );
end $function$
;
revoke all on function public.mw_founder_support_triage_snapshot() from public;
grant execute on function public.mw_founder_support_triage_snapshot() to authenticated;
