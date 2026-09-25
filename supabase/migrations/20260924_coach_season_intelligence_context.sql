-- MW Dynasty Season Intelligence — coach/team context and meet priority.
-- Additive only. Coach Core keeps its normal calendar. Coach Intelligence can
-- receive calendar/readiness insights without exposing the MW programming engine.
-- MW Sprint Performance can use the same context as an input to the full engine.

alter table public.coach_calendar_events
  add column if not exists meet_priority text,
  add column if not exists is_primary_target boolean not null default false,
  add column if not exists qualification_stage text,
  add column if not exists parent_event_id uuid references public.coach_calendar_events(id) on delete set null;

alter table public.coach_calendar_events drop constraint if exists coach_calendar_events_meet_priority_check;
alter table public.coach_calendar_events add constraint coach_calendar_events_meet_priority_check
check (meet_priority is null or meet_priority in ('A','B','C'));

alter table public.coach_calendar_events drop constraint if exists coach_calendar_events_qualification_stage_check;
alter table public.coach_calendar_events add constraint coach_calendar_events_qualification_stage_check
check (
  qualification_stage is null or qualification_stage in (
    'regular','conference','district','sectional','regional','state',
    'national','junior_olympics','ncaa_championship','professional_championship','other'
  )
);

create index if not exists coach_calendar_events_target_idx
  on public.coach_calendar_events(coach_user_id,event_type,is_primary_target,starts_at);
create index if not exists coach_calendar_events_parent_event_idx
  on public.coach_calendar_events(parent_event_id) where parent_event_id is not null;

create table if not exists public.coach_season_contexts (
  id uuid primary key default gen_random_uuid(),
  coach_user_id uuid not null references auth.users(id) on delete cascade,
  group_id uuid references public.coach_groups(id) on delete cascade,
  season_year integer not null,
  season_type text not null,
  competition_level_group text not null,
  competition_state text,
  competition_path text not null,
  first_practice_date date,
  first_meet_date date,
  primary_peak_date date not null,
  secondary_peak_date date,
  goal text,
  status text not null default 'planned',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (season_type in ('indoor','outdoor')),
  check (competition_level_group in ('middle_school','high_school','collegiate','professional','youth_club')),
  check (competition_state is null or competition_state ~ '^[A-Z]{2}$'),
  check (competition_path in ('school','aau','usatf','ncaa','professional_open')),
  check (status in ('planned','active','completed','cancelled')),
  check (secondary_peak_date is null or secondary_peak_date >= primary_peak_date),
  unique(coach_user_id,group_id,season_year,season_type,competition_path)
);

create unique index if not exists coach_one_active_context_per_group_idx
  on public.coach_season_contexts(coach_user_id,coalesce(group_id,'00000000-0000-0000-0000-000000000000'::uuid))
  where status='active';

create index if not exists coach_season_context_timeline_idx
  on public.coach_season_contexts(coach_user_id,primary_peak_date,season_type);
create index if not exists coach_season_context_group_idx
  on public.coach_season_contexts(group_id) where group_id is not null;

alter table public.coach_season_contexts enable row level security;
grant select,insert,update,delete on public.coach_season_contexts to authenticated;

drop policy if exists "coach manages own season contexts" on public.coach_season_contexts;
create policy "coach manages own season contexts"
on public.coach_season_contexts
for all to authenticated
using (
  coach_user_id=(select auth.uid())
  or exists(
    select 1 from public.profiles p
    where p.user_id=(select auth.uid())
      and p.account_status='active'::public.mw_account_status
      and p.role in ('founder_owner','admin')
  )
)
with check (
  coach_user_id=(select auth.uid())
  or exists(
    select 1 from public.profiles p
    where p.user_id=(select auth.uid())
      and p.account_status='active'::public.mw_account_status
      and p.role in ('founder_owner','admin')
  )
);

create or replace function public.mw_coach_season_intelligence_access()
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_uid uuid:=auth.uid();
  v_role text;
  v_tier text;
begin
  if v_uid is null then
    return jsonb_build_object('mode','none','insights',false,'engine',false);
  end if;

  select p.role::text into v_role
  from public.profiles p
  where p.user_id=v_uid and p.account_status='active'::public.mw_account_status
  limit 1;

  if v_role in ('founder_owner','admin') then
    return jsonb_build_object('mode','engine','insights',true,'engine',true);
  end if;
  if v_role<>'coach' then
    return jsonb_build_object('mode','none','insights',false,'engine',false);
  end if;

  select cae.access_tier into v_tier
  from public.coach_access_entitlements cae
  where cae.coach_user_id=v_uid and cae.status='active'
  limit 1;

  return case
    when v_tier='mw_sprint_performance' then jsonb_build_object('mode','engine','insights',true,'engine',true)
    when v_tier='intelligence' then jsonb_build_object('mode','insights','insights',true,'engine',false)
    else jsonb_build_object('mode','none','insights',false,'engine',false)
  end;
end;
$function$;

revoke execute on function public.mw_coach_season_intelligence_access() from public, anon;
grant execute on function public.mw_coach_season_intelligence_access() to authenticated;
