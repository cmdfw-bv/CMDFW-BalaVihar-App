# Plan — Teacher: chat-message-removal (#113)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Teachers can remove Student/Parent messages from their class chat. The text moves into a locked side table, everyone sees a placeholder, every removal and every oversight review is audited, and oversight roles get a review screen.

**Architecture:** One migration adds `sender_role`/`removed_at`/`removed_by_role` to `messages`, a client-unreadable `message_removals` table, and the audited SECURITY DEFINER `remove_message`. A second migration adds the audited `get_removed_messages_for_oversight` and widens `audit_log_coordinator_read`. `lib/chat` gains the remove call, the `message_removed` signal and removal catch-up. A review screen ships under `features/teacher/chat-message-removal/`. The Remove button and the removed bubble are **not** built here (#24 builds them to the spec's contract).

**Execution:** subagent-driven (chosen 2026-11-14): one fresh implementer per task and a reviewer before the next task. Tasks 1–3 run under `/migration`, Tasks 4–6 under `/build`.

**Tech Stack:** Postgres/pgTAP (Supabase CLI v2), Expo Router + RN-Web, TypeScript, vitest.

**Spec:** `.docs/specs/teacher/chat-message-removal.md` (Design section is binding) · **ADR:** `.docs/adr/2026-11-14-chat-message-removal-move-aside.md` (incl. Ratified note).

## Global Constraints

- Every schema change is a timestamped migration in `supabase/migrations/`. Never edit an existing migration. Never use Studio.
- Every SECURITY DEFINER function: `set search_path = ''`, schema-qualified names, `revoke all … from public, anon`, `grant execute … to authenticated`.
- Refusals raise SQLSTATE `42501`. Fail closed: a null/absent `active_role` or `scope_id` claim is a refusal (`coalesce(…, false)`, as in `20260910120000`).
- `messages_member_select` and `messages_member_insert` stay **unchanged** (#105). Clients get no `update`/`delete` on `messages` and no grant on `message_removals`.
- `audit_log` rows never contain message text.
- pgTAP: switch identity with `set local role authenticated` + JWT claims. Assert refusal with `throws_ok(…, '42501', …)`. Never use `clear_authentication()` as an "unauthorized" stand-in, because it is superuser (memory: pgtap-clear-authentication-is-superuser).
- Placeholder copy, exactly: `Message removed by a teacher` · `Message removed by a coordinator` · `Message removed by an admin` (`bv_coordinator` and `admin` both read "an admin").
- Toast copy, exactly: refused → `This message can't be removed.` · network → `Couldn't remove — try again.`
- Review-screen copy, exactly: title `Removed messages` · empty `No messages have been removed.` · footnote `Viewing these messages is recorded.` · button `Load more`.
- Client errors reported to Sentry carry the code only, never the text (existing `errorCodeOf`).

## Review Focus

1. **A teacher with a stale menu after reassignment.** The DB must refuse (`42501`) on a class the JWT scope no longer names, even though the client offered the action. Test: Task 2 `teacher_scope_mismatch_refused`.
2. **Concurrent catch-up and remove on the same row.** A `fetchSince` page that returns the pre-removal row after the remove's patch must not resurrect the text. Test: Task 4 `merge never un-removes`.
3. **Removal of a message older than the catch-up cursor while offline.** It must still arrive on reconnect. Test: Task 4 `fetchRemovedSince cursor is the oldest loaded message`.
4. **Review list page boundary with identical `removed_at`.** Keyset paging on `removed_at` alone skips or repeats ties. Page on `(removed_at, message_id)`. Test: Task 3 `review_keyset_ties`.
5. **Backfilled rows with `null` sender_role.** A teacher must be refused and an admin allowed. Test: Task 2 `null_sender_role_fail_closed`.

## Shared seam & branches

- **Serialized (DB):** Tasks 1–3 are migrations and must land in order on one branch, before any app code merges. Check that no other open branch adds a migration after `20261008120000` (open PRs #133/#132/#131/#116; see memory *open-prs-state*). If one does, rename our timestamps to sort after it before merging.
- **Parallelizable (app):** Tasks 4–6 depend only on Task 1's column names and Task 3's return shape, not on its SQL. They can run in a second worktree once Task 1 is committed.
- **Branch:** `feat/113-chat-message-removal`, cut from `docs/113-chat-message-removal` (which carries the spec/ADR commit). One PR.
- **Local DB:** the Supabase stack is shared across worktrees (memory: *shared-supabase-worktree-collision*). Run pgTAP in an isolated stack (memory: *isolated-supabase-stack-for-verification*) if another worktree is active. Known noise: `040_` test 12 fails on a dirty shared stack (memory: *shared-stack-audit-log-breaks-040*).

## File map

| File | Responsibility |
|---|---|
| `supabase/migrations/20261114120000_chat_message_removal.sql` | Columns, constraint, sender_role trigger + backfill, `message_removals`, `audit_log.action` +`'remove'`, partial index, `remove_message` |
| `supabase/migrations/20261114130000_removed_messages_oversight.sql` | `get_removed_messages_for_oversight`, recreated `audit_log_coordinator_read` |
| `supabase/tests/200_chat_message_removal.sql` | Happy paths, schema shape, idempotency, audit shape, signal |
| `supabase/tests/201_chat_message_removal_adversarial.sql` | Every ladder/scope/role refusal, unreadable text |
| `supabase/tests/202_removed_messages_oversight.sql` | Review function + coordinator audit policy (old clauses pinned) |
| `lib/chat/messageList.ts` | `ChatMessage` fields, `isRemoved`, `placeholderFor`, `canOfferRemove`, `applyRemovals`, merge rule |
| `lib/chat/messagesApi.ts` | `COLUMNS`, `fetchRemovedSince`, `removeMessage` |
| `lib/chat/conversationChannel.ts` | `MESSAGE_REMOVED_EVENT`, `onRemoved` handler |
| `lib/chat/conversationSession.ts` | removal catch-up, `remove(id)`, `removing` state |
| `features/teacher/chat-message-removal/{api,viewState,labels}.ts` + `RemovedMessagesScreen.tsx` | Review list data + state + UI |
| `app/removed-messages.tsx`, `app/(tabs)/dashboard.tsx` | Route + Dashboard card |

---

### Task 1: Removal schema + `remove_message` (migration A, happy path)

**Files:**
- Create: `supabase/migrations/20261114120000_chat_message_removal.sql`
- Test: `supabase/tests/200_chat_message_removal.sql`

**Interfaces:**
- Produces (columns on `public.messages`): `body text NULL`, `sender_role text NULL` (six-role check), `removed_at timestamptz NULL`, `removed_by_role text NULL` (six-role check); constraint `messages_removed_body_ck check ((removed_at is null) = (body is not null))`.
- Produces: `public.message_removals(message_id uuid PK references messages(id) on delete cascade, conversation_id uuid not null, body text not null, mention_targets text[] not null, removed_by_user_id uuid not null, removed_by_role text not null, removed_at timestamptz not null)`.
- Produces: `public.remove_message(p_message_id uuid) returns public.messages`.
- Produces: realtime event `message_removed`, payload `{"id": <uuid>}`, topic `chat:<conversation_id>`.

- [ ] **Step 1: Write the failing tests** in `200_chat_message_removal.sql`. Reuse the fixture style of `190_realtime_chat_delivery.sql` (class conversation with a teacher, a student and a parent participant). `select plan(N)` with these assertions:
  - `col_is_null('public','messages','body')`, `has_column` for `sender_role`, `removed_at`, `removed_by_role`, `has_table('public','message_removals')`, `has_index` on the partial index `messages_removed_idx`.
  - `sender_role_stamped`: a student inserts a message as `authenticated`, and its `sender_role = 'student'`.
  - `sender_role_not_client_settable`: `throws_ok` inserting `(…, sender_role)` as authenticated → `42501`.
  - `teacher_removes_student_message`: as the class teacher (`active_role=teacher`, `scope_id=<class>`), `remove_message(m)` returns a row with `body is null`, `mention_targets = '{}'`, `removed_by_role = 'teacher'`, `removed_at is not null`.
  - `side_table_holds_text`: as superuser, `message_removals` has one row with the original body, the mentions and `removed_by_user_id = <teacher uid>`.
  - `audit_remove_row`: exactly one `audit_log` row with `action='remove'`, `actor_role='teacher'`, `target_table='messages'`, `target_id=m`, `target_student_id=<student id>`. For a parent message, `target_student_id is null`.
  - `idempotent_second_call`: a second `remove_message(m)` returns the same row, and the `message_removals` and `audit_log` 'remove' counts stay at 1.
  - `signal_sent`: `realtime.messages` has exactly one row with `event='message_removed'`, `topic='chat:'||conv`, `payload->>'id' = m` after the first call and still one after the second (check `190_` for how it reads realtime.messages).
  - `half_removed_rejected`: as superuser, `throws_ok` updating `removed_at = now()` on a row with body still set → `23514`.
  - `backfill_resolves_participants`: the backfill itself has already run before the test does, so assert its result instead. `select count(*) from messages m where m.sender_role is null and exists (select 1 from conversation_participants cp where cp.conversation_id = m.conversation_id and cp.user_id = m.sender_user_id)` = 0.

- [ ] **Step 2: Run, confirm it fails.** `npm run db:reset && npx supabase test db` → 200 fails on missing columns/function.

- [ ] **Step 3: Write the migration**, in this order:
  1. `alter table messages alter column body drop not null`; add the three columns with their checks; add `messages_removed_body_ck`.
  2. `before insert` trigger `messages_stamp_sender_role()` (SECURITY DEFINER, `search_path=''`): sets `new.sender_role` from `conversation_participants.participant_role` for `(new.conversation_id, new.sender_user_id)`. Always overwrite, never trust an incoming value. The column grant already blocks clients.
  3. Backfill: from current participants first, then from active `user_roles` of the sender scoped to the conversation's class (`role in ('teacher','student','parent')`, `scope_type='class'`, `scope_id = conversations.scope_id`). Leave anything else `null`.
  4. `message_removals` + `enable row level security`, `revoke all from anon, authenticated`, no policies.
  5. `audit_log`: drop and re-add the action check as `action in ('read','denied','remove')`. Look up the auto-generated constraint name with `\d audit_log` first.
  6. `create index messages_removed_idx on messages (conversation_id, removed_at) where removed_at is not null`.
  7. `remove_message`: lock and read the message (`for update`) joined to its conversation. If it is already removed, return it (no writes). Otherwise authorize per ADR Decision 3, using the Task 2 rules. Then `update … where id = p and removed_at is null returning *`. If no row, re-select and return. Then insert into `message_removals` and `audit_log`, and `perform realtime.send(jsonb_build_object('id', id), 'message_removed', 'chat:'||conversation_id, true)`. Unknown message id → `42501` (same as refused, so ids can't be probed).

- [ ] **Step 4: Run, confirm 200 passes and 000–191 still pass.** `npx supabase test db`. Expected: all green (040 #12 aside on a dirty stack).

- [ ] **Step 5: Commit.** `feat(#113): message removal schema and remove_message`.

### Task 2: Adversarial ladder tests (pgTAP only, AC 2–4, 8, 10)

**Files:**
- Test: `supabase/tests/201_chat_message_removal_adversarial.sql`
- Modify (if any fail): `supabase/migrations/20261114120000_chat_message_removal.sql` (still unmerged, so editing it is allowed)

**Interfaces:** Consumes Task 1's `remove_message`.

Authorization rules the function must satisfy. Each is one `throws_ok … '42501'` or `lives_ok`:

| Test name | Caller (active_role / scope) | Sender role | Expect |
|---|---|---|---|
| `teacher_other_class_refused` | teacher / class B | student in class A | 42501 |
| `teacher_scope_mismatch_refused` | teacher JWT scope = class B, holds user_roles for A too | student in A | 42501 |
| `teacher_on_teacher_refused` | teacher / A | teacher | 42501 |
| `teacher_on_coordinator_refused` | teacher / A | coordinator (superuser-inserted row) | 42501 |
| `self_removal_refused` | teacher / A | own message | 42501 |
| `non_class_conversation_refused` | coordinator / session | parent in a `session_staff` conv (superuser row) | 42501 |
| `active_role_parent_refused` | Teacher+Parent user switched to parent | student in A | 42501 |
| `no_claims_refused` | authenticated, no `active_role` | student | 42501 |
| `coordinator_in_session_allowed` | coordinator / session(A) | teacher | ok |
| `coordinator_other_session_refused` | coordinator / other session | student in A | 42501 |
| `coordinator_on_coordinator_refused` | coordinator / session(A) | coordinator | 42501 |
| `admin_on_coordinator_allowed` | admin | coordinator | ok |
| `admin_on_bv_coordinator_refused` | admin | bv_coordinator | 42501 |
| `null_sender_role_fail_closed` | teacher → refused; bv_coordinator → ok | `null` (superuser `update set sender_role = null`) | both |
| `anon_cannot_execute` | `set role anon` | — | 42501 |

Plus the unreadability checks, each run as a student, a parent and a teacher in class A:
- `message_removals_unreadable`: `throws_ok 'select * from message_removals'` → `42501`.
- `removed_body_unreadable`: `select body, mention_targets from messages where id = m` returns `null`, `'{}'`.
- `no_update_on_messages`: `throws_ok 'update messages set body = …'` → `42501`.

The "ok" rows assert behaviour, not membership: oversight roles aren't class participants (#137), so call the RPC directly.

- [ ] **Step 1: Write all tests.** **Step 2: Run** (`npx supabase test db`). Any failure is a Task 1 bug: fix it in the migration. **Step 3: Re-run green.** **Step 4: Commit** `test(#113): adversarial removal ladder`.

### Task 3: Oversight review function + coordinator audit visibility (migration B)

**Files:**
- Create: `supabase/migrations/20261114130000_removed_messages_oversight.sql`
- Test: `supabase/tests/202_removed_messages_oversight.sql`

**Interfaces:**
- Produces: `public.get_removed_messages_for_oversight(p_before_removed_at timestamptz default null, p_before_id uuid default null, p_limit int default 20) returns table(message_id uuid, class_name text, sender_label text, sender_role text, created_at timestamptz, body text, remover_label text, removed_by_role text, removed_at timestamptz)`. Order is `removed_at desc, message_id desc`. Keyset: rows strictly before `(p_before_removed_at, p_before_id)`. *(Plan call: the spec's single `p_before` can't page through ties, see Review Focus 4.)*
- Labels: student → `first_name || ' ' || left(last_name,1) || '.'`. Parent → `'Parent · ' || families.label`, for the parent's family with an enrollment in that class. If none resolves, use `'Parent'`. Staff → the role (`'teacher'`, `'coordinator'`, …). `null` sender_role → `'Unknown sender'`. Remover: teacher → `'the ' || class_name || ' teacher'`, coordinator → `'a coordinator'`, bv_coordinator/admin → `'an admin'`.

- [ ] **Step 1: Write the failing tests** (`202_`):
  - `teacher_refused`, `student_refused`, `parent_refused`, `no_claims_refused`: `throws_ok … '42501'`.
  - `coordinator_scoped`: a coordinator for session S sees removals in S's classes and none from session T.
  - `admin_org_wide`: an admin sees both.
  - `review_returns_text_and_labels`: the row's body equals the original. `sender_label = 'Aarav M.'`-style for the fixture student, and `'Parent · <label>'` for the parent. `remover_label = 'the <class> teacher'`.
  - `review_audit_per_row`: one call returning 3 rows adds exactly 3 `audit_log` rows with `action='read'`, `target_table='messages'`, the actor's role, and `target_student_id` set only for student senders.
  - `limit_capped_50`: with 55 removals, `p_limit => 500` returns 50.
  - `review_keyset_ties`: 3 removals with identical `removed_at` paged with `p_limit => 2` returns all 3 across two pages, no duplicates.
  - `coord_policy_old_clauses_pinned`: one assertion per existing clause (student-target row, `classes` row, `attendance`/`sessions` session-scoped row) stays visible to the in-session coordinator and hidden from another session's coordinator.
  - `coord_sees_parent_removal_entry`: a coordinator for S sees the `'remove'` row for a parent message in S's class, and a coordinator for T does not.

- [ ] **Step 2: Run, confirm it fails.**
- [ ] **Step 3: Write the migration.** Function: SECURITY DEFINER, `search_path=''`, cap `least(coalesce(p_limit,20),50)`, fail closed on a null coordinator scope. Write the audit rows in the same loop that returns them (pattern: `get_class_roster_for_staff` in `20260910120000`). Policy: `drop policy … ; create policy audit_log_coordinator_read …` copying the three clauses from `20260729092000` verbatim, plus:
  ```sql
  or (
    audit_log.target_table = 'messages'
    and exists (
      select 1 from messages m
      join conversations cv on cv.id = m.conversation_id and cv.kind = 'class'
      join classes c on c.id = cv.scope_id
      where m.id = audit_log.target_id
        and c.session_id = (auth.jwt()->>'scope_id')::uuid
    )
  )
  ```
  Keep the bare `auth.jwt()` form. Don't wrap it (memory: *rls-cloud-timeout-and-bare-auth-jwt*).
- [ ] **Step 4: Run the full suite green.** **Step 5: Commit** `feat(#113): oversight review function and coordinator audit visibility`.

### Task 4: `lib/chat` model, API and catch-up (vitest)

**Files:**
- Modify: `lib/chat/messageList.ts`, `lib/chat/messagesApi.ts`, `lib/chat/conversationChannel.ts`, `lib/chat/conversationSession.ts`
- Test: `lib/chat/__tests__/{messageList,messagesApi,conversationChannel,conversationSession}.test.ts` (extend)

**Interfaces:**
- Consumes: Task 1 column names, `remove_message` RPC, `message_removed` event.
- Produces (`messageList.ts`):
  - `ChatMessage` gains `body: string | null`, `sender_role: Role | null`, `removed_at: string | null`, `removed_by_role: Role | null` (`Role` = the six-role union already in `lib/auth`).
  - `isRemoved(m: ChatMessage): boolean`
  - `placeholderFor(m: ChatMessage): string | null` (null when not removed)
  - `canOfferRemove(m: ChatMessage, activeRole: Role | null, userId: string | null): boolean` (spec Behavior 1; #24's menu uses it)
  - `interface RemovalPatch { id: string; removed_at: string; removed_by_role: Role }`
  - `applyRemovals(held: readonly ChatMessage[], patches: readonly RemovalPatch[]): ChatMessage[]` (only ids in `held`; sets `body=null`, `mention_targets=[]`)
  - `mergeMessages` rule: if either the held or the incoming copy is removed, the result is removed.
- Produces (`messagesApi.ts`): `COLUMNS` += `sender_role, removed_at, removed_by_role`. `fetchRemovedSince(conversationId, sinceIso): Promise<RemovalPatch[]>`, paged like `fetchSince` on `removed_at >= since`. `removeMessage(messageId): Promise<ChatMessage>` via `client.rpc('remove_message', { p_message_id })`. The client type widens to `Pick<SupabaseClient,'from'|'rpc'>`.
- Produces (`conversationChannel.ts`): `MESSAGE_REMOVED_EVENT = 'message_removed'`, `ChannelHandlers.onRemoved(messageId: string | null): void`.
- Produces (`conversationSession.ts`): `ConversationState.removing: string[]`. `ConversationSession.remove(messageId): Promise<void>`, which throws `RemoveMessageError { kind: 'refused' | 'network' }`. Exported copy constants `REMOVE_REFUSED_COPY`, `REMOVE_NETWORK_COPY`.

- [ ] **Step 1: Write the failing tests:**
  - `placeholderFor` returns each of the three exact strings for `teacher`, `coordinator`, `bv_coordinator`, `admin`, and `null` for a live message. `isRemoved` keys off `removed_at`.
  - `canOfferRemove`: true only for active teacher + sender_role student/parent + not self + not removed. False for each single violation, including `sender_role null`.
  - `applyRemovals` patches a loaded id and ignores an unknown id (the list is unchanged, same length).
  - `merge never un-removes`: merge a removed held copy with a stale incoming copy that still has its body → removed. The reverse order → removed.
  - `fetchRemovedSince` calls `.gte('removed_at', since)` and selects only `id, removed_at, removed_by_role`.
  - `fetchRemovedSince cursor is the oldest loaded message`: the session calls it with the oldest held message's `created_at` on every catch-up tick. *(Plan call: any removal of a loaded message has `removed_at` ≥ that message's `created_at`, so this cursor never misses one and needs no client clock. Removals are rare and the partial index serves it.)*
  - `onRemoved` triggers catch-up without adding the id to the pending pings (so it never calls `checkAccess` for an id outside the window).
  - `remove` success: `removing` contains the id while pending, and the row is patched from the RPC result before any signal.
  - `remove` refused: the RPC error has `code '42501'` → throws `kind:'refused'`, the row is unchanged and `removing` is cleared.
  - `remove` network failure: a fetch TypeError or a missing code → throws `kind:'network'`, the row keeps its body.
- [ ] **Step 2: Run** `npx vitest run lib/chat` → fails.
- [ ] **Step 3: Implement.** In `catchUp`, after `fetchSince`/`fetchLatest`, also call `fetchRemovedSince` when the list is non-empty and fold it in with `applyRemovals`. A failure there follows the same `errorCode` path.
- [ ] **Step 4: Run** `npx vitest run lib/chat && npm run typecheck` → green. Fix any existing `body: string` consumers flagged by tsc (`useConversationMessages.ts`, `app/(dev)` screens) by rendering `placeholderFor(m) ?? m.body`.
- [ ] **Step 5: Commit** `feat(#113): lib/chat removal model, call and catch-up`.

### Task 5: Review list data + view state (vitest)

**Files:**
- Create: `features/teacher/chat-message-removal/api.ts`, `viewState.ts`
- Test: `features/teacher/chat-message-removal/__tests__/{api,viewState}.test.ts`

**Interfaces:**
- Consumes: Task 3's function signature and return columns.
- Produces: `type RemovedMessageRow` (Task 3's columns, camelCased). `fetchRemovedMessages(client, cursor?: { removedAt: string; id: string }): Promise<RemovedMessageRow[]>` (page 20). `type ReviewView = { kind:'loading' } | { kind:'empty' } | { kind:'content'; rows; hasMore; loadingMore; loadError: boolean }`. `reduceReview(state, event)` for the events `loaded(rows)`, `loadMoreStarted`, `loadedMore(rows)`, `failed`.
- Copy check: if vitest can't confirm Dashboard placement, it's verified in Task 6 by running the app.

- [ ] **Step 1: Failing tests:** `api` passes `p_before_removed_at`/`p_before_id` from the last row and `p_limit: 20`. `reduceReview`: initial `loading` + `loaded([])` → `empty`. `loaded(20 rows)` → `content` with `hasMore true`. `loadedMore(5)` → 25 rows, `hasMore false`. `failed` while in `content` keeps the rows and sets `loadError` (the spec's "keep loaded rows, inline retry"). `failed` from `loading` → `content` with `rows: []`, `loadError: true`.
- [ ] **Step 2: Run → fail. Step 3: Implement. Step 4: Run → pass. Step 5: Commit** `feat(#113): removed-messages review data and state`.

### Task 6: Review screen, route and Dashboard card

**Files:**
- Create: `features/teacher/chat-message-removal/RemovedMessagesScreen.tsx`, `app/removed-messages.tsx`
- Modify: `app/(tabs)/dashboard.tsx`

**Interfaces:** Consumes Task 5. `app/removed-messages.tsx` calls `useRoleGuard("dashboard")`. navMap already limits `dashboard` to coordinator/bv_coordinator/admin, so other roles are redirected (ADR-0014).

- [ ] **Step 1: Load the `design-system` skill.** Refresh the design mirror (`/design-login`) and record any drift against the spec's UI references.
- [ ] **Step 2: Build the screen** to spec UI: header with the role badge and scope (`Session: <name>` via the existing scope-label resolver, or `All sessions`), card rows (meta line in tabular numerics, quote block, muted remover line), skeleton/empty/inline-retry states, `Load more` secondary, footnote. Single column, max-width matching the Dashboard pane, at 360/768/1024/1440. Unistyles tokens only.
- [ ] **Step 3: Dashboard card** `Removed messages` rendered for coordinator, bv_coordinator and admin. The coordinator branch currently returns `ComplianceDashboardScreen` alone, so add the card above it. bv_coordinator/admin currently see the placeholder, so the card replaces that.
- [ ] **Step 4: Verify.** `npm run typecheck && npm run lint && npm test`, then use the `run` skill on web: sign in as a seeded coordinator and an admin, remove a message via SQL as a teacher, and confirm the card, the list, Load more and that the audit rows appear. Then try the route as a teacher and confirm the redirect to `/feed`. Screenshot each state.
- [ ] **Step 5: Commit** `feat(#113): removed-messages review screen`.

### Task 7: Docs, contract hand-off, staging checks

- [ ] Spec `chat-message-removal.md`: stage line → `/plan ✓`. Teacher `_index.md` row updated.
- [ ] Comment on #24 linking the spec's Design section and the `lib/chat` contract (`canOfferRemove`, `placeholderFor`, `session.remove`, `RemoveMessageError`, copy constants).
- [ ] **Owed at `/deploy-staging`, not now:** check staging drift before any `db push` (memory: *staging-schema-drift-wrapped-auth*). Time `get_removed_messages_for_oversight` as admin org-wide. `EXPLAIN` `messages_member_select` before/after and confirm the plan is unchanged. Run the RLS adversarial agent before `/promote`.

---

## Flags for `/architect`

None architecturally significant. These two plan calls were **approved by the human on 2026-11-14** (sign-off page v2):
1. The review function pages on `(removed_at, message_id)` (two params) instead of the spec's single `p_before`.
2. The removal catch-up cursor is the oldest loaded message's `created_at`, not a clock-based "since".
