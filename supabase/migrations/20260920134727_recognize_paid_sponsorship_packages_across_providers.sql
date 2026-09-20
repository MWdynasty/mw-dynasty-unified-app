-- MW Dynasty production migration
-- Applied to Supabase project keqgunlfwhjgcsurynef as 20260920134727 recognize_paid_sponsorship_packages_across_providers
-- Captured from supabase_migrations.schema_migrations on 2026-09-20.

create or replace function private.mw_coach_sponsored_billing_enabled(p_coach_user_id uuid)
returns boolean
language sql
stable security definer
set search_path=''
as $function$
  select exists(
    select 1
    from public.billing_subscriptions b
    join public.profiles p on p.user_id=b.beneficiary_user_id
    join public.coach_access_entitlements cae
      on cae.coach_user_id=b.beneficiary_user_id and cae.status='active'
    where b.beneficiary_user_id=p_coach_user_id
      and b.audience='coach'
      and p.role='coach'::public.mw_app_role
      and p.account_status='active'::public.mw_account_status
      and b.status in ('active','trialing','cancel_at_period_end')
      and (b.current_period_end is null or b.current_period_end>now())
      and b.plan_code = case cae.access_tier
        when 'core' then 'coach_core'
        when 'intelligence' then 'coach_intelligence'
        when 'mw_sprint_performance' then 'mw_sprint_performance'
        else '__invalid__'
      end
      and (
        lower(coalesce(b.metadata->>'sponsored_billing_active','false'))='true'
        or exists(
          select 1
          from public.coach_sponsorship_packages sp
          where sp.coach_user_id=p_coach_user_id
            and sp.plan_code=b.plan_code
            and sp.requested_seats>0
            and sp.status in ('active','cancel_at_period_end')
            and (sp.current_period_end is null or sp.current_period_end>now())
        )
      )
  );
$function$;

comment on function private.mw_coach_sponsored_billing_enabled(uuid) is
'Returns true only when the Coach base membership and a paid sponsorship source are both currently valid. Supports combined Stripe billing and separate sponsorship add-ons for Apple-paid Coaches.';
