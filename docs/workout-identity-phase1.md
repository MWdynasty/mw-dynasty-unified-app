# Phase 1: canonical track workout identity

Branch: `fix/canonical-workout-identity`.
Baseline: `067ce02d72d134a012e6c509a5c21bf76ee6cccf`.
No production database changes or deployments are part of this change.

## Contract

`lib/mw-workout-identity.js` is the single browser/Node implementation.
`public.mw_workout_identity_key` implements the same contract in PostgreSQL;
SQL integration tests check parity.

```
mw-workout-v1:<athlete-id>:season:<season-plan-id>:w<season-week>:d<day>:track
mw-workout-v1:<athlete-id>:cycle:<workout-cycle-id>:w<week>:d<day>:track
mw-workout-v1:<athlete-id>:mw-41:w<week>:d<day>:track
```

The dimensions are athlete, immutable season/cycle, season week, day, and workout
slot (`track` for the current single-track-session-per-day model). Other explicit
session keys are supported by the identity contract; Practice Mode uses `track`.
The coach timer's session UUID identifies a timing run and remains separate.
Master/source-program week is prescription metadata, not workout identity.

Existing planless programs retain the historical `mw-41` scope. The migration
adds `workout_cycle_id` to program state and the three track result tables.
New planless program-state rows get a cycle UUID. Changing a planless program's
start date, or leaving a season plan, rotates that cycle when the caller has not
already explicitly supplied a new cycle. A restart with an unchanged start date
must explicitly supply a new cycle UUID; it cannot be inferred from week/day.
Strength's existing `training_cycle_key` and strength progression are unchanged.

## Save and read flow

1. `/api/me` exposes the database cycle ID; athlete hydration retains it.
   The roster exposes the same state season/cycle ID to the coach.
2. Both clients call the shared identity factory for the same track slot.
3. The practice API reads current database state, rejects stale plan/cycle/week/day,
   and resolves legacy input aliases into the canonical identity. Its completion
   lock queries the requested athlete/week/day/keys and compares recorded scope.
4. Raw coach timing rows store that identity and cannot be reassigned to a different
   workout. The existing session/athlete/rep uniqueness remains intact.
5. `mw_coach_sync_practice_session_to_athlete` checks role, assignment, current
   program position, season ownership, and scope under a program-state row lock.
   It writes the validated canonical key to athlete reps and completion history.
6. Status and both track calendar refresh RPCs produce the same keys. Identity
   triggers normalize old REST-client aliases before uniqueness checks.
7. The athlete's completion reader and restored-rep reader resolve canonical and
   legacy rows from their recorded scope. Refreshing completions marks the
   coach-saved workout completed. The coach's browser lock uses the same resolver.

## Migration and compatibility

Migration: `supabase/migrations/20261002030901_canonical_workout_identity.sql`.
It is a transaction and is NOT applied by the test suite to any live service.
It retains record IDs, rep evidence, source metadata, completion dates, and
historical activity timestamps. Notification entity links are migrated too.

* `mw-season-<plan-id>-wN-dN` recovers its explicit season if the column is missing.
* `mw-track-wN-dN` with a season column belongs to that recorded season.
* Bare `mw-track-wN-dN` with no scope remains in `mw-41`; it is never assigned to
  the current plan/cycle by guessing from current program state.
* Readers reject athlete/key, week/day/key, and plan/cycle/key disagreement.
* New canonical records win over legacy rep aliases in the read adapter.
* Existing coach rows get scope only where already-linked athlete reps prove it.
  Previously disconnected coach timing rows are not guessed into a current plan.
* Duplicate completion aliases, or duplicate rep aliases for the same rep number,
  abort the whole migration. No row is silently dropped/merged. These require
  reviewed reconciliation before applying the migration.
* Previously overwritten legacy records cannot be reconstructed by identity alone.
* The bridge's old eight-argument signature is replaced with a nine-argument
  signature whose final cycle argument defaults to null. Season/legacy-cycle
  callers remain callable with eight arguments; new planless cycles require the
  cycle ID. Verify deployed consumers/dependencies before eventual application.
* Additive columns and triggers require the existing audited schema/migrations.
  The fixture is not a replacement for a complete production schema baseline.

An eventual release must coordinate migration and client/server rollout, then
refresh cached athlete shells. An old cached athlete reader still compares legacy
strings exactly and cannot read canonical keys after backfill. The service-worker
change only versions/pre-caches the new shared helper; it does not deploy it.
Do not apply this migration or release this branch until reviewed.

## Tests

```
npm test
```

Includes the existing ten scripts and `test-workout-identity.js`. The new test
executes the actual shipped athlete reader, coach helper, and practice API in
bounded fixtures, with no network requests to Supabase.

For actual PostgreSQL function/trigger tests, install the pinned in-memory test
engine outside the repository (no production runtime dependency):

```
npm install --prefix /tmp/mw-identity-tests --no-audit --no-fund @electric-sql/pglite@0.4.1
MW_IDENTITY_PGLITE_PATH=/tmp/mw-identity-tests/node_modules/@electric-sql/pglite npm run test:workout-identity-db
```

The database test loads `test-fixtures/workout-identity.sql`, the relevant original
practice/lifecycle migrations, and the new migration into disposable PGlite
PostgreSQL. It runs the real practice API through a database-backed transport fixture and
executes real SQL/PLpgSQL, role/assignment checks, table RLS for the fixture, coach replication, legacy upserts, cycle restarts, calendar/status
writers, and transaction rollback on conflicting aliases. Feature access is a
fixture dependency; production entitlement/RLS coverage is not claimed.

## Deliberately deferred

* Atomic finalization across raw timing, multiple athletes, and interpretation.
* Durable per-rep coach drafts, retry/correction/delete reconciliation.
* Shared authoritative prescription/calendar/event mapping and stale-state refresh.
* Partial-rep completion semantics, scoring/history rewriting, and target parsing.
* Live refresh between open applications and canonical evidence in Coach MW.
* Stripe, UI design, strength progression, and production deployment/schema work.

The identity failure is repaired, but the other items can still prevent a
complete or reliable Practice Mode session. A new migration cannot establish
that the live schema, policies, or Edge Functions already match this repository.
