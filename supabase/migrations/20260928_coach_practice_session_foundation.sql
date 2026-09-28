-- Coach Practice Mode session foundation.
-- Adds authoritative session, division, lane, source, pace-range, and recovery provenance
-- without breaking existing timing rows.

alter table public.coach_practice_timing_results
  add column if not exists session_id uuid,
  add column if not exists division text,
  add column if not exists lane_number integer,
  add column if not exists timing_source text not null default 'coach',
  add column if not exists target_min_seconds numeric(8,3),
  add column if not exists target_max_seconds numeric(8,3),
  add column if not exists prescribed_rest_seconds numeric(8,2),
  add column if not exists actual_rest_seconds numeric(8,2);

alter table public.coach_practice_timing_results
  drop constraint if exists coach_practice_timing_results_division_check,
  add constraint coach_practice_timing_results_division_check
    check (division is null or division in ('boys','girls','open')),
  drop constraint if exists coach_practice_timing_results_lane_number_check,
  add constraint coach_practice_timing_results_lane_number_check
    check (lane_number is null or lane_number between 1 and 9),
  drop constraint if exists coach_practice_timing_results_timing_source_check,
  add constraint coach_practice_timing_results_timing_source_check
    check (timing_source in ('coach','athlete','sensor','manual')),
  drop constraint if exists coach_practice_timing_results_target_range_check,
  add constraint coach_practice_timing_results_target_range_check
    check (
      (target_min_seconds is null and target_max_seconds is null)
      or (
        target_min_seconds > 0
        and target_max_seconds > 0
        and target_min_seconds <= target_max_seconds
      )
    );

create index if not exists coach_practice_timing_results_session_idx
  on public.coach_practice_timing_results(session_id,rep_number,lane_number);

create index if not exists coach_practice_timing_results_division_group_idx
  on public.coach_practice_timing_results(coach_user_id,session_date,division,group_name);

comment on column public.coach_practice_timing_results.session_id is
  'Shared practice-session identifier. Every athlete result from the same coach-led practice uses the same value.';
comment on column public.coach_practice_timing_results.lane_number is
  'Temporary lane assignment for this rep/heat; configurable from lane 1 through lane 9.';
comment on column public.coach_practice_timing_results.timing_source is
  'Authority/provenance of the recorded result. Coach-led practice uses coach unless explicitly corrected.';
comment on column public.coach_practice_timing_results.target_min_seconds is
  'Fast edge of the prescribed target range. A faster result is not automatically on target.';
comment on column public.coach_practice_timing_results.target_max_seconds is
  'Slow edge of the prescribed target range.';
