alter table public.coach_access_applications add column if not exists coach_title text;
comment on column public.coach_access_applications.coach_title is 'Optional coaching role or title supplied during Coach access application.';
