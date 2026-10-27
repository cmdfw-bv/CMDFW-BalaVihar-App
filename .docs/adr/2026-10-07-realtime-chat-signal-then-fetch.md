# ADR-2026-10-07-realtime-chat-signal-then-fetch: Live chat delivery is a signal; the message is fetched under `messages` RLS

**Status:** Closed · **Category:** Chat/Notifications · **Date:** 2026-10-07 · **Deciders:** Maulik (architect review of issue [#6](https://github.com/cmdfw-bv/CMDFW-BalaVihar-App/issues/6), 2026-10-07)

**Governs:** System → `realtime-chat-delivery`. **Refines [ADR-0007](0007-chat-poc-core.md)'s mechanism** (the transport — Broadcast from the database on private channels authorized by RLS on `realtime.messages` — is unchanged; what the broadcast carries and which database function emits it are decided here). ADR-0007 stays Closed and is not superseded. Builds on [ADR-0015](0015-chat-access-model.md) (who is a participant) and [ADR-2026-09-19](2026-09-19-withdrawal-revokes-conversational-access.md) (withdrawal removes participant rows).

### Context

`messages`, `conversations` and `conversation_participants` exist with membership-derived RLS (`20260709043349`), and triggers keep membership in step with enrollments and staff roles. Nothing delivers a message live: there is no broadcast on insert, no policy on `realtime.messages`, and no client subscription. 3_ARCHITECTURE §9.1 sketches the mechanism as a trigger calling `realtime.broadcast_changes()`, which emits the whole row.

Four facts checked during this review shape the decision:

1. **Realtime caches channel authorization.** Supabase's Realtime Authorization guide (read 2026-10-07): access policies are "cached for the duration of the connection" and refreshed only when a client subscribes to a channel or sends a new JWT; a user whose access is revoked "will keep receiving messages until their JWT expires or a new one is sent", and is disconnected at expiry if no new JWT arrives. `supabase/config.toml` sets `jwt_expiry = 3600`, so a continuously connected client can keep receiving broadcasts for **up to about 60 minutes** after its participant row is deleted. This confirms the assumption the refined brief flagged as unverified, and puts a number on it.
2. **Broadcast-from-database rows are retained for 3 days** in `realtime.messages` (§9.1, re-confirmed in the Broadcast guide). Whatever the payload carries is a second copy outside `messages`.
3. **Chat access is membership-only.** The chat policies key off `auth.uid()` against `conversation_participants`; they read no `active_role` or scope claim. A `SECURITY DEFINER` helper, `public.is_conversation_participant(uuid)`, already exists, revoked from `public, anon` and granted to `authenticated`.
4. **PR [#117](https://github.com/cmdfw-bv/CMDFW-BalaVihar-App/pull/117) does not change the claim-check form.** Its final migration (`20261003130000`) moves predicates into `SECURITY DEFINER` helpers and explicitly drops the `(select auth.jwt())` wrapping its earlier migrations carried, keeping bare `auth.jwt()` / `auth.uid()`. The helper shape it standardizes is the shape `is_conversation_participant` already has. #117 was open with changes requested (tests, not SQL) when this was written.

The current Realtime Authorization and Broadcast guides carry no beta or preview label; this review reads that as meeting §9.4's "confirmed GA" condition. It is an inference from the docs, not a quoted GA statement.

### Options Considered

- **A. Signal only (chosen)** — the broadcast carries the message `id` and `created_at`; the client fetches the row from `messages`.
  - *Pros:* every read of message content is authorized by `messages` RLS at the moment of the read, so the authorization cache in fact 1 cannot leak content; no body of a minor's message is copied into the 3-day transport store; a later message-removal feature has one place to remove from; the client has a single ingestion path ("fetch newer than my last message") shared by live pings, reconnect and foregrounding, which is the path acceptance criterion 4 (no loss across gaps) requires anyway.
  - *Cons:* one extra indexed read per connected participant per message; one extra round trip before the message renders; departs from §9.1's literal `realtime.broadcast_changes()`.
- **B. Full row via `realtime.broadcast_changes()`** — as §9.1 is drawn.
  - *Pros:* fastest render; no extra reads; matches the existing diagram.
  - *Cons:* a revoked participant can receive message bodies for up to ~60 minutes; bodies of minors' messages sit in `realtime.messages` for 3 days and outlive a removal from `messages`; the client must merge two sources (live payloads and gap-fill fetches) without duplicates or misordering.
- **C. Row without the body** — sender, timestamp and mention targets in the event; body fetched.
  - *Pros:* content is protected as in A.
  - *Cons:* same fetch cost as A while still disclosing who posted and when to a revoked participant; no benefit over A.

### Decision

1. **The live event is a signal, not the message.** An `after insert` trigger on `messages` emits, through `realtime.send()`, a private broadcast on topic `chat:<conversation_id>` whose payload is the message `id` and `created_at` and nothing else. No body, sender or mention data enters `realtime.messages`. The client reacts by fetching from `messages` under `messages_member_select`.
2. **Channel access is one `select` policy on `realtime.messages`**, for `authenticated`, limited to the `broadcast` extension, that grants a topic only when it parses as `chat:<uuid>` and `public.is_conversation_participant(<uuid>)` is true. Any other topic, or a malformed one, is denied. The policy reads no `active_role` or scope claim, so an active-role switch cannot widen what is received.
3. **Clients are listen-only.** There is no `insert` policy on `realtime.messages` for any client role. The only way onto a conversation channel is a row saved to `messages`, which already enforces sender = caller and membership. Presence is not enabled.
4. **Policy style: helper-based, bare `auth.uid()`.** The new policy calls the existing helper and adds no inline `exists (...)` and no `(select auth.…())` wrapping. This matches both the existing chat helper and the form #117 lands with, so this item has no merge-order dependency on #117. If #117's style changes before it merges, the only affected text is the body of `is_conversation_participant`, which this item does not redefine.
5. **The revocation window is accepted for the pilot and stated.** After a participant row is deleted, a continuously connected client may keep receiving signals until its next channel join or token refresh — at most one access-token lifetime (60 minutes at `jwt_expiry = 3600`). Under Decision 1 what leaks in that window is only that a message was posted and when; the fetch is refused. History access ends immediately, as today. Immediate forced disconnect is not built.
6. **The existing `messages` / `conversations` policies are not rewritten** by this item. Converting their inline `exists` to the helper is not needed for correctness and is out of scope.
7. **Message removal gates student chat going live, not this item.** [ADR-0017](0017-chat-governance-deferred.md)'s interim safeguard for minors' chats — that the teacher can remove content — is not built: `authenticated` has no `update` or `delete` on `messages` and there is no removal policy. This engine item proceeds through the pipeline without it, because nothing can be sent or seen until a chat screen exists. Student `class-chat-ui` (#24) **must not be promoted to production until Teacher `chat-message-removal` has shipped** (§9.4). Removal is deliberately not folded into this item: it carries its own unanswered policy decisions (who may remove, delete versus hide-and-keep, audit, what others see) and its own first-ever write policy on `messages`, which need their own refine, review and adversarial tests.

### Consequences

- **3_ARCHITECTURE §9.1 is now imprecise**: its diagram and bullet name `realtime.broadcast_changes()` and imply the row is the payload. The text must be corrected to "trigger → `realtime.send()` signal → client fetch". Not done in this ADR's change.
- **A broadcast failure never fails the message insert.** `realtime.send()` traps its own errors and raises a warning. A lost signal is therefore possible and is covered by the same fetch-on-reconnect / fetch-on-foreground path; `/design` must make that path unconditional rather than a fallback.
- **The fetch runs under `messages_member_select` on cloud.** Issue #105 showed a policy that is instant locally can time out on the cloud project. This policy is a single membership check, so it is expected to be cheap, but `/deploy-staging` must time the fetch on cloud staging before promotion. The same step confirms the cloud project's access-token lifetime matches the 3600 s this ADR's window is stated against.
- **Read load:** each saved message causes one small read per connected participant. Within the Free tier at pilot size (§9.3); to be re-checked against rollout numbers alongside the Pro move.
- **Adversarial tests are required before any prod migration** (§11.3, §11.4, acceptance criterion 6): the `realtime.messages` policy per role × scope × grade band, including a withdrawn student and parent, a sibling-still-enrolled family, a teacher of another class, a coordinator of another session, a multi-role user after an active-role switch, an unauthenticated client, a student against a KG–Gr 8 class topic, a malformed topic, and an attempted client `insert`.
- **No new `audit_log` surface.** No new read path to a minor's record is created; content is read through the existing `messages` policy.
- **Residency and vendors unchanged.** Delivery rides the existing US Supabase project; the transport store now holds identifiers and timestamps only.
- **Capacity limit behaviour is defined by the design, not the transport:** a client that cannot connect at the 200-connection limit still gets every message through the fetch path.
- **The go-live gate in Decision 7 is recorded on both sides:** here, and on the Teacher `chat-message-removal` backlog row, so it is visible to whoever picks up either item.
- **Later removals fit the same shape:** a removal can be signalled by id on the same channel without any content ever having been in the transport store.
