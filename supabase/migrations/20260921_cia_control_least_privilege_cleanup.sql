-- Least-privilege cleanup for the MW Dynasty CIA control framework.
-- PostgreSQL grants EXECUTE on new functions to PUBLIC by default, so explicitly remove it.

revoke execute on function public.mw_founder_security_controls_snapshot() from public;
revoke execute on function public.mw_founder_security_controls_snapshot() from anon;
grant execute on function public.mw_founder_security_controls_snapshot() to authenticated;

revoke execute on function public.mw_security_event_from_diagnostic(text,text,text,text,text,jsonb) from public;
revoke execute on function public.mw_security_event_from_diagnostic(text,text,text,text,text,jsonb) from anon;
grant execute on function public.mw_security_event_from_diagnostic(text,text,text,text,text,jsonb) to authenticated;

revoke execute on function public.mw_record_web_event(text,text,text,text,text,text,text,text,jsonb) from public;
grant execute on function public.mw_record_web_event(text,text,text,text,text,text,text,text,jsonb) to anon,authenticated;

drop policy if exists mw_security_controls_founder_select on public.company_security_controls;
drop policy if exists mw_security_incidents_founder_select on public.security_incidents;

notify pgrst, 'reload schema';
