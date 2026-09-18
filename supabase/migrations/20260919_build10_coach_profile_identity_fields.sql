alter table public.profiles
  add column if not exists coach_organization text,
  add column if not exists coach_title text;

update public.profiles p
set coach_organization = nullif(trim(a.organization),'')
from public.coach_access_applications a
where p.user_id = a.coach_user_id
  and p.role = 'coach'::public.mw_app_role
  and coalesce(nullif(trim(p.coach_organization),''),'') = ''
  and nullif(trim(a.organization),'') is not null;

comment on column public.profiles.coach_organization is 'Optional school, club, team, company, or organization displayed on an MW Coach profile.';
comment on column public.profiles.coach_title is 'Optional coaching role or title displayed on an MW Coach profile.';
