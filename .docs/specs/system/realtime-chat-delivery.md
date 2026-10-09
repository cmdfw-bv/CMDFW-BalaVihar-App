# System — realtime chat delivery

> **owner:** System · **consumers:** Student, Teacher, Parent (primary); Coordinator, BV Coordinator, Admin as participants under ADR-0015's ladder; Student `class-chat-ui` (#24) is the first client consumer · **scope:** engine — live delivery of saved chat messages, bounded by `conversation_participants` membership; no new tables · **governing ADR:** ADR-2026-10-07-realtime-chat-signal-then-fetch (payload, channel policy, revocation window, removal gate), ADR-0007 (Broadcast-from-DB transport), ADR-0015 (access model), ADR-0017 (governance deferral), ADR-2026-09-19 (withdrawal revokes conversational access) · **covers:** issue #6; 3_ARCHITECTURE §9.1–§9.3, §11.4

**Stage:** `/refine` ✓ (2026-10-05) → `/architect` ✓ (2026-10-07, ADR-2026-10-07-realtime-chat-signal-then-fetch) → `/design` ✓ (2026-10-07, signed off) → `/plan` ✓ (2026-10-07, signed off — [plan](realtime-chat-delivery.plan.md)) → `/migration` ✓ (2026-10-08) → `/build` ✓ (2026-10-08) → `/test` ✓ (2026-10-08, at `74dff2f`) → whole-branch review ✓ (2026-10-08, "with fixes"; fixes applied, see "Whole-branch review") → PR [#121](https://github.com/cmdfw-bv/CMDFW-BalaVihar-App/pull/121) merged 2026-10-09 (`a431c27`) → `/deploy-staging` ✓ (2026-10-09 — migrations on staging, ledger reconciled; feed walked on cloud) → **next: close #6 by hand once [#118](https://github.com/cmdfw-bv/CMDFW-BalaVihar-App/issues/118)'s two cloud checks land.** The [`_index.md`](_index.md) row is authoritative if these ever disagree (§12.12).

---

## Architect review — sign-off (2026-10-07)

Brief is sound; owner, consumers and scope confirmed (§12.12). One ADR recorded: [ADR-2026-10-07-realtime-chat-signal-then-fetch](../../adr/2026-10-07-realtime-chat-signal-then-fetch.md). Decisions are Maulik's, taken 2026-10-07.

- **Live event carries the message `id` and `created_at` only**; the client fetches the row under `messages` RLS. Answers the Privacy-framing question below: no message body enters the Realtime transport or its 3-day store. The trigger uses `realtime.send()`, not §9.1's `realtime.broadcast_changes()`.
- **Channel access is one `select` policy on `realtime.messages`** calling the existing `is_conversation_participant` helper, bare `auth.uid()` form, no `insert` policy (listen-only clients). Same style PR #117 lands with; no merge-order dependency on it.
- **Revocation assumption verified.** Realtime caches channel authorization for the connection and refreshes it on channel join or a new token, so the window is at most one access-token lifetime (60 minutes at `jwt_expiry = 3600`). Accepted for the pilot; within it a revoked user receives signals but the fetch is refused.
- **No new `audit_log` surface** — confirmed.
- **Flagged gaps routed.** Message removal stays its own item (Teacher `chat-message-removal`) and **gates production promotion of `class-chat-ui` (#24)**, not this item. 1:1 threads not being representable in `conversations.kind` is not this item's concern and is left for the item that introduces them.

**Carried to `/design`:** safe parsing of the `chat:<uuid>` topic (malformed topics denied); the fetch-newer-than-last path must run unconditionally on ping, reconnect and foreground, since a signal can be lost; behaviour at the 200-connection limit; correcting 3_ARCHITECTURE §9.1's wording.
**Carried to `/deploy-staging`:** time the message fetch on cloud (#105 lesson) and confirm the cloud access-token lifetime.

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

---

## Design (2026-10-07)

Signed off 2026-10-07 (see "Design sign-off" at the end). Decisions below marked **(Maulik, 2026-10-07)** were taken during `/design`; everything else follows from the brief and the governing ADR.

### Design decisions

1. **Senders cannot choose a message's `id` or `created_at` (Maulik, 2026-10-07).** Today `authenticated` has table-wide `insert` on `messages`, so a client can supply both. Catch-up is "fetch newer than my last message", so a backdated row would never be fetched by other devices and a future-dated one would pin itself to the bottom of a class chat. The grant is narrowed to the four columns a client legitimately writes; supplying either of the other two is refused with a permission error rather than silently overwritten.
2. **A device listens only while a conversation is on screen (Maulik, 2026-10-07).** The channel is joined when a conversation opens and left when it closes, the app is backgrounded, or the user signs out. No app-wide subscription, so idle open apps do not count against the 200-connection limit. There is no live unread indicator in this item; an unread indicator needs read tracking, which does not exist, and is `class-chat-ui`'s (#24) to design. The client module is built per conversation so #24 can widen the listening scope later without changing the database side.
3. **One catch-up path, also run on a 30-second timer.** The same fetch runs when the conversation opens, on a ping, when the channel (re)joins, when the app returns to the foreground, and every 30 seconds while the conversation is open. The timer is what makes a lost signal and a failed connection recoverable without a separate fallback mode: the chat degrades from instant to at most 30 seconds late.
4. **The trigger function is `SECURITY DEFINER`.** `realtime.messages` has RLS on and this item adds no client `insert` policy. A trigger running as the sender would be refused, and because `realtime.send()` traps its own errors the signal would vanish without failing anything. Verified on the local stack 2026-10-07: `authenticated` and `anon` hold table grants on `realtime.messages`, RLS is enabled, and no policy exists.
5. **Topic parsing is a separate helper that cannot raise.** Postgres does not promise evaluation order inside a policy's `and`, so a regex guard next to a `::uuid` cast can still raise on a malformed topic. The helper returns `null` for anything that is not exactly `chat:<lowercase uuid>`, and `is_conversation_participant(null)` is false.

### Behavior

```mermaid
sequenceDiagram
    participant S as Sender device
    participant DB as Postgres (messages, RLS)
    participant RT as Realtime (private channel chat:<id>)
    participant R as Receiver device (conversation open)

    R->>RT: join chat:<id> (authorized by the realtime.messages policy)
    S->>DB: insert message (4 columns; messages_member_insert)
    DB-->>S: saved row (id, created_at stamped by the database)
    DB->>RT: trigger -> realtime.send({id, created_at})
    RT-->>R: ping "message_saved"
    R->>DB: catch-up fetch (messages_member_select)
    DB-->>R: new rows
    R->>R: merge by id, order by (created_at, id)
```

**Signal.** An `after insert for each row` trigger on `messages` calls `realtime.send(payload, 'message_saved', 'chat:' || conversation_id, true)`. The payload has exactly two keys, `id` and `created_at`. Clients treat the ping as "run catch-up now" and do not depend on its contents.

**Catch-up fetch.** Reads `messages` for the conversation where `created_at` is at or after the newest *fetched* message's `created_at` minus a 10-second overlap (corrected at review from "newest held": a message this device has just sent is held but was never fetched, and must not move the cursor), ascending by `(created_at, id)`, in pages of 100 until a short page. Results are merged by `id`, so the overlap never produces duplicates. The overlap exists because `created_at` is the saving transaction's start time, so two near-simultaneous saves can commit in the opposite order to their timestamps. With no messages held, catch-up is the initial load: the newest 50, with older pages loaded on request.

**Single flight.** One catch-up runs at a time per conversation. A trigger that arrives mid-flight sets a flag and one more catch-up runs when the current one finishes.

**Sending.** The client inserts only `conversation_id`, `sender_user_id`, `body`, `mention_targets` and reads the saved row back. That row is merged immediately; the ping that follows finds it already present. `send` returns the saved row so the caller can invoke push per ADR-0028. This module does not call push.

**Lifecycle.**

| Event | Action |
| --- | --- |
| Conversation opens | set Realtime auth from the current session, join the private channel, run catch-up, start the 30 s timer |
| Ping received | run catch-up |
| Channel joined or rejoined | run catch-up |
| App foregrounded (native `AppState` active; web `visibilitychange` visible) | rejoin if needed, run catch-up, restart the timer |
| App backgrounded | leave the channel, stop the timer |
| Conversation closes | leave the channel, stop the timer |
| Sign-out | remove all Realtime channels (added to the existing sign-out path) |
| Token refresh or active-role switch | nothing to do; `supabase-js` forwards the new token to Realtime, which re-evaluates authorization |

**Access lost while the conversation is open.** RLS returns an empty result rather than an error, so a revoked user's catch-up looks like "nothing new". When a ping arrives and its message is still absent after catch-up, or a channel join is refused, or a catch-up leaves the list empty (added at `/plan`, so a non-participant who cannot reach Realtime does not see an empty chat that looks real), the client re-reads the `conversations` row. If it is no longer readable the client clears the in-memory list, leaves the channel (the channel is removed from the socket, not merely unsubscribed: a refused channel left there keeps retrying and delays the others), stops the timer and reports `unavailable`, so a withdrawn user's device stops displaying a minors' conversation as soon as it notices.

**Connection unavailable** (200-connection limit, network, join timeout). The conversation still loads and updates through the timer. `supabase-js` keeps retrying the join; a successful join triggers catch-up. The module reports whether it is live so #24 can choose to show it.

### Data & RLS impact

One migration. No new tables, no change to membership rules, sync triggers, or the existing `messages` / `conversations` policies (ADR Decision 6).

| Object | Change |
| --- | --- |
| `messages` grant | `revoke insert … from authenticated`, then `grant insert (conversation_id, sender_user_id, body, mention_targets) … to authenticated`. `select` unchanged. `service_role` unchanged. |
| `messages` index | new index on `(conversation_id, created_at desc, id desc)` for catch-up, initial load and older pages. None exists today. |
| `public.chat_topic_conversation_id(text) returns uuid` | new; `immutable`, plain SQL `case` so the cast runs only after the pattern matches; returns `null` otherwise. Accepts lowercase uuids only, which is what the trigger emits. Execute revoked from `public, anon`, granted to `authenticated` (a policy expression runs with the caller's privileges). |
| `public.broadcast_message_saved()` | new trigger function; `security definer`, `set search_path = ''`, schema-qualified references; execute revoked from `public, anon, authenticated`. |
| trigger on `messages` | new; `after insert for each row`. |
| policy on `realtime.messages` | new; `for select to authenticated using (extension = 'broadcast' and topic = realtime.topic() and public.is_conversation_participant(public.chat_topic_conversation_id(realtime.topic())))`. No `insert`, `update` or `delete` policy for any client role. No policy for `anon`. `topic = realtime.topic()` added at `/plan` (2026-10-07): without it a participant joined to one topic could see every row in the table. |

The policy reads no `active_role` or scope claim (ADR Decision 2) and uses the bare `auth.uid()` form through the existing helper (ADR Decision 4). `is_conversation_participant` is not redefined.

**Transport store contents:** `realtime.messages` receives a conversation id (in the topic), a message id and a timestamp. No body, sender or mention data. No new `audit_log` surface.

### Client module

`lib/chat/`, the only client code that touches Realtime. Uses the existing anon-key `supabase` client.

| Unit | Purpose |
| --- | --- |
| `messageList.ts` | pure: merge by `id`, order by `(created_at, id)`, compute the catch-up cursor |
| `messagesApi.ts` | the five queries: newest page, catch-up since a cursor (paged), older page, four-column insert, "is this conversation still readable" (added at `/plan`) |
| `conversationChannel.ts` | join and leave the private channel `chat:<id>`; map channel states to live / not live; surface pings and refused joins |
| `conversationSession.ts` | catch-up, single flight, 30 s timer, access-lost, send, older pages; plain module the hook wraps, so the behaviour is tested without a renderer (added at `/plan`) |
| `appActivity.ts` | foreground / background signal, web and native (added at `/plan`) |
| `signOutCleanup.ts` | remove every channel on `SIGNED_OUT`; called from `SessionProvider` (added at `/plan`) |
| `useConversationMessages(conversationId)` | the interface for #24: `messages`, `status` (`loading` · `ready` · `error` · `unavailable`), `isLive`, `hasOlder`, `errorCode` (added at review: code of the last failed load, never its text), `loadOlder()`, `send(body, mentionTargets)` |

Follows the existing pattern of pure logic tested directly with a thin hook around it (`lib/auth/useAutoRefreshOnRegain.ts`, `lib/attendance/`). `app/(tabs)/chat.tsx` stays a placeholder.

### UI

None. This is an engine item with no screen, component or copy. `design/sankalp/bv-connect/components/chat/ChatBubble.jsx` (+ `.prompt.md`) is present in the design mirror and is `class-chat-ui`'s (#24) reference; it was not refreshed or changed here. The design Definition-of-Done applies to #24.

### Testing

Tests are written first and seen to fail (non-negotiable #4).

**pgTAP — schema and signal** (`supabase/tests/190_realtime_chat_delivery.sql`):
- a participant's insert with the four permitted columns succeeds; an insert supplying `created_at`, or supplying `id`, is refused with `42501`;
- after a participant's insert, exactly one row exists in `realtime.messages` for topic `chat:<conversation_id>`, event `message_saved`, private, and its payload keys are exactly `id` and `created_at`;
- the index exists; the trigger function is `security definer` and not executable by `authenticated`;
- `chat_topic_conversation_id` returns the uuid for a well-formed topic and `null`, without raising, for: empty string, `chat:`, `chat:not-a-uuid`, an uppercase uuid, a trailing suffix, a different prefix, a bare uuid.

**pgTAP — adversarial** (`supabase/tests/191_realtime_chat_delivery_adversarial.sql`). Realtime authorizes a join by evaluating the `realtime.messages` policy with `realtime.topic` set for the connecting user; the tests reproduce that by setting `realtime.topic` and selecting from `realtime.messages` as each user. Every deny assertion is paired with a positive control on the same topic (a participant sees a non-zero count), so no assertion can pass because the table happened to be empty.

| Case | Expected |
| --- | --- |
| enrolled HS student, own class | receives |
| parent of an enrolled student, that class | receives |
| teacher of the class; coordinator of its session; BV coordinator; admin (per ADR-0015 ladder) | receives where a participant row exists |
| withdrawn student; withdrawn student's parent | denied |
| family with one child withdrawn and a sibling still enrolled in the same class | receives |
| student withdrawn from class A, active in class B | A denied, B receives |
| re-enrolled after withdrawal | receives |
| teacher of another class; coordinator of another session | denied |
| student against a KG–Gr 8 class topic | denied |
| multi-role user: result identical before and after `switch_active_role` | no widening |
| unauthenticated, tested with `set role anon` (not `clear_authentication()`, which is a superuser) | zero rows |
| malformed, uppercase and non-chat topics | denied, no error raised |
| client `insert` into `realtime.messages` as a participant | refused `42501` |
| a participant with `realtime.topic` set to one conversation | sees no rows of another conversation they also belong to |

**End-to-end join check** (local stack, real websocket, seeded pilot logins): a participant joins `chat:<id>` and receives the ping after another participant saves a message; a non-participant's join is refused; a client `send` on the channel is not delivered. This confirms the live service agrees with the pgTAP simulation of it.

**Client unit tests** (Vitest, `lib/chat/__tests__/`): merge drops duplicates; ordering with equal timestamps is stable by `id`; the cursor applies the overlap; catch-up pages until a short page; a trigger during an in-flight catch-up causes exactly one more; the sender's row followed by its own ping yields one entry; the access-lost path clears the list and reports `unavailable`.

### Acceptance criteria → design

| # | Criterion | Met by |
| --- | --- | --- |
| 1 | Live delivery ≈ 2 s | trigger signal + catch-up on ping; indexed fetch |
| 2 | Live access equals history access | policy calls the same membership helper; content is only ever read under `messages_member_select` |
| 3 | Listen-only clients | no `insert` policy on `realtime.messages`; adversarial insert test |
| 4 | No loss across gaps | single catch-up path on open, ping, rejoin, foreground and timer; overlap + merge by id; database-stamped `created_at` |
| 5 | Revocation | policy re-evaluated on join and new token (≤ 60 min, ADR Decision 5); fetch refused immediately; access-lost path clears the screen |
| 6 | Adversarial coverage | `191_…_adversarial.sql` + end-to-end join check |
| 7 | Residency and vendors | existing US Supabase project only; no body in the transport store |
| 8 | Capacity | listening only inside a conversation; the timer defines behaviour at the limit |

### Edge cases

- **Same sender, two devices:** the second device gets the ping and fetches; the sending device already holds the row and merges to one entry.
- **Two messages in quick succession:** ordered by `(created_at, id)` from the fetched rows, never by ping arrival.
- **Commit order differs from timestamp order:** covered by the 10-second overlap.
- **Lost signal while connected:** recovered by the timer within 30 seconds.
- **Cannot connect (limit or network):** timer-driven updates; nothing lost.
- **Revoked while the conversation is open:** pings may continue for up to one token lifetime; each fetch returns nothing; the access-lost path clears the list.
- **Sibling still enrolled / withdrawn from A, active in B / re-enrolled:** follow participant rows exactly; covered in the adversarial table.
- **Active-role switch:** no effect on the channel; the policy reads no role claim.
- **Malformed or uppercase topic:** denied without an error.
- **Client sends `created_at` or `id`:** save refused; the module never sends them.
- **Long absence (more new messages than one page):** catch-up pages until a short page.
- **`realtime.send()` fails:** the message is still saved (ADR Consequences); recovered by the timer.

### Documentation corrected in this stage

`realtime.broadcast_changes()` replaced with the signal-then-fetch wording in 3_ARCHITECTURE (§3 topology diagram and bullet, §9.1 diagram and bullet) and in `.claude/rules/supabase-sql.md`.

### Out of scope (design)

Unchanged from the brief, plus: a live or stored unread indicator and read tracking (#24); any app-wide subscription; invoking push from this module; rewriting the existing `messages` / `conversations` policies onto the helper; a forced-disconnect mechanism.

### Carried forward

- **To `/plan` (answered 2026-10-07):** `realtime.send()` does write a readable row inside a pgTAP transaction on a fresh stack (five daily `realtime.messages` partitions exist after `supabase start` → `supabase db reset`), so the signal tests observe `realtime.messages` directly. The end-to-end join check is `scripts/e2e-realtime-join.mjs`, run in the `db-and-rls` CI job right after `supabase test db`.
- **Accepted by Maulik at `/build` (2026-10-08):** `scripts/e2e-realtime-join.mjs` uses the service-role key outside `netlify/functions/` (non-negotiable #2). It is the local stack's demo key only, read at run time from `supabase status`, never stored or printed, used solely to sign seeded test users in, and the script refuses any host but `127.0.0.1` / `localhost`. No staging or production key is involved.
- **Hand check of the hook wiring, done by Maulik (2026-10-08, local stack, two browser profiles as `teacher1` and `multirole`, temporary screen since reverted):** a message sent in one window appeared in the other without a reload; hiding the tab sent `phx_leave`, no signal arrived while hidden, and showing it rejoined and caught up; signing out sent `phx_leave` and left no channel or new socket.
- **Found at `/build` (2026-10-08):** on the local stack Realtime starts streaming database signals lazily, on a project's first client connection. A message saved before that stream is up gets no live signal, even to a listener whose join already succeeded (reproduced twice after a Realtime restart; every later run delivered). Nothing is lost: the 30-second catch-up brings the message in. `scripts/e2e-realtime-join.mjs` therefore saves warm-up messages until the first signal arrives before it counts. Whether cloud behaves the same after an idle period is a `/deploy-staging` check.
- **To `/deploy-staging`** (in addition to the architect's two): after the project has had no Realtime client for a while, check whether the first saved message is signalled live or only arrives on the timer; confirm the cloud project's Realtime setting does not allow public channels to stand in for private ones, and repeat the end-to-end join check against staging.

### Whole-branch review (2026-10-08)

One independent review of the whole branch, `d470a7a..7b85618`, after `/test`. Verdict "ready to merge with fixes"; no access-control or privacy finding. Maulik chose to fix everything on this branch, tests first. What changed, each with a test that failed before the change:

- **Catch-up resumes from the newest message a fetch returned, not the newest on screen.** As planned, a message this device sent moved the cursor forward, so anything saved earlier by someone else that no fetch had yet brought in (lost signal, app in the background, failed foreground fetch) never appeared while the conversation stayed open. This was a defect in the plan, which the build followed exactly; it broke acceptance criterion 4. The session tests could not see it because their fake returned canned rows whatever the cursor, so the new tests use a table that honours the cursor.
- **Every read times out after 15 seconds.** Catch-up is single flight, so one request that never answered held up every later tick. Saves are not timed out: an aborted insert may already have been stored.
- **An empty result is checked for access before it is reported as ready.** A non-participant no longer passes through "ready and empty" on the way to `unavailable` (plan decision D).
- **A conversation mounted while the app is hidden does not join or poll** until it is shown (design decision 2). `watchAppActivity` now reports the state at the start, and the hook opens only through it.
- **Timestamps are cut to milliseconds before `Date.parse`.** Postgres prints up to six fractional digits and engines are only required to parse three, so this no longer depends on the engine; the microseconds are still read separately for ordering.
- **Failures the session recovers from carry a code.** `errorCode` in state for a failed load, and an optional `onError({ source, code })` for a failed load, access check or join. Only a Postgres / PostgREST code or an error name is kept, never the message.
- **The end-to-end check now runs `lib/chat`'s own queries against real rows** (six more checks, 21 `ok` lines in all), including the row-wise "older page" filter, which had never returned a real row. Breaking either query on purpose makes its check fail. The script imports the TypeScript module directly, which needs Node 22.18 or later; it was run on Node 22 and 24.

Left as it is, deliberately: `conversationChannel.ts` still ignores an error from `removeChannel` on leave, because the only cause is a socket that is already gone and there is nothing to retry or report.

**Carried to `class-chat-ui` (#24):**

- **One `useConversationMessages` instance per conversation at a time.** supabase-js gives two joins of the same topic the same channel, so a second instance would hear nothing and the first to unmount would remove the channel for both. Noted in the hook; a guard belongs with the screen.
- **A long absence fetches everything since the cursor, with no cap.** Harmless at pilot size. A cap needs a decision about what the screen shows when it is hit (a gap with "load more", or a fresh newest page), which is a screen design question.
- **`onError` is not connected to anything yet.** The client has no error reporting wired in; when it does, this is where chat failures go, and the code-only rule keeps message text out of it.
- **`errorCode` is available to the screen** if #24 wants to tell "cannot reach the server" apart from "nothing new".

---

## Design sign-off (2026-10-07)

Signed off by Maulik, 2026-10-07. He confirmed that the design reads right and explicitly confirmed the two behaviours added while the spec was written, which were not part of the design first approved in conversation:

- **Access lost while the conversation is open** clears the on-screen list and reports `unavailable` (Behavior).
- **The 10-second overlap** on every catch-up fetch (Behavior → Catch-up fetch).

Design decisions 1 and 2 are his, taken during `/design`. Next stage: `/plan`.
