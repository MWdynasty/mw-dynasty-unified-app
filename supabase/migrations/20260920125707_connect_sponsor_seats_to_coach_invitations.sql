-- MW Dynasty production migration
-- Applied to Supabase project keqgunlfwhjgcsurynef as 20260920125707 connect_sponsor_seats_to_coach_invitations
-- Captured from supabase_migrations.schema_migrations on 2026-09-20.

create or replace function public.mw_coach_assign_sponsor_seat(p_invitation_id bigint)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_coach uuid:=auth.uid();
  v_inv public.coach_invitations%rowtype;
  v_package public.coach_sponsorship_packages%rowtype;
  v_seat public.coach_sponsor_seats%rowtype;
  v_tier text;
  v_price integer;
begin
  if v_coach is null then raise exception 'Authentication required'; end if;

  select * into v_inv from public.coach_invitations
  where id=p_invitation_id and coach_user_id=v_coach
  for update;
  if not found then raise exception 'Invitation not found'; end if;

  select * into v_package from public.coach_sponsorship_packages
  where coach_user_id=v_coach and status in ('active','cancel_at_period_end')
    and (current_period_end is null or current_period_end>now())
  order by created_at desc limit 1;
  if not found then raise exception 'Sponsored-athlete billing is not active for this Coach membership'; end if;

  select * into v_seat from public.coach_sponsor_seats
  where package_id=v_package.id and status='available'
  order by seat_number
  limit 1
  for update skip locked;
  if not found then raise exception 'No sponsored-athlete seats are available. Add another sponsored seat to your membership first.'; end if;

  select access_tier,sponsored_athlete_price_cents into v_tier,v_price
  from public.membership_plans where plan_code=v_package.plan_code;

  update public.coach_sponsor_seats
  set status='invited',athlete_email=lower(trim(v_inv.athlete_email)),
      coach_invitation_id=v_inv.id,invited_at=now(),updated_at=now()
  where id=v_seat.id;

  update public.coach_invitations
  set billing_type='coach_sponsored',sponsor_access_tier=v_tier,
      sponsor_price_cents=v_price,sponsorship_ends_at=v_package.current_period_end
  where id=v_inv.id;

  return jsonb_build_object(
    'seat_id',v_seat.id,'seat_number',v_seat.seat_number,
    'package_id',v_package.id,'sponsor_access_tier',v_tier,
    'sponsor_price_cents',v_price
  );
end;
$$;

create or replace function public.mw_coach_release_sponsor_seat(p_invitation_id bigint)
returns boolean
language plpgsql
security definer
set search_path=''
as $$
declare v_coach uuid:=auth.uid();
begin
  if v_coach is null then raise exception 'Authentication required'; end if;
  if not exists(select 1 from public.coach_invitations where id=p_invitation_id and coach_user_id=v_coach) then
    raise exception 'Invitation not found';
  end if;

  update public.coach_sponsor_seats s
  set status='available',athlete_email=null,athlete_user_id=null,coach_invitation_id=null,
      invited_at=null,claimed_at=null,activated_at=null,scheduled_end_at=null,ended_at=null,updated_at=now()
  where s.coach_invitation_id=p_invitation_id
    and s.status='invited'
    and exists(select 1 from public.coach_sponsorship_packages p where p.id=s.package_id and p.coach_user_id=v_coach);

  update public.coach_invitations
  set billing_type='self_pay',sponsor_access_tier=null,sponsor_price_cents=null,sponsorship_ends_at=null
  where id=p_invitation_id and coach_user_id=v_coach;

  return true;
end;
$$;

revoke all on function public.mw_coach_assign_sponsor_seat(bigint) from public,anon;
grant execute on function public.mw_coach_assign_sponsor_seat(bigint) to authenticated;
revoke all on function public.mw_coach_release_sponsor_seat(bigint) from public,anon;
grant execute on function public.mw_coach_release_sponsor_seat(bigint) to authenticated;

comment on function public.mw_coach_assign_sponsor_seat(bigint) is
'Atomically reserves one already-paid sponsored-athlete seat for an invitation owned by the signed-in coach.';
comment on function public.mw_coach_release_sponsor_seat(bigint) is
'Releases an unclaimed invited sponsor seat when the coach switches that invitation back to athlete self-pay.';
