# ADR-0003: Access control enforced at the database layer (RLS)

**Status:** Closed · **Date:** 2026-06-16 · **Deciders:** Project owner + architect

### Context
Minors' data must be protected even if app code has a bug. Access spans multiple personas and scopes (own-children → class → session → org).

### Options Considered
- **Database-layer RLS (authoritative)** — Pros: a bug in client/app code cannot leak rows; declarative, auditable; one enforcement point. Cons: requires disciplined policy design + adversarial tests.
- **Application-layer checks** — Pros: familiar. Cons: every code path must re-implement checks; one missed check = a leak of minors' data. Rejected.

### Decision
**RLS in the database is the single source of truth for access.** App code may hide/show UI but never grants access.

### Consequences
Every table is RLS-on; policies key off JWT claims (ADR-0004). Adversarial role × scope tests are a merge/deploy gate (3_ARCHITECTURE §11.3, §12.4).
