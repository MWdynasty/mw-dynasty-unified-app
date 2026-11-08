alter table public.mw_notification_preferences
  add column if not exists random_daily_reminders boolean not null default true,
  add column if not exists scripture_encouragement boolean not null default true,
  add column if not exists coach_mus_motivation boolean not null default true,
  add column if not exists max_daily_pushes smallint not null default 3;

alter table public.mw_notification_preferences
  drop constraint if exists mw_notification_preferences_max_daily_pushes_check;
alter table public.mw_notification_preferences
  add constraint mw_notification_preferences_max_daily_pushes_check
  check (max_daily_pushes between 1 and 3);

create table if not exists public.mw_push_schedule (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  athlete_id uuid not null references public.athletes(id) on delete cascade,
  local_date date not null,
  slot smallint not null check (slot in (1, 2)),
  scheduled_for timestamptz not null,
  notification_type text not null,
  title text not null,
  body text not null,
  dispatched_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, local_date, slot)
);

alter table public.mw_push_schedule enable row level security;
revoke all on public.mw_push_schedule from anon, authenticated;
grant all on public.mw_push_schedule to service_role;

create table if not exists public.mw_push_delivery_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  notification_id uuid not null,
  delivery_date date not null,
  attempted_at timestamptz not null default now(),
  unique (notification_id)
);

create index if not exists mw_push_delivery_user_day_idx
  on public.mw_push_delivery_log(user_id, delivery_date);

alter table public.mw_push_delivery_log enable row level security;
revoke all on public.mw_push_delivery_log from anon, authenticated;
grant all on public.mw_push_delivery_log to service_role;

create or replace function public.mw_claim_push_delivery(
  p_user_id uuid,
  p_notification_id uuid,
  p_daily_limit integer default 3
) returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_timezone text;
  v_today date;
  v_count integer;
begin
  perform pg_advisory_xact_lock(hashtext(p_user_id::text));
  select coalesce(nullif(timezone, ''), 'America/Chicago')
    into v_timezone
    from public.mw_notification_preferences
   where user_id = p_user_id;
  v_timezone := coalesce(v_timezone, 'America/Chicago');
  v_today := (now() at time zone v_timezone)::date;

  if exists (select 1 from public.mw_push_delivery_log where notification_id = p_notification_id) then
    return false;
  end if;

  select count(*) into v_count
    from public.mw_push_delivery_log
   where user_id = p_user_id and delivery_date = v_today;

  if v_count >= greatest(1, least(coalesce(p_daily_limit, 3), 3)) then
    return false;
  end if;

  insert into public.mw_push_delivery_log(user_id, notification_id, delivery_date)
  values (p_user_id, p_notification_id, v_today)
  on conflict (notification_id) do nothing;

  return found;
end;
$$;

revoke all on function public.mw_claim_push_delivery(uuid, uuid, integer) from public, anon, authenticated;
grant execute on function public.mw_claim_push_delivery(uuid, uuid, integer) to service_role;

create or replace function public.mw_process_daily_push_schedule()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_pref record;
  v_item record;
  v_date date;
  v_minute integer;
  v_type text;
  v_title text;
  v_body text;
  v_tz text;
  v_created integer := 0;
  v_sent integer := 0;
begin
  for v_pref in
    select p.user_id, p.timezone, p.inactivity_reminders, p.scripture_encouragement,
           p.coach_mus_motivation, a.id as athlete_id
      from public.mw_notification_preferences p
      join public.athletes a on a.user_id = p.user_id
     where p.push_enabled = true
       and p.random_daily_reminders = true
       and (p.inactivity_reminders or p.scripture_encouragement or p.coach_mus_motivation)
       and exists (
         select 1 from public.mw_push_devices d
          where d.user_id = p.user_id
            and d.environment = 'production'
            and d.app_bundle_id = 'com.mwdynasty.app'
            and d.disabled_at is null
       )
  loop
    v_tz := coalesce(nullif(v_pref.timezone, ''), 'America/Chicago');
    v_date := (now() at time zone v_tz)::date + 1;

    for v_item in select 1 as slot union all select 2 as slot loop
      if v_item.slot = 1 and v_pref.inactivity_reminders then
        v_type := 'inactivity_reminder';
        v_title := 'Your next rep is waiting';
        v_body := case floor(random() * 4)::int
          when 0 then 'A little consistency adds up. Open MW Velocity and take your next training step.'
          when 1 then 'Make time for your training today. Your plan is ready when you are.'
          when 2 then 'Keep building your speed one session at a time. Check today’s workout in MW Velocity.'
          else 'You do not need a perfect day to make progress. Start with your next rep.'
        end;
      elsif v_item.slot = 2 and (v_pref.scripture_encouragement or v_pref.coach_mus_motivation) then
        if v_pref.scripture_encouragement and (not v_pref.coach_mus_motivation or random() < 0.5) then
          v_type := 'scripture_encouragement';
          v_title := 'A word of encouragement';
          v_body := case floor(random() * 4)::int
            when 0 then '“I can do all things through Christ which strengtheneth me.” — Philippians 4:13 (KJV)'
            when 1 then '“Let us run with patience the race that is set before us.” — Hebrews 12:1 (KJV)'
            when 2 then '“Be strong and of a good courage.” — Joshua 1:9 (KJV)'
            else '“Whatsoever ye do, do it heartily.” — Colossians 3:23 (KJV)'
          end;
        else
          v_type := 'coach_mus_motivation';
          v_title := 'Coach Mus has a reminder for you';
          v_body := case floor(random() * 4)::int
            when 0 then 'Stay patient with your progress. Good training is built one focused day at a time.'
            when 1 then 'Bring your best effort to the work in front of you. Your next step matters.'
            when 2 then 'Speed grows through consistency, smart recovery, and quality reps. Keep stacking them.'
            else 'You are building more than a time. Keep showing up and trust the work.'
          end;
        end if;
      else
        continue;
      end if;

      v_minute := 7 * 60 + floor(random() * (13 * 60))::int;
      insert into public.mw_push_schedule(
        user_id, athlete_id, local_date, slot, scheduled_for,
        notification_type, title, body
      ) values (
        v_pref.user_id,
        v_pref.athlete_id,
        v_date,
        v_item.slot,
        ((v_date::timestamp + make_interval(mins => v_minute)) at time zone v_tz),
        v_type,
        v_title,
        v_body
      )
      on conflict (user_id, local_date, slot) do nothing;
      if found then v_created := v_created + 1; end if;
    end loop;
  end loop;

  for v_item in
    select id, athlete_id, notification_type, title, body
      from public.mw_push_schedule
     where dispatched_at is null and scheduled_for <= now()
     order by scheduled_for
     for update skip locked
  loop
    insert into public.athlete_notifications(
      athlete_id, notification_type, title, body, action_view
    ) values (
      v_item.athlete_id,
      v_item.notification_type,
      v_item.title,
      v_item.body,
      'home'
    );
    update public.mw_push_schedule
       set dispatched_at = now()
     where id = v_item.id;
    v_sent := v_sent + 1;
  end loop;

  return jsonb_build_object('scheduled', v_created, 'dispatched', v_sent);
end;
$$;

revoke all on function public.mw_process_daily_push_schedule() from public, anon, authenticated;
grant execute on function public.mw_process_daily_push_schedule() to service_role;

select cron.schedule(
  'mw-daily-push-scheduler',
  '*/15 * * * *',
  'select public.mw_process_daily_push_schedule();'
);
