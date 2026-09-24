-- MW Dynasty Season Intelligence V1
-- Additive architecture: preserves the 41-week master program while allowing
-- school/club/college/pro season plans to map season weeks to MW master weeks.

alter table public.athletes
  add column if not exists competition_level text,
  add column if not exists competition_state text,
  add column if not exists season_preference text,
  add column if not exists competition_paths text[] not null default array['school']::text[];

alter table public.athletes drop constraint if exists athletes_competition_level_check;
alter table public.athletes add constraint athletes_competition_level_check
check (competition_level is null or competition_level in ('6','7','8','9','10','11','12','collegiate','professional'));

alter table public.athletes drop constraint if exists athletes_competition_state_check;
alter table public.athletes add constraint athletes_competition_state_check
check (competition_state is null or competition_state ~ '^[A-Z]{2}$');

alter table public.athletes drop constraint if exists athletes_season_preference_check;
alter table public.athletes add constraint athletes_season_preference_check
check (season_preference is null or season_preference in ('indoor','outdoor','both','offseason'));

alter table public.athlete_program_state
  add column if not exists season_plan_id uuid,
  add column if not exists season_length_weeks integer,
  add column if not exists source_program_week integer,
  add column if not exists season_phase_code text;

create table if not exists public.mw_season_templates (
  id bigint generated always as identity primary key,
  level_group text not null,
  season_type text not null,
  competition_path text not null,
  min_weeks integer not null,
  target_weeks integer not null,
  max_weeks integer not null,
  notes text,
  updated_at timestamptz not null default now(),
  unique(level_group,season_type,competition_path),
  check (level_group in ('middle_school','high_school','collegiate','professional','youth_club')),
  check (season_type in ('indoor','outdoor')),
  check (competition_path in ('school','aau','usatf','ncaa','professional_open')),
  check (min_weeks between 4 and 41 and target_weeks between min_weeks and max_weeks and max_weeks between target_weeks and 41)
);

insert into public.mw_season_templates(level_group,season_type,competition_path,min_weeks,target_weeks,max_weeks,notes)
values
  ('middle_school','indoor','school',8,10,12,'MW planning range; state/school dates override.'),
  ('middle_school','outdoor','school',8,11,13,'MW planning range; state/school dates override.'),
  ('high_school','indoor','school',11,13,16,'MW planning range; state association dates override.'),
  ('high_school','outdoor','school',12,15,17,'MW planning range; state association dates override.'),
  ('youth_club','indoor','aau',8,10,12,'MW planning range; club and championship dates override.'),
  ('youth_club','outdoor','aau',12,14,16,'MW planning range; club and championship dates override.'),
  ('youth_club','indoor','usatf',8,10,12,'MW planning range; association and championship dates override.'),
  ('youth_club','outdoor','usatf',12,14,16,'MW planning range; association and championship dates override.'),
  ('collegiate','indoor','ncaa',10,11,12,'MW planning range; institutional schedule and championship dates override.'),
  ('collegiate','outdoor','ncaa',12,13,15,'MW planning range; institutional schedule and championship dates override.'),
  ('professional','indoor','professional_open',8,10,12,'MW planning range; athlete competition calendar overrides.'),
  ('professional','outdoor','professional_open',16,18,24,'MW planning range; athlete competition calendar overrides.')
on conflict(level_group,season_type,competition_path) do update
set min_weeks=excluded.min_weeks,target_weeks=excluded.target_weeks,max_weeks=excluded.max_weeks,notes=excluded.notes,updated_at=now();

create table if not exists public.mw_state_season_registry (
  id uuid primary key default gen_random_uuid(),
  state_code text not null,
  level_group text not null,
  season_type text not null,
  competition_path text not null default 'school',
  season_year integer not null,
  estimated_start_date date,
  estimated_first_meet_date date,
  estimated_peak_date date,
  estimated_end_date date,
  min_weeks integer,
  target_weeks integer,
  max_weeks integer,
  source_label text,
  source_url text,
  source_confidence text not null default 'estimated',
  verified_at timestamptz,
  updated_at timestamptz not null default now(),
  unique(state_code,level_group,season_type,competition_path,season_year),
  check (state_code ~ '^[A-Z]{2}$'),
  check (level_group in ('middle_school','high_school')),
  check (season_type in ('indoor','outdoor')),
  check (competition_path='school'),
  check (source_confidence in ('official','official_peak_estimated_start','estimated'))
);

