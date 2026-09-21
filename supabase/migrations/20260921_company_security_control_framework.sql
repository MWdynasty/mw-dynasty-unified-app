-- MW Dynasty company-wide CIA triad + control family framework.
-- Applied to production on 2026-09-21.

create table if not exists public.company_security_controls (
  id uuid primary key default gen_random_uuid(),
  control_code text not null unique,
  platform text not null,
  cia_dimensions text[] not null default '{}',
  control_family text not null check (control_family in ('preventive','detective','corrective','compensating')),
  name text not null,
  description text not null,
  status text not null default 'active' check (status in ('active','degraded','planned','retired')),
  criticality text not null default 'high' check (criticality in ('low','moderate','high','critical')),
  implementation_source text,
  compensating_control_code text,
  evidence jsonb not null default '{}'::jsonb,
  owner_role text not null default 'founder_owner',
  last_verified_at timestamptz,
  review_interval_days integer not null default 30 check (review_interval_days between 1 and 365),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists company_security_controls_platform_idx
  on public.company_security_controls(platform,control_family,status);
alter table public.company_security_controls enable row level security;

drop policy if exists mw_security_controls_founder_select on public.company_security_controls;
create policy mw_security_controls_founder_select on public.company_security_controls
for select to authenticated using (private.mw_is_founder());
drop policy if exists mw_security_controls_founder_modify on public.company_security_controls;
create policy mw_security_controls_founder_modify on public.company_security_controls
for all to authenticated using (private.mw_is_founder()) with check (private.mw_is_founder());
grant select,insert,update,delete on public.company_security_controls to authenticated;
revoke all on public.company_security_controls from anon;

create table if not exists public.security_incidents (
  id uuid primary key default gen_random_uuid(),
  dedupe_key text not null unique,
  platform text not null,
  cia_dimension text not null check (cia_dimension in ('confidentiality','integrity','availability')),
  control_family text not null default 'detective' check (control_family in ('preventive','detective','corrective','compensating')),
  severity text not null check (severity in ('info','low','medium','high','critical')),
  status text not null default 'open' check (status in ('open','monitoring','resolved','accepted')),
  event_code text not null,
  summary text not null,
  source text not null default 'diagnostics',
  actor_user_id uuid,
  route text,
  details jsonb not null default '{}'::jsonb,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  occurrence_count integer not null default 1,
  resolved_at timestamptz,
  resolution_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists security_incidents_open_idx on public.security_incidents(status,severity,last_seen_at desc);
create index if not exists security_incidents_actor_idx on public.security_incidents(actor_user_id,last_seen_at desc);
alter table public.security_incidents enable row level security;

drop policy if exists mw_security_incidents_founder_select on public.security_incidents;
create policy mw_security_incidents_founder_select on public.security_incidents
for select to authenticated using (private.mw_is_founder());
drop policy if exists mw_security_incidents_founder_modify on public.security_incidents;
create policy mw_security_incidents_founder_modify on public.security_incidents
for all to authenticated using (private.mw_is_founder()) with check (private.mw_is_founder());
grant select,insert,update,delete on public.security_incidents to authenticated;
revoke all on public.security_incidents from anon;

create or replace function public.mw_security_event_from_diagnostic(
  p_surface text,p_event_type text,p_severity text,p_code text default null,
  p_route text default null,p_context jsonb default '{}'::jsonb
)
returns boolean language plpgsql security definer set search_path to ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_platform text := lower(left(trim(coalesce(p_surface,'unknown')),40));
  v_event text := lower(left(trim(coalesce(p_event_type,'event')),80));
  v_code text := lower(left(trim(coalesce(p_code,'unknown')),80));
  v_route text := left(split_part(split_part(coalesce(p_route,''),'?',1),'#',1),140);
  v_severity text; v_cia text := 'availability'; v_key text; v_details jsonb;
begin
  if v_uid is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if v_platform not in ('athlete','coach','account','native','founder','website','unknown') then v_platform := 'unknown'; end if;

  if v_event='sync_ok' or (v_event='network_state' and v_code='online') then
    update public.security_incidents
    set status='resolved',resolved_at=now(),resolution_note='Automatic recovery signal received.',
        updated_at=now(),last_seen_at=now()
    where actor_user_id=v_uid and platform=v_platform and cia_dimension='availability'
      and status in ('open','monitoring') and source='diagnostics';
    return true;
  end if;

  if lower(coalesce(p_severity,'')) not in ('warn','error')
     and v_event not in ('network_failure','api_failure','client_error') then return true; end if;

  v_severity := case when lower(coalesce(p_severity,''))='error' then 'high'
                     when lower(coalesce(p_severity,''))='warn' then 'medium' else 'low' end;
  if v_code in ('http_401','http_403','permission_denied','auth_failed','session_invalid')
     or v_event in ('auth_failure','authorization_failure') then v_cia := 'confidentiality';
  elsif v_code like '%integrity%' or v_event like '%integrity%' then v_cia := 'integrity';
  else v_cia := 'availability'; end if;

  v_details := case when jsonb_typeof(coalesce(p_context,'{}'::jsonb))='object'
    then coalesce(p_context,'{}'::jsonb)
      - 'email' - 'name' - 'message' - 'body' - 'token' - 'password'
      - 'secret' - 'authorization' - 'cookie' - 'photo' - 'image'
    else '{}'::jsonb end;
  v_key := concat_ws('|',v_uid::text,v_platform,v_cia,v_event,v_code,v_route,
                     to_char(date_trunc('minute',now()),'YYYYMMDDHH24MI'));

  insert into public.security_incidents(
    dedupe_key,platform,cia_dimension,control_family,severity,status,event_code,summary,
    source,actor_user_id,route,details
  ) values (
    v_key,v_platform,v_cia,'detective',v_severity,'open',coalesce(nullif(v_code,''),v_event),
    left(initcap(replace(v_event,'_',' '))||case when v_route<>'' then ' · '||v_route else '' end,240),
    'diagnostics',v_uid,nullif(v_route,''),v_details
  )
  on conflict (dedupe_key) do update
  set occurrence_count=public.security_incidents.occurrence_count+1,last_seen_at=now(),updated_at=now(),
      severity=case when public.security_incidents.severity in ('critical','high')
                    then public.security_incidents.severity else excluded.severity end,
      status=case when public.security_incidents.status='resolved' then 'monitoring'
                  else public.security_incidents.status end;
  return true;
end
$function$;
grant execute on function public.mw_security_event_from_diagnostic(text,text,text,text,text,jsonb) to authenticated;
revoke execute on function public.mw_security_event_from_diagnostic(text,text,text,text,text,jsonb) from anon;

create or replace function public.mw_founder_security_controls_snapshot()
returns jsonb language plpgsql security definer set search_path to ''
as $function$
begin
  if auth.uid() is null or not private.mw_is_founder() then
    raise exception 'Founder / Owner access required' using errcode='42501';
  end if;
  return jsonb_build_object(
    'generated_at',now(),
    'control_count',(select count(*) from public.company_security_controls where status<>'retired'),
    'active_controls',(select count(*) from public.company_security_controls where status='active'),
    'degraded_controls',(select count(*) from public.company_security_controls where status='degraded'),
    'open_incidents',(select count(*) from public.security_incidents where status in ('open','monitoring')),
    'critical_high_incidents',(select count(*) from public.security_incidents where status in ('open','monitoring') and severity in ('critical','high')),
    'cia_coverage',jsonb_build_object(
      'confidentiality',(select count(*) from public.company_security_controls where status='active' and 'confidentiality'=any(cia_dimensions)),
      'integrity',(select count(*) from public.company_security_controls where status='active' and 'integrity'=any(cia_dimensions)),
      'availability',(select count(*) from public.company_security_controls where status='active' and 'availability'=any(cia_dimensions))
    ),
    'family_coverage',jsonb_build_object(
      'preventive',(select count(*) from public.company_security_controls where status='active' and control_family='preventive'),
      'detective',(select count(*) from public.company_security_controls where status='active' and control_family='detective'),
      'corrective',(select count(*) from public.company_security_controls where status='active' and control_family='corrective'),
      'compensating',(select count(*) from public.company_security_controls where status='active' and control_family='compensating')
    ),
    'platforms',coalesce((
      select jsonb_agg(jsonb_build_object(
        'platform',x.platform,'active_controls',x.active_controls,'degraded_controls',x.degraded_controls,
        'preventive',x.preventive,'detective',x.detective,'corrective',x.corrective,'compensating',x.compensating
      ) order by x.platform)
      from (
        select platform,
          count(*) filter(where status='active') active_controls,
          count(*) filter(where status='degraded') degraded_controls,
          count(*) filter(where status='active' and control_family='preventive') preventive,
          count(*) filter(where status='active' and control_family='detective') detective,
          count(*) filter(where status='active' and control_family='corrective') corrective,
          count(*) filter(where status='active' and control_family='compensating') compensating
        from public.company_security_controls where status<>'retired' group by platform
      ) x
    ),'[]'::jsonb),
    'controls',coalesce((
      select jsonb_agg(jsonb_build_object(
        'control_code',c.control_code,'platform',c.platform,'cia_dimensions',c.cia_dimensions,
        'control_family',c.control_family,'name',c.name,'description',c.description,'status',c.status,
        'criticality',c.criticality,'implementation_source',c.implementation_source,
        'compensating_control_code',c.compensating_control_code,'evidence',c.evidence,
        'last_verified_at',c.last_verified_at,'review_interval_days',c.review_interval_days
      ) order by c.platform,c.control_family,c.control_code)
      from public.company_security_controls c where c.status<>'retired'
    ),'[]'::jsonb),
    'incidents',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',i.id,'platform',i.platform,'cia_dimension',i.cia_dimension,'control_family',i.control_family,
        'severity',i.severity,'status',i.status,'event_code',i.event_code,'summary',i.summary,
        'source',i.source,'route',i.route,'occurrence_count',i.occurrence_count,
        'first_seen_at',i.first_seen_at,'last_seen_at',i.last_seen_at,'resolved_at',i.resolved_at
      ) order by case i.severity when 'critical' then 1 when 'high' then 2 when 'medium' then 3 else 4 end,i.last_seen_at desc)
      from (select * from public.security_incidents where status in ('open','monitoring')
            order by last_seen_at desc limit 100) i
    ),'[]'::jsonb)
  );
