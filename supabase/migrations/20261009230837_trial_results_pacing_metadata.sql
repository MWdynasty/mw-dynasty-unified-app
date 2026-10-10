alter table public.athlete_prs add column if not exists mark_type text not null default 'unspecified';
alter table public.athlete_prs add constraint athlete_prs_mark_type_check check (mark_type in ('race_pr','time_trial','unspecified'));

create or replace function public.mw_update_athlete_profile(p_first_name text,p_prs jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer
set search_path = 'public','private','pg_temp'
as $function$
declare
  v_uid uuid := auth.uid();
  v_athlete_id uuid;
  v_name text := left(trim(coalesce(p_first_name,'')),80);
  v_event text;
  v_item jsonb;
  v_raw text;
  v_time numeric;
  v_mark text;
  v_timing text;
  v_date date;
  v_prs jsonb;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  if v_name='' then raise exception 'First name is required'; end if;
  select a.id into v_athlete_id from public.athletes a join public.profiles p on p.user_id=a.user_id
  where a.user_id=v_uid and p.role='athlete'::public.mw_app_role
    and p.account_status='active'::public.mw_account_status limit 1;
  if v_athlete_id is null then raise exception 'Active athlete profile not found'; end if;
  update public.profiles set first_name=v_name,updated_at=now() where user_id=v_uid;
  foreach v_event in array array['60m','100m','150m','200m','300m','400m','500m'] loop
    v_item:=p_prs->v_event;
    v_raw:=trim(coalesce(case when jsonb_typeof(v_item)='object' then v_item->>'time_seconds' else p_prs->>v_event end,''));
    if v_raw='' then continue; end if;
    begin v_time:=v_raw::numeric; exception when others then raise exception 'Enter a valid % result',upper(v_event); end;
    if v_time<=0 or v_time::text in ('NaN','Infinity','-Infinity') then raise exception 'Enter a valid % result',upper(v_event); end if;
    v_mark:=coalesce(nullif(v_item->>'mark_type',''),'unspecified');
    v_timing:=coalesce(nullif(v_item->>'timing_method',''),'unknown');
    if v_mark not in ('race_pr','time_trial','unspecified') then raise exception 'Invalid result type'; end if;
    if v_timing not in ('fat','hand','unknown') then raise exception 'Invalid timing method'; end if;
    v_date:=nullif(v_item->>'date_recorded','')::date;
    insert into public.athlete_prs(athlete_id,event,time_seconds,verified,verified_by,updated_at,mark_type,timing_method,date_recorded)
      values(v_athlete_id,v_event,v_time,false,null,now(),v_mark,v_timing,v_date)
    on conflict (athlete_id,event) do update set
      time_seconds=excluded.time_seconds,verified=false,verified_by=null,updated_at=now(),
      mark_type=case when jsonb_typeof(v_item)='object' then excluded.mark_type else athlete_prs.mark_type end,
      timing_method=case when jsonb_typeof(v_item)='object' then excluded.timing_method else athlete_prs.timing_method end,
      date_recorded=case when jsonb_typeof(v_item)='object' then excluded.date_recorded else athlete_prs.date_recorded end;
  end loop;
  select coalesce(jsonb_agg(jsonb_build_object('event',ap.event,'time_seconds',ap.time_seconds,
    'date_recorded',ap.date_recorded,'verified',ap.verified,'timing_method',ap.timing_method,'mark_type',ap.mark_type) order by ap.event),'[]'::jsonb)
  into v_prs from public.athlete_prs ap where ap.athlete_id=v_athlete_id;
  return jsonb_build_object('ok',true,'profile',jsonb_build_object('first_name',v_name),'prs',v_prs);
end;
$function$;
