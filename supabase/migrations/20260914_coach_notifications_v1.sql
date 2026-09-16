-- Applied live in Supabase on 2026-09-14.
create table if not exists public.coach_notifications (
  id uuid primary key default gen_random_uuid(),
  coach_user_id uuid not null references auth.users(id) on delete cascade,
  notification_type text not null,
  title text not null,
  body text not null,
  action_page text,
  entity_type text,
  entity_id text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.coach_notifications enable row level security;
grant select, update on public.coach_notifications to authenticated;
create policy "coach notifications select own" on public.coach_notifications for select to authenticated using (coach_user_id = auth.uid());
create policy "coach notifications update own" on public.coach_notifications for update to authenticated using (coach_user_id = auth.uid()) with check (coach_user_id = auth.uid());
create index if not exists coach_notifications_user_created_idx on public.coach_notifications (coach_user_id, created_at desc);
-- Trigger functions are installed in the live project migration history.
