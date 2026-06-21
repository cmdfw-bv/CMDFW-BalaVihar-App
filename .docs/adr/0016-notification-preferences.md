# ADR-0016: Notification preferences — per-channel levels with role-aware defaults

**Status:** Closed · **Date:** 2026-06-20 · **Deciders:** Project owner + architect
**Extends:** ADR-0015 (chat access model), 3_ARCHITECTURE §8 (notifications). New requirement — absent from docs 1–3.

### Context
On the program's current tooling (WhatsApp), high-reach roles (Admin, BV Coordinator, Coordinator) sit in every group and **cannot dial down notification noise** — the single most-cited pain. Because ADR-0015 makes those roles participants in many threads org-wide, the app must give first-class **per-channel notification control**, or it reproduces the same overload. (Broadcasts already move to the feed + push, removing the "step into a thread to announce" workaround.)

### Options Considered
- **Per-channel levels + global default + role-aware smart defaults** (chosen) — Pros: fixes the noise *by default* for exactly the omnipresent roles; users still opt loud channels in. Cons: a per-participant preference field + send-time evaluation.
- **Three levels per channel only** — Cons: omnipresent roles must mute ~40 channels by hand; no relief by default. Rejected.
- **+ global default, no role awareness** — Cons: better, but still leaves high-reach roles loud until they intervene. Rejected.

### Decision
Every channel carries a per-participant notification level — **All · Mentions only · Muted** — over a **personal global default** for newly-joined channels. **Role-aware smart defaults:** Admin / BV Coordinator / Coordinator start new channels at **Mentions only** and opt *into* the few they want loud; other roles default to **All**. The **`@mentions`** from ADR-0015 (`@Parents` / `@Students` / `@individual`) are what trigger a notification at the *Mentions only* level.

### Consequences
Schema (§6.2/§10): add `conversation_participants.notify_level` (enum `all | mentions | muted`) + a per-user `notification_default`; seed role-aware defaults on membership creation. The **`push-send`** function (§8.1) must evaluate `notify_level` and mention targeting before dispatch, and payloads stay **PII-free**. Extends §8 (notifications) and §9 (chat); add the field to the data-model additions in 1_GREENFIELD_POC_PROPOSAL §10.
