# ADR-0028: Push dispatch is client-invoked, not a DB trigger

**Status:** Closed · **Date:** 2026-07-21 · **Deciders:** Project owner + architect
**Governs:** System → `notifications-infra` (`.docs/specs/system/notifications-infra.md`).

### Context

`notifications-infra` needs a new chat message (`messages` insert) to result in a Web Push dispatch to the conversation's other participants, respecting each participant's `notify_level` and mention targeting (ADR-0016). `messages` is inserted directly by the client under a plain RLS policy (`messages_member_insert`, from `core-schema-and-rls`) — there is no RPC wrapping the insert today, and the refined brief already fixed "no new RLS surface" as an acceptance criterion, so replacing the direct insert with a new SECURITY DEFINER RPC was not considered as an option (it would reopen a surface that's already shipped, tested, and out of this item's declared scope). The real question is how the *dispatch* gets triggered off that existing insert path: from the client, after its insert succeeds, or from the database itself.

### Options Considered

- **Option A — Client-invoked (chosen).** After the client's RLS-permitted insert into `messages` succeeds, the client calls the `push-send` Netlify function (bearer JWT) passing only the `message_id`. The function runs service-role, re-reads the message + `conversation_participants` + `notify_level` from the DB itself (never trusts a client-supplied recipient list or payload), and dispatches. Pros: matches this repo's only existing precedent — `csv-import`, `user-role-grant`, and `user-role-sweep` are all client-invoked HTTP functions, no DB-to-HTTP mechanism exists anywhere in this codebase; zero new extensions, zero new secrets-in-Postgres, zero new operational surface for three non-technical volunteer maintainers to reason about. Cons: best-effort — if the client crashes or loses network in the narrow window after the insert commits but before the follow-up call completes, that one push silently never fires. The message itself is unaffected (already committed, still readable by every participant via RLS/poll); only the push notification for that one message is missed.

- **Option B — DB trigger + `pg_net`.** An `AFTER INSERT` trigger on `messages` calls `net.http_post` (the `pg_net` extension) to invoke `push-send` directly from Postgres. Pros: fires unconditionally, including for any future insert path that forgets to call anything (e.g. a hypothetical system-generated message). Cons: introduces a new extension and an async, fire-and-forget HTTP mechanism with its own retry/error/observability surface that nothing else in this codebase uses yet; requires a shared secret the trigger can present to authenticate to the Netlify function, which means a secret has to live somewhere reachable by Postgres (Vault, or a GUC) — a new secret-handling surface (constitution rule #2 already restricts secrets to `netlify/functions/` env; this would be the first exception). Materially more moving parts for a volunteer-maintained project, for a benefit (guaranteed-fire) that doesn't matter much for a best-effort notification channel.

- **Option C — Wrap the insert in a new SECURITY DEFINER RPC.** Rejected without full write-up: contradicts the refined brief's own "no new RLS surface" acceptance criterion and would mean re-touching and re-adversarial-testing an already-shipped, tested table for a notification-infra item — disproportionate for what this item is trying to do.

### Decision

Use **Option A — client-invoked**. The `push-send` Netlify function is the single trusted computation point (it re-derives recipients/`notify_level`/mention-targeting from the DB itself, so a buggy or malicious client payload can't spoof who gets notified) and is called by the client as a follow-up step after a successful `messages` insert, the same pattern already used by `csv-import`/`user-role-grant`/`user-role-sweep`.

Missing a push because the client didn't get to call `push-send` is an accepted, disclosed gap at POC — the underlying message is never lost (RLS-scoped read/poll always sees it), only the out-of-app notification for that one message. If missed-push turns out to matter in practice post-pilot, revisit toward Option B rather than retrofitting it silently.

### Consequences

- **No new extension, no new secret-handling surface.** `pg_net` is not enabled; VAPID private key and SES creds remain the only notification-related secrets, and they stay exactly where constitution rule #2 already puts them (`netlify/functions/` env).
- **`push-send` never trusts the caller for *who* gets notified or *what* the payload says** — it takes a `message_id` (or, for a later caller like `#21`, an equivalent reference) and re-reads participants/`notify_level`/mentions server-side. This is what makes best-effort client-invocation safe to accept: the client can fail to call it, or in principle try to call it with a forged target list, but it cannot cause a wrong recipient to be notified.
- **Every future trigger source (e.g. `#21 class-update-and-home-feed`) follows the same shape**: write the row, then call `push-send` with a reference to it. No DB-side wiring needed per new event type.
- **Missed-push is a disclosed, accepted gap**, not silently absorbed — call it out in the notifications-infra spec's edge cases and carry it forward if/when this item reaches `/test`.
