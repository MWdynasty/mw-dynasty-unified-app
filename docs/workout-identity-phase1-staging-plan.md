# Phase 1 staging integration plan

Pinned implementation: `fix/canonical-workout-identity` @ `13ab5e86fc36d3f86d8e5bd66c8883971d8286aa`.
Baseline: `main` @ `067ce02d`.
This document prepares controlled staging work. It does not authorize production
migration, production deploy, or a merge to `main`.

## Environment status (as of this preparation)

| Surface | Status | Safe for Phase 1 migration / E2E writes? |
|---|---|---|
| Production Supabase `keqgunlfwhjgcsurynef` | Live app database; hardcoded default in clients | **No** |
| QA/preview Supabase `nktemtmsfhjcgjvkavrm` | Only selected when `MW_QA_PREVIEW` is true | **Not wired to this branch** |
| `MW_QA_PREVIEW` gate | Vercel preview **and** git ref `feature/season-intelligence-v1`, or hostname containing `-git-f-bc0584-` | Does **not** match `fix/canonical-workout-identity` |
| Vercel Preview for SHA `13ab5e86` | Exists (`Preview` deployment succeeded) | **No — it still talks to production Supabase** |
| This Cloud Agent VM | No `DATABASE_URL` / service-role / staging secrets | Cannot apply SQL or inventory live data |
| In-memory PGlite | Disposable; used for tests + inventory SQL proof | Yes, not a shared staging env |

**Conclusion:** the repository does **not** currently expose a safe isolated
Supabase that this branch will use. A Vercel Preview of Phase 1 is **not** an
isolated backend. Do not sign into that preview and save Practice results.

A dedicated staging project (or a restored snapshot clone of production) must be
provisioned, and the Phase 1 clients must be pointed at it explicitly, before
any migration is applied.

## Collision inventory

Live inventory was **not** run (no isolated database credentials).

Local proof of the inventory SQL in disposable PGlite (not live data):

- Clean pair (`mw-track-w3-d2` on old season + unscoped W1D1): `collision_group_count = 0`, `normalize_error_count = 0`.
- Dual alias on the same plan (`mw-track-w3-d2` + `mw-season-<P>-w3-d2` at W3D2): `collision_group_count = 1`, canonical_key `mw-workout-v1:<athlete>:season:<P>:w3:d2:track`. That is the abort case the migration must not apply through.

Exact read-only procedure:

1. Restore a **clone** of the target database (staging snapshot or temporary
   branch database). Do not use production.
2. Confirm `workout_completions.workout_key` has not already been rewritten to
   `mw-workout-v1:%` for the majority of rows (if it has, inventory is post-apply).
3. Run `scripts/workout-identity-collision-inventory.sql` as a **single
   read-only query**. It inlines the same plan/cycle recovery and alias rules as
   `private.mw_normalize_workout_key` in
   `supabase/migrations/20261002030901_canonical_workout_identity.sql`.
4. GO only if:
   - `completion_summary.collision_group_count = 0`
   - `rep_summary.collision_group_count = 0`
   - `completion_summary.normalize_error_count = 0`
   - `rep_summary.normalize_error_count = 0`
5. If collisions exist, stop. Reconcile reviewed aliases; do not let the
   migration merge them. The migration aborts the whole transaction on collision.

Optional exact-parity check on the clone (still no data writes if rolled back):

```sql
begin;
-- paste ONLY the CREATE FUNCTION block from the Phase 1 migration
-- (mw_workout_identity_key, mw_workout_record_plan/cycle, mw_normalize_workout_key)
-- then:
select athlete_id, private.mw_normalize_workout_key(athlete_id,season_plan_id,program_week,program_day,workout_key,nullif(to_jsonb(workout_completions)->>'workout_cycle_id','')::uuid) as canonical_key, count(*)
from public.workout_completions
where workout_key ~ '^mw-(track-w|season-|workout-v1:)'
group by 1,2
having count(*)>1;
rollback;
```

If `mw_normalize_workout_key` raises, that clone has mismatch rows; those also
block apply. Keep the `rollback`.

## Prerequisites / blockers

Must have before applying the migration:

1. Isolated Postgres that is **not** production (`keqgunlfwhjgcsurynef`).
2. Service-role or postgres URI for **that clone only**.
3. Collision inventory = 0 / 0.
4. Phase 1 web/API build pointed at the clone (do not use the current Vercel
   Preview, which uses production).
5. Two test accounts: assigned coach + athlete, plus a planless athlete.
6. Ability to create two season plans (or copy two plans) for the same athlete.
7. Coordinated cache refresh (`mw-dynasty-shell-v6-workout-identity`).
8. Notification deep-link bug accepted as known (do not treat as pass).

Blockers now:

- No isolated backend wired to this branch.
- No database credentials in this agent.
- Preview deployment would write production if used for Practice saves.

## Credentials: what would be required

| Need | Production? | Notes |
|---|---|---|
| Staging/clone Postgres URI or service role | No | Required to inventory and migrate |
| Staging anon/publishable key | No | Required for app E2E against the clone |
| Test coach + athlete passwords | No | Use dedicated staging users |
| Production service role | **Must not be used** | |
| Production user data copy | Optional | Only as a **restored clone**, never live |

