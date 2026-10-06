-- Disposable fixture of the existing production team tables and policies.
create table public.coach_groups(id uuid primary key default gen_random_uuid(),coach_user_id uuid references auth.users(id),name text not null,event_group text,description text,archived boolean not null default false,created_at timestamptz default now(),updated_at timestamptz default now(),unique(coach_user_id,name));
create table public.coach_group_members(id uuid primary key default gen_random_uuid(),group_id uuid references public.coach_groups(id) on delete cascade,athlete_id uuid references public.athletes(id) on delete cascade,added_by uuid references auth.users(id),created_at timestamptz default now(),unique(group_id,athlete_id));
create function private.mw_coach_workspace_actor() returns boolean language sql stable as $$select private.mw_current_role() in ('coach','admin','founder_owner')$$;
create function private.mw_can_manage_athlete(uuid) returns boolean language sql stable as $$select private.mw_is_admin_or_founder() or private.mw_coach_is_assigned($1)$$;
create function private.mw_group_owned(uuid) returns boolean language sql stable security definer set search_path='' as $$select private.mw_coach_workspace_actor() and exists(select 1 from public.coach_groups where id=$1 and coach_user_id=auth.uid() and archived=false)$$;
alter table public.coach_groups enable row level security;
alter table public.coach_group_members enable row level security;
create policy mw_coach_groups_own_all on public.coach_groups for all to authenticated using(private.mw_coach_workspace_actor() and coach_user_id=(select auth.uid())) with check(private.mw_coach_workspace_actor() and coach_user_id=(select auth.uid()));
create policy mw_coach_group_members_own_all on public.coach_group_members for all to authenticated using(private.mw_group_owned(group_id)) with check(private.mw_group_owned(group_id) and private.mw_can_manage_athlete(athlete_id) and added_by=(select auth.uid()));
grant select,insert,update,delete on public.coach_groups,public.coach_group_members to authenticated;
