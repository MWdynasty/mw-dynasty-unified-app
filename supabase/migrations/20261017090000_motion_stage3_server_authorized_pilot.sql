-- Motion Intelligence Stage 3: server-authorized recording pilot (staging only).
-- Edge function holds service credentials; no direct client writes or storage access.
ALTER TABLE public.motion_assessments DROP CONSTRAINT IF EXISTS motion_assessments_status_check;
ALTER TABLE public.motion_assessments ADD CONSTRAINT motion_assessments_status_check
 CHECK (status IN ('draft','uploaded','queued','processing','needs_better_video','analyzed','reviewed','failed','deleted'));

CREATE TABLE IF NOT EXISTS public.motion_upload_intents (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 assessment_id uuid NOT NULL UNIQUE REFERENCES public.motion_assessments(id) ON DELETE CASCADE,
 owner_user_id uuid NOT NULL REFERENCES auth.users(id),
 storage_path text NOT NULL UNIQUE,
 declared_mime text NOT NULL CHECK(declared_mime IN ('video/mp4','video/quicktime','video/webm')),
 declared_bytes bigint NOT NULL CHECK(declared_bytes BETWEEN 1 AND 104857600),
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','finalized','failed')),
 created_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL DEFAULT (now() + interval '2 hours'),
 finalized_at timestamptz
);
CREATE INDEX IF NOT EXISTS motion_upload_intents_owner_created ON public.motion_upload_intents(owner_user_id,created_at DESC);
ALTER TABLE public.motion_upload_intents ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.motion_upload_intents FROM PUBLIC, anon, authenticated;

CREATE TABLE IF NOT EXISTS public.motion_audit_events (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 actor_user_id uuid,
 assessment_id uuid,
 event_type text NOT NULL CHECK(length(event_type) BETWEEN 2 AND 64),
 details jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS motion_audit_events_assessment ON public.motion_audit_events(assessment_id,created_at DESC);
ALTER TABLE public.motion_audit_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.motion_audit_events FROM PUBLIC, anon, authenticated;

-- Centralize all upload, signed playback and deletion in the staging Edge function.
DROP POLICY IF EXISTS "motion_upload_owner_only" ON storage.objects;
DROP POLICY IF EXISTS "motion_download_owner_only" ON storage.objects;
DROP POLICY IF EXISTS "motion_cleanup_owner_draft" ON storage.objects;
DROP POLICY IF EXISTS "motion athlete create own" ON public.motion_assessments;
DROP POLICY IF EXISTS "motion_asset_metadata_create_owner" ON public.motion_assets;
REVOKE INSERT, UPDATE, DELETE ON public.motion_assessments FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.motion_assets FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.motion_findings FROM authenticated;
