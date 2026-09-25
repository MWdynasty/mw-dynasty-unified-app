-- MW Dynasty Season Intelligence — verified Alabama 2027 outdoor registry metadata.
-- Verified against the AHSAA 2026-2031 Five-Year Calendar.
-- Official 2026-2027 dates: first spring practice Jan 18, Track first contest Feb 25,
-- State Track & Field Meets May 6-8. MW uses the final championship day (May 8)
-- as the single planning peak anchor while preserving the official meet range in the source label.
-- AHSAA states that calendar dates are subject to change.

update public.mw_state_season_registry
set
  estimated_start_date='2027-01-18',
  estimated_first_meet_date='2027-02-25',
  estimated_peak_date='2027-05-08',
  estimated_end_date='2027-05-08',
  source_label='AHSAA 2026-2031 Five-Year Calendar — State Track & Field May 6-8; MW peak anchor May 8',
  source_url='https://www.ahsaa.com/Portals/0/Publications/2026-2027/5%20%20year%20Calendar%202026-2031.pdf',
  source_confidence='official',
  verified_at=now(),
  updated_at=now()
where state_code='AL'
  and level_group='high_school'
  and season_type='outdoor'
  and competition_path='school'
  and season_year=2027;
