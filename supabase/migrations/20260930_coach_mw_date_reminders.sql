-- Applied live in Supabase on 2026-09-30.
-- Coach MW operating reminder layer: upcoming calendar intelligence is converted
-- into idempotent coach notifications when the notification feed synchronizes.
create or replace function public.mw_sync_coach_date_reminders()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_count integer := 0;
  r record;
  v_days integer;
  v_title text;
  v_body text;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  if not exists (select 1 from public.profiles p where p.user_id=v_uid and p.account_status='active' and p.role in ('coach','admin','founder_owner')) then
    raise exception 'Coach access required';
  end if;
  for r in
    select e.id,e.title,e.event_type,e.starts_at,e.training_impact,e.meet_priority,e.qualification_stage,e.is_primary_target
    from public.coach_calendar_events e
    where e.coach_user_id=v_uid
      and e.starts_at >= date_trunc('day',now())
      and e.starts_at < date_trunc('day',now()) + interval '8 days'
      and e.event_type in ('meet','practice','testing','school_break','exam_week','holiday','facility_closure','travel')
    order by e.starts_at asc
  loop
    v_days := greatest(0,floor(extract(epoch from (date_trunc('day',r.starts_at)-date_trunc('day',now())))/86400)::integer);
    if r.event_type='meet' then
      v_title := case when v_days=0 then 'Meet today: ' when v_days=1 then 'Meet tomorrow: ' else 'Meet in '||v_days||' days: ' end||r.title;
      v_body := case when v_days<=1 then 'Coach MW reminder: review entries, athlete availability, competition warm-up, travel and any unresolved roster details.' else 'Coach MW reminder: review entries, athlete availability, travel and the upcoming training load.' end;
    elsif r.event_type in ('school_break','holiday','facility_closure','travel') then
      v_title := case when v_days=0 then 'Schedule constraint starts today: ' when v_days=1 then 'Schedule constraint tomorrow: ' else 'Schedule constraint in '||v_days||' days: ' end||r.title;
      v_body := 'Coach MW reminder: review practice availability and make sure the upcoming training schedule respects this constraint.';
    elsif r.event_type='exam_week' then
      v_title := case when v_days=0 then 'Exam period starts today: ' when v_days=1 then 'Exam period tomorrow: ' else 'Exam period in '||v_days||' days: ' end||r.title;
      v_body := 'Coach MW reminder: reduced-load context is approaching. Review training pressure, athlete availability and recovery.';
    else
      continue;
    end if;
    if not exists (select 1 from public.coach_notifications n where n.coach_user_id=v_uid and n.notification_type='coach_mw_date_reminder' and n.entity_type='calendar_event' and n.entity_id=r.id::text and n.title=v_title and n.created_at>=date_trunc('day',now())) then
      insert into public.coach_notifications(coach_user_id,notification_type,title,body,action_page,entity_type,entity_id)
      values(v_uid,'coach_mw_date_reminder',v_title,v_body,case when r.event_type='meet' then 'meets' else 'calendar' end,'calendar_event',r.id::text);
      v_count:=v_count+1;
    end if;
  end loop;
  return v_count;
end;
$$;
revoke all on function public.mw_sync_coach_date_reminders() from public;
grant execute on function public.mw_sync_coach_date_reminders() to authenticated;
