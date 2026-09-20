-- MW Dynasty Founder OS v13
-- Record the completed intentionality review for the seven RLS-enabled/no-policy tables.
-- Live privilege review confirmed no direct anon/authenticated table grants; the tables are intentionally fail-closed.

update public.founder_risk_register
set status='resolved',
    description='Reviewed against live database privileges. The seven RLS-enabled tables have no direct anon/authenticated table grants, so no-policy RLS is intentionally fail-closed. Access is mediated through scoped SECURITY DEFINER RPCs and/or service-side flows; coach_verification_blocks is service-role controlled.',
    mitigation='Keep these tables fail-closed. Re-open this risk only if a client feature later requires direct table access; then add a narrowly scoped RLS policy rather than broad grants.',
    updated_at=now()
where title='RLS-enabled tables without direct policies need intentionality review';
