create table if not exists public.mw_push_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  device_token text not null,
  platform text not null default 'ios' check (platform in ('ios')),
  environment text not null default 'production' check (environment in ('sandbox','production')),
  app_bundle_id text not null default 'com.mwdynasty.app',
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  disabled_at timestamptz,
  unique (user_id, device_token)
);

create index if not exists mw_push_devices_user_active_idx
  on public.mw_push_devices (user_id, environment, app_bundle_id)
  where disabled_at is null;

alter table public.mw_push_devices enable row level security;

drop policy if exists "mw_push_devices_select_own" on public.mw_push_devices;
create policy "mw_push_devices_select_own" on public.mw_push_devices
  for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "mw_push_devices_insert_own" on public.mw_push_devices;
create policy "mw_push_devices_insert_own" on public.mw_push_devices
  for insert to authenticated with check ((select auth.uid()) = user_id);

drop policy if exists "mw_push_devices_update_own" on public.mw_push_devices;
create policy "mw_push_devices_update_own" on public.mw_push_devices
  for update to authenticated using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

grant select, insert, update on table public.mw_push_devices to authenticated;

