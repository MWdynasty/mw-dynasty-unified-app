-- MW Dynasty Season Intelligence — District of Columbia outdoor fallback.
-- DC is not a state, but it is included in the athlete location selector and has its own NFHS member association.
-- Until a usable 2027 DCSAA outdoor calendar is verified, these dates remain explicit MW estimates
-- and must go through Confirm/Edit before any season plan is activated.

insert into public.mw_state_season_registry(
  state_code,level_group,season_type,competition_path,season_year,
  estimated_start_date,estimated_first_meet_date,estimated_peak_date,estimated_end_date,
  min_weeks,target_weeks,max_weeks,source_label,source_url,source_confidence,verified_at
) values (
  'DC','high_school','outdoor','school',2027,
  '2027-03-01','2027-03-15','2027-05-29','2027-05-29',
  12,16,17,
  'MW estimate — District of Columbia 2027 outdoor dates not yet verified from a usable DCSAA calendar; confirm/edit required',
  'https://dcsaasports.org/',
  'estimated',now()
)
on conflict(state_code,level_group,season_type,competition_path,season_year) do update
set estimated_start_date=excluded.estimated_start_date,
    estimated_first_meet_date=excluded.estimated_first_meet_date,
    estimated_peak_date=excluded.estimated_peak_date,
    estimated_end_date=excluded.estimated_end_date,
    min_weeks=excluded.min_weeks,
    target_weeks=excluded.target_weeks,
    max_weeks=excluded.max_weeks,
    source_label=excluded.source_label,
    source_url=excluded.source_url,
    source_confidence=excluded.source_confidence,
    verified_at=excluded.verified_at,
    updated_at=now();