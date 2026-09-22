-- MW Dynasty Founder Website Design Studio permission repair.
-- Keep the table inaccessible to anon; allow authenticated Founder sessions through RLS.

revoke insert, update, delete, select on table public.founder_website_projects from anon;
revoke truncate on table public.founder_website_projects from anon, authenticated;

grant select, insert, update, delete on table public.founder_website_projects to authenticated;
grant select, insert, update, delete on table public.founder_website_projects to service_role;
