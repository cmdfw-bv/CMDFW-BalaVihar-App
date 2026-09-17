---
name: privacy-rules
description: Use when handling any minors' data, PII, consent, notifications, error reporting, or third-party calls — the privacy/compliance rules for the CMDFW Bala Vihar app.
---

# Privacy & compliance rules

Authoritative detail: `.docs/3_ARCHITECTURE.md` §3 (residency) and §11 (security/compliance).

## Hard rules
- **US residency:** every PII-touching service is US-region under DPA (Supabase, SES, Sentry, functions). No data leaves the US perimeter. No ad/marketing/analytics trackers.
- **Data minimization:** collect the minimum on minors; minimal columns; PII-free push payloads; scrub PII from Sentry before capture.
- **No minor self-registration** — accounts provisioned by coordinator/admin (COPPA).
- **Consent:** captured by the organization at registration, **outside the app** (ADR-2026-09-15). The app neither captures nor separately checks consent — enrollment is the consent signal and RLS enforces it. `consents` is inert and not writable by `authenticated`. **If you are adding any photo/video/file surface for a child, this decision reopens** — see the ADR's triggers.
- **Audit (`audit_log`):** append-only entry on every access to a minor's record.
- **Retention:** retention fields + scheduled deletion job; policy needs org + legal sign-off before finalizing.

## Chat (minors) — gate before shipping (§9.4)
who-may-chat-whom (default adult↔adult; no open student DMs) · moderation/report · retention. These bound the RLS on `realtime.messages`.

## Secrets
Service-role / VAPID-private / SES creds only in `netlify/functions/` env — never client, never Git. The secret-scan hook enforces this.