-- Alabama 2026-27 outdoor high-school seed from the AHSAA five-year calendar.
-- Dates remain editable/overridable by an athlete or coach.
insert into public.mw_state_season_registry(
  state_code,level_group,season_type,competition_path,season_year,
  estimated_start_date,estimated_first_meet_date,estimated_peak_date,estimated_end_date,
  min_weeks,target_weeks,max_weeks,source_label,source_url,source_confidence,verified_at
) values (
  'AL','high_school','outdoor','school',2027,
  '2027-01-18','2027-02-25','2027-05-08','2027-05-08',
  12,16,17,'AHSAA 2026-2027 Five-Year Calendar',
  'https://www.ahsaa.com/Portals/0/Publications/2026-2027/5%20%20year%20Calendar%202026-2031.pdf',
  'official',now()
)
on conflict(state_code,level_group,season_type,competition_path,season_year) do update
set estimated_start_date=excluded.estimated_start_date,
    estimated_first_meet_date=excluded.estimated_first_meet_date,
    estimated_peak_date=excluded.estimated_peak_date,
    estimated_end_date=excluded.estimated_end_date,
    min_weeks=excluded.min_weeks,target_weeks=excluded.target_weeks,max_weeks=excluded.max_weeks,
    source_label=excluded.source_label,source_url=excluded.source_url,
    source_confidence=excluded.source_confidence,verified_at=excluded.verified_at,updated_at=now();

create table if not exists public.athlete_season_plans (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references public.athletes(id) on delete cascade,
  season_year integer not null,
  season_type text not null,
  competition_level text not null,
  level_group text not null,
  competition_state text,
  competition_path text not null,
  plan_status text not null default 'planned',
  calendar_source text not null default 'athlete_dates',
  season_start_date date not null,
  first_meet_date date,
  primary_peak_date date not null,
  secondary_peak_date date,
  season_length_weeks integer not null,
  phase_plan jsonb not null default '{}'::jsonb,
  source_week_map jsonb not null default '{}'::jsonb,
  continuation_from_plan_id uuid references public.athlete_season_plans(id) on delete set null,
  mapping_version text not null default 'mw-season-map-v1',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(athlete_id,season_year,season_type,competition_path),
  check (season_type in ('indoor','outdoor')),
  check (competition_level in ('6','7','8','9','10','11','12','collegiate','professional')),
  check (level_group in ('middle_school','high_school','collegiate','professional','youth_club')),
  check (competition_state is null or competition_state ~ '^[A-Z]{2}$'),
  check (competition_path in ('school','aau','usatf','ncaa','professional_open')),
  check (plan_status in ('planned','active','completed','cancelled')),
  check (calendar_source in ('athlete_dates','coach_calendar','state_registry','mw_estimate')),
  check (season_length_weeks between 4 and 41),
  check (primary_peak_date >= season_start_date)
);

create unique index if not exists athlete_one_active_season_plan_idx
  on public.athlete_season_plans(athlete_id) where plan_status='active';
create index if not exists athlete_season_plans_timeline_idx
  on public.athlete_season_plans(athlete_id,season_start_date,primary_peak_date);
create index if not exists state_season_registry_lookup_idx
  on public.mw_state_season_registry(state_code,level_group,season_type,season_year);

alter table public.athlete_season_plans enable row level security;
alter table public.mw_state_season_registry enable row level security;
alter table public.mw_season_templates enable row level security;

grant select on public.mw_season_templates, public.mw_state_season_registry, public.athlete_season_plans to authenticated;
grant usage, select on sequence public.mw_season_templates_id_seq to authenticated;

drop policy if exists "season templates readable" on public.mw_season_templates;
create policy "season templates readable" on public.mw_season_templates
for select to authenticated using (true);

drop policy if exists "state season registry readable" on public.mw_state_season_registry;
create policy "state season registry readable" on public.mw_state_season_registry
for select to authenticated using (true);

