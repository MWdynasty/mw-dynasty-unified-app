create table if not exists public.athlete_notifications (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references public.athletes(id) on delete cascade,
  notification_type text not null,
  title text not null,
  body text not null,
  action_view text,
  entity_type text,
  entity_id text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists athlete_notifications_athlete_created_idx
  on public.athlete_notifications(athlete_id, created_at desc);

create unique index if not exists athlete_notifications_entity_unique_idx
  on public.athlete_notifications(athlete_id, notification_type, entity_type, entity_id)
  where entity_id is not null;

alter table public.athlete_notifications enable row level security;

drop policy if exists "athlete notifications select own" on public.athlete_notifications;
create policy "athlete notifications select own"
on public.athlete_notifications for select
to authenticated
using (athlete_id = private.mw_own_athlete_id());

drop policy if exists "athlete notifications update own" on public.athlete_notifications;
create policy "athlete notifications update own"
on public.athlete_notifications for update
to authenticated
using (athlete_id = private.mw_own_athlete_id())
with check (athlete_id = private.mw_own_athlete_id());

create or replace function private.mw_notify_athletes_coach_message()
returns trigger language plpgsql security definer set search_path = ''
as $function$
begin
  if new.audience_type = 'athlete' and new.athlete_id is not null then
    insert into public.athlete_notifications(athlete_id,notification_type,title,body,action_view,entity_type,entity_id)
    select ca.athlete_id,'coach_message','New message from your coach',left(new.body,240),'messages','coach_message',new.id::text
    from public.coach_assignments ca
    where ca.coach_user_id=new.coach_user_id and ca.athlete_id=new.athlete_id and ca.status='active'::public.mw_assignment_status
    on conflict do nothing;
  elsif new.audience_type = 'all_assigned' and new.athlete_id is null and new.group_id is null then
    insert into public.athlete_notifications(athlete_id,notification_type,title,body,action_view,entity_type,entity_id)
    select ca.athlete_id,'coach_message','New message from your coach',left(new.body,240),'messages','coach_message',new.id::text
    from public.coach_assignments ca
    where ca.coach_user_id=new.coach_user_id and ca.status='active'::public.mw_assignment_status
    on conflict do nothing;
  elsif new.audience_type = 'group' and new.group_id is not null then
    insert into public.athlete_notifications(athlete_id,notification_type,title,body,action_view,entity_type,entity_id)
    select distinct gm.athlete_id,'coach_message','New message from your coach',left(new.body,240),'messages','coach_message',new.id::text
    from public.coach_group_members gm
    join public.coach_groups g on g.id=gm.group_id
    join public.coach_assignments ca on ca.athlete_id=gm.athlete_id and ca.coach_user_id=new.coach_user_id and ca.status='active'::public.mw_assignment_status
    where gm.group_id=new.group_id and g.coach_user_id=new.coach_user_id and g.archived=false
    on conflict do nothing;
  end if;
  return new;
end;
$function$;

drop trigger if exists mw_notify_athletes_coach_message on public.coach_messages;
create trigger mw_notify_athletes_coach_message
after insert on public.coach_messages
for each row execute function private.mw_notify_athletes_coach_message();
