# ADR-0017: Chat governance gate — moderation & retention deferred post-pilot

**Status:** Closed · **Date:** 2026-06-20 · **Deciders:** Project owner + architect
**Extends:** ADR-0015 (chat access model), ADR-0007 (chat POC-core). **Closes** the 3_ARCHITECTURE §9.4 / 2_POC_FEATURE_SCOPE §6.4 chat-governance gate — its remaining two items are resolved here *by deferral under interim safeguards*.

### Context
The chat-governance gate has three items: **who-may-chat-whom** (resolved by ADR-0015), **moderation/report**, and **retention**. The pilot is deliberately thin: single center, ~50–150 users, **no open student–student DMs** (ADR-0015), **an adult in every chat** (the teacher is a member of every class chat; coordinator / BV / admin are participants — ADR-0015), and `audit_log` on minors'-record access (§11). The POC's job is to prove the end-to-end loop, not to ship launch-ready governance (an explicit POC non-goal — doc 1 §9 / doc 2 §5). Owner direction: defer both remaining items to post-pilot.

### Options Considered
- **Build full moderation + retention now** — Pros: launch-ready governance. Cons: heavy for a POC; the interim safeguards already bound the risk at pilot scale. Rejected for the POC.
- **Defer both, with interim safeguards** (chosen) — Pros: keeps the POC thin; risk is bounded by *no open student DMs* + *adult presence in every channel* + small single-center scope + audit. Cons: not launch-ready — must be revisited before any rollout/go-live. Accepted (matches POC non-goals).
- **Defer with no safeguards** — Cons: unacceptable for a minors' platform. Rejected.

### Decision
**Moderation/report — deferred.** No formal report/flag tooling in the POC. Interim oversight is **adult presence via the participant ladder** (ADR-0015): the teacher is in every class chat and can remove content; coordinator / BV / admin are participants who can step in; there are no unsupervised student channels. Removal actions are auditable.

**Retention — deferred post-pilot.** No formal retention/deletion *schedule* in the POC. Interim posture: durable history lives in the own `messages` tables and is **retained for the pilot, then purged at pilot close** (`realtime.messages` is transport only — 3-day, §9.1). A formal retention/deletion policy + deleted-account message handling is post-pilot.

**Both are a hard precondition for go-live, not for the pilot** — revisit before any rollout or native launch.

### Consequences
The §9.4 gate is now fully addressed (who-may-chat-whom resolved; moderation + retention deferred under safeguards) — no POC-blocking open gate items remain. Patch 2_POC §6.4 and §9.4 wording from "still open" → "deferred post-pilot (ADR-0017)". **Revisit list before go-live:** report/flag UX + escalation; a retention/deletion schedule wired to the §10 scheduled-deletion job; deleted-account message handling. Pairs with the standing RLS adversarial tests (§11.3) and `audit_log`.
