-- Native iOS APNs delivery. Device registration is owner-scoped; delivery queue
-- is private to the service role and is populated from existing in-app notices.
create table if not exists public.mw_push_devices (
  device_id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  device_token text not null check (device_token ~ '^[0-9A-Fa-f]{64,200}$'),
  apns_environment text not null check (apns_environment in ('development','production')),
  platform text not null default 'ios' check (platform='ios'),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now()+interval '1 day'),
  expires_at timestamptz not null default (now()+interval '1 day'),
  last_seen_at timestamptz not null default now(),
  disabled_at timestamptz
);
create index if not exists mw_push_devices_user_active_idx
  on public.mw_push_devices(user_id,last_seen_at desc) where disabled_at is null;
alter table public.mw_push_devices enable row level security;
revoke all on public.mw_push_devices from public,anon,authenticated;
grant select,update on public.mw_push_devices to service_role;

create or replace function public.mw_register_push_device(
  p_device_id uuid,p_device_token text,p_apns_environment text
) returns boolean
language plpgsql security definer set search_path to ''
as $function$
declare v_uid uuid := (select auth.uid());
begin
  if v_uid is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if p_device_id is null or p_device_token !~ '^[0-9A-Fa-f]{64,200}$' then
    raise exception 'Invalid iPhone push token' using errcode='22023';
  end if;
  if p_apns_environment not in ('development','production') then
    raise exception 'Invalid APNs environment' using errcode='22023';
  end if;
  insert into public.mw_push_devices(device_id,user_id,device_token,apns_environment,platform,last_seen_at,disabled_at)
  values(p_device_id,v_uid,lower(p_device_token),p_apns_environment,'ios',now(),null)
  on conflict(device_id) do update set user_id=excluded.user_id,device_token=excluded.device_token,
    apns_environment=excluded.apns_environment,platform='ios',last_seen_at=now(),expires_at=now()+interval '1 day',disabled_at=null;
  return true;
end
$function$;
revoke all on function public.mw_register_push_device(uuid,text,text) from public,anon;
grant execute on function public.mw_register_push_device(uuid,text,text) to authenticated;

create or replace function public.mw_unregister_push_device(p_device_id uuid)
returns boolean language plpgsql security definer set search_path to ''
as $function$
declare v_uid uuid := (select auth.uid());
begin
  if v_uid is null then raise exception 'Authentication required' using errcode='42501'; end if;
  delete from public.mw_push_devices where device_id=p_device_id and user_id=v_uid;
  return true;
end
$function$;
revoke all on function public.mw_unregister_push_device(uuid) from public,anon;
grant execute on function public.mw_unregister_push_device(uuid) to authenticated;

create table if not exists public.mw_push_delivery_queue (
  id bigint generated always as identity primary key,
  notification_table text not null check(notification_table in ('athlete_notifications','coach_notifications')),
  notification_id uuid not null,
  recipient_user_id uuid not null references auth.users(id) on delete cascade,
  notification_type text not null,
  title text not null,
  body text not null,
  action_view text,
  entity_type text,
  entity_id text,
  created_at timestamptz not null default now(),
  attempt_count integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  delivered_at timestamptz,
  delivery_status text,
  last_error text,
  unique(notification_table,notification_id)
);
create index if not exists mw_push_delivery_queue_pending_idx
  on public.mw_push_delivery_queue(next_attempt_at,id) where delivered_at is null;
alter table public.mw_push_delivery_queue enable row level security;
revoke all on public.mw_push_delivery_queue from public,anon,authenticated;
grant select,insert,update,delete on public.mw_push_delivery_queue to service_role;

create or replace function private.mw_enqueue_athlete_push_notice()
returns trigger language plpgsql security definer set search_path to ''
as $function$
declare v_user_id uuid;
begin
  select a.user_id into v_user_id from public.athletes a where a.id=new.athlete_id;
  if v_user_id is not null then
    insert into public.mw_push_delivery_queue(notification_table,notification_id,recipient_user_id,notification_type,title,body,action_view,entity_type,entity_id)
    values('athlete_notifications',new.id,v_user_id,new.notification_type,new.title,new.body,new.action_view,new.entity_type,new.entity_id)
    on conflict(notification_table,notification_id) do nothing;
  end if;
  return new;
end
$function$;

create or replace function private.mw_enqueue_coach_push_notice()
returns trigger language plpgsql security definer set search_path to ''
as $function$
begin
  insert into public.mw_push_delivery_queue(notification_table,notification_id,recipient_user_id,notification_type,title,body,action_view,entity_type,entity_id)
  values('coach_notifications',new.id,new.coach_user_id,new.notification_type,new.title,new.body,new.action_page,new.entity_type,new.entity_id)
  on conflict(notification_table,notification_id) do nothing;
  return new;
end
$function$;

do $triggers$
begin
  if pg_catalog.to_regclass('public.athlete_notifications') is not null then
    execute 'drop trigger if exists mw_push_enqueue_athlete_notice on public.athlete_notifications';
    execute 'create trigger mw_push_enqueue_athlete_notice after insert on public.athlete_notifications for each row execute function private.mw_enqueue_athlete_push_notice()';
  end if;
  if pg_catalog.to_regclass('public.coach_notifications') is not null then
    execute 'drop trigger if exists mw_push_enqueue_coach_notice on public.coach_notifications';
    execute 'create trigger mw_push_enqueue_coach_notice after insert on public.coach_notifications for each row execute function private.mw_enqueue_coach_push_notice()';
  end if;
end
$triggers$;

-- A random worker secret is kept in Vault and shared only with the Edge worker
-- through this service-role-only validation RPC and the scheduled HTTP header.
select vault.create_secret(encode(extensions.gen_random_bytes(32),'hex'),'mw_push_worker_secret','Internal APNs worker authentication')
where not exists(select 1 from vault.secrets where name='mw_push_worker_secret');
select vault.create_secret('https://keqgunlfwhjgcsurynef.supabase.co','mw_push_project_url','Supabase project URL for internal push worker')
where not exists(select 1 from vault.secrets where name='mw_push_project_url');

create or replace function public.mw_validate_push_worker_secret(p_secret text)
returns boolean language sql security definer set search_path to ''
as $function$
  select coalesce((select auth.jwt()->>'role')='service_role',false)
    and p_secret=(select s.decrypted_secret from vault.decrypted_secrets s where s.name='mw_push_worker_secret' limit 1)
$function$;
revoke all on function public.mw_validate_push_worker_secret(text) from public,anon,authenticated;
grant execute on function public.mw_validate_push_worker_secret(text) to service_role;

create or replace function private.mw_push_cron_tick()
returns void language plpgsql security definer set search_path to ''
as $function$
begin
  delete from public.mw_push_delivery_queue where expires_at<now();
  perform net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name='mw_push_project_url' limit 1)||'/functions/v1/mw-push-delivery',
    headers := jsonb_build_object('Content-Type','application/json','x-mw-push-worker-secret',(select decrypted_secret from vault.decrypted_secrets where name='mw_push_worker_secret' limit 1)),
    body := '{}'::jsonb,
    timeout_milliseconds := 10000
  );
end
$function$;
revoke all on function private.mw_push_cron_tick() from public,anon,authenticated;

do $schedule$
begin
  perform cron.unschedule(jobid) from cron.job where jobname='mw-push-delivery-every-minute';
  perform cron.schedule('mw-push-delivery-every-minute','* * * * *',
    'select private.mw_push_cron_tick()'
  );
end
$schedule$;