drop policy if exists "athletes read own season plans" on public.athlete_season_plans;
create policy "athletes read own season plans" on public.athlete_season_plans
for select to authenticated
using (exists(select 1 from public.athletes a where a.id=athlete_id and a.user_id=(select auth.uid())));

drop policy if exists "authorized staff read season plans" on public.athlete_season_plans;
create policy "authorized staff read season plans" on public.athlete_season_plans
for select to authenticated
using (
  exists(select 1 from public.profiles p where p.user_id=(select auth.uid()) and p.account_status='active'::public.mw_account_status and p.role in ('founder_owner','admin'))
  or exists(
    select 1
    from public.coach_assignments ca
    join public.coach_access_entitlements cae on cae.coach_user_id=ca.coach_user_id and cae.status='active'
    where ca.athlete_id=athlete_id and ca.coach_user_id=(select auth.uid()) and ca.status::text='active'
      and cae.access_tier='mw_sprint_performance'
  )
);

grant update (competition_level,competition_state,season_preference,competition_paths) on public.athletes to authenticated;

create or replace function public.mw_upsert_own_season_plan(
  p_season_year integer,
  p_season_type text,
  p_competition_level text,
  p_level_group text,
  p_competition_state text,
  p_competition_path text,
  p_calendar_source text,
  p_season_start_date date,
  p_first_meet_date date,
  p_primary_peak_date date,
  p_secondary_peak_date date,
  p_season_length_weeks integer,
  p_phase_plan jsonb,
  p_source_week_map jsonb,
  p_activate boolean default false,
  p_continuation_from_plan_id uuid default null
) returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_uid uuid:=auth.uid();
  v_athlete uuid;
  v_plan public.athlete_season_plans%rowtype;
begin
  if v_uid is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if not private.mw_athlete_feature_enabled('smart_entry') then raise exception 'Smart Entry access required' using errcode='42501'; end if;

  select a.id into v_athlete
  from public.athletes a join public.profiles p on p.user_id=a.user_id
  where a.user_id=v_uid and p.account_status='active'::public.mw_account_status
  limit 1;
  if v_athlete is null then raise exception 'Athlete profile not found' using errcode='42501'; end if;

  if p_season_type not in ('indoor','outdoor') then raise exception 'Invalid season type'; end if;
  if p_competition_level not in ('6','7','8','9','10','11','12','collegiate','professional') then raise exception 'Invalid competition level'; end if;
  if p_level_group not in ('middle_school','high_school','collegiate','professional','youth_club') then raise exception 'Invalid level group'; end if;
  if p_competition_path not in ('school','aau','usatf','ncaa','professional_open') then raise exception 'Invalid competition path'; end if;
  if p_calendar_source not in ('athlete_dates','coach_calendar','state_registry','mw_estimate') then raise exception 'Invalid calendar source'; end if;
  if p_competition_state is not null and p_competition_state !~ '^[A-Z]{2}$' then raise exception 'Invalid competition state'; end if;
  if p_season_length_weeks not between 4 and 41 then raise exception 'Season length must be 4-41 weeks'; end if;
  if p_primary_peak_date < p_season_start_date then raise exception 'Peak date must be after season start'; end if;

  if p_activate then
    update public.athlete_season_plans set plan_status='planned',updated_at=now()
    where athlete_id=v_athlete and plan_status='active'
      and not (season_year=p_season_year and season_type=p_season_type and competition_path=p_competition_path);
  end if;

  insert into public.athlete_season_plans(
    athlete_id,season_year,season_type,competition_level,level_group,competition_state,competition_path,
    plan_status,calendar_source,season_start_date,first_meet_date,primary_peak_date,secondary_peak_date,
    season_length_weeks,phase_plan,source_week_map,continuation_from_plan_id,mapping_version,updated_at
  ) values (
    v_athlete,p_season_year,p_season_type,p_competition_level,p_level_group,p_competition_state,p_competition_path,
    case when p_activate then 'active' else 'planned' end,p_calendar_source,p_season_start_date,p_first_meet_date,p_primary_peak_date,p_secondary_peak_date,
    p_season_length_weeks,coalesce(p_phase_plan,'{}'::jsonb),coalesce(p_source_week_map,'{}'::jsonb),p_continuation_from_plan_id,'mw-season-map-v1',now()
  )
  on conflict(athlete_id,season_year,season_type,competition_path) do update set
    competition_level=excluded.competition_level,
    level_group=excluded.level_group,
    competition_state=excluded.competition_state,
    plan_status=excluded.plan_status,
    calendar_source=excluded.calendar_source,
    season_start_date=excluded.season_start_date,
    first_meet_date=excluded.first_meet_date,
    primary_peak_date=excluded.primary_peak_date,
    secondary_peak_date=excluded.secondary_peak_date,
    season_length_weeks=excluded.season_length_weeks,
    phase_plan=excluded.phase_plan,
    source_week_map=excluded.source_week_map,
    continuation_from_plan_id=excluded.continuation_from_plan_id,
    mapping_version=excluded.mapping_version,
    updated_at=now()
  returning * into v_plan;

  update public.athletes set
    competition_level=p_competition_level,
    competition_state=p_competition_state,
    season_preference=case
      when season_preference='both' then 'both'
      when p_season_type='indoor' then 'indoor'
      else 'outdoor'
    end,
    competition_paths=array[p_competition_path]::text[],
    updated_at=now()
  where id=v_athlete;

  if p_activate then
    update public.athlete_program_state set
      season_plan_id=v_plan.id,
      season_length_weeks=v_plan.season_length_weeks,
      season_phase_code='foundation',
      source_program_week=coalesce(nullif(v_plan.source_week_map->'1'->>'sourceWeek','')::integer,1),
      start_date=v_plan.season_start_date,
      starting_week=1,
      current_week=1,
      current_day=1,
      current_phase=1,
      program_status=case when current_date<v_plan.season_start_date then 'not_started'::public.mw_program_status else 'active'::public.mw_program_status end,
      program_version='mw-season-intelligence-v1',
      assignment_updated_at=now(),
      assignment_updated_by=v_uid,
      updated_at=now()
    where athlete_id=v_athlete;

    update public.athletes set program_start_date=v_plan.season_start_date where id=v_athlete;
  end if;

  return to_jsonb(v_plan);
