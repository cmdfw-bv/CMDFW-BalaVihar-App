# ADR-0019: Minors'-record read-audit mechanism — hybrid RPC for cross-scope reads

**Status:** Closed · **Date:** 2026-07-08 · **Deciders:** Project owner + architect
**Governs:** System → `core-schema-and-rls` (`.docs/specs/System/core-schema-and-rls.md`). Resolves the brief's flagged open question: constitution non-negotiable #6 requires an `audit_log` entry on **every access** to a minor's record (doc 3 §6.2, §11.2), but native Postgres triggers cannot fire on `SELECT` — a real mechanism decision was needed before `/design`.

### Context
`audit_log` (append-only: actor, action, target, timestamp) is already specified as a table in doc 3 §6.2, but nothing in `3_ARCHITECTURE.md` or the `rls-patterns` skill says *how* a read gets captured, since triggers only fire on write. Left unresolved, `/design` would either under-deliver (mutations-only, silently missing the "every access" requirement) or over-deliver (restructure every read in the app through a wrapper, at real cost to a 3-non-technical-volunteer-maintainer team).

### Options Considered
- **Full RPC/view wrapper for all minors'-record reads**, including a parent viewing their own child — Pros: fullest, least-ambiguous compliance interpretation of "every access." Cons: forces every screen touching `students`/`attendance`/`consents` — including the highest-volume, lowest-risk case (parent/student viewing their own data) — off the plain Supabase `.from(table).select()` pattern used everywhere else; more code, more surface, avoidable overhead for a case that isn't the compliance concern in practice.
- **Defer read-auditing; audit mutations only for the POC** — Pros: cheapest, uses plain triggers, no new pattern. Cons: does not satisfy the literal "every access" requirement at all — a real, not cosmetic, compliance gap for a system holding minors' data; rejected as too weak given non-negotiable #6.
- **Hybrid — RPC-wrapped audit only for cross-scope reads** (chosen) — Pros: audits the actual risk case (a Teacher/Coordinator/BV Coordinator/Admin viewing a child who is not themself/their own) atomically — the security-definer function checks scope and writes the `audit_log` row in the same transaction as the read, so it can't be bypassed once direct table grants are revoked for those roles. Parent/Student self-scope reads keep the plain RLS-scoped `select` — no overhead on the common case, and self-access isn't the oversight concern the audit trail exists for. Cons: two read pathways for the same tables depending on caller role, which `/design` must keep unambiguous, and direct table `select` must be verifiably revoked for staff roles beyond their own scope or the RPC requirement is just cosmetic.

### Decision
For the minors'-data tables (`students`, `attendance`, `consents`):
- **Parent (own-children) and Student (self) reads** use plain RLS-scoped `select` — unaudited by design; this is the subject/subject's-own-parent viewing their own data, not the oversight case `audit_log` exists to cover.
- **Teacher / Coordinator / BV Coordinator / Admin reads** (i.e. any role viewing a record it does not own by self/parent scope) go through a **security-definer RPC** that (a) applies the identical scope check RLS would, and (b) inserts the `audit_log` row in the same transaction as the read. Direct table `select` grants for these roles are **revoked** beyond their own row-ownership case, so the RPC path cannot be bypassed.

### Consequences
- `/design` for `core-schema-and-rls` must specify: the exact RPC function signatures per table/role (e.g. a staff-facing "get student record" / "get class attendance" function), the grant/revoke matrix per role, and audit granularity (one `audit_log` row per record returned vs. per query call).
- Staff-facing screens (Teacher roster, Coordinator/BV Coordinator/Admin dashboards) call these RPCs instead of a generic `.from(table).select()`; Parent/Student screens are unaffected and keep the simple pattern.
- The adversarial pgTAP suite (core-schema-and-rls acceptance criterion #9) must additionally prove: the RPC path logs on every staff read; direct `select` is actually revoked for staff roles beyond self/parent scope (not just conventionally avoided); and Parent/Student paths correctly remain un-audited (an intentional scope boundary, not a leak).
- **Residual risk:** if legal/compliance later requires auditing parent/self reads too, that's a follow-up ADR extending the RPC pattern to those roles — not assumed here.
