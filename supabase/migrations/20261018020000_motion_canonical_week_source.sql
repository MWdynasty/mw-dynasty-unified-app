-- Preserve whether a motion assessment used the server-owned unified
-- 41-week program start or an explicitly selected fallback week.
alter table public.motion_assessments
 add column if not exists week_source text not null default 'unassigned'
 check (week_source in ('unassigned','manual','athlete_program_start'));
create index if not exists motion_assessments_owner_week_idx
 on public.motion_assessments(created_by,week_number,created_at desc);
