# System — realtime chat delivery

> **owner:** System · **consumers:** Student, Teacher, Parent (primary); Coordinator, BV Coordinator, Admin as participants under ADR-0015's ladder; Student `class-chat-ui` (#24) is the first client consumer · **scope:** engine — live delivery of saved chat messages, bounded by `conversation_participants` membership; no new tables · **governing ADR:** ADR-0007 (Broadcast-from-DB transport), ADR-0015 (access model), ADR-0017 (governance deferral), ADR-2026-09-19 (withdrawal revokes conversational access) · **covers:** issue #6; 3_ARCHITECTURE §9.1–§9.3, §11.4

**Stage:** `/refine` ✓ (2026-10-05) → next is `/architect` (review).

---

## Requirements (refined)

### User story
As the System, I want to deliver each newly saved chat message live to every current participant of that conversation — and to nobody else — so that Students, Teachers and Parents can hold a conversation without reloading, with the same database-enforced access that already protects message history.

### Roadmap context (what exists, what is missing)
- **Exists (`core-schema-and-rls`, Built):** `conversations`, `conversation_participants`, `messages` with RLS (`messages_member_select`, `messages_member_insert`, both membership-derived); the sync triggers that keep membership in step with enrollments and staff roles (`20260709043451`). Withdrawal already deletes the student's and family's participant rows, with a sibling guard (ADR-2026-09-19 Decision 9 — "chat is already compliant and is not touched").
- **Missing (this item):** nothing delivers a message live. No database broadcast on message insert, no access rule on the Realtime channel, no client subscription. `app/(tabs)/chat.tsx` is a placeholder.
- **Downstream:** `class-chat-ui` (#24) is blocked on this item. `notifications-infra` (push) is independent: it is client-invoked after the insert (ADR-0028) and does not ride this channel.

### Decisions captured during refine (human-confirmed 2026-10-05)
- **Priority: POC-core** (ADR-0007), unchanged.
- **Revocation timing: next reconnect or token refresh.** A participant whose membership ends stops receiving live messages no later than their next channel join or sign-in-token refresh. The window is accepted for the pilot and must be stated, not hidden. Immediate forced disconnect is **not** required. *Unverified assumption for `/architect`:* that Supabase Realtime re-evaluates channel authorization on join and on token refresh, and what the actual maximum window is with this project's token lifetime.
- **Message removal is not part of this item.** Removal does not exist today (see "Flagged gaps"). This brief requires only that the delivery mechanism not preclude carrying removals later.

### Acceptance criteria
1. **Live delivery.** A message saved by a participant appears for other connected participants of that conversation within about 2 seconds, with no reload.
2. **Live access equals history access.** A user who cannot read a conversation's history under `messages` RLS cannot join or receive on that conversation's live channel. The live channel grants nothing that history does not.
3. **Listen-only clients.** A message reaches the live channel only by being saved to `messages` (which enforces sender = caller and membership). No client can publish to a conversation channel directly.
4. **No loss across gaps.** A participant who was offline, backgrounded or disconnected sees every missed message after reconnecting, in order, with no duplicates. Durable history is the record; the live channel is transport only (§9.1).
5. **Revocation.** After membership ends (withdrawal, role change, removal from staff), the user receives no live messages from that conversation after their next reconnect or token refresh, and history access ends immediately as it does today.
6. **Adversarial coverage before ship.** Channel access is tested per role × scope × grade band — including a withdrawn student and parent, a sibling-still-enrolled family, a teacher of another class, a coordinator of another session, a multi-role user after an active-role switch, and an unauthenticated client (§11.3, §11.4). Minors' conversations must not be joinable by any non-participant.
7. **Residency and vendors.** Delivery rides the existing Supabase US project. No new vendor, no message content leaves the US perimeter.
8. **Capacity.** Works within the Free-tier Realtime limits for the pilot (200 concurrent connections, §9.3); behaviour at the limit is defined, not undefined.

### Edge cases
- The sender has the same conversation open on two devices: the second device receives the message; the sending device does not show it twice.
- A family with one child withdrawn from a class and a sibling still enrolled in it keeps membership and keeps receiving.
- A student withdrawn from class A and active in class B loses A's channel only.
- A user re-enrolled after withdrawal regains live delivery along with membership.
- A multi-role user: delivery follows membership rows exactly as history does today; switching active role must not widen what is received.
- Two messages saved in quick succession arrive in saved order, or the client can order them from the data delivered.
- Connection limit reached: a client that cannot connect still gets messages by loading history; nothing is lost.
- KG–Gr 8 class chats have no student participants (ADR-0015); a student account must not be able to join one.

### Consumers
Student, Teacher and Parent through `class-chat-ui` (#24). Coordinator, BV Coordinator and Admin receive on conversations where the ADR-0015 ladder makes them participants. No persona gets a delivery path that bypasses membership.

### Access scope (§5.4)
Engine-level. Access is membership-derived (`conversation_participants`), the same basis as `messages` RLS, and is enforced in the database on the Realtime channel — never in client code only (non-negotiable #1). No change to who is a participant.

### Privacy framing
- Message bodies of minors' conversations transit the Realtime transport, which retains for 3 days (§9.1). *For `/architect`:* whether the live event should carry the message body or only enough for the client to fetch it under `messages` RLS (data minimization).
- No new access to a minor's record is created, so no new `audit_log` surface is expected; `/architect` to confirm.

### Flagged gaps (not this item's to fix — for `/architect` to route)
- **Message removal does not exist.** ADR-0017's interim safeguard for minors says the teacher "can remove content", but `authenticated` has no UPDATE or DELETE on `messages` and there is no removal policy. Filed as its own backlog item (Teacher → `chat-message-removal`).
- **1:1 threads are not representable.** ADR-0015 lists Coordinator–Teacher and leadership 1:1 threads; `conversations.kind` allows only `class`, `session_staff`, `leadership`.

### Explicitly out of scope (so a later item picks it up)
- The chat screen, composer and message list (`class-chat-ui`, #24).
- Push notifications for chat messages (`notifications-infra`).
- Typing indicators, read receipts, presence, and `@mention` parsing or targeting.
- Message edit or removal, report/flag tooling, and retention (ADR-0017).
- Any change to membership rules or the sync triggers.
- Immediate forced disconnect on revocation.
