-- MW Dynasty Founder OS v7
-- Deterministic full-launch readiness gates.

create table if not exists public.founder_launch_gates (
  id uuid primary key default gen_random_uuid(),
  gate_code text not null unique,
  category text not null,
  title text not null,
  description text,
  required boolean not null default true,
  severity text not null default 'high' check (severity in ('low','medium','high','critical')),
  status text not null default 'pending' check (status in ('pending','verified','blocked','not_applicable')),
  verification_source text not null default 'manual' check (verification_source in ('automated','manual','external')),
  owner_agent_code text references public.founder_ai_agents(code) on update cascade,
  evidence text,
  founder_approval_required boolean not null default false,
  verified_by uuid,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists founder_launch_gates_status_idx on public.founder_launch_gates(status,severity,category);
alter table public.founder_launch_gates enable row level security;
drop policy if exists mw_founder_launch_gates_all on public.founder_launch_gates;
create policy mw_founder_launch_gates_all on public.founder_launch_gates
for all to authenticated using (private.mw_is_founder()) with check (private.mw_is_founder());

insert into public.founder_launch_gates(
  gate_code,category,title,description,required,severity,status,verification_source,owner_agent_code,evidence,founder_approval_required
) values
('code_integrity','Code','Launch-integrity source checks','Founder OS, billing, account, onboarding, and release guardrails are present in source control.',true,'critical','verified','automated','release_qa','Launch-integrity source checks and current syntax checks are present on main.',false),
('billing_integrity','Billing','Billing integrity invariants','All deterministic MW billing and entitlement invariants must be zero before release.',true,'critical','pending','automated','controller','Evaluated live by Founder Launch Readiness.',false),
('diagnostics_clean','Product','No unresolved launch diagnostic errors','Recent launch diagnostics must not show active release-blocking errors.',true,'high','pending','automated','release_qa','Evaluated live by Founder Launch Readiness.',false),
('coach_payment_gate','Billing','Coach access remains payment-gated','Coach approval verifies the person; access activates only after paid membership confirmation.',true,'critical','verified','automated','controller','Current Coach access architecture separates verification from payment activation.',false),
('apple_products','App Store','App Store Connect products configured','All four MW monthly products must exist with correct subscription groups, levels, pricing, localization, availability, and review metadata.',true,'critical','blocked','external','release_qa','Requires verification inside App Store Connect.',false),
('apple_server_credentials','App Store','Apple In-App Purchase server credentials configured','Issuer ID, Key ID, private key, bundle ID, and server API access must be present in the secure server environment.',true,'critical','blocked','external','security_specialist','Requires secure environment verification; private keys must not be stored in source or chat.',false),
('apple_notifications','App Store','App Store Server Notifications V2 configured','Production and Sandbox Server Notifications V2 must point to MW Apple notification endpoint.',true,'high','blocked','external','release_qa','Requires App Store Connect verification.',false),
('billing_grace_sandbox','App Store','Billing Grace Period sandbox tested','Billing Grace should be enabled/tested in Sandbox before any production decision.',true,'medium','blocked','external','release_qa','Requires App Store Connect sandbox configuration and test.',false),
('signed_build','iOS Build','Signed Build 13 produced','A valid signed IPA for com.mwdynasty.app must be produced from the current Build 13 source.',true,'critical','blocked','external','release_qa','No signed IPA has been independently verified by Founder OS yet.',false),
('testflight_uploaded','TestFlight','Build 13 uploaded to TestFlight','The signed Build 13 must reach TestFlight processing successfully.',true,'critical','blocked','external','release_qa','Requires Codemagic/Xcode/App Store Connect verification.',false),
('device_sandbox_e2e','TestFlight','Real-device sandbox purchase matrix passed','Athlete purchase/restore and Coach purchase/change/cancel plus sponsor cross-provider scenarios must pass on a real device.',true,'critical','blocked','external','release_qa','Requires TestFlight real-device testing.',false),
('website_live','Website','Public website and app domains are live','mwdynasty.com and app.mwdynasty.com must both respond successfully.',true,'high','pending','automated','website_growth','Evaluated live by Founder API health checks.',false),
('public_site_analytics','Website','Public marketing-site analytics connected','Shared MW Growth tracking should be present on the standalone marketing deployment for complete public-site conversion visibility.',false,'medium','blocked','external','website_growth','App-side web funnel is instrumented; standalone marketing source is not currently connected here.',false),
('security_password_protection','Security','Leaked-password protection enabled','Supabase leaked-password protection should be enabled and sign-in flows rechecked before full public launch.',true,'high','blocked','external','security_specialist','Requires Supabase Auth configuration verification.',false),
('security_review','Security','Founder security review completed','Founder reviews open security/RLS findings and accepts or resolves launch-relevant risk.',true,'high','pending','manual','security_specialist','Founder decision required after final security pass.',true),
('founder_go_live','Founder','Founder go-live approval','Final public launch requires explicit Founder approval after all required launch gates are verified.',true,'critical','pending','manual','chief_of_staff','Must be the final required gate.',true)
on conflict (gate_code) do update set
  category=excluded.category,title=excluded.title,description=excluded.description,required=excluded.required,
  severity=excluded.severity,verification_source=excluded.verification_source,
  owner_agent_code=excluded.owner_agent_code,founder_approval_required=excluded.founder_approval_required,
  updated_at=now();

CREATE OR REPLACE FUNCTION public.mw_founder_launch_readiness()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_billing jsonb;
  v_billing_failures integer := 0;
  v_diag integer := 0;
  v_required integer := 0;
  v_verified integer := 0;
begin
  if auth.uid() is null or not private.mw_is_founder() then
    raise exception 'Founder / Owner access required' using errcode='42501';
  end if;

  v_billing := private.mw_billing_integrity_audit();
  select coalesce(sum(case when key='checked_at' then 0 else
    case when jsonb_typeof(value)='number' then greatest(0,(value #>> '{}')::integer) else 0 end end),0)
  into v_billing_failures
  from jsonb_each(v_billing);

  select count(*) into v_diag
  from public.launch_diagnostics
  where severity='error' and created_at>now()-interval '24 hours';

  update public.founder_launch_gates
  set status=case when v_billing_failures=0 then 'verified' else 'blocked' end,
      evidence=case when v_billing_failures=0 then 'All billing integrity invariants are zero.'
                    else concat(v_billing_failures,' billing integrity violations detected.') end,
      verified_at=case when v_billing_failures=0 then now() else null end,
      updated_at=now()
  where gate_code='billing_integrity';

  update public.founder_launch_gates
  set status=case when v_diag=0 then 'verified' else 'blocked' end,
      evidence=case when v_diag=0 then 'No launch diagnostic errors recorded in the last 24 hours.'
                    else concat(v_diag,' launch diagnostic errors recorded in the last 24 hours.') end,
      verified_at=case when v_diag=0 then now() else null end,
      updated_at=now()
  where gate_code='diagnostics_clean';

  select count(*),count(*) filter(where status='verified')
  into v_required,v_verified
  from public.founder_launch_gates
  where required;

  return jsonb_build_object(
    'generated_at',now(),
    'required_total',v_required,
    'required_verified',v_verified,
    'required_remaining',v_required-v_verified,
    'ready_for_founder_go_live',(
      not exists(
        select 1 from public.founder_launch_gates
        where required and gate_code<>'founder_go_live' and status<>'verified'
      )
    ),
    'fully_launch_ready',(
      not exists(select 1 from public.founder_launch_gates where required and status<>'verified')
    ),
    'billing_integrity',v_billing,
    'gates',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',g.id,'gate_code',g.gate_code,'category',g.category,'title',g.title,'description',g.description,
        'required',g.required,'severity',g.severity,'status',g.status,'verification_source',g.verification_source,
        'owner_agent_code',g.owner_agent_code,'evidence',g.evidence,
        'founder_approval_required',g.founder_approval_required,'verified_at',g.verified_at,'updated_at',g.updated_at
      ) order by
        case g.status when 'blocked' then 1 when 'pending' then 2 when 'verified' then 3 else 4 end,
        case g.severity when 'critical' then 1 when 'high' then 2 when 'medium' then 3 else 4 end,
        g.category,g.title)
      from public.founder_launch_gates g
    ),'[]'::jsonb)
  );
end $function$
;

revoke all on function public.mw_founder_launch_readiness() from public;
grant execute on function public.mw_founder_launch_readiness() to authenticated;
