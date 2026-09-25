-- MW Dynasty Season Intelligence — follow-up source upgrades for the 2027 national outdoor registry.
-- Applies newly verified governing-association dates to the already-created QA database.

update public.mw_state_season_registry
set estimated_start_date='2027-02-22',
    estimated_first_meet_date=null,
    estimated_peak_date='2027-05-08',
    estimated_end_date='2027-05-08',
    source_label='Arkansas Activities Association 2026-27 — Track season begins Feb 22; State Track Meets May 3-8; Meet of Champions May 12; MW primary state anchor May 8',
    source_url='https://www.ahsaa.org/page/calendar-checklist/',
    source_confidence='official',
    verified_at=now(),updated_at=now()
where state_code='AR' and level_group='high_school' and season_type='outdoor' and competition_path='school' and season_year=2027;

update public.mw_state_season_registry
set estimated_start_date='2027-03-01',
    estimated_first_meet_date='2027-03-18',
    estimated_peak_date='2027-05-29',
    estimated_end_date='2027-05-29',
    source_label='MSHSAA 2026-27 projected calendar — State Classes 1-3 May 21-22; Classes 4-5 May 28-29; MW statewide anchor May 29; opening dates remain MW estimates',
    source_url='https://www.mshsaa.org/resources/pdf/Official%20Handbook.pdf?preview=true&site_id=756',
    source_confidence='official_peak_estimated_start',
    verified_at=now(),updated_at=now()
where state_code='MO' and level_group='high_school' and season_type='outdoor' and competition_path='school' and season_year=2027;

update public.mw_state_season_registry
set estimated_start_date='2027-02-01',
    estimated_first_meet_date='2027-02-19',
    estimated_peak_date='2027-05-15',
    estimated_end_date='2027-05-15',
    source_label='SCHSL 2026-27 Sports Season Calendar — first practice Feb 1; first contest Feb 19; State Track & Field May 13-15; MW peak anchor May 15',
    source_url='https://schsl.org/wp-content/uploads/2026/08/2026-Sports-Season-Schedule.pdf',
    source_confidence='official',
    verified_at=now(),updated_at=now()
where state_code='SC' and level_group='high_school' and season_type='outdoor' and competition_path='school' and season_year=2027;

update public.mw_state_season_registry
set estimated_start_date='2027-03-01',
    estimated_first_meet_date='2027-03-17',
    estimated_peak_date='2027-05-22',
    estimated_end_date='2027-05-22',
    source_label='WVSSAC Standardized Calendar 2023-2029 — Track starts Mar 1; first contest Mar 17; State May 21-22; MW peak anchor May 22',
    source_url='https://www.wvssac.org/wp-content/uploads/2023/08/High_school_STANDARDIZED_CALENDAR_2023_klb_8_22_2023_1.pdf',
    source_confidence='official',
    verified_at=now(),updated_at=now()
where state_code='WV' and level_group='high_school' and season_type='outdoor' and competition_path='school' and season_year=2027;