Production data is **not** required if staging is seeded with synthetic
coach/athlete/season rows that cover the matrix. A production **snapshot clone**
is the only honest way to inventory real collision rates.

## Integration-test matrix

Do not cover Pace AI.

| ID | Flow | Setup | Pass condition |
|---|---|---|---|
| C1 | Coach saves Practice | Season athlete, current week/day incomplete | Row in `workout_completions` uses canonical season key; athlete Train shows that week/day completed; Progress shows COACH TIMED |
| A1 | Athlete saves Practice / Done | Same season slot if not locked | Coach roster `latest_workout` matches canonical key + week/day; Practice Mode shows WORKOUT COMPLETE |
| I1 | Shared identity | Compare athlete `workoutKey(w,d)` vs coach `coachPracticeIdentity(athlete)` | Exact string equality including athlete id + `season:<plan>` |
| H1 | Legacy `mw-track-wN-dN` | Seed unscoped completed W3D2; athlete on planless `mw-41` (`workout_cycle_id` null) | Athlete reader marks W3D2 complete; coach lock for a **season** athlete on W3D2 stays unlocked |
| H2 | Legacy `mw-season-<plan>-wN-dN` | Seed that key for plan P, possibly null `season_plan_id` | With active plan P, athlete reader shows complete; `fromRow` recovers plan from key |
| L1 | Old season cannot lock current | Seed completed W3D2 for plan OLD; current state plan P, W3D2 | Coach save of current W3D2 returns 200, not 409 `workout_already_completed` |
| S1 | Two seasons, same week/day | Completions for P and OLD at W3D2 | Two rows; different canonical keys; current reader only shows P |
| P1 | Planless `mw-41` | No season, null cycle | New writes use `...:mw-41:wN:dN:track` until a cycle is minted; unscoped history still reads |
| P2 | Cycle rotation | Leave season or change `start_date` | New `workout_cycle_id`; old `mw-41` / old cycle rows do not complete the new cycle |
| M1 | Migration collision abort | Clone with both `mw-track-w3-d2`+plan P and `mw-season-P-w3-d2` | Migration raises; original keys and timestamps unchanged |
| M2 | Migration happy path | Clone with no collisions | Keys rewritten; `last_activity_at` unchanged on key-only backfill; notifications `entity_id` rewritten |
| R1 | Clients after migration | Phase 1 athlete+coach against migrated clone | Load completions, save new workout, coach lock on that save |
| N1 | Notification deep-link (known fail) | Incomplete notification whose `entity_id` is canonical | Tap does **not** open Practice. Document only; do not fix unless approved |
| X1 | Unrelated | Strength / Stripe / Coach MW copy | Unchanged |

Suggested order on a clone: seed H1/H2/L1/S1 → run inventory → apply migration (only after GO) → R1/C1/A1/I1/P1/P2 → reproduce N1.

## Proposed staging migration procedure (do not run yet)

1. Create isolated project or restore snapshot. Record pre-image backup.
2. Run collision inventory. Stop if any collision or normalize error.
3. Deploy Phase 1 **clients and API** to a preview/host whose Supabase URL/key
   are the **clone** (requires a temporary, explicit config change or a new
   `MW_QA_PREVIEW` gate for this branch — not in this prep).
4. Smoke read-only: athlete load completions (pre-migration aliases still work
   with Phase 1 reader).
5. Apply
   `supabase/migrations/20261002030901_canonical_workout_identity.sql`
   **only on the clone**, in a maintenance window, as a single transaction
   (the file already wraps `begin;`).
6. Re-run inventory: expect `canonical_count` ≈ previous alias total,
   collision 0, leftover `mw-track` / `mw-season` near 0 for matched keys.
7. Execute matrix C1–R1 and N1.
8. Do not promote to production.

## Rollback

The migration rewrites keys, notification `entity_id`s, adds columns/triggers,
and **drops** the 8-argument
`mw_coach_sync_practice_session_to_athlete`. There is no down migration in
the repo.

Rollback on staging:

1. Restore the clone from the pre-image backup taken in step 1. This is the
   only complete rollback.
2. Point the test host back at the restored clone.
3. If only the app was deployed and the SQL was never applied, undeploy /
   stop using the Phase 1 host. Production `main` stays on `067ce02d`.

Do not attempt to reverse canonical keys in place without a backup.

## Notification deep-link (known, unfixed)

`athlete/index.html` `workout_incomplete` click handler parses only:

- `^mw-track-w(\d+)-d(\d+)$`
- `^mw-season-[0-9a-f-]+-w(\d+)-d(\d+)$`

After migration, `entity_id` becomes `mw-workout-v1:...:w3:d2:track`. Reproduce
with `node scripts/repro-workout-notification-deeplink.js`. Do not fix until
approved.

## GO / NO-GO for applying the staging migration **now**

**NO-GO.**

Reasons: no isolated Supabase is wired to this branch; this agent cannot reach a
clone; the existing Vercel Preview for `13ab5e86` would hit production; live
collision counts are unknown until the inventory is run on a clone.

Re-evaluate to GO only after: clone exists, inventory is clean, Phase 1 app is
pointed at that clone (not production), backup is verified.