end
$function$;
grant execute on function public.mw_founder_security_controls_snapshot() to authenticated;
revoke execute on function public.mw_founder_security_controls_snapshot() from anon;

-- Baseline control registry. Four active control families are required per platform.
insert into public.company_security_controls
(control_code,platform,cia_dimensions,control_family,name,description,status,criticality,implementation_source,compensating_control_code,evidence,last_verified_at)
values
('WEB-PREV-001','website',array['confidentiality','integrity'],'preventive','Global browser security headers','HSTS, CSP, frame blocking, referrer policy, permissions policy, and MIME sniffing protection reduce browser-side attack surface.','active','high','vercel.json','WEB-COMP-001','{"layer":"edge_headers"}',now()),
('WEB-DETECT-001','website',array['availability','integrity'],'detective','Public website telemetry','Sanitized page, error, and availability signals are recorded without passwords, tokens, payment data, or message content.','active','moderate','mw-web-analytics + founder_web_events','WEB-COMP-001','{"privacy_scrubbed":true}',now()),
('WEB-CORR-001','website',array['availability'],'corrective','Network-first recovery','Cached site/app shells and online recovery events restore service after transient network/CDN failures.','active','high','mw-resilience + service worker','WEB-COMP-001','{"mode":"network_first"}',now()),
('WEB-COMP-001','website',array['availability','integrity'],'compensating','Cached read-only shell fallback','If live delivery is unavailable, previously cached shell content can load while state-changing operations remain fail-safe.','active','high','mw-sw.js',null,'{"writes_replayed":false}',now()),
('ATH-PREV-001','athlete_app',array['confidentiality','integrity'],'preventive','Athlete authentication and authorization','Authenticated access, RLS, entitlement checks, and offline write blocking prevent unauthorized or unsafe state changes.','active','critical','Supabase RLS + MW auth + mw-resilience','ATH-COMP-001','{"fail_closed":true}',now()),
('ATH-DETECT-001','athlete_app',array['confidentiality','integrity','availability'],'detective','Athlete diagnostics and security incidents','Sanitized client/API failures are captured and promoted into central incident tracking.','active','high','launch_diagnostics + security_incidents','ATH-COMP-001','{"sensitive_fields_scrubbed":true}',now()),
('ATH-CORR-001','athlete_app',array['availability'],'corrective','Athlete session recovery','Expired sessions refresh automatically and valid saved sessions survive transient backend failures.','active','high','mw-resilience + Athlete auth','ATH-COMP-001','{"auto_refresh":true}',now()),
('ATH-COMP-001','athlete_app',array['availability','integrity'],'compensating','Athlete safe/degraded mode','Cached shell remains available while unsafe writes are blocked and live secure data waits for backend recovery.','active','high','mw-resilience + mw-sw.js',null,'{"no_blind_write_retry":true}',now()),
('COACH-PREV-001','coach_app',array['confidentiality','integrity'],'preventive','Coach role and entitlement enforcement','Coach access is verified server-side; RLS and tier checks limit data and features to authorized coaches.','active','critical','coach/access + RLS','COACH-COMP-001','{"server_authoritative":true}',now()),
('COACH-DETECT-001','coach_app',array['confidentiality','integrity','availability'],'detective','Coach diagnostics and anomaly detection','API failures, session issues, and application errors feed centralized diagnostics and incident tracking.','active','high','launch_diagnostics + security_incidents','COACH-COMP-001','{"centralized":true}',now()),
('COACH-CORR-001','coach_app',array['availability'],'corrective','Coach session recovery','Transient auth failures preserve valid sessions; refresh and reconnect restore the workspace automatically.','active','high','Coach auth + mw-resilience','COACH-COMP-001','{"session_preserved":true}',now()),
('COACH-COMP-001','coach_app',array['availability','integrity'],'compensating','Coach fail-safe workspace','Temporary verification outages do not falsely revoke access or trigger membership changes; writes are never blindly replayed.','active','critical','Coach auth + mw-resilience',null,'{"false_denial_protected":true}',now()),
('FOUNDER-PREV-001','founder_os',array['confidentiality','integrity'],'preventive','Exclusive Founder authorization','Founder OS, Founder AI, and Founder voice share fail-closed Founder-only authorization.','active','critical','founder-auth + RLS','FOUNDER-COMP-001','{"fail_closed":true}',now()),
('FOUNDER-DETECT-001','founder_os',array['confidentiality','integrity','availability'],'detective','Founder Security & Audit center','Founder OS inventories RLS, privileged functions, risks, audit events, controls, and incidents.','active','critical','Founder Security & Audit','FOUNDER-COMP-001','{"executive_visibility":true}',now()),
('FOUNDER-CORR-001','founder_os',array['availability'],'corrective','Founder session and service recovery','Token refresh, controlled retry, cached data, and reconnect logic recover from transient failures.','active','high','Founder OS resilience','FOUNDER-COMP-001','{"controlled_retry":true}',now()),
('FOUNDER-COMP-001','founder_os',array['confidentiality','integrity','availability'],'compensating','Founder fail-closed continuity','When authorization cannot be positively verified, privileged access remains locked while the valid saved session is preserved for recovery.','active','critical','Founder auth fault tolerance',null,'{"no_backdoor":true}',now()),
('API-PREV-001','api',array['confidentiality','integrity','availability'],'preventive','Unified API guardrails','Authentication, authorization, request limits, no-store responses, request IDs, and sanitized 5xx errors protect API boundaries.','active','critical','api/mw.js + server auth','API-COMP-001','{"gateway":"unified"}',now()),
('API-DETECT-001','api',array['confidentiality','integrity','availability'],'detective','API failure telemetry','HTTP failures and network errors are recorded with sanitized routes and request context.','active','high','launch_diagnostics + gateway logs','API-COMP-001','{"request_ids":true}',now()),
('API-CORR-001','api',array['availability'],'corrective','Transient failure recovery semantics','Retryable failures return controlled status behavior while clients retry only safe reads.','active','high','gateway + mw-resilience','API-COMP-001','{"safe_read_retry_only":true}',now()),
('API-COMP-001','api',array['integrity','availability'],'compensating','No blind write replay','POST/PATCH/DELETE operations are never automatically replayed during degraded service.','active','critical','mw-resilience',null,'{"duplicate_side_effect_protection":true}',now()),
('DB-PREV-001','database',array['confidentiality','integrity'],'preventive','Row-level security and guarded RPCs','RLS protects data tables and SECURITY DEFINER functions use explicit identity/role guards and fixed search paths.','active','critical','Supabase RLS + guarded RPCs','DB-COMP-001','{"rls":true,"fixed_search_path":true}',now()),
('DB-DETECT-001','database',array['confidentiality','integrity'],'detective','Database security posture inventory','Founder security snapshot continuously inventories RLS gaps, client grants, privileged functions, and security risks.','active','high','mw_founder_security_snapshot','DB-COMP-001','{"continuous_inventory":true}',now()),
('DB-CORR-001','database',array['integrity','availability'],'corrective','Transactional correction and reconciliation','Database constraints, transactional RPCs, and billing/program reconciliation restore consistent state after interrupted workflows.','active','high','Postgres transactions + MW reconciliation','DB-COMP-001','{"transactional":true}',now()),
('DB-COMP-001','database',array['confidentiality','integrity'],'compensating','Fail-closed protected tables','Sensitive tables without direct client policies remain inaccessible to client roles unless an explicitly guarded server/RPC path permits access.','active','critical','RLS fail-closed model',null,'{"default_deny":true}',now()),
('BILL-PREV-001','billing',array['confidentiality','integrity'],'preventive','Server-authoritative billing and entitlements','Membership access is granted only through verified billing/entitlement state rather than client claims.','active','critical','billing RPCs + Stripe/App Store flow','BILL-COMP-001','{"server_authoritative":true}',now()),
('BILL-DETECT-001','billing',array['integrity','availability'],'detective','Billing integrity checks','Founder System Health and billing transition records surface pending, failed, or inconsistent subscription state.','active','critical','billing_integrity + billing_transitions','BILL-COMP-001','{"integrity_invariants":true}',now()),
('BILL-CORR-001','billing',array['integrity','availability'],'corrective','Billing transition reconciliation','Expired or failed handoffs are cancelled/failed deterministically so members do not remain trapped in permanent pending state.','active','critical','mw_billing_status reconciliation','BILL-COMP-001','{"stale_transition_cleanup":true}',now()),
('BILL-COMP-001','billing',array['integrity'],'compensating','Entitlement fail-closed gate','If payment verification cannot be established, paid access is not granted; human review remains available for exceptions.','active','critical','membership entitlement gates',null,'{"no_payment_no_access":true}',now()),
('AI-PREV-001','ai',array['confidentiality','integrity'],'preventive','Authenticated AI boundaries','Coach MW and Founder AI use authenticated server routes; Founder AI requires Founder authorization and protected actions require approvals.','active','critical','chat/founder-ai/speak APIs','AI-COMP-001','{"privileged_actions_human_gated":true}',now()),
('AI-DETECT-001','ai',array['integrity','availability'],'detective','AI run and task traceability','Founder AI runs, tasks, approvals, and errors remain visible for review rather than operating invisibly.','active','high','founder_ai_runs + founder_ai_tasks','AI-COMP-001','{"traceable":true}',now()),
('AI-CORR-001','ai',array['availability','integrity'],'corrective','AI failure isolation','AI or TTS failure returns a bounded error without corrupting training, billing, roster, or Founder data.','active','high','API isolation boundaries','AI-COMP-001','{"blast_radius_limited":true}',now()),
('AI-COMP-001','ai',array['integrity','availability'],'compensating','Human and core-product fallback','Training, dashboards, billing, messaging, and Founder decisions continue without AI; AI never becomes the sole authority for consequential changes.','active','critical','human approval + non-AI workflows',null,'{"ai_not_single_point_of_failure":true}',now()),
('MSG-PREV-001','messaging',array['confidentiality','integrity'],'preventive','Scoped coach-athlete messaging','RLS and relationship checks limit messages and read receipts to authorized coach-athlete relationships.','active','high','messaging RLS/RPCs','MSG-COMP-001','{"relationship_scoped":true}',now()),
('MSG-DETECT-001','messaging',array['confidentiality','availability'],'detective','Messaging diagnostics','Connection and API failures surface through diagnostics rather than silently dropping into unknown state.','active','moderate','launch_diagnostics','MSG-COMP-001','{"delivery_failures_visible":true}',now()),
('MSG-CORR-001','messaging',array['availability'],'corrective','Reconnect and read-state recovery','Recovered sessions reload message/read state after transient service interruptions.','active','moderate','session recovery + message reload','MSG-COMP-001','{"reload_on_reconnect":true}',now()),
('MSG-COMP-001','messaging',array['integrity','availability'],'compensating','No automatic message replay','Failed message writes are not blindly retried, preventing duplicate sends; users can retry intentionally after recovery.','active','high','mw-resilience',null,'{"no_duplicate_send_retry":true}',now()),
('NATIVE-PREV-001','native_app',array['confidentiality','integrity'],'preventive','Native app uses the same server authority','iOS/native webview uses the same authenticated APIs, entitlements, RLS, and role enforcement as web.','active','critical','native webview + shared APIs','NATIVE-COMP-001','{"parity":true}',now()),
('NATIVE-DETECT-001','native_app',array['availability','integrity'],'detective','Native launch diagnostics','Native diagnostics are enabled automatically and queue sanitized events until they can sync.','active','high','mw-diagnostics','NATIVE-COMP-001','{"offline_queue":true}',now()),
('NATIVE-CORR-001','native_app',array['availability'],'corrective','Native reconnect recovery','Queued diagnostics, saved sessions, and app state resume when connectivity returns.','active','high','mw-diagnostics + mw-resilience','NATIVE-COMP-001','{"reconnect":true}',now()),
('NATIVE-COMP-001','native_app',array['availability','integrity'],'compensating','Local shell continuity','The local/web shell remains usable for non-authoritative UI while secure writes wait for live backend confirmation.','active','high','cached shell + fail-safe writes',null,'{"offline_writes_blocked":true}',now()),
('OPS-PREV-001','company_ops',array['confidentiality','integrity'],'preventive','Role separation and Founder approvals','Consequential company actions remain role-scoped and Founder approval gates prevent AI or lower-privilege roles from silently exercising executive authority.','active','critical','Founder approvals + RBAC','OPS-COMP-001','{"separation_of_duties":true}',now()),
('OPS-DETECT-001','company_ops',array['confidentiality','integrity','availability'],'detective','Audit, risk, diagnostics, and incident registers','Company operations use audit logs, risk register, launch gates, diagnostics, and security incidents for centralized detection.','active','critical','Founder OS','OPS-COMP-001','{"central_monitoring":true}',now()),
('OPS-CORR-001','company_ops',array['integrity','availability'],'corrective','Incident correction workflow','Open incidents and risks remain visible until resolved, accepted, or remediated; recovery evidence is retained.','active','high','security_incidents + risk register','OPS-COMP-001','{"tracked_to_resolution":true}',now()),
('OPS-COMP-001','company_ops',array['confidentiality','integrity','availability'],'compensating','Manual Founder control path','When automation, AI, or a provider is unavailable, high-impact decisions remain under explicit Founder/human control instead of bypassing governance.','active','critical','Founder OS + manual approval',null,'{"human_fallback":true}',now()),
('AUTH-PREV-002','company_ops',array['confidentiality'],'preventive','Leaked-password protection','Supabase Auth should reject passwords known to be compromised. This remains degraded until the provider-level protection is enabled.','degraded','high','Supabase Auth','OPS-COMP-001','{"advisor":"auth_leaked_password_protection","required_action":"enable_in_supabase_auth"}',now())
on conflict (control_code) do update set
  platform=excluded.platform,cia_dimensions=excluded.cia_dimensions,control_family=excluded.control_family,
  name=excluded.name,description=excluded.description,status=excluded.status,criticality=excluded.criticality,
  implementation_source=excluded.implementation_source,compensating_control_code=excluded.compensating_control_code,
  evidence=excluded.evidence,last_verified_at=excluded.last_verified_at,updated_at=now();

notify pgrst, 'reload schema';