end;
$function$;

grant execute on function public.mw_upsert_own_season_plan(integer,text,text,text,text,text,text,date,date,date,date,integer,jsonb,jsonb,boolean,uuid) to authenticated;

create or replace function public.mw_reconcile_own_season_plan()
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_uid uuid:=auth.uid();
  v_athlete uuid;
  v_active public.athlete_season_plans%rowtype;
  v_next public.athlete_season_plans%rowtype;
begin
  if v_uid is null then return null; end if;
  select a.id into v_athlete from public.athletes a where a.user_id=v_uid limit 1;
  if v_athlete is null then return null; end if;

  select * into v_active from public.athlete_season_plans
  where athlete_id=v_athlete and plan_status='active' order by updated_at desc limit 1;

  if found and current_date>v_active.primary_peak_date then
    select * into v_next from public.athlete_season_plans
    where athlete_id=v_athlete and plan_status='planned' and primary_peak_date>=current_date
    order by season_start_date asc,primary_peak_date asc limit 1;
    if found then
      update public.athlete_season_plans set plan_status='completed',updated_at=now() where id=v_active.id;
      update public.athlete_season_plans set plan_status='active',updated_at=now() where id=v_next.id returning * into v_active;
    end if;
  elsif not found then
    select * into v_next from public.athlete_season_plans
    where athlete_id=v_athlete and plan_status='planned' and primary_peak_date>=current_date
    order by case when season_start_date<=current_date then 0 else 1 end, season_start_date asc,primary_peak_date asc limit 1;
    if found then
      update public.athlete_season_plans set plan_status='active',updated_at=now() where id=v_next.id returning * into v_active;
    end if;
  end if;

  if v_active.id is null then return null; end if;
  return to_jsonb(v_active);
end;
$function$;
grant execute on function public.mw_reconcile_own_season_plan() to authenticated;

create or replace function public.mw_apply_own_season_position(
  p_plan_id uuid,
  p_current_week integer,
  p_phase_code text,
  p_source_program_week integer,
  p_status text
) returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_uid uuid:=auth.uid();
  v_athlete uuid;
  v_plan public.athlete_season_plans%rowtype;
  v_phase integer;
  v_state public.athlete_program_state%rowtype;
