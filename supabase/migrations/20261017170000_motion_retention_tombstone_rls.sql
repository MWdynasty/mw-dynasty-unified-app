-- Staging-only Motion Intelligence privacy hardening.
-- A deleted assessment is a short-lived tombstone to defeat late signed uploads.
-- Keep it invisible to athlete Data API reads while maintenance removes the object.
DROP POLICY IF EXISTS "motion athlete read own" ON public.motion_assessments;
CREATE POLICY "motion athlete read own" ON public.motion_assessments
 FOR SELECT TO authenticated
 USING (
   status <> 'deleted'
   AND EXISTS (
     SELECT 1 FROM public.athletes a
     WHERE a.id=motion_assessments.athlete_id
       AND a.user_id=(SELECT auth.uid())
   )
 );

DROP POLICY IF EXISTS "motion athlete read own asset metadata" ON public.motion_assets;
CREATE POLICY "motion athlete read own asset metadata" ON public.motion_assets
 FOR SELECT TO authenticated
 USING (
   EXISTS (
     SELECT 1 FROM public.motion_assessments m
     JOIN public.athletes a ON a.id=m.athlete_id
     WHERE m.id=motion_assets.assessment_id
       AND m.status <> 'deleted'
       AND a.user_id=(SELECT auth.uid())
   )
 );

DROP POLICY IF EXISTS "motion athlete read own findings" ON public.motion_findings;
CREATE POLICY "motion athlete read own findings" ON public.motion_findings
 FOR SELECT TO authenticated
 USING (
   EXISTS (
     SELECT 1 FROM public.motion_assessments m
     JOIN public.athletes a ON a.id=m.athlete_id
     WHERE m.id=motion_findings.assessment_id
       AND m.status <> 'deleted'
       AND a.user_id=(SELECT auth.uid())
   )
 );

CREATE INDEX IF NOT EXISTS motion_assessments_retention_created_idx
 ON public.motion_assessments(created_at);
CREATE INDEX IF NOT EXISTS motion_assessments_deleted_created_idx
 ON public.motion_assessments(created_at) WHERE status='deleted';
CREATE INDEX IF NOT EXISTS motion_upload_intents_pending_expiry_idx
 ON public.motion_upload_intents(expires_at) WHERE status='pending';
