-- Staging-only Motion Intelligence adult pilot allowlist.
-- Admin/service role grants approval after independent age and consent review.
-- Public/athlete clients must not be able to self-approve.
CREATE TABLE IF NOT EXISTS public.motion_pilot_approvals (
 user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
 status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','revoked')),
 adult_verified_at timestamptz NOT NULL,
 approved_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL,
 approved_by uuid REFERENCES auth.users(id),
 consent_policy_version text NOT NULL DEFAULT 'pilot-v1',
 CHECK (expires_at > approved_at)
);
ALTER TABLE public.motion_pilot_approvals ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.motion_pilot_approvals FROM PUBLIC, anon, authenticated;
CREATE INDEX IF NOT EXISTS motion_pilot_approvals_active_expiry
 ON public.motion_pilot_approvals(status,expires_at);