begin
  if v_uid is null then raise exception 'Authentication required' using errcode='42501'; end if;
  select a.id into v_athlete from public.athletes a where a.user_id=v_uid limit 1;
  if v_athlete is null then raise exception 'Athlete profile not found' using errcode='42501'; end if;
  select * into v_plan from public.athlete_season_plans where id=p_plan_id and athlete_id=v_athlete limit 1;
  if v_plan.id is null then raise exception 'Season plan not found' using errcode='42501'; end if;
  if p_current_week<1 or p_current_week>v_plan.season_length_weeks then raise exception 'Invalid season week'; end if;
  if p_phase_code not in ('foundation','pre_competition','competition','peak') then raise exception 'Invalid season phase'; end if;
  if p_source_program_week<1 or p_source_program_week>41 then raise exception 'Invalid source week'; end if;
  if p_status not in ('not_started','active','needs_review','completed') then raise exception 'Invalid program status'; end if;

  v_phase:=case p_phase_code when 'foundation' then 1 when 'pre_competition' then 3 when 'competition' then 4 else 5 end;

  update public.athlete_program_state set
    season_plan_id=v_plan.id,
    season_length_weeks=v_plan.season_length_weeks,
    season_phase_code=p_phase_code,
    source_program_week=p_source_program_week,
    current_week=p_current_week,
    current_phase=v_phase,
    start_date=v_plan.season_start_date,
    starting_week=1,
    program_status=p_status::public.mw_program_status,
    program_version='mw-season-intelligence-v1',
    updated_at=now()
  where athlete_id=v_athlete
  returning * into v_state;

  return jsonb_build_object(
    'athlete_id',v_state.athlete_id,'season_plan_id',v_state.season_plan_id,
    'current_week',v_state.current_week,'current_phase',v_state.current_phase,
    'season_phase_code',v_state.season_phase_code,'source_program_week',v_state.source_program_week,
    'season_length_weeks',v_state.season_length_weeks,'program_status',v_state.program_status,
    'start_date',v_state.start_date,'program_version',v_state.program_version
  );
end;
$function$;
grant execute on function public.mw_apply_own_season_position(uuid,integer,text,integer,text) to authenticated;

create or replace function public.mw_submit_smart_entry_v2(
  p_season_week integer,
  p_season_phase text,
  p_event_group text,
  p_training_age integer,
  p_continuity integer,
  p_speed_exposure integer,
  p_recent_race integer,
  p_lifting integer,
  p_health text
) returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_uid uuid:=auth.uid();
  v_athlete uuid;
  v_existing public.athlete_entry_assessments%rowtype;
  v_ready integer:=2;
  v_conf text:='MODERATE';
  v_why text:='';
  v_phase_ui integer;
  v_status text;
  v_hold boolean:=false;
  v_review boolean:=false;
  v_id uuid;
  v_plan_id uuid;
  v_next integer;
