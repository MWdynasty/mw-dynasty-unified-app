-- Motion week provenance now supports the athlete's active Season Intelligence
-- plan as the shared schedule anchor for both coach and athlete surfaces.
alter table public.motion_assessments
 drop constraint if exists motion_assessments_week_source_check;
alter table public.motion_assessments
 add constraint motion_assessments_week_source_check
 check (week_source in ('unassigned','manual','athlete_program_start','active_season_plan'));
