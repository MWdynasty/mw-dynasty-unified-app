-- Canonical workout identity collision inventory
-- Source of truth: supabase/migrations/20261002030901_canonical_workout_identity.sql
--   private.mw_normalize_workout_key / public.mw_workout_identity_key
--
-- SAFE MODE: read-only SELECTs. No CREATE, no UPDATE, no LOCK, no COMMIT of DDL.
-- Run against an isolated clone/staging copy ONLY. Never production.
--
-- Pre-Phase-1 schema has no workout_cycle_id; this query treats it as null
-- via to_jsonb so it also works after the column exists.
--
-- A collision is the same athlete + same normalized canonical key
-- (and same rep_number for practice reps) appearing on more than one row.
-- A normalize_error would abort the whole Phase 1 migration.

with completions as (
  select
    c.id,
    c.athlete_id,
    c.program_week,
    c.program_day,
    c.workout_key,
    c.completion_status,
    c.season_plan_id,
    nullif(to_jsonb(c)->>'workout_cycle_id','')::uuid as workout_cycle_id,
    c.completed_at,
    c.last_activity_at
  from public.workout_completions c
  where c.workout_key ~ '^mw-(track-w|season-|workout-v1:)'
),
rep_results as (
  select
    r.id,
    r.athlete_id,
    r.program_week,
    r.program_day,
    r.workout_key,
    r.rep_number,
    r.season_plan_id,
    nullif(to_jsonb(r)->>'workout_cycle_id','')::uuid as workout_cycle_id,
    r.recorded_at
  from public.athlete_practice_rep_results r
  where r.workout_key ~ '^mw-(track-w|season-|workout-v1:)'
),
classified_completions as (
  select
    x.*,
    substring(x.workout_key from '^mw-season-([0-9a-f-]{36})-w') as season_from_legacy,
    substring(x.workout_key from '^mw-workout-v1:[0-9a-f-]{36}:season:([0-9a-f-]{36}):w') as season_from_canonical,
    substring(x.workout_key from '^mw-workout-v1:[0-9a-f-]{36}:cycle:([0-9a-f-]{36}):w') as cycle_from_canonical,
    case when x.workout_key like 'mw-workout-v1:%' then regexp_replace(x.workout_key,'^.*:','') else 'track' end as session_key
  from completions x
),
normalized_completions as (
  select
    c.*,
    coalesce(c.season_from_legacy,c.season_from_canonical)::uuid as encoded_plan,
    c.cycle_from_canonical::uuid as encoded_cycle,
    coalesce(coalesce(c.season_from_legacy,c.season_from_canonical)::uuid,c.season_plan_id) as resolved_plan,
    coalesce(c.cycle_from_canonical::uuid,c.workout_cycle_id) as resolved_cycle
  from classified_completions c
),
completion_eval as (
  select
    n.*,
    case
      when n.season_plan_id is not null and n.encoded_plan is not null and n.season_plan_id<>n.encoded_plan
        then 'season_metadata_mismatch'
      when n.workout_cycle_id is not null and n.encoded_cycle is not null and n.workout_cycle_id<>n.encoded_cycle
        then 'cycle_metadata_mismatch'
      when n.resolved_plan is not null and n.resolved_cycle is not null
        then 'plan_and_cycle_both_set'
      when n.athlete_id is null or n.program_week not between 1 and 41 or n.program_day not between 1 and 7
        or n.session_key is null or n.session_key !~ '^[a-z][a-z0-9-]{0,63}$'
        then 'invalid_workout_identity'
      when not (
        n.workout_key=format(
          'mw-workout-v1:%s:%s:w%s:d%s:%s',
          n.athlete_id,
          case
            when n.resolved_plan is not null then 'season:'||n.resolved_plan::text
            when n.resolved_cycle is not null then 'cycle:'||n.resolved_cycle::text
            else 'mw-41'
          end,
          n.program_week,n.program_day,n.session_key
        )
        or (
          n.session_key='track'
          and (
            n.workout_key=format('mw-track-w%s-d%s',n.program_week,n.program_day)
            or (n.resolved_plan is not null and n.workout_key=format('mw-season-%s-w%s-d%s',n.resolved_plan,n.program_week,n.program_day))
          )
        )
      ) then 'identity_mismatch'
      else null
    end as normalize_error,
    case
      when n.athlete_id is null or n.program_week not between 1 and 41 or n.program_day not between 1 and 7
        or n.session_key is null or n.session_key !~ '^[a-z][a-z0-9-]{0,63}$'
        or (n.resolved_plan is not null and n.resolved_cycle is not null)
        then null
      else format(
        'mw-workout-v1:%s:%s:w%s:d%s:%s',
        n.athlete_id,
        case
          when n.resolved_plan is not null then 'season:'||n.resolved_plan::text
          when n.resolved_cycle is not null then 'cycle:'||n.resolved_cycle::text
          else 'mw-41'
        end,
        n.program_week,n.program_day,n.session_key
      )
    end as canonical_key
  from normalized_completions n
),
classified_reps as (
  select
    x.*,
    substring(x.workout_key from '^mw-season-([0-9a-f-]{36})-w') as season_from_legacy,
    substring(x.workout_key from '^mw-workout-v1:[0-9a-f-]{36}:season:([0-9a-f-]{36}):w') as season_from_canonical,
    substring(x.workout_key from '^mw-workout-v1:[0-9a-f-]{36}:cycle:([0-9a-f-]{36}):w') as cycle_from_canonical,
    case when x.workout_key like 'mw-workout-v1:%' then regexp_replace(x.workout_key,'^.*:','') else 'track' end as session_key
  from rep_results x
),
normalized_reps as (
  select
    c.*,
    coalesce(c.season_from_legacy,c.season_from_canonical)::uuid as encoded_plan,
    c.cycle_from_canonical::uuid as encoded_cycle,
    coalesce(coalesce(c.season_from_legacy,c.season_from_canonical)::uuid,c.season_plan_id) as resolved_plan,
    coalesce(c.cycle_from_canonical::uuid,c.workout_cycle_id) as resolved_cycle
  from classified_reps c
),
rep_eval as (
  select
    n.*,
    case
      when n.season_plan_id is not null and n.encoded_plan is not null and n.season_plan_id<>n.encoded_plan
        then 'season_metadata_mismatch'
      when n.workout_cycle_id is not null and n.encoded_cycle is not null and n.workout_cycle_id<>n.encoded_cycle
        then 'cycle_metadata_mismatch'
      when n.resolved_plan is not null and n.resolved_cycle is not null
        then 'plan_and_cycle_both_set'
      when n.athlete_id is null or n.program_week not between 1 and 41 or n.program_day not between 1 and 7
        or n.session_key is null or n.session_key !~ '^[a-z][a-z0-9-]{0,63}$'
        then 'invalid_workout_identity'
      when not (
        n.workout_key=format(
          'mw-workout-v1:%s:%s:w%s:d%s:%s',
          n.athlete_id,
          case
            when n.resolved_plan is not null then 'season:'||n.resolved_plan::text
            when n.resolved_cycle is not null then 'cycle:'||n.resolved_cycle::text
            else 'mw-41'
          end,
          n.program_week,n.program_day,n.session_key
        )
        or (
          n.session_key='track'
          and (
            n.workout_key=format('mw-track-w%s-d%s',n.program_week,n.program_day)
            or (n.resolved_plan is not null and n.workout_key=format('mw-season-%s-w%s-d%s',n.resolved_plan,n.program_week,n.program_day))
          )
        )
      ) then 'identity_mismatch'
      else null
    end as normalize_error,
    case
      when n.athlete_id is null or n.program_week not between 1 and 41 or n.program_day not between 1 and 7
        or n.session_key is null or n.session_key !~ '^[a-z][a-z0-9-]{0,63}$'
        or (n.resolved_plan is not null and n.resolved_cycle is not null)
        then null
      else format(
        'mw-workout-v1:%s:%s:w%s:d%s:%s',
        n.athlete_id,
        case
          when n.resolved_plan is not null then 'season:'||n.resolved_plan::text
          when n.resolved_cycle is not null then 'cycle:'||n.resolved_cycle::text
          else 'mw-41'
        end,
        n.program_week,n.program_day,n.session_key
      )
    end as canonical_key
  from normalized_reps n
)
select 'completion_summary' as report, jsonb_build_object(
  'row_count',(select count(*) from completion_eval),
  'normalize_error_count',(select count(*) from completion_eval where normalize_error is not null),
  'collision_group_count',(
    select count(*) from (
      select athlete_id,canonical_key
      from completion_eval
      where normalize_error is null
      group by athlete_id,canonical_key
      having count(*)>1
    ) g
  ),
  'mw_track_count',(select count(*) from completion_eval where workout_key ~ '^mw-track-w'),
  'mw_season_count',(select count(*) from completion_eval where workout_key ~ '^mw-season-'),
  'canonical_count',(select count(*) from completion_eval where workout_key like 'mw-workout-v1:%')
) as data
union all
select 'rep_summary', jsonb_build_object(
  'row_count',(select count(*) from rep_eval),
  'normalize_error_count',(select count(*) from rep_eval where normalize_error is not null),
  'collision_group_count',(
    select count(*) from (
      select athlete_id,canonical_key,rep_number
      from rep_eval
      where normalize_error is null
      group by athlete_id,canonical_key,rep_number
      having count(*)>1
    ) g
  )
)
union all
select 'completion_normalize_errors', jsonb_agg(e)
from (
  select id,athlete_id,program_week,program_day,workout_key,season_plan_id,normalize_error
  from completion_eval where normalize_error is not null
  order by athlete_id,program_week,program_day
  limit 200
) e
union all
select 'completion_collisions', jsonb_agg(e)
from (
  select c.athlete_id,c.canonical_key,count(*) as alias_count,
         jsonb_agg(jsonb_build_object(
           'id',c.id,'workout_key',c.workout_key,'season_plan_id',c.season_plan_id,
           'completion_status',c.completion_status,'completed_at',c.completed_at
         ) order by c.workout_key) as aliases
  from completion_eval c
  where c.normalize_error is null
  group by c.athlete_id,c.canonical_key
  having count(*)>1
  order by count(*) desc
  limit 200
) e
union all
select 'rep_collisions', jsonb_agg(e)
from (
  select r.athlete_id,r.canonical_key,r.rep_number,count(*) as alias_count,
         jsonb_agg(jsonb_build_object(
           'id',r.id,'workout_key',r.workout_key,'season_plan_id',r.season_plan_id
         ) order by r.workout_key) as aliases
  from rep_eval r
  where r.normalize_error is null
  group by r.athlete_id,r.canonical_key,r.rep_number
  having count(*)>1
  order by count(*) desc
  limit 200
) e;
