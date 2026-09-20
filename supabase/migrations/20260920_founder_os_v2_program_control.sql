-- MW Dynasty Founder OS v2
-- Program Control + expanded AI workforce.

create table if not exists public.founder_program_releases (
  id uuid primary key default gen_random_uuid(),
  program_code text not null,
  display_name text not null,
  component text not null,
  program_version text not null,
  status text not null default 'review' check (status in ('draft','review','approved','published','retired')),
  notes text,
  source_reference text,
  created_by uuid default auth.uid(),
  approved_by uuid,
  approved_at timestamptz,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(program_code,component,program_version)
);
alter table public.founder_program_releases enable row level security;
drop policy if exists mw_founder_select_founder_program_releases on public.founder_program_releases;
create policy mw_founder_select_founder_program_releases on public.founder_program_releases
for select to authenticated using (private.mw_is_founder());
drop policy if exists mw_founder_modify_program_releases on public.founder_program_releases;
create policy mw_founder_modify_program_releases on public.founder_program_releases
for all to authenticated using (private.mw_is_founder()) with check (private.mw_is_founder());

insert into public.founder_program_releases(program_code,display_name,component,program_version,status,notes,source_reference,published_at)
values
('mw_sprint_performance','MW Sprint Performance System','Track 41-Week System','mw-41-tiered-v2.9','published','Founder-approved 41-week track system with Foundation, Development, and Performance tiers.','server/lib/mw-program-service.js',now()),
('mw_sprint_performance','MW Sprint Performance System','Strength & Power','mw-41-tiered-v2.9','published','Synchronized Strength & Power system aligned to the 41-week track year.','server/lib/mw-program-service.js',now()),
('mw_sprint_school','MW Sprint School','Education Library','mw-sprint-school-current','published','Founder-controlled sprint education and teaching library.','athlete/index.html',now()),
('coach_mw','Coach MW','Coaching Knowledge','mw-coach-knowledge-current','published','Coach MW behavior and approved knowledge are governed by MW access rules and Founder-approved methodology.','server/api/chat.js',now())
on conflict (program_code,component,program_version) do update
set display_name=excluded.display_name,status=excluded.status,notes=excluded.notes,source_reference=excluded.source_reference,updated_at=now();

insert into public.founder_ai_agents(code,name,title,department,manager_code,org_level,mission,responsibilities,kpis,authority_level,sort_order)
values
('accounting_specialist','Accounting AI','Accounting / Bookkeeping Specialist','Finance','controller','specialist','Prepare clean bookkeeping classifications and financial reconciliation support.','["Transaction classification support","Reconciliation checklists","Expense categorization"]'::jsonb,'["Unreconciled items","Classification accuracy","Close support time"]'::jsonb,'analyze',23),
('security_specialist','Security AI','Security & Privacy Specialist','Technology','cto','specialist','Watch authentication, privacy, access control, and security hardening requirements.','["Security advisor triage","RLS review","Secret handling review","Privacy control checks"]'::jsonb,'["Open security warnings","Access-control exceptions","Privacy findings"]'::jsonb,'analyze',44),
('media_specialist','Media AI','Creative / Media Specialist','Marketing','creative_lead','specialist','Prepare social, video, visual, and campaign production briefs that follow MW brand standards.','["Creative production briefs","Social content planning","Asset QA"]'::jsonb,'["Asset throughput","Campaign asset readiness","Brand consistency"]'::jsonb,'draft',64),
('customer_success_manager','Customer Success Manager AI','Customer Success Manager','Customer Success','cco','manager','Track onboarding, product adoption, retention risks, and customer outcomes.','["Customer health","Onboarding review","Retention outreach drafts","Escalation coordination"]'::jsonb,'["Activation","Retention","At-risk accounts"]'::jsonb,'draft',83),
('chief_people','People & Culture AI','Chief People Officer','People / HR',null,'executive','Build the operating structure, role clarity, hiring plans, and people systems MW Dynasty needs as it grows.','["Org design","Hiring plans","Role definitions","Performance systems"]'::jsonb,'["Role coverage","Hiring readiness","People process maturity"]'::jsonb,'draft',120),
('people_ops','People Operations AI','People Operations Manager','People / HR','chief_people','manager','Turn MW people policies and organizational design into repeatable operating processes.','["Onboarding systems","Role documentation","Performance cadence","Policy workflows"]'::jsonb,'["Onboarding completion","Role documentation","Process SLA"]'::jsonb,'draft',121),
('talent_specialist','Talent AI','Talent / Recruiting Specialist','People / HR','people_ops','specialist','Prepare hiring scorecards, sourcing plans, and structured candidate evaluation for future human hires.','["Job scorecards","Candidate sourcing plans","Interview guides"]'::jsonb,'["Qualified candidate pipeline","Time to shortlist","Scorecard coverage"]'::jsonb,'draft',122)
on conflict (code) do update set
 name=excluded.name,title=excluded.title,department=excluded.department,manager_code=excluded.manager_code,
 org_level=excluded.org_level,mission=excluded.mission,responsibilities=excluded.responsibilities,
 kpis=excluded.kpis,authority_level=excluded.authority_level,sort_order=excluded.sort_order,updated_at=now();

