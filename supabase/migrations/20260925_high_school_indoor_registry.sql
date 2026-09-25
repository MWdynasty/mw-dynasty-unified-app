-- MW Dynasty Season Intelligence — 2027 high-school indoor registry.
-- NFHS state-association championship data identifies 17 NFHS jurisdictions
-- (16 states plus the District of Columbia) with state-association indoor-track championship paths.
-- Dates below use current 2026-27 association calendars when published.
-- Rows explicitly marked estimated/official_peak_estimated_start stay provisional and must be Confirm/Edit-ed.

insert into public.mw_state_season_registry(
  state_code,level_group,season_type,competition_path,season_year,
  estimated_start_date,estimated_first_meet_date,estimated_peak_date,estimated_end_date,
  min_weeks,target_weeks,max_weeks,source_label,source_url,source_confidence,verified_at
) values
('AL','high_school','indoor','school',2027,'2026-11-02','2026-12-01','2027-02-06','2027-02-06',11,13,16,'AHSAA 2026-31 Five-Year Calendar — State Indoor Track Feb 5-6, 2027; opening dates are MW estimates; confirm/edit required','https://www.ahsaa.com/Portals/0/Publications/2026-2027/5%20%20year%20Calendar%202026-2031.pdf','official_peak_estimated_start',now()),
('CT','high_school','indoor','school',2027,'2026-12-03','2026-12-17','2027-02-27','2027-02-27',11,13,16,'CIAC 2026-27 Indoor Track — first practice Dec 3; first contest Dec 17; State Open Feb 27, 2027','https://ciac.fpsports.org/resources/Resources/Handbook.pdf','official',now()),
('DE','high_school','indoor','school',2027,'2026-11-30','2026-12-07','2027-02-21','2027-02-21',11,13,16,'DIAA 2027 Indoor Track — State Championship Feb 21; opening dates are MW estimates; confirm/edit required','https://education.delaware.gov/diaa/sport_championships/winter_sports/indoor_track_and_field/','official_peak_estimated_start',now()),
('DC','high_school','indoor','school',2027,'2026-11-16','2026-12-01','2027-02-20','2027-02-20',11,13,16,'MW estimate — DCSAA is an NFHS member association with an indoor-track championship path, but a usable 2027 calendar was not verified; confirm/edit required','https://dcsaasports.org/','estimated',now()),
('KY','high_school','indoor','school',2027,'2026-12-01','2026-12-15','2027-03-06','2027-03-06',11,13,16,'MW estimate — KHSAA sponsors Indoor Track & Field, but the 2027 championship calendar was not yet published on the current track page; confirm/edit required','https://khsaa.org/sports-sport-activities/individual-sports/track/','estimated',now()),
('ME','high_school','indoor','school',2027,'2026-11-16','2026-12-03','2027-02-15','2027-02-15',11,13,16,'MPA 2026-27 Indoor Track — first practice Nov 16; regular-season meet Dec 3; State Championship Feb 15, 2027','https://www.mpa.cc/DashboardSport.aspx?TournamentID=104','official',now()),
('MD','high_school','indoor','school',2027,'2026-11-14','2026-12-04','2027-02-17','2027-02-17',11,13,16,'MPSSAA 2026-27 Indoor Track — first practice Nov 14; first play Dec 4; State Meets Feb 16-17; MW peak anchor Feb 17','https://www.mpssaa.org/sports/indoor-track-field/state-championships/mpssaa-indoor-track-state-championships-central/','official',now()),
('MA','high_school','indoor','school',2027,'2026-11-30','2026-12-10','2027-02-20','2027-02-20',11,13,16,'MIAA 2026-27 Indoor Track — practice Nov 30; first contest Dec 10; Meet of Champions Feb 20, 2027','https://www.miaa.net/track-cross-country','official',now()),
('MS','high_school','indoor','school',2027,'2026-11-30','2026-12-12','2027-02-13','2027-02-13',11,13,16,'MW estimate — MHSAA sponsors indoor track, but a usable 2027 association calendar was not verified; confirm/edit required','https://www.misshsaa.com/','estimated',now()),
('NH','high_school','indoor','school',2027,'2026-11-30','2026-12-14','2027-02-07','2027-02-07',11,13,16,'MW estimate — NHIAA sponsors boys/girls indoor track, but the current sport pages still show 2025-26 championship information; confirm/edit required','https://www.nhiaa.org/sports/winter/boys-indoor-track','estimated',now()),
('NJ','high_school','indoor','school',2027,'2026-11-30','2026-12-07','2027-03-07','2027-03-07',11,13,16,'NJSIAA 2026-27 Winter Track — first practice Nov 30; competition Dec 7; Meet of Champions Mar 7, 2027','https://www.njsiaa.org/sports/track-field-indoor','official',now()),
('NY','high_school','indoor','school',2027,'2026-11-16','2026-12-01','2027-03-06','2027-03-06',11,13,16,'NYSPHSAA 2026-27 — official winter start Nov 16 and Indoor Track Championships Mar 5-6; first-meet date is an MW estimate; confirm/edit required','https://nysphsaa.org/sports/2023/6/3/ChampionshipSchedule.aspx','official_peak_estimated_start',now()),
('NC','high_school','indoor','school',2027,'2026-11-02','2026-11-11','2027-02-12','2027-02-12',11,13,16,'NCHSAA 2026-27 Indoor Track — first practice Nov 2; first contest Nov 11; State Championships Feb 9-12; MW peak anchor Feb 12','https://www.nchsaa.org/sports/indoor-track-and-field/','official',now()),
('RI','high_school','indoor','school',2027,'2026-11-30','2026-12-10','2027-02-20','2027-02-20',11,13,16,'MW estimate — RIIL 2026-27 Indoor Track page lists championship dates as TBD; confirm/edit required','https://www.riil.org/DashboardSport.aspx?TournamentID=1024','estimated',now()),
('VT','high_school','indoor','school',2027,'2026-11-30','2026-12-12','2027-02-20','2027-02-20',11,13,16,'MW estimate — VPA sponsors indoor track, but a usable 2027 state-championship calendar was not verified; confirm/edit required','https://vpaonline.org/athletics/indoor-track/','estimated',now()),
('VA','high_school','indoor','school',2027,'2026-11-09','2026-11-30','2027-03-04','2027-03-04',11,13,16,'VHSL 2026-27 Indoor Track — first practice Nov 9; first contest Nov 30; State Championships Mar 1-4; MW peak anchor Mar 4','https://www.vhsl.org/indoor-track/','official',now()),
('WY','high_school','indoor','school',2027,'2027-01-04','2027-01-14','2027-03-06','2027-03-06',11,13,16,'WHSAA 2027 Indoor Track — first practice Jan 4; first contest Jan 14; 3A State Mar 4-5 and 4A State Mar 5-6; MW statewide anchor Mar 6','https://whsaa.org/indoor/indoor.html','official',now())
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