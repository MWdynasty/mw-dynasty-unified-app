-- Private, short-lived local motion reports. Measurements are not verified
-- biomechanics. No authenticated insert/update/delete grants.
create table if not exists public.motion_reviews (
 assessment_id uuid primary key references public.motion_assessments(id) on delete cascade,
 owner_user_id uuid not null references auth.users(id),
 movement_type text not null,
 week_number integer check (week_number between 1 and 41),
 sampled_frames integer not null check (sampled_frames between 5 and 36),
 pose_frames integer not null check (pose_frames between 5 and 36 and pose_frames <= sampled_frames),
 metrics jsonb not null check (jsonb_typeof(metrics)='array' and jsonb_array_length(metrics) between 1 and 3),
 method text not null default 'local-pose-v1' check (method='local-pose-v1'),
 provenance text not null default 'unverified_client_2d' check (provenance='unverified_client_2d'),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index if not exists motion_reviews_owner_week_idx on public.motion_reviews(owner_user_id,week_number,created_at desc);
alter table public.motion_reviews enable row level security;
revoke all on public.motion_reviews from anon,authenticated;
grant select on public.motion_reviews to authenticated;
drop policy if exists "motion owner read private reviews" on public.motion_reviews;
create policy "motion owner read private reviews" on public.motion_reviews
 for select to authenticated
 using (owner_user_id=(select auth.uid()) and exists(
  select 1 from public.motion_assessments a
  where a.id=motion_reviews.assessment_id
  and a.created_by=(select auth.uid())
  and a.status='uploaded'
  and a.created_at>now()-interval '14 days'
 ));
