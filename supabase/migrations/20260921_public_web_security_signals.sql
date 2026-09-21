-- Extend privacy-scrubbed public website telemetry with security/availability signals.
create or replace function public.mw_record_web_event(
  p_session_key text,p_event_type text,p_page_path text,p_audience text default null,
  p_source text default null,p_campaign text default null,p_referrer_host text default null,
  p_device_class text default null,p_metadata jsonb default '{}'::jsonb
)
returns boolean language plpgsql security definer set search_path to ''
as $function$
declare
  v_event text := lower(left(trim(coalesce(p_event_type,'')),50));
  v_page text;
  v_session text := left(regexp_replace(coalesce(p_session_key,''),'[^a-zA-Z0-9_-]','','g'),80);
  v_window interval := interval '8 seconds';
  v_meta jsonb;
begin
  v_page := left(split_part(split_part(coalesce(p_page_path,'/'),'?',1),'#',1),160);
  if v_event not in (
    'page_view','cta_click','role_choice','signup_start','signup_complete','checkout_start',
    'support_open','app_open','client_error','availability_degraded','availability_recovered'
  ) then return false; end if;
  if length(v_session)<8 then return false; end if;
  if v_page='' then v_page:='/'; end if;
  if v_event in ('client_error','availability_degraded','availability_recovered') then
    v_window := interval '30 seconds';
  end if;
  if exists(
    select 1 from public.founder_web_events
    where session_key=v_session and event_type=v_event and page_path=v_page
      and created_at>now()-v_window
  ) then return true; end if;
  v_meta := case when jsonb_typeof(coalesce(p_metadata,'{}'::jsonb))='object'
    then coalesce(p_metadata,'{}'::jsonb)
      - 'email' - 'name' - 'message' - 'body' - 'token' - 'password'
      - 'secret' - 'authorization' - 'cookie' - 'photo' - 'image'
    else '{}'::jsonb end;
  insert into public.founder_web_events(
    session_key,user_id,event_type,page_path,audience,source,campaign,referrer_host,device_class,metadata
  ) values (
    v_session,auth.uid(),v_event,v_page,
    nullif(left(trim(coalesce(p_audience,'')),40),''),
    nullif(left(trim(coalesce(p_source,'')),80),''),
    nullif(left(trim(coalesce(p_campaign,'')),80),''),
    nullif(left(trim(coalesce(p_referrer_host,'')),120),''),
    nullif(left(trim(coalesce(p_device_class,'')),30),''),
    v_meta
  );
  return true;
end
$function$;
grant execute on function public.mw_record_web_event(text,text,text,text,text,text,text,text,jsonb) to anon,authenticated;
