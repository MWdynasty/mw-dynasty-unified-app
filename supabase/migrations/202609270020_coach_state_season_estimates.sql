alter table public.coach_season_settings
  add column if not exists competition_state text,
  add column if not exists coaching_level text,
  add column if not exists season_type text,
  add column if not exists season_year integer,
  add column if not exists first_meet_date date,
  add column if not exists primary_peak_date date,
  add column if not exists calendar_source text;

comment on column public.coach_season_settings.competition_state is 'Two-letter state code used to estimate the coach training calendar.';
comment on column public.coach_season_settings.coaching_level is 'Coach environment such as middle_school, high_school, collegiate, club, private, or professional.';
comment on column public.coach_season_settings.calendar_source is 'Provenance for the saved dates, e.g. state_registry, state_school_proxy, mw_estimate, or coach_edit.';
