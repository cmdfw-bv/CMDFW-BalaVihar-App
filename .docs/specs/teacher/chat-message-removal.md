# Teacher — Chat message removal

> **owner:** Teacher · **consumers:** Student, Parent (see that a message was removed); Coordinator / BV Coordinator / Admin (may also remove, per the ADR-0015 participant ladder; may review hidden content); System `realtime-chat-delivery` (#6, carries the removal live) · **scope:** Teacher = own class chats · Coordinator = class chats in their session · BV Coordinator / Admin = class chats org-wide — §5.4 · **governing ADR:** [ADR-2026-11-14-chat-message-removal-move-aside](../../adr/2026-11-14-chat-message-removal-move-aside.md) (primary); ADR-0017 (interim safeguard: "the teacher … can remove content … removal actions are auditable"), ADR-0015 (participant ladder), ADR-2026-10-07-realtime-chat-signal-then-fetch (Decision 7: this item gates student chat going live) · **covers:** GitHub issue #113; doc 2 §2 chat governance "message moderation/report mechanism" (the removal half only; report/flag stays deferred under ADR-0017)

**Stage:** Refined ✓ (2026-11-14) → `/architect` ✓ (2026-11-14, ADR-2026-11-14-chat-message-removal-move-aside) → `/design` ✓ (2026-11-14, signed off) → next: `/plan`

---

## Requirements (refined)

### User story
**As a** Teacher, **I want to** remove a message from my class chat, **so that** harmful or inappropriate content stops reaching the students and parents in it, and the program keeps a record of what was removed in case the concern needs follow-up.

### Decisions captured during refine (human-validated 2026-11-14)
1. **Priority: POC-core.** Student `class-chat-ui` (#24) must not be promoted to production until this ships (ADR-2026-10-07 Decision 7).
2. **Hide and keep, not erase.** A removed message is hidden from everyone in the chat, and its text stays in the database for evidence. It is erased along with all other chat history at pilot close (ADR-0017's retention posture). Nothing is purged early.
3. **Everyone sees a placeholder.** Where the message was, all participants see "Message removed by a teacher" (or by a coordinator/admin, matching the remover's role). The text, the mentions and any other content of the message are not shown. The sender's name and the time stay visible, so replies still make sense.
4. **Who may remove whose messages: down the ladder only.**
   - A **Teacher** may remove any **Student or Parent** message in their own class chat. A Teacher may not remove a message from another Teacher, a Coordinator, a BV Coordinator or an Admin.
   - A **Coordinator** may remove Student, Parent and Teacher messages in class chats in their session.
   - A **BV Coordinator / Admin** may remove Student, Parent, Teacher and Coordinator messages in any class chat.
   - **No one may remove their own message.** That way a sender can't wipe something before an adult has seen it.

### Acceptance criteria
1. A Teacher can remove a Student's or Parent's message in a class chat they teach. Afterwards every participant sees the placeholder in place of the text, both live (via #6's signal) and on any later fetch, reconnect or app foregrounding.
2. The removed text is never sent to any Student, Parent or Teacher client after removal. The database enforces this; hiding it in the client is not enough (non-negotiable 1).
3. A Teacher **cannot** remove a message in a class chat they don't teach, a message from staff at their level or above, or their own message. Each attempt is refused by the database.
4. Coordinators and BV Coordinator/Admin can remove messages within their scope, following the ladder in Decision 4. They cannot remove outside their scope.
5. Every removal writes one `audit_log` entry: who removed it, their active role, the message, the conversation, and when. The entry does **not** copy the message text (minors' data minimization).
6. Hidden text can be reviewed only by oversight roles within their scope (Coordinator for their session, BV Coordinator/Admin org-wide). Every review is audited like any other access to minors' records (§11). *Whether this item builds a review screen or only provides access in the database is a `/design` question. See "For /architect".*
7. Removing a message twice is harmless. The second attempt changes nothing and writes no second audit entry.
8. Removal follows the **active role**, not every role the user holds. A Teacher who is also a Parent and has switched to the Parent role cannot remove messages (§5).
9. Push notifications need no change, because their payloads already carry no message text (privacy rules). A removal doesn't recall or send a notification.
10. Adversarial RLS tests (role × scope × grade, §11.3) cover every refusal in criteria 3, 4 and 8, plus "removed text is unreadable", before any production migration.

### Edge cases
- **Recipient offline at removal:** they see only the placeholder when they next open the chat, never the original text (follows from #6's fetch-on-reconnect path).
- **Removed message mentioned someone:** the mention no longer shows. Removal does not take back a mention notification that was already delivered, since it carried no text.
- **Sender's account later deleted or unlinked:** out of scope. See #59 (sender FK) and #124 (membership not revoked).
- **Withdrawn family:** ADR-2026-09-19 already cuts their chat access. Removal adds nothing for them.
- **Undo / restore:** not in the POC. A wrongly removed message stays removed and the sender can send it again.

### Out of scope (deferred)
- Report/flag of a message by students or parents, and an escalation workflow (deferred by ADR-0017, go-live revisit list).
- Removal in non-class threads (session staff, 1:1 Coordinator–Teacher, leadership). These are adults-only, and ADR-0017's safeguard is about minors' chats.
- Editing messages, telling the sender their message was removed, giving a reason for removal, undoing a removal.
- Moderating class-update comments. That is a separate doc 2 Teacher bullet ("moderate comments") and not this item.

### Calls made during refine (not asked, open to correction)
- **No reason field.** It keeps the data we hold small. The audit entry records who, what and when.
- **Placeholder names the remover's role, not their name.** It explains what happened without singling out a person in front of students.
- **BV Coordinator and Admin cannot remove each other's messages.** They are the same rung of the ladder.

### `/architect` review (2026-11-14) — signed off

Governing ADR: [ADR-2026-11-14-chat-message-removal-move-aside](../../adr/2026-11-14-chat-message-removal-move-aside.md). Owner, consumers and scope are confirmed, with the narrowing below.

**Chosen by the human at review:**
- **Mechanism:** one audited SECURITY DEFINER function, `remove_message`, moves the text and mentions into a locked `message_removals` table and blanks them on the message. `messages_member_select` stays unchanged, so there is no repeat of #105.
- **Oversight gap:** the database doesn't make Coordinators, BV Coordinators or Admins members of class chats (contrary to ADR-0015). The full ladder is built into `remove_message` and tested, but **only Teachers get a removal button in the POC**. The gap is tracked in [#137](https://github.com/cmdfw-bv/CMDFW-BalaVihar-App/issues/137) and does not block #24.
- **Criterion 6:** a **simple review screen** for Coordinator / BV Coordinator / Admin ships in this item. It uses an audited read function, scoped by active role.

**Architect calls (open to correction at `/design`):** `sender_role` stamped at send time by a trigger and backfilled; authorization by active role plus scope, not participation; idempotency through `where removed_at is null`; new `audit_log.action = 'remove'` with no text copied; `message_removed` id-only signal on `chat:<id>`; catch-up must also fetch `removed_at >= since`.

**Handed to `/design`:** the placeholder copy and rendering from `removed_by_role`; `body` nullable vs `''`; backfill rows with no resolvable `sender_role`; the catch-up query for removals; the review screen layout and where it lives; whether to extend `audit_log_coordinator_read` so Coordinators see removal entries for parent messages; timing the org-wide review list on staging.

---

## Design (`/design`, 2026-11-14)

**Stage:** `/design` ✓ signed off 2026-11-14 → next: `/plan`

### Split with Student `class-chat-ui` (#24) (human decision, 2026-11-14)
The chat screen does not exist yet (`app/(tabs)/chat.tsx` is a placeholder). **This item delivers:** the database (function, side table, audit, signal, review function), the `lib/chat` plumbing (remove call, live and catch-up handling of removals, the removed-message model), the **contract** for the Remove action and the removed bubble (below), and the **oversight review screen**. **#24 builds** the Remove action and the removed bubble into its chat screen to this contract. The go-live gate is unchanged: students reach chat only through #24, and #24 cannot be promoted without the Remove action (ADR-2026-10-07 Decision 7). #24's `/refine` must cite this section.

### Behavior
1. **Remove (Teacher, in #24's chat screen).** Long-press a message on phone, or use the "⋯" hover action on desktop, then choose **Remove message**. The action appears only when the client predicts that removal is allowed: active role `teacher`, the message's `sender_role` in (`student`,`parent`), the sender is not the caller, and the message is not already removed. This only hides the action. The database decides (AC 2–4).
2. **Confirm.** A dialog: *"Remove this message?"* / *"Everyone in this chat will see 'Message removed by a teacher'. This can't be undone."* → **Remove** (destructive, `theme.colors.status.absent` tone) / **Cancel**. Exactly one primary action.
3. **Call.** `lib/chat` calls `rpc('remove_message', { p_message_id })`. While it runs, the bubble shows a pending state. On success, the local row is patched from the returned row, without waiting for the signal. If the database refuses (`42501`), the bubble stays as it was and an inline toast says *"This message can't be removed."* On a network error, the toast says *"Couldn't remove — try again."* and the bubble keeps its text.
4. **Everyone else.** The `message_removed` signal `{id}` on `chat:<conversation_id>` triggers a refetch of that row under `messages_member_select`. A row with `removed_at` set renders as the removed bubble.
5. **Catch-up** (reconnect, foreground, 30 s tick). This also covers removals. See "Catch-up query".
6. **Oversight review** (Coordinator / BV Coordinator / Admin). A **Removed messages** card on the Dashboard tab opens the review list. See UI.

### Data & RLS impact
Everything is in timestamped migrations under `supabase/migrations/`, as the ADR specifies. The calls below are the `/design` resolutions of the ADR's hand-offs.

| Object | Change |
|---|---|
| `messages.body` | **Becomes nullable.** It is `null` exactly when the message is removed. A `check ((removed_at is null) = (body is not null))` constraint enforces that, so a row can't be half-removed. *(Design call: `null` rather than `''`, because an empty string is a value a client could plausibly send, while `null` can only mean "removed".)* |
| `messages.mention_targets` | Set to `'{}'` on removal (it already defaults to that). |
| `messages.sender_role` | New `text`, stamped by a `before insert` trigger from `conversation_participants.participant_role`. It isn't in the client insert column grant, so the client cannot supply it. Uses the same check list as `participant_role`. **Backfill:** from current participants first, then from the sender's `user_roles` scoped to the conversation's class. If neither resolves, the value stays `null`. **A `null` sender_role is removable only by `bv_coordinator`/`admin`** (fail-closed). *(Design call. Only pre-pilot staging rows are affected.)* |
| `messages.removed_at` `timestamptz`, `removed_by_role` `text` | New. Clients can read them through the unchanged `messages_member_select`. `removed_by_role` uses the six-role check. The remover's **user id is not on `messages`**. It is stored only in `message_removals`. |
| `message_removals` | New table: `message_id` (PK, FK → `messages` `on delete cascade`), `conversation_id`, `body`, `mention_targets`, `removed_by_user_id`, `removed_by_role`, `removed_at`. RLS on, **no grants to `anon`/`authenticated`**, no policies. |
| `remove_message(p_message_id uuid)` | Implements ADR Decisions 1, 3, 4, 5 and 7. SECURITY DEFINER, `search_path = ''`, granted to `authenticated` only. Returns the updated `messages` row (no text). It refuses (`42501`) when any of these hold: the conversation is not `kind='class'`, the caller is the sender, the caller has no active role or scope, or the ladder or scope check fails. A call on a message that is already removed returns the row unchanged and writes no audit row and no signal. |
| `audit_log.action` | The check constraint gains `'remove'`. A removal entry has `actor_user_id`, `actor_role` = active role, `target_table='messages'`, `target_id` = the message id, and `target_student_id` = the sender's student id when the sender is a student (else `null`). It holds no text. |
| `audit_log_coordinator_read` | **Extended (design call, accepted 2026-11-14)** with one more clause: `target_table='messages'` and the message's conversation is a class chat whose class is in the Coordinator's session. Coordinators then see removal and review entries for parent messages too. The policy is recreated with every existing clause preserved, and a test pins each old clause. |
| `get_removed_messages_for_oversight(p_before timestamptz default null, p_limit int default 20)` | SECURITY DEFINER, `search_path = ''`. It allows only `active_role in ('coordinator','bv_coordinator','admin')` and refuses everyone else with `42501`. Coordinators are limited to class chats whose class `session_id` is their `scope_id`. BV Coordinators and Admins are org-wide. It returns, newest removal first, keyset-paged on `removed_at` with `p_limit` capped at 50: message id, class name, `sender_label`, `sender_role`, `created_at`, original `body`, `remover_label`, `removed_by_role`, `removed_at`. **Labels, not names (human decision 2026-11-14).** The database holds no names for adults; only `students` has names. So `sender_label` is "<first_name> <last initial>." for a student and "Parent · <families.label>" for a parent, using the family enrolled in that class. For staff, `sender_label` is the role. `remover_label` is "the <class name> teacher" for a teacher and "a coordinator" or "an admin" for the other roles. Adult display names are a separate gap ([#138](https://github.com/cmdfw-bv/CMDFW-BalaVihar-App/issues/138)), and the labels switch to names once it lands. It writes **one `audit_log` `'read'` row per returned message** (ADR-0019 shape, `target_table='messages'`). |
| Index | Partial index `messages (conversation_id, removed_at) where removed_at is not null`. It serves catch-up and the review list. |
| Realtime | `remove_message` calls `realtime.send(jsonb_build_object('id', id), 'message_removed', 'chat:'||conversation_id, true)`. It reuses #6's private-channel authorization, so no new topic policy is needed. |
| Push (`push-send.ts`) | No change. It reads no `body`. If a removal lands before `push-send` reads the row, `mention_targets` is empty and no mention push goes out. That outcome is acceptable. |

**Catch-up query** (ADR Decision 8). `fetchSince` stays as it is. A new `fetchRemovedSince(conversationId, sinceIso)` selects `id, removed_at, removed_by_role` with `removed_at >= since`. The session patches only ids already in its loaded window. Ids outside the window are ignored, because they will load already removed when the user pages back. Both reads run on every catch-up tick.

**Client model** (`lib/chat/messageList.ts`). `ChatMessage` gains `body: string | null`, `sender_role`, `removed_at` and `removed_by_role`. `COLUMNS` adds those three columns. A pure `isRemoved(m)` / `placeholderFor(m)` gives the copy *"Message removed by a teacher"*, *"…by a coordinator"* or *"…by an admin"* (`bv_coordinator` and `admin` both read as "an admin").

**Staging timing owed.** Time `get_removed_messages_for_oversight` as an Admin, org-wide, on staging. Also run `EXPLAIN` on `messages_member_select` to confirm the new columns didn't change its plan (#105 vigilance).

### UI
References used (local mirror; DesignSync was unauthorized on 2026-11-14, so refresh the mirror via `/design-login` before `/build` and record any drift): `design/sankalp/bv-connect/components/chat/ChatBubble.jsx` (+ `.prompt.md`), `design/sankalp/bv-connect/components/privacy/AuditEntry.jsx` (+ `.prompt.md`), `design/sankalp/bv-connect/screens/phone/app.jsx` (chat screen), `design/sankalp/bv-connect/screens/desktop/dash.jsx` (Dashboard cards). The mirror has **no removed-bubble or moderation reference**. New variants are specified here and must be pushed back to the design project after `/build`.

**Removed bubble (`ChatBubble` variant `removed`, built in #24).** It keeps the sender name (group chat) and the time. The bubble has no fill: a `theme.colors.chatInLine` 1px **dashed** border, a muted `ink-3` italic body showing the placeholder copy, and a small "slashed message" icon before it. There's no read tick and no long-press menu. It aligns the same way the original did. Screen-reader label: "Message from <sender>, removed by a teacher, <time>".

**Remove action + confirm (built in #24).** A bottom sheet on phone or a popover menu on desktop, with one item, "Remove message" (trash icon), and a 44px target. The confirm dialog is described in Behavior 2. The pending bubble shows its text at 50% opacity with a spinner in the time slot.

**Removed messages review (this item)** — `app/removed-messages.tsx`. It's reached from a **"Removed messages"** card on the Dashboard tab (`app/(tabs)/dashboard.tsx`), and the card renders only for `coordinator`/`bv_coordinator`/`admin`. The route uses the role guard and redirects home for other roles (ADR-0014). The header shows the role badge and scope ("Session: Sunday AM" or "All sessions").
```
Removed messages · Session: Sunday AM
──────────────────────────────────────
Grade 4 · Aarav M. (student) · Nov 9, 9:41
"original text…"
Removed by the Grade 4 teacher · Nov 9, 9:50
──────────────────────────────────────
[ Load more ]
```
- Each row is a card: the meta line in tabular numerics, the original text in body type inside a quote block, and the remover line muted. Newest first, 20 per page, **Load more** (secondary). There is no class filter in the POC (human-validated 2026-11-14).
- The four states. **Loading:** skeleton rows. **Empty:** "No messages have been removed." **Error:** keep the loaded rows and show an inline retry. **Content:** as above. No permission-denied state.
- A footnote under the list: "Viewing these messages is recorded." This is the minors'-access transparency cue, following the `AuditEntry` tone.
- Breakpoints 360/768/1024/1440. Desktop is a single column, max-width matching the Dashboard content pane.

### Edge cases (additions to the brief)
- **Removal races a new reply.** No conflict. The reply stays and the removed bubble sits above it.
- **Two teachers remove the same message at once.** The `removed_at is null` guard means exactly one call writes the removal, its audit row and its signal. The other call gets the already-removed row back, and both clients render the same result.
- **Signal arrives for a message not loaded yet.** The refetch returns a row outside the window, which is ignored. It loads already removed when the user pages back.
- **Teacher's class assignment revoked mid-session.** The JWT scope or `user_roles` check refuses on the next call. The menu may still show until the next token refresh, and the database refusal path handles it.
- **Reviewer opens the same page twice.** Each call is audited again. That's correct: each view is an access.
- **Two teachers share a class.** The review list can't tell them apart ("the Grade 4 teacher"). `message_removals.removed_by_user_id` keeps the exact person for follow-up through the database until adult display names land (#138).
- **The sender is a minor and is later withdrawn.** `sender_role` was stamped at send time, so the message stays removable (ADR Decision 2).

### Out of scope (additions to the brief)
- The chat screen, the Remove action and the removed bubble *as built code*. These belong to #24, to this spec's contract.
- Coordinator / BV Coordinator / Admin removal buttons. The database ladder ships, but these roles aren't class-chat members yet ([#137](https://github.com/cmdfw-bv/CMDFW-BalaVihar-App/issues/137)).
- Filtering or searching the review list, showing the conversation around a removed message, and exporting it.

### Test obligations (for `/plan`)
- **pgTAP adversarial.** Cover each item in the ADR Consequences list, plus: the `null` sender_role is removable only by BV Coordinator/Admin; the `body`/`removed_at` check constraint; every existing `audit_log_coordinator_read` clause still holds after the policy is recreated; a Coordinator can see removal entries for parent messages in their session and not in another session; the review function's per-row audit count; `p_limit` capped at 50. Use `set role` + `throws_ok 42501` (never `clear_authentication()`).
- **vitest.** `isRemoved`/`placeholderFor` copy per role; `fetchRemovedSince` patches only loaded ids; the remove call's optimistic patch, its `42501` rollback and its network-error rollback; the review screen's four states.
