# MW Dynasty Company Security Control Framework

## Purpose

MW Dynasty treats security as a company-wide operating system, not as a feature of one application. Every production surface must preserve the CIA triad and must have preventive, detective, corrective, and compensating controls.

This standard applies to the public website, Athlete app, Coach app, Founder OS, native app shell, unified API, Supabase database, billing/entitlements, AI services, messaging, and company operations.

## CIA triad

### Confidentiality

Only authorized identities, roles, relationships, and services may access protected data. MW Dynasty uses authentication, server-side role and entitlement checks, Row Level Security, Founder-only authorization, secret environment variables, sanitized telemetry, least-privilege RPCs, and fail-closed access decisions.

### Integrity

Authoritative state is decided on the server/database, not by browser claims. Billing, membership access, program state, approvals, coach-athlete relationships, attendance, and consequential Founder actions must use validated server-side paths. Failed writes are never blindly replayed.

### Availability

The system should survive transient provider, network, authentication, or deployment failures without turning availability failures into security failures. Safe reads may retry. Sessions can refresh. Previously loaded shells can remain available. State-changing actions require live confirmation.

## Control families

### Preventive controls

Prevent or reduce the chance of an incident. Examples include RLS, authorization, security headers, entitlement gates, request limits, input validation, role separation, and offline write blocking.

### Detective controls

Identify incidents and drift. Examples include launch diagnostics, public website health signals, API failures, audit logs, security incidents, Founder risk registers, launch gates, billing-integrity checks, and the Founder Security & Audit control plane.

### Corrective controls

Restore safe operation after a failure. Examples include session refresh, reconnect logic, billing transition reconciliation, recovery signals that close availability incidents, and controlled retry of safe reads.

### Compensating controls

Provide a safe alternate control when the primary control or dependency is unavailable. Examples include cached read-only shells, fail-closed authorization, human Founder approval, no automatic write replay, AI-independent core product operation, and preserving valid sessions during provider outages.

## Non-negotiable design rules

1. Fail closed for authorization and payment/entitlement decisions.
2. Never use availability recovery to bypass confidentiality or integrity controls.
3. Retry safe reads only. Never blindly replay consequential writes.
4. Do not grant access from client-side claims alone.
5. AI is never the sole authority for payments, pricing, contracts, destructive actions, production deployment, or official MW methodology.
6. Security telemetry must not record passwords, auth tokens, payment credentials, message content, private images, or other unnecessary sensitive content.
7. Every production platform must have at least one active preventive, detective, corrective, and compensating control.
8. Open security incidents and risks remain visible until resolved, accepted, or explicitly retired.
9. Security changes must remain reproducible in version-controlled migrations/configuration.
10. A control that is not currently enforced must be marked degraded or planned; it must not be represented as active.

## Control plane

The canonical implementation registry is the Supabase table `public.company_security_controls`. The live incident register is `public.security_incidents`. Founder OS Security & Audit consumes `mw_founder_security_snapshot()` and `mw_founder_security_controls_snapshot()`.

The registry currently covers:

- website
- athlete_app
- coach_app
- founder_os
- api
- database
- billing
- ai
- messaging
- native_app
- company_ops

Each platform is required to show active coverage across all four control families.

## Incident lifecycle

Sanitized app diagnostics are written to `launch_diagnostics`. Warning/error signals can be promoted to `security_incidents` through `mw_security_event_from_diagnostic()`. Recovery signals can resolve availability incidents automatically. Founder OS remains the executive review point for unresolved or recurring incidents.

## Degraded controls

A degraded control is intentionally visible and is not treated as complete coverage. As of the introduction of this framework, Supabase leaked-password protection is tracked as degraded until the provider-level Auth setting is enabled and verified.

## Change management

Any new platform, payment path, privileged role, AI action, data domain, or external provider must be added to the control registry before production launch. Changes to authentication, authorization, billing, RLS, security headers, diagnostics, or recovery logic must pass the automated security baseline test and production deployment checks.


## Operational resilience architecture — implementation specification (proposed, not yet deployed)

This section defines acceptance criteria for a **company-wide** fault-tolerance and compensating-control program. Existing features described earlier in this framework are a baseline, **not evidence of complete failover**. Each capability must be verified in production-like failure-injection tests before it is marked active.

### Service objectives and critical user journeys

| Critical journey | Normal path | Safe degraded behavior | Never allowed |
|---|---|---|---|
| Founder sign-in and Command Center | Auth + Founder role + live APIs | Retain a *still valid, already verified* session during transient failures; show incident status and last-known non-sensitive summaries where safe | Auth bypass, privileged actions on cached data, exposure of another account |
| Coach sign-in, roster and practice | Auth + entitlement + team-scoped data | Retry safe reads, display previously loaded *account-scoped* schedule and draft timing notes if explicitly enabled | Unverified coach access, cross-team data, automatic replay of a completed practice |
| Athlete training | Auth + athlete-scoped plan and logs | Show previously verified, account-scoped training reference in read-only mode with freshness label | Mark workouts complete without server acknowledgment |
| Public site | Vercel site and APIs | Serve versioned public static informational pages and status banner | Cache or expose authenticated profile/payment content |
| Memberships and billing | Stripe + server webhook + database entitlement | Keep existing *server-verified* entitlements within their authorized period; show billing temporarily unavailable; reconcile events when provider recovers | Grant new paid access from browser claims or a failed webhook |
| Coach MW AI | AI service + authorized context | Core workout/practice tools remain available without AI; display service status | AI pretending it executed a change, using unverified or cross-account context |
| Messaging and notifications | Auth + scoped database + push | Safe locally drafted messages may remain unsent, visibly labeled, until user submits after recovery | Silently sending duplicates or leaking messages |
| Founder actions / program controls | Authorized server mutation + audit | Read-only inspection and queued **approval requests** only if separately authorized and deduplicated | Offline execution of destructive, financial, access-changing, or irreversible actions |

