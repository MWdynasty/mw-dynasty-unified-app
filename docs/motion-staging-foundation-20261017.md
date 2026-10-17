# Motion Intelligence staging foundation — 2026-10-17

The migration `motion_intelligence_pilot_private_foundation` was applied **only** to Supabase staging project `uuggbmccnyswiwkjgydo`. Production remains unchanged.

Objects verified: public.motion_assessments, public.motion_assets, public.motion_findings, and private bucket `motion-private`.

### Security choices
- Assessment SELECT/INSERT limited to logged-in athlete's `athletes.user_id`. Only draft creation directly from the client.
- Assets/findings readable only to the corresponding athlete. No client write policies.
- No bucket upload/download policies added: upload and streaming must be gated by a future authenticated server function with verified account entitlement, consent and signed operations.
- No cross-team coach reads are permitted yet. These must be introduced only after reviewed coach-assignment checks.
- Deliberately no video capture, uploading or inference is enabled in production.
- Child/guardian notice, consent rules, retention and deletion must be approved before collecting actual athlete footage.

### Validation to complete
Staging RLS tests using separate authenticated athlete and coach identities, file-path traversal attempts, API upload denial, video deletion, immutable status transitions, rate-limit and retry behavior. Database schemas and bucket existence alone do NOT prove the end-to-end pipeline.

### Rollback
The staging objects can be removed through a reviewed reverse migration if no production or pilot data is present; NEVER drop a live table/bucket without data inventory and backup verification.
