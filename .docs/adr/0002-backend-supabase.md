# ADR-0002: Backend — Supabase (Postgres/RLS), pinned to a US region

**Status:** Closed · **Date:** 2026-06-16 · **Deciders:** Project owner + architect

### Context
The app handles minors' data: it needs DB-enforced per-row access (ADR-0003), US data residency, low/predictable cost, and low ops burden for volunteers. Verified live: Supabase pins an exact US AWS region (fixed at creation).

### Options Considered
- **Supabase (Postgres + RLS)** — Pros: declarative, DB-enforced, auditable RLS; Postgres+SQL+TS maximally AI-legible; managed (low ops); US region; free at pilot. Cons: realtime quotas to watch at scale.
- **Firebase** — Pros: managed, large corpus. Cons: doc-level rules, "rules are not filters," **server SDKs bypass rules** — wrong trade for auditable minors' data.
- **Convex** — Pros: TS-native, managed. Cons: code-based authz in functions, not row-level; newer/smaller corpus.
- **Self-host Postgres** — Pros: full control + RLS. Cons: ops burden on volunteers (backups/DR/patching) — fails the maintainer criterion.

### Decision
Adopt **Supabase (Postgres + RLS), pinned to a US AWS region**. It is the only option taking both highest-weighted criteria (per-row access for minors + AI-legibility) while staying managed and US-resident.

### Consequences
RLS is the access-control engine (ADR-0003); multi-role via the auth hook (ADR-0004). Sign DPA, pin US region. See 3_ARCHITECTURE §5–§6.
