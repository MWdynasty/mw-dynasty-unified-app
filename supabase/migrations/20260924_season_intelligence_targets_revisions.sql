-- MW Dynasty Season Intelligence — target hierarchy and plan revision history.
-- Keeps championship dates/plan changes auditable and supports qualification-driven extensions.

alter table public.athlete_season_plans
  add column if not exists revision_number integer not null default 1,
  add column if not exists change_reason text,
  add column if not exists coach_context_id uuid references public.coach_season_contexts(id) on delete set null,
  add column if not exists primary_peak_locked boolean not null default true;

create table if not exists public.athlete_season_targets (
  id uuid primary key default gen_random_uuid(),
  season_plan_id uuid not null references public.athlete_season_plans(id) on delete cascade,
  athlete_id uuid not null references public.athletes(id) on delete cascade,
  name text not null,
  target_date date not null,
  target_type text not null default 'meet',
  meet_priority text not null default 'C',
  is_primary boolean not null default false,
  peak_rank integer,
  qualification_stage text,
  qualification_dependency_target_id uuid references public.athlete_season_targets(id) on delete set null,
  status text not null default 'planned',
  source text not null default 'athlete',
  coach_calendar_event_id uuid references public.coach_calendar_events(id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (target_type in ('meet','qualifier','championship','testing')),
  check (meet_priority in ('A','B','C')),
  check (peak_rank is null or peak_rank between 1 and 9),
  check (qualification_stage is null or qualification_stage in (
    'regular','conference','district','sectional','regional','state',
    'national','junior_olympics','ncaa_championship','professional_championship','other'
  )),
  check (status in ('planned','qualified','not_qualified','completed','cancelled')),
  check (source in ('athlete','coach','state_registry','mw_engine')),
  unique(season_plan_id,name,target_date)
);

create unique index if not exists athlete_season_one_primary_target_idx
  on public.athlete_season_targets(season_plan_id)
  where is_primary=true and status not in ('cancelled','not_qualified');

create index if not exists athlete_season_targets_timeline_idx
  on public.athlete_season_targets(athlete_id,target_date,status);

create table if not exists public.athlete_season_plan_revisions (
  id uuid primary key default gen_random_uuid(),
  season_plan_id uuid not null references public.athlete_season_plans(id) on delete cascade,
  athlete_id uuid not null references public.athletes(id) on delete cascade,
  revision_number integer not null,
  changed_by uuid references public.profiles(user_id) on delete set null,
  change_reason text not null,
  prior_primary_peak_date date,
  new_primary_peak_date date,
  prior_season_start_date date,
  new_season_start_date date,
  prior_season_length_weeks integer,
  new_season_length_weeks integer,
  prior_phase_plan jsonb,
  new_phase_plan jsonb,
  prior_source_week_map jsonb,
  new_source_week_map jsonb,
  created_at timestamptz not null default now(),
  unique(season_plan_id,revision_number)
);

alter table public.athlete_season_targets enable row level security;
alter table public.athlete_season_plan_revisions enable row level security;
grant select,insert,update,delete on public.athlete_season_targets to authenticated;
grant select,insert on public.athlete_season_plan_revisions to authenticated;

drop policy if exists "athletes read own season targets" on public.athlete_season_targets;
create policy "athletes read own season targets"
on public.athlete_season_targets for select to authenticated
using (exists(select 1 from public.athletes a where a.id=athlete_id and a.user_id=(select auth.uid())));

drop policy if exists "athletes manage own season targets" on public.athlete_season_targets;
create policy "athletes manage own season targets"
on public.athlete_season_targets for all to authenticated
using (exists(select 1 from public.athletes a where a.id=athlete_id and a.user_id=(select auth.uid())))
with check (exists(select 1 from public.athletes a where a.id=athlete_id and a.user_id=(select auth.uid())));

drop policy if exists "performance coaches manage assigned season targets" on public.athlete_season_targets;
create policy "performance coaches manage assigned season targets"
on public.athlete_season_targets for all to authenticated
using (
  exists(
    select 1
    from public.coach_assignments ca
    join public.coach_access_entitlements cae on cae.coach_user_id=ca.coach_user_id and cae.status='active'
    where ca.athlete_id=athlete_id and ca.coach_user_id=(select auth.uid())
      and ca.status='active' and cae.access_tier='mw_sprint_performance'
  )
  or exists(
    select 1 from public.profiles p
    where p.user_id=(select auth.uid()) and p.account_status='active'::public.mw_account_status
      and p.role in ('founder_owner','admin')
  )
)
with check (
  exists(
    select 1
    from public.coach_assignments ca
    join public.coach_access_entitlements cae on cae.coach_user_id=ca.coach_user_id and cae.status='active'
    where ca.athlete_id=athlete_id and ca.coach_user_id=(select auth.uid())
      and ca.status='active' and cae.access_tier='mw_sprint_performance'
  )
  or exists(
    select 1 from public.profiles p
    where p.user_id=(select auth.uid()) and p.account_status='active'::public.mw_account_status
      and p.role in ('founder_owner','admin')
  )
);

drop policy if exists "athletes read own season revisions" on public.athlete_season_plan_revisions;
create policy "athletes read own season revisions"
on public.athlete_season_plan_revisions for select to authenticated
using (exists(select 1 from public.athletes a where a.id=athlete_id and a.user_id=(select auth.uid())));

drop policy if exists "authorized staff read season revisions" on public.athlete_season_plan_revisions;
create policy "authorized staff read season revisions"
on public.athlete_season_plan_revisions for select to authenticated
using (
  exists(select 1 from public.coach_assignments ca where ca.athlete_id=athlete_id and ca.coach_user_id=(select auth.uid()) and ca.status='active')
  or exists(select 1 from public.profiles p where p.user_id=(select auth.uid()) and p.account_status='active'::public.mw_account_status and p.role in ('founder_owner','admin'))
);

-- Revision writes are intentionally RPC-only.
revoke insert on public.athlete_season_plan_revisions from authenticated;

create or replace function public.mw_record_season_plan_revision(
  p_plan_id uuid,
  p_reason text,
  p_new_start date,
  p_new_peak date,
  p_new_length integer,
  p_new_phase_plan jsonb,
  p_new_source_map jsonb
) returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_uid uuid:=auth.uid();
  v_plan public.athlete_season_plans%rowtype;
  v_revision integer;
  v_authorized boolean:=false;
begin
  if v_uid is null then raise exception 'Authentication required' using errcode='42501'; end if;
  select * into v_plan from public.athlete_season_plans where id=p_plan_id for update;
  if v_plan.id is null then raise exception 'Season plan not found'; end if;

  v_authorized:=exists(select 1 from public.athletes a where a.id=v_plan.athlete_id and a.user_id=v_uid)
    or exists(
      select 1 from public.coach_assignments ca
      join public.coach_access_entitlements cae on cae.coach_user_id=ca.coach_user_id and cae.status='active'
      where ca.athlete_id=v_plan.athlete_id and ca.coach_user_id=v_uid and ca.status='active'
        and cae.access_tier='mw_sprint_performance'
    )
    or exists(select 1 from public.profiles p where p.user_id=v_uid and p.account_status='active'::public.mw_account_status and p.role in ('founder_owner','admin'));

  if not v_authorized then raise exception 'Not authorized to revise this season plan' using errcode='42501'; end if;
  if coalesce(trim(p_reason),'')='' then raise exception 'A change reason is required'; end if;
  if p_new_length not between 4 and 41 then raise exception 'Season length must be 4-41 weeks'; end if;
  if p_new_peak<p_new_start then raise exception 'Peak date must be after season start'; end if;

  v_revision:=coalesce(v_plan.revision_number,1)+1;

  insert into public.athlete_season_plan_revisions(
    season_plan_id,athlete_id,revision_number,changed_by,change_reason,
    prior_primary_peak_date,new_primary_peak_date,prior_season_start_date,new_season_start_date,
    prior_season_length_weeks,new_season_length_weeks,prior_phase_plan,new_phase_plan,
    prior_source_week_map,new_source_week_map
  ) values (
    v_plan.id,v_plan.athlete_id,v_revision,v_uid,left(trim(p_reason),1000),
    v_plan.primary_peak_date,p_new_peak,v_plan.season_start_date,p_new_start,
    v_plan.season_length_weeks,p_new_length,v_plan.phase_plan,p_new_phase_plan,
    v_plan.source_week_map,p_new_source_map
  );

  update public.athlete_season_plans set
    season_start_date=p_new_start,
    primary_peak_date=p_new_peak,
    season_length_weeks=p_new_length,
    phase_plan=p_new_phase_plan,
    source_week_map=p_new_source_map,
    revision_number=v_revision,
    change_reason=left(trim(p_reason),1000),
    updated_at=now()
  where id=v_plan.id;

  return jsonb_build_object('ok',true,'plan_id',v_plan.id,'revision_number',v_revision);
end;
$function$;

grant execute on function public.mw_record_season_plan_revision(uuid,text,date,date,integer,jsonb,jsonb) to authenticated;