begin
  if v_uid is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if not private.mw_athlete_feature_enabled('smart_entry') then raise exception 'Smart Entry access required' using errcode='42501'; end if;
  if p_season_week not between 1 and 41 then raise exception 'Invalid season week'; end if;
  if p_season_phase not in ('foundation','pre_competition','competition','peak') then raise exception 'Invalid season phase'; end if;
  if p_event_group not in ('short','long','hurdles','multi') then raise exception 'Invalid event group'; end if;
  if p_training_age not between 0 and 5 or p_continuity not between 0 and 3 or p_speed_exposure not in (0,2,3) or p_recent_race not in (0,1) or p_lifting not between 0 and 2 or p_health not in ('clear','tight','pain') then raise exception 'Invalid Smart Entry response'; end if;

  select a.id into v_athlete from public.athletes a join public.profiles p on p.user_id=a.user_id
  where a.user_id=v_uid and p.account_status='active'::public.mw_account_status limit 1;
  if v_athlete is null then raise exception 'Athlete profile not found' using errcode='42501'; end if;

  select * into v_existing from public.athlete_entry_assessments where athlete_id=v_athlete order by created_at desc limit 1;
  if found and v_existing.status not in ('COACH REVIEW REQUIRED','HOLD') then
    return jsonb_build_object('locked',true,'assessment',to_jsonb(v_existing));
  end if;

  if p_health='pain' then
    v_hold:=true;v_ready:=1;v_conf:='HOLD';v_why:='Pain, a recent injury, or altered running mechanics must be resolved before high-speed placement.';
  elsif p_training_age=0 then
    v_ready:=1;v_conf:='HIGH';v_why:='A newer sprinter needs conservative loading and strong technical foundations.';
  elsif p_continuity=0 or p_speed_exposure=0 then
    v_ready:=1;v_conf:='HIGH';v_why:='Recent sprint continuity or true high-speed exposure is too low for aggressive loading.';
  elsif p_continuity<=1 then
    v_ready:=1;v_conf:='HIGH';v_why:='Training has been inconsistent, so MW protects volume and intensity while the season clock keeps moving.';
  elsif p_continuity=2 and p_speed_exposure=2 then
    v_ready:=2;v_conf:='HIGH';v_why:='Consistent training and recent speed exposure support developmental loading.';
  elsif p_continuity>=2 and p_speed_exposure>=3 and p_lifting>=1 and p_recent_race=0 then
    v_ready:=3;v_conf:='MODERATE';v_why:='Consistent training, repeated speed exposure and current lifting support pre-competition work.';
  elsif p_continuity>=3 and p_speed_exposure>=3 and p_recent_race=1 and p_lifting>=1 and p_training_age>=1 then
    v_ready:=4;v_conf:='HIGH';v_why:='Current training and recent competition support competition-specific work.';
  end if;

  v_phase_ui:=case p_season_phase when 'foundation' then 1 when 'pre_competition' then 3 when 'competition' then 4 else 5 end;
  if v_hold then
    v_status:='COACH REVIEW REQUIRED';
  elsif p_season_phase='peak' and v_ready<3 then
    v_review:=true;v_status:='CHAMPIONSHIP ENTRY — COACH REVIEW';
    v_why:=v_why||' The championship window is close, so MW will not force an aggressive peak without coach review.';
  elsif (p_season_phase='competition' and v_ready<3) or (p_season_phase='pre_competition' and v_ready<2) then
    v_status:='SEASON-AWARE PROTECTED ENTRY';
    v_why:=v_why||' MW keeps the real competition calendar intact while the athlete tier reduces loading to a safer entry level.';
  else
    v_status:='SEASON-AWARE CURRENT-PHASE ENTRY';
  end if;

  select id into v_plan_id from public.athlete_season_plans where athlete_id=v_athlete and plan_status='active' limit 1;
  v_next:=p_season_week+1;

  insert into public.athlete_entry_assessments(
    athlete_id,season_week,season_phase,readiness_phase,assigned_phase,assigned_week,status,next_checkpoint,confidence,event_group,assessment_data
  ) values (
    v_athlete,p_season_week,v_phase_ui::text,v_ready::text,v_phase_ui::text,p_season_week,v_status,v_next::text,v_conf,p_event_group,
    jsonb_build_object('training_age',p_training_age,'continuity',p_continuity,'speed_exposure',p_speed_exposure,
      'recent_race',p_recent_race,'lifting',p_lifting,'health',p_health,'season_plan_id',v_plan_id,'season_aware',true,'season_phase_code',p_season_phase)
  ) returning id into v_id;

  update public.athlete_program_state set
    current_week=p_season_week,
    current_phase=v_phase_ui,
    program_status=case when v_hold or v_review then 'needs_review'::public.mw_program_status else 'active'::public.mw_program_status end,
    updated_at=now()
  where athlete_id=v_athlete;

  return jsonb_build_object(
    'locked',false,'id',v_id,'hold',v_hold,'review',v_review,'seasonAware',true,
    'seasonWeek',p_season_week,'seasonPhase',v_phase_ui,'seasonPhaseCode',p_season_phase,
    'readinessPhase',v_ready,'assignedPhase',v_phase_ui,'assignedWeek',p_season_week,
    'status',v_status,'nextCheckpoint',v_next,'confidence',v_conf,'eventGroup',p_event_group,'why',v_why
  );
end;
$function$;
grant execute on function public.mw_submit_smart_entry_v2(integer,text,text,integer,integer,integer,integer,integer,text) to authenticated;
