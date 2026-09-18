update public.profiles p
set coach_title = nullif(trim(a.coach_title),'')
from public.coach_access_applications a
where p.user_id = a.coach_user_id
  and p.role = 'coach'::public.mw_app_role
  and coalesce(nullif(trim(p.coach_title),''),'') = ''
  and nullif(trim(a.coach_title),'') is not null;
