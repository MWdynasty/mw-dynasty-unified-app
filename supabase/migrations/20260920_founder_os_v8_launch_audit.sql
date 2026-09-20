-- MW Dynasty Founder OS v8
-- Include launch readiness mutations in the Founder audit trail.

drop trigger if exists mw_audit_founder_launch_gates on public.founder_launch_gates;
create trigger mw_audit_founder_launch_gates
after insert or update or delete on public.founder_launch_gates
for each row execute function private.mw_audit_founder_os_change();
