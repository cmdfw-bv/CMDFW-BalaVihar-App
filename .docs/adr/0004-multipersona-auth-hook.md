# ADR-0004: Multi-persona resolution via Postgres Custom Access Token Hook

**Status:** Closed · **Date:** 2026-06-16 · **Deciders:** Project owner + architect
**Supersedes:** the earlier draft "JWT custom claims via Edge Function" approach (from the removed root-level ARCHITECTURE_DECISIONS.md, preserved in git history).

### Context
One account may hold several roles (Parent→Teacher→Coordinator→BV Coordinator), each with a different scope, with an active-role switch. RLS policies (ADR-0003) need the active role + scope in the JWT. We want one language (no Deno). Verified live: Supabase Custom Access Token Hook supports a Postgres function adding claims on token issue/refresh.

### Options Considered
- **Postgres Custom Access Token Hook (SQL)** — Pros: no Deno (one language); runs at token issue/refresh; reads `user_roles`; hardenable (`supabase_auth_admin` only). Cons: claims update requires a session refresh.
- **Edge Function (Deno) setting claims** — Pros: flexible. Cons: adds a second language/runtime; contradicts the AI-legible, one-language goal. Rejected/superseded.
- **Client-asserted role** — Cons: forgeable; never acceptable for minors' data. Rejected.

### Decision
Use a **Postgres Custom Access Token Hook (SQL)** to stamp `active_role`, `scope_type`, `scope_id` into the JWT; active-role switch = write own row + `refreshSession()`.

### Consequences
Hook hardened per §5.5 (grant to `supabase_auth_admin`, revoke from anon/authenticated/public). Drives every RLS policy. See 3_ARCHITECTURE §5.
