-- Schema-only fixture with synthetic identities; no production rows or credentials.
create schema auth; create schema private;
create role anon; create role authenticated; create role service_role bypassrls;
create table auth.users(id uuid primary key,email text);
create table auth.sessions(id uuid primary key,user_id uuid references auth.users(id),not_after timestamptz);
create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
create function auth.uid() returns uuid language sql stable as $$select nullif(auth.jwt()->>'sub','')::uuid$$;
create type public.mw_account_status as enum ('invited', 'active', 'paused', 'suspended', 'closed');
create type public.mw_app_role as enum ('founder_owner', 'admin', 'coach', 'athlete');
create type public.mw_assignment_status as enum ('active', 'ended');
create type public.mw_flag_severity as enum ('low', 'medium', 'high', 'critical');
create type public.mw_flag_status as enum ('open', 'in_review', 'resolved', 'dismissed');
create type public.mw_program_status as enum ('not_started', 'active', 'paused', 'completed', 'needs_review');
create table public.athletes (id uuid default gen_random_uuid() not null, user_id uuid not null, date_of_birth date, primary_event text, secondary_event text, experience_level text, program_start_date date, created_at timestamp with time zone default now() not null, updated_at timestamp with time zone default now() not null, selected_events text[] default '{}'::text[] not null, track_training_years numeric, training_goal text, competition_level text, competition_state text, season_preference text, competition_paths text[] default ARRAY['school'::text] not null, training_context text default 'independent'::text not null, competition_division text);
create table public.billing_subscriptions (id uuid default gen_random_uuid() not null, audience text not null, beneficiary_user_id uuid not null, payer_user_id uuid, responsible_coach_user_id uuid, billing_type text not null, billing_cycle text default 'monthly'::text not null, plan_code text not null, provider text default 'unconfigured'::text not null, provider_subscription_id text, status text default 'pending_payment'::text not null, current_period_start timestamp with time zone, current_period_end timestamp with time zone, cancel_at_period_end boolean default false not null, pending_plan_code text, pending_billing_type text, pending_billing_cycle text, pending_payer_user_id uuid, pending_effective_at timestamp with time zone, metadata jsonb default '{}'::jsonb not null, created_at timestamp with time zone default now() not null, updated_at timestamp with time zone default now() not null);
create table public.billing_transitions (id uuid default gen_random_uuid() not null, audience text not null, beneficiary_user_id uuid not null, requested_by uuid not null, transition_type text not null, direction text default 'neutral'::text not null, timing text not null, status text default 'requested'::text not null, from_plan_code text, to_plan_code text, from_billing_type text, to_billing_type text, from_billing_cycle text, to_billing_cycle text, from_payer_user_id uuid, to_payer_user_id uuid, effective_at timestamp with time zone, payment_required boolean default false not null, expected_amount_cents integer, currency text default 'USD'::text not null, provider text, provider_reference text, idempotency_key text, metadata jsonb default '{}'::jsonb not null, created_at timestamp with time zone default now() not null, updated_at timestamp with time zone default now() not null, completed_at timestamp with time zone);
create table public.coach_access_applications (id uuid default gen_random_uuid() not null, email text not null, email_normalized text generated always as (lower(TRIM(BOTH FROM email))) stored not null, first_name text not null, last_name text not null, organization text, city text, state text, coaching_level text, years_coaching integer, website_or_social text, reason text not null, status text default 'pending'::text not null, reviewed_by uuid, reviewed_at timestamp with time zone, review_notes text, created_at timestamp with time zone default now() not null, updated_at timestamp with time zone default now() not null, access_tier text, invited_at timestamp with time zone, activated_at timestamp with time zone, coach_user_id uuid, rejection_reason text, request_fingerprint text, coach_title text, verification_method text, verification_detail text, athlete_count integer, verification_status text default 'pending'::text not null, decision_mode text, verification_score integer, payment_status text default 'not_ready'::text not null, selected_plan_code text, sponsored_athlete_seats integer default 0 not null, verification_evidence jsonb default '{}'::jsonb not null, verification_checked_at timestamp with time zone, decision_reason text, email_domain text);
create table public.coach_access_entitlements (coach_user_id uuid not null, access_tier text not null, status text default 'active'::text not null, approved_by uuid, application_id uuid, created_at timestamp with time zone default now() not null, updated_at timestamp with time zone default now() not null, access_source text default 'paid'::text not null);
create table public.coach_assignments (id uuid default gen_random_uuid() not null, coach_user_id uuid not null, athlete_id uuid not null, status mw_assignment_status default 'active'::mw_assignment_status not null, assigned_at timestamp with time zone default now() not null, assigned_by uuid not null, ended_at timestamp with time zone);
create table public.coach_invitations (id bigint generated by default as identity not null, created_at timestamp with time zone default now() not null, coach_user_id uuid, athlete_email text, invite_type text, team_id uuid, status text, invite_token text, expires_at timestamp with time zone, accepted_at timestamp with time zone, accepted_by uuid, billing_type text default 'self_pay'::text not null, sponsor_access_tier text, sponsor_price_cents integer, sponsorship_ends_at timestamp with time zone, email_delivery_status text default 'not_sent'::text not null, email_sent_at timestamp with time zone);
create table public.coach_sponsor_seats (id uuid default gen_random_uuid() not null, package_id uuid not null, seat_number integer not null, status text default 'available'::text not null, athlete_email text, athlete_user_id uuid, coach_invitation_id bigint, invited_at timestamp with time zone, claimed_at timestamp with time zone, activated_at timestamp with time zone, scheduled_end_at timestamp with time zone, ended_at timestamp with time zone, metadata jsonb default '{}'::jsonb not null, created_at timestamp with time zone default now() not null, updated_at timestamp with time zone default now() not null);
create table public.coach_sponsorship_packages (id uuid default gen_random_uuid() not null, coach_application_id uuid, coach_user_id uuid, plan_code text not null, requested_seats integer default 0 not null, seat_price_cents integer not null, coach_price_cents integer not null, monthly_total_cents integer generated always as ((coach_price_cents + (requested_seats * seat_price_cents))) stored, status text default 'draft'::text not null, provider text default 'unconfigured'::text not null, provider_subscription_id text, current_period_start timestamp with time zone, current_period_end timestamp with time zone, cancel_at_period_end boolean default false not null, metadata jsonb default '{}'::jsonb not null, created_at timestamp with time zone default now() not null, updated_at timestamp with time zone default now() not null);
create table public.membership_entitlements (id uuid default gen_random_uuid() not null, source text default 'skool'::text not null, email text not null, email_normalized text not null, user_id uuid, external_member_id text, plan_code text default 'mw_athlete'::text not null, status text default 'active'::text not null, access_starts_at timestamp with time zone default now() not null, access_ends_at timestamp with time zone, last_event_at timestamp with time zone default now() not null, metadata jsonb default '{}'::jsonb not null, created_at timestamp with time zone default now() not null, updated_at timestamp with time zone default now() not null);
create table public.membership_plans (plan_code text not null, display_name text not null, monthly_price_cents integer not null, annual_price_cents integer, currency text default 'USD'::text not null, active boolean default true not null, updated_at timestamp with time zone default now() not null, audience text default 'athlete'::text not null, access_tier text, sponsored_athlete_price_cents integer, monthly_enabled boolean default true not null, annual_enabled boolean default true not null);
create table public.onboarding_journeys (id uuid default gen_random_uuid() not null, user_id uuid, coach_application_id uuid, audience text not null, channel text not null, stage text not null, status text default 'in_progress'::text not null, verification_status text default 'not_required'::text not null, selected_plan_code text, sponsored_athlete_seats integer default 0 not null, payment_status text default 'not_started'::text not null, assessment_status text default 'not_started'::text not null, last_completed_stage text, metadata jsonb default '{}'::jsonb not null, created_at timestamp with time zone default now() not null, updated_at timestamp with time zone default now() not null, completed_at timestamp with time zone);
create table public.profiles (user_id uuid not null, first_name text, last_name text, role mw_app_role default 'athlete'::mw_app_role not null, account_status mw_account_status default 'invited'::mw_account_status not null, created_at timestamp with time zone default now() not null, updated_at timestamp with time zone default now() not null, coach_organization text, coach_title text);
create table public.team_members (id uuid default gen_random_uuid() not null, team_id uuid not null, user_id uuid not null, member_role text not null, created_at timestamp with time zone default now() not null);
alter table public.athletes add constraint athletes_competition_division_check CHECK (((competition_division IS NULL) OR (competition_division = ANY (ARRAY['boys'::text, 'girls'::text, 'open'::text]))));
alter table public.athletes add constraint athletes_competition_level_check CHECK (((competition_level IS NULL) OR (competition_level = ANY (ARRAY['6'::text, '7'::text, '8'::text, '9'::text, '10'::text, '11'::text, '12'::text, 'collegiate'::text, 'professional'::text]))));
alter table public.athletes add constraint athletes_competition_state_check CHECK (((competition_state IS NULL) OR (competition_state ~ '^[A-Z]{2}$'::text)));
alter table public.athletes add constraint athletes_pkey PRIMARY KEY (id);
alter table public.athletes add constraint athletes_season_preference_check CHECK (((season_preference IS NULL) OR (season_preference = ANY (ARRAY['indoor'::text, 'outdoor'::text, 'both'::text, 'offseason'::text]))));
alter table public.athletes add constraint athletes_training_context_check CHECK ((training_context = ANY (ARRAY['independent'::text, 'coach_team'::text])));
alter table public.athletes add constraint athletes_training_goal_length_check CHECK (((training_goal IS NULL) OR (char_length(training_goal) <= 500)));
alter table public.athletes add constraint athletes_user_id_key UNIQUE (user_id);
alter table public.billing_subscriptions add constraint billing_subscriptions_audience_check CHECK ((audience = ANY (ARRAY['athlete'::text, 'coach'::text])));
alter table public.billing_subscriptions add constraint billing_subscriptions_beneficiary_user_id_audience_key UNIQUE (beneficiary_user_id, audience);
alter table public.billing_subscriptions add constraint billing_subscriptions_billing_cycle_check CHECK ((billing_cycle = ANY (ARRAY['monthly'::text, 'annual'::text])));
alter table public.billing_subscriptions add constraint billing_subscriptions_billing_type_check CHECK ((billing_type = ANY (ARRAY['individual'::text, 'coach_sponsored'::text])));
alter table public.billing_subscriptions add constraint billing_subscriptions_pending_billing_cycle_check CHECK (((pending_billing_cycle IS NULL) OR (pending_billing_cycle = ANY (ARRAY['monthly'::text, 'annual'::text]))));
alter table public.billing_subscriptions add constraint billing_subscriptions_pending_billing_type_check CHECK (((pending_billing_type IS NULL) OR (pending_billing_type = ANY (ARRAY['individual'::text, 'coach_sponsored'::text]))));
alter table public.billing_subscriptions add constraint billing_subscriptions_pkey PRIMARY KEY (id);
alter table public.billing_subscriptions add constraint billing_subscriptions_status_check CHECK ((status = ANY (ARRAY['pending_payment'::text, 'trialing'::text, 'active'::text, 'past_due'::text, 'cancel_at_period_end'::text, 'cancelled'::text, 'expired'::text])));
alter table public.billing_transitions add constraint billing_transitions_audience_check CHECK ((audience = ANY (ARRAY['athlete'::text, 'coach'::text])));
alter table public.billing_transitions add constraint billing_transitions_direction_check CHECK ((direction = ANY (ARRAY['upgrade'::text, 'downgrade'::text, 'neutral'::text])));
alter table public.billing_transitions add constraint billing_transitions_idempotency_key_key UNIQUE (idempotency_key);
alter table public.billing_transitions add constraint billing_transitions_pkey PRIMARY KEY (id);
alter table public.billing_transitions add constraint billing_transitions_status_check CHECK ((status = ANY (ARRAY['requested'::text, 'awaiting_payment'::text, 'awaiting_provider'::text, 'scheduled'::text, 'applied'::text, 'cancelled'::text, 'failed'::text])));
alter table public.billing_transitions add constraint billing_transitions_timing_check CHECK ((timing = ANY (ARRAY['immediate'::text, 'period_end'::text])));
alter table public.billing_transitions add constraint billing_transitions_transition_type_check CHECK ((transition_type = ANY (ARRAY['plan_change'::text, 'payer_change'::text, 'cancel'::text, 'reactivate'::text])));
alter table public.coach_access_applications add constraint coach_access_applications_access_tier_check CHECK (((access_tier IS NULL) OR (access_tier = ANY (ARRAY['core'::text, 'intelligence'::text, 'mw_sprint_performance'::text]))));
alter table public.coach_access_applications add constraint coach_access_applications_athlete_count_check CHECK (((athlete_count IS NULL) OR ((athlete_count >= 1) AND (athlete_count <= 5000))));
alter table public.coach_access_applications add constraint coach_access_applications_decision_mode_check CHECK (((decision_mode IS NULL) OR (decision_mode = ANY (ARRAY['automatic'::text, 'manual'::text]))));
alter table public.coach_access_applications add constraint coach_access_applications_payment_status_check CHECK ((payment_status = ANY (ARRAY['not_ready'::text, 'ready'::text, 'checkout_started'::text, 'paid'::text, 'failed'::text, 'refunded'::text])));
alter table public.coach_access_applications add constraint coach_access_applications_pkey PRIMARY KEY (id);
alter table public.coach_access_applications add constraint coach_access_applications_sponsored_seats_check CHECK (((sponsored_athlete_seats >= 0) AND (sponsored_athlete_seats <= 5000)));
alter table public.coach_access_applications add constraint coach_access_applications_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text, 'invited'::text, 'activated'::text])));
alter table public.coach_access_applications add constraint coach_access_applications_verification_score_check CHECK (((verification_score IS NULL) OR ((verification_score >= 0) AND (verification_score <= 100))));
alter table public.coach_access_applications add constraint coach_access_applications_verification_status_check CHECK ((verification_status = ANY (ARRAY['pending'::text, 'auto_approved'::text, 'needs_review'::text, 'approved'::text, 'denied'::text])));
alter table public.coach_access_entitlements add constraint coach_access_entitlements_access_source_check CHECK ((access_source = ANY (ARRAY['paid'::text, 'internal_test'::text])));
alter table public.coach_access_entitlements add constraint coach_access_entitlements_access_tier_check CHECK ((access_tier = ANY (ARRAY['core'::text, 'intelligence'::text, 'mw_sprint_performance'::text])));
alter table public.coach_access_entitlements add constraint coach_access_entitlements_pkey PRIMARY KEY (coach_user_id);
alter table public.coach_access_entitlements add constraint coach_access_entitlements_status_check CHECK ((status = ANY (ARRAY['active'::text, 'paused'::text, 'revoked'::text])));
alter table public.coach_assignments add constraint coach_assignments_coach_user_id_athlete_id_status_key UNIQUE (coach_user_id, athlete_id, status);
alter table public.coach_assignments add constraint coach_assignments_pkey PRIMARY KEY (id);
alter table public.coach_invitations add constraint coach_invitations_billing_type_check CHECK ((billing_type = ANY (ARRAY['self_pay'::text, 'coach_sponsored'::text])));
alter table public.coach_invitations add constraint coach_invitations_email_delivery_check CHECK ((email_delivery_status = ANY (ARRAY['not_sent'::text, 'sent'::text, 'failed'::text])));
alter table public.coach_invitations add constraint coach_invitations_pkey PRIMARY KEY (id);
alter table public.coach_invitations add constraint coach_invitations_sponsor_price_check CHECK (((sponsor_price_cents IS NULL) OR (sponsor_price_cents >= 0)));
alter table public.coach_invitations add constraint coach_invitations_sponsor_tier_check CHECK (((sponsor_access_tier IS NULL) OR (sponsor_access_tier = ANY (ARRAY['core'::text, 'intelligence'::text, 'mw_sprint_performance'::text]))));
alter table public.coach_sponsor_seats add constraint coach_sponsor_seats_package_id_seat_number_key UNIQUE (package_id, seat_number);
alter table public.coach_sponsor_seats add constraint coach_sponsor_seats_pkey PRIMARY KEY (id);
alter table public.coach_sponsor_seats add constraint coach_sponsor_seats_seat_number_check CHECK ((seat_number > 0));
alter table public.coach_sponsor_seats add constraint coach_sponsor_seats_status_check CHECK ((status = ANY (ARRAY['available'::text, 'invited'::text, 'claimed'::text, 'active'::text, 'scheduled_to_end'::text, 'ended'::text])));
alter table public.coach_sponsorship_packages add constraint coach_sponsorship_packages_check CHECK (((coach_application_id IS NOT NULL) OR (coach_user_id IS NOT NULL)));
alter table public.coach_sponsorship_packages add constraint coach_sponsorship_packages_coach_price_cents_check CHECK ((coach_price_cents >= 0));
alter table public.coach_sponsorship_packages add constraint coach_sponsorship_packages_pkey PRIMARY KEY (id);
alter table public.coach_sponsorship_packages add constraint coach_sponsorship_packages_requested_seats_check CHECK (((requested_seats >= 0) AND (requested_seats <= 5000)));
alter table public.coach_sponsorship_packages add constraint coach_sponsorship_packages_seat_price_cents_check CHECK ((seat_price_cents >= 0));
alter table public.coach_sponsorship_packages add constraint coach_sponsorship_packages_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'checkout_started'::text, 'active'::text, 'past_due'::text, 'cancel_at_period_end'::text, 'cancelled'::text])));
alter table public.membership_entitlements add constraint membership_entitlements_pkey PRIMARY KEY (id);
alter table public.membership_entitlements add constraint membership_entitlements_source_email_normalized_key UNIQUE (source, email_normalized);
alter table public.membership_entitlements add constraint membership_entitlements_status_check CHECK ((status = ANY (ARRAY['active'::text, 'trialing'::text, 'cancelled'::text, 'paused'::text, 'past_due'::text, 'refunded'::text, 'expired'::text])));
alter table public.membership_plans add constraint membership_plans_annual_price_cents_check CHECK ((annual_price_cents >= 0));
alter table public.membership_plans add constraint membership_plans_audience_check CHECK ((audience = ANY (ARRAY['athlete'::text, 'coach'::text])));
alter table public.membership_plans add constraint membership_plans_monthly_price_cents_check CHECK ((monthly_price_cents >= 0));
alter table public.membership_plans add constraint membership_plans_pkey PRIMARY KEY (plan_code);
alter table public.membership_plans add constraint membership_plans_sponsored_athlete_price_check CHECK (((sponsored_athlete_price_cents IS NULL) OR (sponsored_athlete_price_cents >= 0)));
alter table public.onboarding_journeys add constraint onboarding_journeys_assessment_status_check CHECK ((assessment_status = ANY (ARRAY['not_started'::text, 'in_progress'::text, 'completed'::text, 'not_required'::text])));
alter table public.onboarding_journeys add constraint onboarding_journeys_audience_check CHECK ((audience = ANY (ARRAY['athlete'::text, 'coach'::text])));
alter table public.onboarding_journeys add constraint onboarding_journeys_channel_check CHECK ((channel = ANY (ARRAY['website'::text, 'ios'::text, 'android'::text])));
alter table public.onboarding_journeys add constraint onboarding_journeys_check CHECK (((user_id IS NOT NULL) OR (coach_application_id IS NOT NULL)));
alter table public.onboarding_journeys add constraint onboarding_journeys_payment_status_check CHECK ((payment_status = ANY (ARRAY['not_started'::text, 'not_ready'::text, 'ready'::text, 'checkout_started'::text, 'paid'::text, 'failed'::text, 'refunded'::text])));
alter table public.onboarding_journeys add constraint onboarding_journeys_pkey PRIMARY KEY (id);
alter table public.onboarding_journeys add constraint onboarding_journeys_sponsored_athlete_seats_check CHECK (((sponsored_athlete_seats >= 0) AND (sponsored_athlete_seats <= 5000)));
alter table public.onboarding_journeys add constraint onboarding_journeys_status_check CHECK ((status = ANY (ARRAY['in_progress'::text, 'blocked'::text, 'completed'::text, 'cancelled'::text])));
alter table public.onboarding_journeys add constraint onboarding_journeys_verification_status_check CHECK ((verification_status = ANY (ARRAY['not_required'::text, 'pending'::text, 'auto_approved'::text, 'needs_review'::text, 'approved'::text, 'denied'::text])));
alter table public.profiles add constraint profiles_pkey PRIMARY KEY (user_id);
alter table public.team_members add constraint team_members_member_role_check CHECK ((member_role = ANY (ARRAY['coach'::text, 'athlete'::text])));
alter table public.team_members add constraint team_members_pkey PRIMARY KEY (id);
alter table public.team_members add constraint team_members_team_id_user_id_key UNIQUE (team_id, user_id);
CREATE UNIQUE INDEX coach_assignments_one_active_per_pair ON public.coach_assignments USING btree (coach_user_id, athlete_id) WHERE (status = 'active'::mw_assignment_status);
CREATE OR REPLACE FUNCTION private.mw_authenticated_uid()
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_uid uuid:=auth.uid(); v_claims jsonb:=auth.jwt(); v_session uuid;
begin
  -- Only server credentials may intentionally use a non-user session.
  if v_claims->>'role'='service_role' then return v_uid; end if;
  if v_uid is null then return null; end if;
  begin v_session:=nullif(v_claims->>'session_id','')::uuid;
  exception when invalid_text_representation then return null; end;
  if v_session is null then return null; end if;
  if exists(select 1 from auth.sessions s where s.id=v_session and s.user_id=v_uid
    and (s.not_after is null or s.not_after>now())) then return v_uid; end if;
  return null;
end $function$;

create function private.mw_coach_sponsored_billing_enabled(uuid) returns boolean language sql as $$select false$$;
create function private.mw_sync_sponsor_seats(uuid) returns void language plpgsql as $$begin return; end$$;
create function public.mw_apply_due_billing_transitions(uuid) returns void language plpgsql as $$begin return; end$$;
grant usage on schema auth,private,public to authenticated;

