alter table public.membership_plans
  alter column annual_price_cents drop not null;

alter table public.membership_plans
  add column if not exists audience text not null default 'athlete',
  add column if not exists access_tier text,
  add column if not exists sponsored_athlete_price_cents integer,
  add column if not exists monthly_enabled boolean not null default true,
  add column if not exists annual_enabled boolean not null default true;

alter table public.membership_plans
  drop constraint if exists membership_plans_audience_check,
  add constraint membership_plans_audience_check check (audience in ('athlete','coach')),
  drop constraint if exists membership_plans_sponsored_athlete_price_check,
  add constraint membership_plans_sponsored_athlete_price_check check (sponsored_athlete_price_cents is null or sponsored_athlete_price_cents >= 0);

insert into public.membership_plans
  (plan_code, display_name, monthly_price_cents, annual_price_cents, currency, active, audience, access_tier, sponsored_athlete_price_cents, monthly_enabled, annual_enabled, updated_at)
values
  ('mw_athlete','MW Athlete',1900,14900,'USD',true,'athlete',null,null,true,true,now()),
  ('coach_core','Coach Core',4900,null,'USD',true,'coach','core',500,true,false,now()),
  ('coach_intelligence','Coach Intelligence',7900,null,'USD',true,'coach','intelligence',600,true,false,now()),
  ('mw_sprint_performance','MW Sprint Performance',10900,null,'USD',true,'coach','mw_sprint_performance',700,true,false,now())
on conflict (plan_code) do update set
  display_name = excluded.display_name,
  monthly_price_cents = excluded.monthly_price_cents,
  annual_price_cents = case when excluded.plan_code='mw_athlete' then coalesce(public.membership_plans.annual_price_cents, excluded.annual_price_cents) else excluded.annual_price_cents end,
  currency = excluded.currency,
  active = excluded.active,
  audience = excluded.audience,
  access_tier = excluded.access_tier,
  sponsored_athlete_price_cents = excluded.sponsored_athlete_price_cents,
  monthly_enabled = excluded.monthly_enabled,
  annual_enabled = case when excluded.plan_code='mw_athlete' then public.membership_plans.annual_enabled else excluded.annual_enabled end,
  updated_at = now();

grant select on public.membership_plans to anon, authenticated, service_role;

drop policy if exists mw_membership_plans_public_read on public.membership_plans;
create policy mw_membership_plans_public_read
on public.membership_plans
for select
to anon, authenticated
using (active = true);
