create or replace function private.mw_sync_last_completed_workout()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_athlete uuid;
  v_latest timestamptz;
begin
  v_athlete := case when tg_op='DELETE' then old.athlete_id else new.athlete_id end;

  if tg_op='UPDATE'
     and old.athlete_id is not distinct from new.athlete_id
     and old.completion_status is not distinct from new.completion_status
     and old.completed_at is not distinct from new.completed_at then
    return new;
  end if;

  select max(w.completed_at)
    into v_latest
  from public.workout_completions w
  where w.athlete_id=v_athlete
    and w.completion_status='completed'
    and w.completed_at is not null;

  update public.athlete_program_state s
  set last_completed_workout_at=v_latest,
      updated_at=now()
  where s.athlete_id=v_athlete
    and s.last_completed_workout_at is distinct from v_latest;

  return case when tg_op='DELETE' then old else new end;
end;
$function$;

revoke all on function private.mw_sync_last_completed_workout() from public;
revoke all on function private.mw_sync_last_completed_workout() from anon;
revoke all on function private.mw_sync_last_completed_workout() from authenticated;

drop trigger if exists mw_sync_last_completed_workout on public.workout_completions;
create trigger mw_sync_last_completed_workout
after insert or update or delete on public.workout_completions
for each row execute function private.mw_sync_last_completed_workout();