create or replace function public.mw_founder_program_control()
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
begin
  if auth.uid() is null or not private.mw_is_founder() then
    raise exception 'Founder / Owner access required' using errcode='42501';
  end if;
  return jsonb_build_object(
    'generated_at',now(),
    'releases',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',r.id,'program_code',r.program_code,'display_name',r.display_name,'component',r.component,
        'program_version',r.program_version,'status',r.status,'notes',r.notes,'source_reference',r.source_reference,
        'published_at',r.published_at,'updated_at',r.updated_at
      ) order by r.program_code,r.component,r.updated_at desc)
      from public.founder_program_releases r
    ),'[]'::jsonb),
    'athlete_version_distribution',coalesce((
      select jsonb_agg(jsonb_build_object('program_version',q.program_version,'athletes',q.athletes) order by q.athletes desc)
      from (
        select coalesce(program_version,'unassigned') program_version,count(*) athletes
        from public.athlete_program_state
        group by coalesce(program_version,'unassigned')
      ) q
    ),'[]'::jsonb),
    'week_distribution',coalesce((
      select jsonb_agg(jsonb_build_object('week',q.current_week,'athletes',q.athletes) order by q.current_week)
      from (
        select current_week,count(*) athletes
        from public.athlete_program_state
        where current_week is not null
        group by current_week
      ) q
    ),'[]'::jsonb),
    'tier_distribution',jsonb_build_object(
      'track',coalesce((
        select jsonb_agg(jsonb_build_object('tier',q.track_tier,'athletes',q.athletes) order by q.athletes desc)
        from (
          select coalesce(track_tier,'unassigned') track_tier,count(*) athletes
          from public.athlete_program_state group by coalesce(track_tier,'unassigned')
        ) q
      ),'[]'::jsonb),
      'strength',coalesce((
        select jsonb_agg(jsonb_build_object('tier',q.strength_tier,'athletes',q.athletes) order by q.athletes desc)
        from (
          select coalesce(strength_tier,'unassigned') strength_tier,count(*) athletes
          from public.athlete_program_state group by coalesce(strength_tier,'unassigned')
        ) q
      ),'[]'::jsonb)
    ),
    'guardrails',jsonb_build_array(
      'Official MW methodology changes require Founder approval.',
      'AI may structure, compare, and identify conflicts but cannot publish methodology autonomously.',
      'Coaches cannot rewrite the official MW 41-week system.',
      'Track and Strength remain synchronized to the same official program version.'
    )
  );
end $$;

revoke all on function public.mw_founder_program_control() from public;
grant execute on function public.mw_founder_program_control() to authenticated;
