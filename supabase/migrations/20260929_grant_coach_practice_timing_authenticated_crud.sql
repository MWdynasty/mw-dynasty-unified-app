-- Coach Practice Mode timing rows are accessed with the signed-in coach JWT.
-- RLS policies remain authoritative; these table grants allow PostgreSQL to reach them.

revoke all privileges
on table public.coach_practice_timing_results
from anon;

revoke truncate, references, trigger
on table public.coach_practice_timing_results
from authenticated;

grant select, insert, update, delete
on table public.coach_practice_timing_results
to authenticated;