### Mandatory shared resilience components

1. **Health and dependency probes.** Separate probes for public-site delivery, app shell, auth, authenticated access checks, Supabase reads/writes, payment webhooks, AI, and notifications. Probes must not expose credentials or private user data.
2. **Circuit breakers and bounded retry.** Use timeouts, jittered exponential backoff and request budgets for safe/idempotent operations. A circuit breaker opens on sustained failures, moves to half-open probes, then closes only after healthy responses. Never retry a non-idempotent write without a server-enforced idempotency key.
3. **Session continuity.** Treat the authenticated user identity, token/session rotation, and workspace authorization as separate concerns. Same-user sign-in or token refresh must not be treated as an account switch. Real account switches must clear the previous user's private state. Expired or unverified sessions must not unlock private data.
4. **Account-scoped offline references.** Cache only deliberately classified content; encrypt sensitive device storage where supported; bind each cache to user ID and organization/team ID; label freshness and offline mode. Wipe inaccessible data on sign-out or account change. Never cache bearer tokens in service-worker caches or share cached data between tenants.
5. **Mutation protection.** Block offline consequential writes by default. For explicitly approved low-risk operations, use server-side idempotency keys, authenticated ownership checks, a durable operation state machine, and reconciliation. Show pending/failed/confirmed distinctly. No optimistic success for payments, access, attendance, or training completion.
6. **Independent monitoring and alert delivery.** At least one external synthetic monitor must check critical journeys from outside the primary hosting/data provider. Incident alerts must be deliverable without relying solely on the failed application or its database. Define owners, escalation, and customer communications.
7. **Versioned rollback and disaster recovery.** Keep a last-known-good deployment and documented rollback procedure. Back up database state with tested restore and point-in-time recovery where supported. Test recovery in an isolated environment; never assume a backup is restorable.
8. **Founder incident cockpit.** Surface dependency, affected journeys, detection time, severity, last successful probe, degraded controls, recovery action, verification status, and audit evidence. An AI recommendation is not proof that a recovery action occurred.
9. **Explicit service modes.** Each surface exposes NORMAL, DEGRADED_READ_ONLY, OFFLINE_REFERENCE, and UNAVAILABLE states as applicable. A security incident may force UNAVAILABLE even if an offline shell exists. A cached shell is not a second live backend.

### Implementation sequence and launch gates

**P0 — Fix authentication loop and instrument it.**
- Regression tests: same user signs in with a new session ID; refresh-token rotation; founder/coach/athlete workspace handoff; different-user switch; simultaneous tabs; sign-out; expired session; unauthorized coach and founder.
- Emit sanitized failure codes for login success followed by access denial, missing stored session, repeated redirects, token refresh failure, and server 5xx. Never log passwords, tokens, email addresses, or private profile content.
- No production rollout without verified role isolation and a real-browser login test.

**P1 — Shared runtime controls.**
- Add centralized dependency health, bounded retry/circuit breakers, a consistent degraded-mode UI, and reliable detection of recoverable vs authorization errors.
- Review service-worker exclusions: current worker bypasses Coach and Founder paths; offline fallback for those paths is **not** currently established. Do not enable private-page caching without an explicit security review.
- Test forced 401, 403, 429, 500, 503, lost connectivity, partial Supabase outage, and deployment failure.

**P2 — Business continuity.**
- Provide secure offline reference views for selected athlete and coach training content, while keeping consequential writes disabled until reconnection.
- Add Stripe webhook reconciliation, AI-independent workflow fallbacks, backup/restore exercises, and deployment rollback rehearsals.
- Define and approve measurable recovery time objective (RTO), recovery point objective (RPO), and availability targets for each critical journey before claiming resilience.

**P3 — Founder control plane and chaos testing.**
- Integrate live monitors, incident triage, approvals, auditable remediation and post-recovery verification into Founder OS.
- Run controlled fault-injection drills at least quarterly: auth unavailable, database read outage, payment webhook delayed, AI provider unavailable, stale client build, and full hosting outage.
- Mark a control ACTIVE only with dated test evidence, accountable owner, verified fallback, and observed recovery; otherwise mark PLANNED or DEGRADED.

### Release criteria

No platform is declared fully fault tolerant merely because a cached page opens or a retry exists. Release requires: (a) authorized access preserved or denied correctly; (b) no cross-tenant exposure; (c) no lost or duplicated consequential writes; (d) an explicit user-visible degraded state; (e) alerts that work during the primary outage; (f) a tested rollback/restore path; and (g) recorded recovery evidence.
