-- Season Intelligence Authority V2
-- Smart Entry stays on the real season clock for standard, coach-custom, and
-- season-plan calendars. Readiness changes the dose/tier and review status,
-- not the athlete-facing season week.

create or replace function public.mw_submit_smart_entry_v3(
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
set search_path=''
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
  if p_season_phase not in ('foundation','strength_speed','pre_competition','competition','peak') then raise exception 'Invalid season phase'; end if;
  if p_event_group not in ('short','long','hurdles','multi') then raise exception 'Invalid event group'; end if;
  if p_training_age not between 0 and 5 or p_continuity not between 0 and 3 or p_speed_exposure not in (0,2,3) or p_recent_race not in (0,1) or p_lifting not between 0 and 2 or p_health not in ('clear','tight','pain') then
    raise exception 'Invalid Smart Entry response';
  end if;

  select a.id into v_athlete
  from public.athletes a
  join public.profiles p on p.user_id=a.user_id
  where a.user_id=v_uid and p.account_status='active'::public.mw_account_status
  limit 1;
  if v_athlete is null then raise exception 'Athlete profile not found' using errcode='42501'; end if;

  select * into v_existing
  from public.athlete_entry_assessments
  where athlete_id=v_athlete
  order by created_at desc
  limit 1;
  if found and v_existing.status not in ('COACH REVIEW REQUIRED','HOLD') then
    return jsonb_build_object('locked',true,'assessment',to_jsonb(v_existing));
  end if;

  if p_health='pain' then
    v_hold:=true;v_ready:=1;v_conf:='HOLD';v_why:='Pain, a recent injury, or altered running mechanics requires review before high-speed progression.';
  elsif p_training_age=0 then
    v_ready:=1;v_conf:='HIGH';v_why:='A newer sprinter stays on the real season clock while MW uses Foundation-level loading and stronger technical guardrails.';
  elsif p_continuity=0 or p_speed_exposure=0 then
    v_ready:=1;v_conf:='HIGH';v_why:='Recent sprint continuity or true high-speed exposure is low, so MW protects volume and intensity without moving the season backward.';
  elsif p_continuity<=1 then
    v_ready:=1;v_conf:='HIGH';v_why:='Training has been inconsistent, so MW protects the dose while preserving the competition calendar.';
  elsif p_continuity=2 and p_speed_exposure=2 then
    v_ready:=2;v_conf:='HIGH';v_why:='Consistent training and recent speed exposure support Development loading at the current season position.';
  elsif p_continuity>=2 and p_speed_exposure>=3 and p_lifting>=1 and p_recent_race=0 then
    v_ready:=3;v_conf:='MODERATE';v_why:='Consistent training, repeated speed exposure and current lifting support pre-competition loading.';
  elsif p_continuity>=3 and p_speed_exposure>=3 and p_recent_race=1 and p_lifting>=1 and p_training_age>=1 then
    v_ready:=4;v_conf:='HIGH';v_why:='Current training and recent competition support competition-specific loading.';
  end if;

  v_phase_ui:=case p_season_phase
    when 'foundation' then 1
    when 'strength_speed' then 2
    when 'pre_competition' then 3
    when 'competition' then 4
    else 5
  end;

  if v_hold then
    v_status:='COACH REVIEW REQUIRED';
  elsif p_season_phase='peak' and v_ready<3 then
    v_review:=true;v_status:='CHAMPIONSHIP ENTRY — COACH REVIEW';
    v_why:=v_why||' The championship window is close, so MW will not force aggressive progression without review.';
  elsif (p_season_phase='competition' and v_ready<3)
     or (p_season_phase='pre_competition' and v_ready<2)
     or (p_season_phase='strength_speed' and v_ready<2) then
    v_status:='SEASON-AWARE PROTECTED ENTRY';
    v_why:=v_why||' Season Intelligence keeps the real calendar intact while the athlete tier and recovery guardrails reduce the dose.';
  else
    v_status:='SEASON-AWARE CURRENT-PHASE ENTRY';
  end if;

  select id into v_plan_id
  from public.athlete_season_plans
  where athlete_id=v_athlete and plan_status='active'
  limit 1;

  v_next:=least(41,p_season_week+1);

  insert into public.athlete_entry_assessments(
    athlete_id,season_week,season_phase,readiness_phase,assigned_phase,assigned_week,
    status,next_checkpoint,confidence,event_group,assessment_data
  ) values (
    v_athlete,p_season_week,v_phase_ui::text,v_ready::text,v_phase_ui::text,p_season_week,
    v_status,v_next::text,v_conf,p_event_group,
    jsonb_build_object(
      'training_age',p_training_age,'continuity',p_continuity,'speed_exposure',p_speed_exposure,
      'recent_race',p_recent_race,'lifting',p_lifting,'health',p_health,
      'season_plan_id',v_plan_id,'season_aware',true,'season_phase_code',p_season_phase,
      'authority_version','mw-season-intelligence-authority-v2'
    )
  ) returning id into v_id;

  update public.athlete_program_state set
    current_week=p_season_week,
    current_day=extract(isodow from current_date)::integer,
    current_phase=v_phase_ui,
    starting_week=coalesce(starting_week,p_season_week),
    start_date=coalesce(start_date,current_date),
    program_status=case when v_hold or v_review then 'needs_review'::public.mw_program_status else 'active'::public.mw_program_status end,
    program_version=case when v_plan_id is not null then 'mw-season-intelligence-v2+mw-sprint-v3.0' else 'mw-season-intelligence-v2+mw-sprint-v3.0' end,
    updated_at=now()
  where athlete_id=v_athlete;

  return jsonb_build_object(
    'locked',false,'id',v_id,'hold',v_hold,'review',v_review,'seasonAware',true,
    'seasonWeek',p_season_week,'seasonPhase',v_phase_ui,'seasonPhaseCode',p_season_phase,
    'readinessPhase',v_ready,'assignedPhase',v_phase_ui,'assignedWeek',p_season_week,
    'status',v_status,'nextCheckpoint',v_next,'confidence',v_conf,'eventGroup',p_event_group,
    'why',v_why,'authorityVersion','mw-season-intelligence-authority-v2'
  );
end;
$function$;

revoke all on function public.mw_submit_smart_entry_v3(integer,text,text,integer,integer,integer,integer,integer,text) from public;
grant execute on function public.mw_submit_smart_entry_v3(integer,text,text,integer,integer,integer,integer,integer,text) to authenticated;
