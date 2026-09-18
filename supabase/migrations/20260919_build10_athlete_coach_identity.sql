create or replace function public.mw_athlete_assigned_coach_identity()
returns table(coach_user_id uuid,coach_name text,coach_organization text,coach_title text)
language sql
stable
security definer
set search_path=''
as $function$
  select distinct ca.coach_user_id,
    coalesce(nullif(trim(concat_ws(' ',p.first_name,p.last_name)),''),'MW Coach') as coach_name,
    coalesce(p.coach_organization,'') as coach_organization,
    coalesce(p.coach_title,'') as coach_title
  from public.athletes a
  join public.profiles ap on ap.user_id=a.user_id
  join public.coach_assignments ca on ca.athlete_id=a.id and ca.status='active'::public.mw_assignment_status
  left join public.profiles p on p.user_id=ca.coach_user_id
  where a.user_id=auth.uid()
    and ap.role='athlete'::public.mw_app_role
    and ap.account_status='active'::public.mw_account_status
    and private.mw_athlete_feature_enabled('messaging');
$function$;

revoke all on function public.mw_athlete_assigned_coach_identity() from public;
grant execute on function public.mw_athlete_assigned_coach_identity() to authenticated;
