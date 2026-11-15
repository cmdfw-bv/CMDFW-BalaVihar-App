# ADR-2026-11-14-chat-message-removal-move-aside: Chat message removal moves the text into a locked side table through one audited function

**Status:** Closed · **Category:** Privacy/Minors · **Date:** 2026-11-14 · **Deciders:** Maulik (architect review of issue [#113](https://github.com/cmdfw-bv/CMDFW-BalaVihar-App/issues/113), 2026-11-14)

**Governs:** Teacher → `chat-message-removal`. **Builds ADR-0017's interim safeguard** for minors' chats ("the teacher … can remove content … removal actions are auditable"). That ADR stays Closed and is not superseded. Uses [ADR-0015](0015-chat-access-model.md) (participant ladder), [ADR-0019](0019-minors-record-read-audit.md) / [ADR-0021](0021-teacher-attendance-write-rpc.md) (audited SECURITY DEFINER RPCs) and [ADR-2026-10-07-realtime-chat-signal-then-fetch](2026-10-07-realtime-chat-signal-then-fetch.md) (signal-then-fetch; its Decision 7 is the go-live gate this item clears).

### Context

The refined brief (`.docs/specs/teacher/chat-message-removal.md`, human-validated 2026-11-14) asks for hide-and-keep removal down the ADR-0015 ladder: everyone sees a placeholder, the text is kept for evidence until the pilot-close purge, every removal is audited, and no one removes their own message. Five facts checked during this review shape the decision:

1. **RLS hides rows, not columns.** `messages_member_select` (`20260709043349`) is membership-only. A removed message must stay visible as a row (for the placeholder) while its `body` and `mention_targets` become unreadable. A row policy can't do that on its own.
2. **`authenticated` has `select, insert` on `messages` and no write policy.** This is the first write path ever on the table.
3. **Oversight roles are not class-chat members.** The sync triggers (`20260709043451`) add only students, parents (from enrollments) and teachers (from class-scoped `user_roles`) to `kind = 'class'` conversations. Coordinators join `session_staff` conversations, and BV Coordinators/Admins join `leadership`. That contradicts ADR-0015 ("Coordinator: participant in every class chat in their session"; "BV Coordinator / Admin: participant in any thread org-wide"). As built, only teachers among the staff can see a class chat.
4. **`audit_log.action` is constrained to `('read','denied')`** (`20260709040853`, never altered). A removal entry needs a new value.
5. **The client's catch-up path only fetches newer messages** (`lib/chat/messagesApi.ts`: `created_at >= since`). A removal of an older message would never reach a client that missed the live signal.

### Options Considered

- **A. Move the text aside through one SECURITY DEFINER function (chosen)**: `remove_message(p_message_id)` copies `body` and `mention_targets` into a side table that no client role can read, blanks them on the message, and stamps who removed it (by role) and when.
  - *Pros:* the text is no longer in any row a participant can read, so "never sent to any Student, Parent or Teacher client" holds structurally; `messages_member_select` is unchanged, so this does not repeat the #105 cloud timeout; ladder, scope, active-role, idempotency and audit live in one place, matching ADR-0019/0021; clients still get no `update`/`delete` grant on `messages`.
  - *Cons:* `messages.body` must become nullable (or take an empty value), and the client must render the placeholder from the removal columns; one more table to purge at pilot close.
- **B. A filtering view**: keep the text in place, revoke direct `select` on `messages`, and have clients read a security-barrier view that blanks removed text.
  - *Pros:* no data movement.
  - *Cons:* every chat read changes (client, the realtime fetch, push-send reads) and must be re-timed on staging (#105 risk); the "unreadable" guarantee rests on revoking the base table and on the view being correct.
- **C. An UPDATE policy on `messages`**: teachers edit rows under a new policy.
  - *Pros:* uses PostgREST directly.
  - *Cons:* needs column grants to stop edits to other columns; the ladder needs the sender's rank, and the audit write needs a separate definer trigger; blanking the text loses it unless a trigger also copies it aside. This approach has the most moving parts.

### Decision

*Decisions 1, 5 and 6 were chosen by the human at review. Decisions 2–4 and 7–9 are architect calls made in the same review and are open to correction at `/design`.*

1. **Removal is one function, and the text moves aside.** `public.remove_message(p_message_id uuid)` is `SECURITY DEFINER`, `set search_path = ''`, revoked from `public, anon` and granted to `authenticated`. In one transaction it inserts `(message_id, conversation_id, body, mention_targets, removed_by_user_id, removed_by_role, removed_at)` into a new `message_removals` table, then updates the message so the text is blank, `mention_targets` is empty, and `removed_at` / `removed_by_role` are set. `message_removals` has RLS on, no client grants, and `on delete cascade` from `messages`, so the pilot-close chat purge takes it too. Clients get no `update` or `delete` on `messages`.
2. **The ladder uses the sender's role stamped at send time.** A `sender_role` column on `messages` is set by a `before insert` trigger from the sender's `conversation_participants.participant_role`; the client cannot supply it. This keeps a message removable after its sender leaves the chat (for example, a withdrawn family under ADR-2026-09-19). Existing rows are backfilled from current participants. `/design` decides how to handle rows the backfill cannot resolve.
3. **Authorization reads the active role and its scope, not participation.** `remove_message` refuses unless the conversation is `kind = 'class'`, the caller is not the sender, and one of the following holds:
   - `active_role = 'teacher'`, the caller holds a teacher role for that class, and `sender_role in ('student','parent')`
   - `active_role = 'coordinator'`, the caller holds a coordinator role for the session that owns the class, and `sender_role in ('student','parent','teacher')`
   - `active_role in ('bv_coordinator','admin')` and `sender_role in ('student','parent','teacher','coordinator')`

   An active-role switch therefore narrows what the caller can do, with no extra checks needed (brief criterion 8). The function follows the fail-closed staff-scope guard style (`20260910120000`).
4. **Idempotent and race-safe.** The update is `… where id = p_message_id and removed_at is null returning …`. Only the call that changes the row writes the side-table row, the audit entry and the signal. A second call, or the loser of a race, is a no-op.
5. **Every removal is audited without the text.** `audit_log.action` gains `'remove'`. The entry records actor, active role, `target_table = 'messages'`, `target_id = message id`, and `target_student_id` = the sender's student when the sender is a student. Conversation and time are derivable from the message and `accessed_at`. No body is copied into `audit_log`.
6. **Oversight review is a simple screen backed by an audited read function.** `get_removed_messages_for_oversight(...)` (SECURITY DEFINER) returns removed messages with their original text within the caller's active-role scope: Coordinator = class chats in their session, BV Coordinator/Admin = org-wide. Every call writes an `audit_log` `'read'` entry per returned message (ADR-0019). A basic review list for Coordinator / BV Coordinator / Admin ships in this item. Teachers, students and parents cannot call it successfully.
7. **The removal travels as a signal on the existing channel.** The function emits `realtime.send({id}, 'message_removed', 'chat:<conversation_id>', true)`. The payload is the id only, and the client refetches that row under `messages_member_select`. This follows ADR-2026-10-07's "a removal can be signalled by id on the same channel".
8. **Catch-up covers removals.** Because the live signal can be lost, the client's reconnect/foreground path must also fetch rows with `removed_at >= since` for the loaded window, in addition to new rows (a partial index on `removed_at` where it is not null). `/design` owns the exact query.
9. **Push is unchanged.** Payloads already carry no text. A removal neither recalls nor sends a notification.

### Consequences

- **Only Teachers have a removal button in the POC.** Under fact 3, Coordinators, BV Coordinators and Admins cannot see class chats, so they have nothing to remove from in the UI. The full ladder is still built into `remove_message` and covered by adversarial tests, so it starts working once they are made class-chat members. **Making them members is a separate issue** (the ADR-0015 participation gap). It changes who reads minors' chats and how many notifications oversight roles receive (ADR-0016), so it needs its own refine and review. Until it ships, the oversight review screen (Decision 6) is the only way those roles can see class-chat content, and it shows removed messages only.
- **Go-live gate:** this item still gates Student `class-chat-ui` (#24) under ADR-2026-10-07 Decision 7. The gate is met once Teacher removal is live. The oversight participation gap does not block #24.
- **`messages.body` loses its `not null`** (or blanks to `''`; `/design` chooses). The client and push-send must render a removed row as the placeholder "Message removed by a <role>", using `removed_by_role`.
- **Coordinators can't see removal entries in `audit_log`.** `audit_log_coordinator_read` grants rows by `target_student_id` or `target_table = 'classes'`, so a Coordinator does not see removal entries for parent messages. BV Coordinator/Admin see all entries. `/design` either accepts this or extends the policy.
- **Adversarial pgTAP** (§11.3) must cover, before any prod migration: every ladder refusal (wrong class, staff sender at or above the caller, self-removal, non-class conversation); active-role switch (Teacher+Parent acting as Parent); `message_removals` unreadable by every client role; removed body and mentions unreadable through `messages`; review function refused for teacher/student/parent and scope-bound for coordinator; idempotent second call writing no audit entry. Use `set role` + `throws_ok`, never `clear_authentication()` (which bypasses RLS).
- **Performance:** `messages_member_select` is untouched. The new functions are point lookups. No staging timing is owed for the read path, but the review function's org-wide list should be timed on staging.
- **Residency and vendors unchanged.** Retention: the evidence copy lives only until the pilot-close chat purge, as under ADR-0017.

### Ratified (2026-11-14, `/design` sign-off)

The human approved the `/design` of `chat-message-removal` on 2026-11-14. That confirms architect calls 2–4 and 7–9 as written, with these resolutions of the points the ADR handed to `/design` (details in the spec's Design section):
- `messages.body` becomes **nullable**. It is `null` exactly when `removed_at` is set, and a check constraint enforces that.
- Backfill rows with no resolvable `sender_role` stay `null` and are removable only by `bv_coordinator`/`admin` (fail-closed).
- Catch-up adds `fetchRemovedSince` (`removed_at >= since`) and patches only the messages already loaded.
- `audit_log_coordinator_read` is **extended** to cover `target_table='messages'` for class chats in the Coordinator's session.
- The review screen is a Dashboard card plus `app/removed-messages.tsx`. The database holds no adult names, so its rows show **role labels** ([#138](https://github.com/cmdfw-bv/CMDFW-BalaVihar-App/issues/138)).
- The Remove action and the removed bubble are specified here and **built in #24**. The go-live gate (ADR-2026-10-07 Decision 7) is unchanged.

### Build note (2026-11-14, `/build`; no decision changed)

These clarifications came up during the build. None of them changes a decision above.
- **`is_active` means "the role the user has selected", not "the grant exists"** (as recorded in #119's migration `20261113120000`). `remove_message` and `get_removed_messages_for_oversight` require the caller's matching `user_roles` grant to be `is_active`. In effect, the JWT claim must match the role the user has currently selected. A user who has switched away from a role is refused until they switch back, even if their token is stale. This is deliberate. Don't "fix" it to check only that the grant exists.
- The `sender_role` backfill does **not** filter on `is_active`. It asks which role the sender holds in that class, not which role they have selected.
- Coordinators are not class-chat participants (#137), so an inline policy subquery on `messages` always returns false for them. Coordinator visibility of message audit rows therefore goes through the claim-gated SECURITY DEFINER helper `message_in_session` (precedent: `class_in_session`). Message audit rows are excluded from the student-enrollment clause of `audit_log_coordinator_read` (#139).
