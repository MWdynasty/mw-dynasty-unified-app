-- MW Dynasty Founder OS v9
-- Correct launch billing gate: internal test Coach entitlements are informational,
-- not production billing-integrity failures.

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

  select coalesce(sum(
    case
      when key in ('checked_at','internal_test_coach_entitlements') then 0
      when jsonb_typeof(value)='number' then greatest(0,(value #>> '{}')::integer)
      else 0
    end
  ),0)
  into v_billing_failures
  from jsonb_each(v_billing);

  select count(*) into v_diag
  from public.launch_diagnostics
  where severity='error' and created_at>now()-interval '24 hours';

  update public.founder_launch_gates
  set status=case when v_billing_failures=0 then 'verified' else 'blocked' end,
      evidence=case when v_billing_failures=0
                    then concat('All production billing integrity invariants are zero. Internal test Coach entitlements: ',coalesce(v_billing->>'internal_test_coach_entitlements','0'),'.')
                    else concat(v_billing_failures,' production billing integrity violations detected.') end,
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
