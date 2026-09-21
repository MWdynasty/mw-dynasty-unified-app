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
