create or replace function private.mw_notify_athletes_coach_message()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if new.audience_type = 'athlete' and new.athlete_id is not null then
    insert into public.athlete_notifications(athlete_id,notification_type,title,body,action_view,entity_type,entity_id)
    select ca.athlete_id,'coach_message','New message from your coach','Open Messages to read it.','messages','coach_message',new.id::text
    from public.coach_assignments ca
    where ca.coach_user_id=new.coach_user_id and ca.athlete_id=new.athlete_id and ca.status='active'::public.mw_assignment_status
    on conflict do nothing;
  elsif new.audience_type = 'all_assigned' and new.athlete_id is null and new.group_id is null then
    insert into public.athlete_notifications(athlete_id,notification_type,title,body,action_view,entity_type,entity_id)
    select ca.athlete_id,'coach_message','New message from your coach','Open Messages to read it.','messages','coach_message',new.id::text
    from public.coach_assignments ca
    where ca.coach_user_id=new.coach_user_id and ca.status='active'::public.mw_assignment_status
    on conflict do nothing;
  elsif new.audience_type = 'group' and new.group_id is not null then
    insert into public.athlete_notifications(athlete_id,notification_type,title,body,action_view,entity_type,entity_id)
    select distinct gm.athlete_id,'coach_message','New message from your coach','Open Messages to read it.','messages','coach_message',new.id::text
    from public.coach_group_members gm
    join public.coach_groups g on g.id=gm.group_id
    join public.coach_assignments ca on ca.athlete_id=gm.athlete_id and ca.coach_user_id=new.coach_user_id and ca.status='active'::public.mw_assignment_status
    where gm.group_id=new.group_id and g.coach_user_id=new.coach_user_id and g.archived=false
    on conflict do nothing;
  end if;
  return new;
end;
$function$;
