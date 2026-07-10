# ADR-0007: Real-time chat is POC-core via Supabase Realtime Broadcast-from-DB

**Status:** Closed · **Date:** 2026-06-16 · **Deciders:** Project owner + architect
**Resolves:** the doc 1 (post-POC) vs doc 2 (POC-core) conflict — doc 1 Appendix A updated to match.

### Context
Doc 2 §2/§4 lists class group chat + student P2P DMs as Student POC-core. HS students are minors. Verified live: Supabase Realtime Authorization (RLS on `realtime.messages`) + Broadcast-from-DB; Free tier = 200 concurrent (fits pilot).

### Options Considered
- **POC-core, Supabase Realtime Broadcast-from-DB + RLS on realtime.messages** — Pros: zero new vendors; US-resident, DB-enforced, auditable; admin visibility via SELECT RLS. Cons: requires the chat-governance gate before shipping (minors).
- **Post-POC (defer)** — Pros: smaller POC surface. Cons: contradicts doc 2; rejected per decision.
- **Third-party chat SDK** — Cons: breaks US-residency/no-marketing-sharing; weakens oversight. Rejected.
- **Postgres Changes for delivery** — Cons: one read per subscriber per change (DB bottleneck). Rejected in favor of Broadcast.

### Decision
**Chat is POC-core**, delivered via **Broadcast triggered from the database** on private channels authorized by RLS on `realtime.messages`; durable history in own `messages`/`conversations` tables.

### Consequences
**Hard precondition:** chat-governance gate (who-may-chat-whom, moderation/report, retention) resolved before student chat ships. Confirm Realtime Authorization GA + adversarial channel tests. See 3_ARCHITECTURE §9.
