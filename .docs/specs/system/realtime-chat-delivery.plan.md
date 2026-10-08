# System — realtime-chat-delivery — plan

> `/plan` 2026-10-07. Turns the [Design section](realtime-chat-delivery.md#design-2026-10-07) into ordered, test-first tasks.
> **Stage:** `/refine` ✓ `/architect` ✓ (ADR-2026-10-07) `/design` ✓ `/plan` ✓ (this — signed off by Maulik, 2026-10-07) → `/migration` → `/build` → `/test` → `/deploy-staging`.
> **Spec:** [realtime-chat-delivery.md](realtime-chat-delivery.md) · **Governing ADR:** [ADR-2026-10-07-realtime-chat-signal-then-fetch](../../adr/2026-10-07-realtime-chat-signal-then-fetch.md) · **Issue:** #6

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. The pipeline stages (`/migration`, `/build`, `/test`) are typed by the human; do the work, show the evidence, then ask them to type the stage command.

**Goal:** deliver a "new message saved" signal live to the current participants of a conversation and to nobody else, and give `class-chat-ui` (#24) one hook that always holds the complete, ordered message list.

**Architecture:** one migration adds a trigger on `messages` that emits a two-key signal (`id`, `created_at`) through `realtime.send()` on the private topic `chat:<conversation_id>`, plus one `select` policy on `realtime.messages` that grants a topic only to a participant. The client (`lib/chat/`) joins that channel while a conversation is on screen and treats every ping, join, foreground and 30-second tick as "fetch newer than my last message" under the existing `messages` RLS. No message content ever enters the transport.

**Tech stack:** Postgres + pgTAP (`supabase/migrations/`, `supabase/tests/`), Supabase Realtime (Broadcast from the database, private channels), `@supabase/supabase-js` ^2.108.2, TypeScript, Vitest 4, Node 22.

## Global constraints

- **Access control is RLS in the database** (non-negotiable #1). Nothing in `lib/chat/` decides who may read; the `unavailable` state is display hygiene only.
- **Anon key only in client code** (non-negotiable #2). `lib/chat/` uses the existing `supabase` export from `lib/supabase.ts`. No new client.
- **Schema is code** (non-negotiable #3): one new timestamped migration. Never edit `20260709043349_chat_durability_tables.sql`.
- **Tests first, seen to fail** (non-negotiable #4). Every task below starts red.
- **No test-only DB objects in a migration** (ADR-2026-09-07). `rt_visible()` in test 191 is created inside the test's own transaction and rolled back.
- **Payload is exactly `id` and `created_at`.** No body, sender or mention data in `realtime.messages`.
- **Topic format is exactly `chat:<lowercase uuid>`.** Event name is exactly `message_saved`.
- **Clients are listen-only.** No `insert`, `update` or `delete` policy on `realtime.messages` for any client role; none for `anon`.
- **Policy style:** calls the existing `public.is_conversation_participant(uuid)`; bare `auth.uid()` inside it; no `(select auth.…())` wrapping; reads no `active_role` or scope claim. `is_conversation_participant` is **not** redefined. The existing `messages` / `conversations` policies are **not** rewritten.
- **Client constants:** catch-up overlap 10 s · catch-up page 100 · initial load 50 · timer 30 s.
- **A client inserts only** `conversation_id`, `sender_user_id`, `body`, `mention_targets`.
- **No UI.** `app/(tabs)/chat.tsx` stays a placeholder. This module does not call push.
- **US residency / no new vendor.** Existing Supabase project only.

## Verified during `/plan` (2026-10-07, isolated stack)

Run on a throwaway stack (own `project_id`, 553xx ports; torn down afterwards), not the shared one. The draft migration and both pgTAP files in Task 1 were executed there, so the SQL below is known to run.

| Question carried from `/design` | Result |
| --- | --- |
| Does `realtime.send()` write a row inside a pgTAP transaction on a fresh stack? | **Yes.** After `supabase start` → `supabase db reset` (CI's order) and before any client connects, `realtime.messages` already has five daily partitions (today … +4). A send inside `begin … rollback` produces one readable row. The signal tests observe `realtime.messages` directly; no other observation point is needed. |
| Does the trigger need `security definer`? | **Yes.** As `security invoker` the insert is refused by RLS, `realtime.send()` swallows it as a warning, and no signal is written (mutation run: 5 of 34 assertions in test 190 go red). `postgres` owns the function and has `bypassrls`. |
| Does the live service agree with the pgTAP simulation? | **Yes** (real websocket, seeded logins): participant joins and gets the ping; non-participant, malformed topic and uppercase-uuid topic are refused with `Unauthorized`; a client `send` on the channel returns `ok` to the sender and is **not** delivered; an insert supplying `created_at` is refused `42501`. Ping arrives within ~1 ms of the save locally. |
| Does the existing suite survive the migration? | **Yes.** 30 files / 406 tests pass with it applied; 32 files / 487 with the two new files. |

Three things found that the spec does not say:

1. **The policy as written in the spec is wider than the spec's own tests allow.** `extension = 'broadcast' and is_conversation_participant(chat_topic_conversation_id(realtime.topic()))` never compares the *row's* topic to the joined topic. A participant of class A, joined to `chat:A`, can then see every row in `realtime.messages`, for every conversation (measured: 7 of 7). It is not reachable today (the `realtime` schema is not exposed through the API and Realtime fans out by topic), but it fails the spec's last adversarial case and leaves the table protected by an accident of configuration. **This plan adds `and topic = realtime.topic()`.** Verified against the live service: joins, pings and refusals behave identically. → **Decision A below.**
2. **A refused channel left on the socket slows everything else on it.** `supabase-js` keeps retrying a refused join; with one refused channel open, pings on a healthy channel on the same connection were intermittently delayed by about 5 seconds (measured 1 in 6). The access-lost path must *remove* the channel, not just stop listening, and topics must be lowercased before joining so a mixed-case id from a link cannot become a permanently refused channel. Covered in Tasks 4 and 5.
3. **`realtime.send()` runs `SET LOCAL realtime.topic`** in the saving transaction. Harmless in production (one request, one transaction); in pgTAP it means the setting holds the last saved message's topic, so every assertion sets the topic itself (`rt_visible()` in test 191).

## Decisions (signed off by Maulik, 2026-10-07)

All four confirmed as recommended, from the plain-language summary.

- **A. Tighten the channel policy with `topic = realtime.topic()`** (finding 1). A stricter form of ADR Decision 2, not a change to it; no ADR needed. It changes one row of the spec's "Data & RLS impact" table. *Recommended: yes.*
- **B. Where the end-to-end join check runs** (carried from `/design`). *Recommended:* a script, `scripts/e2e-realtime-join.mjs`, run in the existing `db-and-rls` CI job right after `supabase test db` — the stack is already up and seeded there, and it adds a few seconds. The alternative is local-only at `/test`, which leaves "the live service agrees with our simulation" unchecked on every later PR. The script signs seeded users in by asking the **local** stack for a magic-link token with the local stack's own service key, read at run time from `supabase status`; it refuses to run against anything but `127.0.0.1`/`localhost` and stores nothing.
- **C. Two client units beyond the three the spec lists.** The spec names `messageList.ts`, `conversationChannel.ts` and the hook. The repo cannot render a hook in tests, so the catch-up / single-flight / access-lost behaviour the spec requires tests for has to live in a plain module: `conversationSession.ts`, with `messagesApi.ts` for the five queries. Same pattern as `setupAutoRefreshOnRegain`. The hook's public shape is exactly the spec's.
- **D. One small addition to the access-lost rule.** The spec checks access when a ping's message is missing or a join is refused. This plan also checks when a catch-up leaves the list **empty**, so a non-participant who opens a conversation while Realtime is unreachable gets `unavailable` rather than an empty chat that looks real. One extra single-row read, only while a conversation has no messages.

## Flagged (not this item's to fix)

- **Students in the pilot "7, 8, 9" class are class-chat participants.** `sync_class_participants` adds any enrolled student who has a login, with no grade check; the pilot seed gives every student in that combined class a login. ADR-0015 says KG–Gr 8 class chats have no student participants. Membership rules are out of scope here ("no change to who is a participant"); route to `/architect` before `class-chat-ui` (#24) is built. Test 191's "student against a KG–Gr 8 class" case uses a student who is *not enrolled* there, which is what the channel policy can and should prove.

## Shared seam (§12.6)

- **Schema (serialized):** one migration, `supabase/migrations/<timestamp>_realtime_chat_delivery.sql`. Its timestamp must sort after `20261003130000` (PR #117's last migration). It touches the `messages` grant and adds objects; it does not touch `is_conversation_participant`, so there is **no merge-order dependency on #117** (ADR Decision 4). If #117 merges first, merge `main` and re-run the suite; nothing else changes.
- **App code (parallel):** `lib/chat/` is new and isolated. Tasks 2–4 are independent of each other and of Task 1; Task 5 needs 2–4; Task 6 needs 5; Task 7 needs 1.
- **Generated/shared files:** `.docs/specs/system/_index.md` row (Task 8). No ADR is added, so the ADR index is untouched.
- **Branch / worktree:** `feat/issue-6-realtime-chat-delivery` in the main checkout. Only one worktree exists today. If another is live when `db reset` is needed, use the isolated-stack recipe (own `project_id`, 553xx ports) rather than the shared stack.

## Review focus

Failure modes the spec implies but its test list does not exercise; each is pinned by a test in the task named.

1. **Mixed-case conversation id** (from a link or a hand-typed route) → must still join; the policy accepts lowercase only. *Task 4, `chatTopic` test.*
2. **A message sent before the first load has succeeded** → the next catch-up must still do the initial load, not "newer than the message I just sent", or the whole history is skipped. *Task 5.*
3. **Timestamps that differ only below a millisecond, or whose trailing zeros Postgres trimmed** → order must follow the database's, not `Date`'s millisecond truncation. *Task 2.*
4. **Access lost** → the channel is removed from the socket, not left retrying (finding 2). *Task 5.*
5. **Non-participant opens a conversation while Realtime is unreachable** → `unavailable`, not an empty "ready" chat (Decision D). *Task 5.*

## File structure

| File | Responsibility |
| --- | --- |
| `supabase/migrations/<ts>_realtime_chat_delivery.sql` | column grant, index, topic parser, trigger function + trigger, channel policy |
| `supabase/tests/190_realtime_chat_delivery.sql` | objects, privileges, parser, column grant, signal shape |
| `supabase/tests/191_realtime_chat_delivery_adversarial.sql` | channel policy, role × scope × grade band |
| `lib/chat/messageList.ts` | pure: `ChatMessage`, ordering, merge, catch-up cursor, constants |
| `lib/chat/messagesApi.ts` | the five PostgREST calls |
| `lib/chat/conversationChannel.ts` | join/leave the private channel; map channel states to handlers |
| `lib/chat/conversationSession.ts` | catch-up, single flight, timer, access-lost, send, older pages |
| `lib/chat/appActivity.ts` | foreground/background signal (web + native) |
| `lib/chat/signOutCleanup.ts` | remove all channels on `SIGNED_OUT` |
| `lib/chat/useConversationMessages.ts` | the hook #24 consumes; thin wiring only |
| `lib/auth/SessionProvider.tsx` | one line: call the sign-out cleanup |
| `scripts/e2e-realtime-join.mjs` | end-to-end join check against the local stack |
| `.github/workflows/ci.yml` | one step in `db-and-rls` |

---

## Task 1 — Database: signal, column grant, channel policy (`/migration`)

**Files:**
- Create (test): `supabase/tests/190_realtime_chat_delivery.sql`
- Create (test): `supabase/tests/191_realtime_chat_delivery_adversarial.sql`
- Create: `supabase/migrations/<timestamp>_realtime_chat_delivery.sql` (via `/migration realtime_chat_delivery`)
- Modify: `.docs/specs/system/realtime-chat-delivery.md` (Data & RLS table, policy row — Decision A)

**Interfaces:**
- Consumes: `public.is_conversation_participant(uuid)`, `tests.create_supabase_user(text)`, `tests.authenticate_as(uuid, text, text, uuid)`, `tests.clear_authentication()`.
- Produces: trigger `messages_broadcast_saved`; `public.broadcast_message_saved()`; `public.chat_topic_conversation_id(text) returns uuid`; policy `chat_participants_receive_broadcast` on `realtime.messages`; index `messages_conversation_created_id_idx`; column-level insert on `messages`. Topic `chat:<conversation_id>`, event `message_saved`, payload `{ "id": uuid, "created_at": timestamptz }`.

- [ ] **Step 1 — Write the failing schema-and-signal test.** Create `supabase/tests/190_realtime_chat_delivery.sql`:

```sql
-- System -> realtime-chat-delivery (issue #6, ADR-2026-10-07): schema and signal.
-- The adversarial role x scope matrix for the channel policy lives in 191.
begin;
select plan(34);

insert into centers (id, name) values ('d6000000-0000-0000-0000-000000000001', 'RT Center');
insert into sessions (id, center_id, name, start_date, end_date, day_of_week, start_time, end_time)
  values ('d6000000-0000-0000-0000-000000000011', 'd6000000-0000-0000-0000-000000000001', 'RT Session', '2026-01-01', '2026-06-01', 0, '09:00', '10:30');
insert into classes (id, session_id, name, grade_band)
  values ('d6000000-0000-0000-0000-000000000021', 'd6000000-0000-0000-0000-000000000011', 'RT Class HS', 'HS9-12');
insert into families (id, label) values ('d6000000-0000-0000-0000-000000000031', 'RT Family');
select tests.create_supabase_user('rt-student@test.local') as v_student \gset
insert into students (id, family_id, first_name, last_name, grade_level, user_id) values
  ('d6000000-0000-0000-0000-000000000041', 'd6000000-0000-0000-0000-000000000031', 'Rt', 'Student', 'HS9', :'v_student'::uuid);
insert into enrollments (student_id, class_id, session_id, status) values
  ('d6000000-0000-0000-0000-000000000041', 'd6000000-0000-0000-0000-000000000021', 'd6000000-0000-0000-0000-000000000011', 'active');

select id as v_conv from conversations
  where kind = 'class' and scope_id = 'd6000000-0000-0000-0000-000000000021'::uuid \gset

-- ---------------------------------------------------------------------------------------------
-- Objects and privileges
-- ---------------------------------------------------------------------------------------------
select has_index('public', 'messages', 'messages_conversation_created_id_idx',
  'the catch-up index exists');
select is(
  (select pg_get_indexdef(indexrelid) from pg_index where indexrelid = 'public.messages_conversation_created_id_idx'::regclass),
  'CREATE INDEX messages_conversation_created_id_idx ON public.messages USING btree (conversation_id, created_at DESC, id DESC)',
  'the catch-up index is (conversation_id, created_at desc, id desc)'
);
select has_trigger('public', 'messages', 'messages_broadcast_saved', 'the signal trigger exists on messages');
select is(
  (select prosecdef from pg_proc where oid = 'public.broadcast_message_saved()'::regprocedure), true,
  'the trigger function is security definer'
);
select is(
  (select proconfig from pg_proc where oid = 'public.broadcast_message_saved()'::regprocedure),
  array['search_path=""'],
  'the trigger function pins an empty search_path'
);
select is(has_function_privilege('authenticated', 'public.broadcast_message_saved()', 'execute'), false,
  'authenticated cannot execute the trigger function');
select is(has_function_privilege('anon', 'public.broadcast_message_saved()', 'execute'), false,
  'anon cannot execute the trigger function');
select is(has_function_privilege('authenticated', 'public.chat_topic_conversation_id(text)', 'execute'), true,
  'authenticated can execute the topic parser (a policy expression runs as the caller)');
select is(has_function_privilege('anon', 'public.chat_topic_conversation_id(text)', 'execute'), false,
  'anon cannot execute the topic parser');

select is(has_table_privilege('authenticated', 'public.messages', 'insert'), false,
  'authenticated no longer holds table-wide insert on messages');
select is(has_column_privilege('authenticated', 'public.messages', 'id', 'insert'), false,
  'authenticated cannot supply messages.id');
select is(has_column_privilege('authenticated', 'public.messages', 'created_at', 'insert'), false,
  'authenticated cannot supply messages.created_at');
select is(
  (select array_agg(column_name::text order by column_name::text) from information_schema.column_privileges
    where table_schema = 'public' and table_name = 'messages' and grantee = 'authenticated' and privilege_type = 'INSERT'),
  array['body', 'conversation_id', 'mention_targets', 'sender_user_id'],
  'authenticated may insert exactly the four client-written columns'
);
select is(has_table_privilege('authenticated', 'public.messages', 'select'), true,
  'authenticated still holds select on messages');

select is(
  (select array_agg(cmd || ':' || roles::text order by policyname) from pg_policies
    where schemaname = 'realtime' and tablename = 'messages'),
  array['SELECT:{authenticated}'],
  'realtime.messages has exactly one policy: select, for authenticated (listen-only clients)'
);

-- ---------------------------------------------------------------------------------------------
-- Topic parser: never raises
-- ---------------------------------------------------------------------------------------------
select is(public.chat_topic_conversation_id('chat:' || :'v_conv'), :'v_conv'::uuid,
  'a well-formed topic parses to its conversation id');
select is(public.chat_topic_conversation_id(''), null::uuid, 'empty topic -> null');
select is(public.chat_topic_conversation_id(null), null::uuid, 'null topic -> null');
select is(public.chat_topic_conversation_id('chat:'), null::uuid, 'prefix only -> null');
select is(public.chat_topic_conversation_id('chat:not-a-uuid'), null::uuid, 'non-uuid -> null, no cast error');
select is(public.chat_topic_conversation_id('chat:' || upper(:'v_conv')), null::uuid, 'uppercase uuid -> null');
select is(public.chat_topic_conversation_id('chat:' || :'v_conv' || ':extra'), null::uuid, 'trailing suffix -> null');
select is(public.chat_topic_conversation_id('chat:' || :'v_conv' || E'\n'), null::uuid, 'trailing newline -> null');
select is(public.chat_topic_conversation_id('room:' || :'v_conv'), null::uuid, 'different prefix -> null');
select is(public.chat_topic_conversation_id(:'v_conv'), null::uuid, 'bare uuid -> null');

-- ---------------------------------------------------------------------------------------------
-- Column grant and signal
-- ---------------------------------------------------------------------------------------------
select is(
  (select count(*) from realtime.messages where topic = 'chat:' || :'v_conv')::int, 0,
  'baseline: no signal exists for this conversation before any message is saved'
);

select tests.authenticate_as(:'v_student'::uuid, 'student');

select lives_ok(
  format('insert into messages (conversation_id, sender_user_id, body, mention_targets) values (%L::uuid, auth.uid(), %L, array[]::text[])',
    :'v_conv', 'hello'),
  'a participant can save a message with the four permitted columns'
);
select throws_ok(
  format('insert into messages (conversation_id, sender_user_id, body, mention_targets, created_at) values (%L::uuid, auth.uid(), %L, array[]::text[], now() - interval ''1 day'')',
    :'v_conv', 'backdated'),
  '42501', null,
  'a participant cannot supply created_at'
);
select throws_ok(
  format('insert into messages (id, conversation_id, sender_user_id, body, mention_targets) values (gen_random_uuid(), %L::uuid, auth.uid(), %L, array[]::text[])',
    :'v_conv', 'chosen id'),
  '42501', null,
  'a participant cannot supply id'
);

select tests.clear_authentication();

select is(
  (select count(*) from realtime.messages where topic = 'chat:' || :'v_conv')::int, 1,
  'exactly one signal was written: one for the saved message, none for the two refused inserts'
);
select is(
  (select event || '|' || private::text || '|' || extension from realtime.messages where topic = 'chat:' || :'v_conv'),
  'message_saved|true|broadcast',
  'the signal is a private broadcast with event message_saved'
);
select is(
  (select array_agg(k order by k) from realtime.messages rm, jsonb_object_keys(rm.payload) k where rm.topic = 'chat:' || :'v_conv'),
  array['created_at', 'id'],
  'the payload has exactly two keys: id and created_at (no body, sender or mentions)'
);
select is(
  (select count(*) from realtime.messages rm
     join messages m on m.id = (rm.payload->>'id')::uuid and m.created_at = (rm.payload->>'created_at')::timestamptz
    where rm.topic = 'chat:' || :'v_conv' and m.body = 'hello')::int,
  1,
  'the payload id and created_at are those of the saved message'
);
select is(
  (select count(*) from realtime.messages where payload::text like '%hello%')::int, 0,
  'the message body is nowhere in the transport store'
);

select * from finish();
rollback;
```

- [ ] **Step 2 — Write the failing adversarial test.** Create `supabase/tests/191_realtime_chat_delivery_adversarial.sql`:

```sql
-- Adversarial suite for the chat channel policy on realtime.messages (issue #6, ADR-2026-10-07,
-- acceptance criterion 6). Realtime authorizes a channel join by evaluating the realtime.messages
-- policies with the `realtime.topic` setting equal to the requested topic, as the connecting
-- user. rt_visible() reproduces that: set the topic, count what the caller can see.
--
-- Every DENY is paired with a CONTROL on the same topic. Each conversation holds exactly one
-- signal, so a control is `1` and a deny is `0`; no assertion can pass because the table was empty.
--
-- realtime.send() runs `SET LOCAL realtime.topic` in the saving transaction, so after any insert
-- into messages the setting holds that message's topic. Never rely on it: rt_visible() always
-- sets the topic itself.
begin;
select plan(47);

create function public.rt_visible(p_topic text) returns integer
language sql volatile
as $$
  select set_config('realtime.topic', p_topic, true);
  select count(*)::int from realtime.messages;
$$;
grant execute on function public.rt_visible(text) to authenticated, anon;

-- ---------------------------------------------------------------------------------------------
-- Fixture
-- ---------------------------------------------------------------------------------------------
insert into centers (id, name) values ('e6000000-0000-0000-0000-000000000001', 'RT Adv Center');
insert into sessions (id, center_id, name, start_date, end_date, day_of_week, start_time, end_time) values
  ('e6000000-0000-0000-0000-000000000011', 'e6000000-0000-0000-0000-000000000001', 'RT Adv S1', '2026-01-01', '2026-06-01', 0, '09:00', '10:30'),
  ('e6000000-0000-0000-0000-000000000012', 'e6000000-0000-0000-0000-000000000001', 'RT Adv S2', '2026-01-01', '2026-06-01', 0, '09:00', '10:30');
insert into classes (id, session_id, name, grade_band) values
  ('e6000000-0000-0000-0000-0000000000a1', 'e6000000-0000-0000-0000-000000000011', 'RT Adv A (HS)', 'HS9-12'),
  ('e6000000-0000-0000-0000-0000000000b1', 'e6000000-0000-0000-0000-000000000011', 'RT Adv B (HS)', 'HS9-12'),
  ('e6000000-0000-0000-0000-0000000000c1', 'e6000000-0000-0000-0000-000000000011', 'RT Adv K (KG-2)', 'KG, 1, 2'),
  ('e6000000-0000-0000-0000-0000000000d1', 'e6000000-0000-0000-0000-000000000012', 'RT Adv X (HS, other session)', 'HS9-12');

select tests.create_supabase_user('rta-student@test.local') as v_student \gset
select tests.create_supabase_user('rta-parent@test.local') as v_parent \gset
select tests.create_supabase_user('rta-teacher-a@test.local') as v_teacher_a \gset
select tests.create_supabase_user('rta-teacher-x@test.local') as v_teacher_x \gset
select tests.create_supabase_user('rta-coord-1@test.local') as v_coord_1 \gset
select tests.create_supabase_user('rta-coord-2@test.local') as v_coord_2 \gset
select tests.create_supabase_user('rta-bvc@test.local') as v_bvc \gset
select tests.create_supabase_user('rta-admin@test.local') as v_admin \gset
select tests.create_supabase_user('rta-wd-student@test.local') as v_wd_student \gset
select tests.create_supabase_user('rta-wd-parent@test.local') as v_wd_parent \gset
select tests.create_supabase_user('rta-sib-student@test.local') as v_sib_student \gset
select tests.create_supabase_user('rta-sib-parent@test.local') as v_sib_parent \gset
select tests.create_supabase_user('rta-ab-student@test.local') as v_ab_student \gset
select tests.create_supabase_user('rta-re-student@test.local') as v_re_student \gset
select tests.create_supabase_user('rta-k-parent@test.local') as v_k_parent \gset
select tests.create_supabase_user('rta-multirole@test.local') as v_multirole \gset
select tests.create_supabase_user('rta-outsider@test.local') as v_outsider \gset

insert into families (id, label) values
  ('e6000000-0000-0000-0000-000000000031', 'RT Adv Family Enrolled'),
  ('e6000000-0000-0000-0000-000000000032', 'RT Adv Family Withdrawn'),
  ('e6000000-0000-0000-0000-000000000033', 'RT Adv Family Siblings'),
  ('e6000000-0000-0000-0000-000000000034', 'RT Adv Family A-then-B'),
  ('e6000000-0000-0000-0000-000000000035', 'RT Adv Family Re-enrolled'),
  ('e6000000-0000-0000-0000-000000000036', 'RT Adv Family KG');

-- v_multirole is a real second guardian of the enrolled student (-> participant of class A) and
-- holds a real teacher grant on class X (-> participant of class X).
insert into family_members (family_id, user_id, relationship) values
  ('e6000000-0000-0000-0000-000000000031', :'v_parent'::uuid, 'guardian'),
  ('e6000000-0000-0000-0000-000000000031', :'v_multirole'::uuid, 'guardian'),
  ('e6000000-0000-0000-0000-000000000032', :'v_wd_parent'::uuid, 'guardian'),
  ('e6000000-0000-0000-0000-000000000033', :'v_sib_parent'::uuid, 'guardian'),
  ('e6000000-0000-0000-0000-000000000036', :'v_k_parent'::uuid, 'guardian');

insert into students (id, family_id, first_name, last_name, grade_level, user_id) values
  ('e6000000-0000-0000-0000-000000000041', 'e6000000-0000-0000-0000-000000000031', 'Enrolled', 'Student', 'HS9', :'v_student'::uuid),
  ('e6000000-0000-0000-0000-000000000042', 'e6000000-0000-0000-0000-000000000032', 'Withdrawn', 'Student', 'HS9', :'v_wd_student'::uuid),
  ('e6000000-0000-0000-0000-000000000043', 'e6000000-0000-0000-0000-000000000033', 'Sibling', 'Leaving', 'HS9', :'v_sib_student'::uuid),
  ('e6000000-0000-0000-0000-000000000044', 'e6000000-0000-0000-0000-000000000033', 'Sibling', 'Staying', 'HS10', null),
  ('e6000000-0000-0000-0000-000000000045', 'e6000000-0000-0000-0000-000000000034', 'AthenB', 'Student', 'HS9', :'v_ab_student'::uuid),
  ('e6000000-0000-0000-0000-000000000046', 'e6000000-0000-0000-0000-000000000035', 'Reenrolled', 'Student', 'HS9', :'v_re_student'::uuid),
  ('e6000000-0000-0000-0000-000000000047', 'e6000000-0000-0000-0000-000000000036', 'Kinder', 'Child', 'KG', null);

insert into enrollments (id, student_id, class_id, session_id, status) values
  ('e6000000-0000-0000-0000-000000000051', 'e6000000-0000-0000-0000-000000000041', 'e6000000-0000-0000-0000-0000000000a1', 'e6000000-0000-0000-0000-000000000011', 'active'),
  ('e6000000-0000-0000-0000-000000000052', 'e6000000-0000-0000-0000-000000000042', 'e6000000-0000-0000-0000-0000000000a1', 'e6000000-0000-0000-0000-000000000011', 'active'),
  ('e6000000-0000-0000-0000-000000000053', 'e6000000-0000-0000-0000-000000000043', 'e6000000-0000-0000-0000-0000000000a1', 'e6000000-0000-0000-0000-000000000011', 'active'),
  ('e6000000-0000-0000-0000-000000000054', 'e6000000-0000-0000-0000-000000000044', 'e6000000-0000-0000-0000-0000000000a1', 'e6000000-0000-0000-0000-000000000011', 'active'),
  ('e6000000-0000-0000-0000-000000000055', 'e6000000-0000-0000-0000-000000000045', 'e6000000-0000-0000-0000-0000000000a1', 'e6000000-0000-0000-0000-000000000011', 'active'),
  ('e6000000-0000-0000-0000-000000000056', 'e6000000-0000-0000-0000-000000000046', 'e6000000-0000-0000-0000-0000000000a1', 'e6000000-0000-0000-0000-000000000011', 'active'),
  ('e6000000-0000-0000-0000-000000000057', 'e6000000-0000-0000-0000-000000000047', 'e6000000-0000-0000-0000-0000000000c1', 'e6000000-0000-0000-0000-000000000011', 'active');

insert into user_roles (user_id, role, scope_type, scope_id) values
  (:'v_teacher_a'::uuid, 'teacher', 'class', 'e6000000-0000-0000-0000-0000000000a1'::uuid),
  (:'v_teacher_x'::uuid, 'teacher', 'class', 'e6000000-0000-0000-0000-0000000000d1'::uuid),
  (:'v_multirole'::uuid, 'teacher', 'class', 'e6000000-0000-0000-0000-0000000000d1'::uuid),
  (:'v_coord_1'::uuid, 'coordinator', 'session', 'e6000000-0000-0000-0000-000000000011'::uuid),
  (:'v_coord_2'::uuid, 'coordinator', 'session', 'e6000000-0000-0000-0000-000000000012'::uuid),
  (:'v_bvc'::uuid, 'bv_coordinator', 'org', null),
  (:'v_admin'::uuid, 'admin', 'org', null);

select id as v_a from conversations where kind = 'class' and scope_id = 'e6000000-0000-0000-0000-0000000000a1'::uuid \gset
select id as v_b from conversations where kind = 'class' and scope_id = 'e6000000-0000-0000-0000-0000000000b1'::uuid \gset
select id as v_k from conversations where kind = 'class' and scope_id = 'e6000000-0000-0000-0000-0000000000c1'::uuid \gset
select id as v_x from conversations where kind = 'class' and scope_id = 'e6000000-0000-0000-0000-0000000000d1'::uuid \gset
select id as v_staff_1 from conversations where kind = 'session_staff' and scope_id = 'e6000000-0000-0000-0000-000000000011'::uuid \gset
select id as v_staff_2 from conversations where kind = 'session_staff' and scope_id = 'e6000000-0000-0000-0000-000000000012'::uuid \gset
select id as v_lead from conversations where kind = 'leadership' \gset

-- Transitions are driven by UPDATE, the way a real withdrawal happens (a direct insert of a
-- 'withdrawn' row never created a participant row, so it would prove nothing).
update enrollments set status = 'withdrawn' where id = 'e6000000-0000-0000-0000-000000000052';  -- whole family leaves A
update enrollments set status = 'withdrawn' where id = 'e6000000-0000-0000-0000-000000000053';  -- one sibling leaves A, one stays
update enrollments set status = 'withdrawn' where id = 'e6000000-0000-0000-0000-000000000055';  -- leaves A ...
insert into enrollments (student_id, class_id, session_id, status) values                       -- ... joins B
  ('e6000000-0000-0000-0000-000000000045', 'e6000000-0000-0000-0000-0000000000b1', 'e6000000-0000-0000-0000-000000000011', 'active');
update enrollments set status = 'withdrawn' where id = 'e6000000-0000-0000-0000-000000000056';  -- leaves A ...
update enrollments set status = 'active'    where id = 'e6000000-0000-0000-0000-000000000056';  -- ... and is re-enrolled

-- One signal per conversation, saved as postgres (the trigger fires for any insert).
delete from realtime.messages;
insert into messages (conversation_id, sender_user_id, body)
select c, :'v_admin'::uuid, 'fixture'
from unnest(array[:'v_a', :'v_b', :'v_k', :'v_x', :'v_staff_1', :'v_staff_2', :'v_lead']::uuid[]) c;

select is((select count(*) from realtime.messages)::int, 7,
  'fixture: one signal exists for each of the seven conversations');

-- ---------------------------------------------------------------------------------------------
-- GROUP 1: participants receive
-- ---------------------------------------------------------------------------------------------
select tests.authenticate_as(:'v_student'::uuid, 'student');
select is(public.rt_visible('chat:' || :'v_a'), 1, 'CONTROL 1a: enrolled HS student receives on their own class');
select tests.clear_authentication();

select tests.authenticate_as(:'v_parent'::uuid, 'parent');
select is(public.rt_visible('chat:' || :'v_a'), 1, 'CONTROL 1b: parent of an enrolled student receives on that class');
select tests.clear_authentication();

select tests.authenticate_as(:'v_teacher_a'::uuid, 'teacher', 'class', 'e6000000-0000-0000-0000-0000000000a1'::uuid);
select is(public.rt_visible('chat:' || :'v_a'), 1, 'CONTROL 1c: the class teacher receives on their class');
select tests.clear_authentication();

select tests.authenticate_as(:'v_coord_1'::uuid, 'coordinator', 'session', 'e6000000-0000-0000-0000-000000000011'::uuid);
select is(public.rt_visible('chat:' || :'v_staff_1'), 1, 'CONTROL 1d: a session coordinator receives on their session-staff conversation');
select tests.clear_authentication();

select tests.authenticate_as(:'v_bvc'::uuid, 'bv_coordinator', 'org');
select is(public.rt_visible('chat:' || :'v_lead'), 1, 'CONTROL 1e: the BV coordinator receives on the leadership conversation');
select tests.clear_authentication();

select tests.authenticate_as(:'v_admin'::uuid, 'admin', 'org');
select is(public.rt_visible('chat:' || :'v_lead'), 1, 'CONTROL 1f: an admin receives on the leadership conversation');
select tests.clear_authentication();

select tests.authenticate_as(:'v_k_parent'::uuid, 'parent');
select is(public.rt_visible('chat:' || :'v_k'), 1, 'CONTROL 1g: a parent of a KG-2 child receives on the KG-2 class');
select tests.clear_authentication();

-- ---------------------------------------------------------------------------------------------
-- GROUP 2: withdrawal (ADR-2026-09-19)
-- ---------------------------------------------------------------------------------------------
select tests.authenticate_as(:'v_wd_student'::uuid, 'student');
select is(public.rt_visible('chat:' || :'v_a'), 0, 'ATTACK 2a DENY: a withdrawn student cannot receive on the class they left');
select tests.clear_authentication();

select tests.authenticate_as(:'v_wd_parent'::uuid, 'parent');
select is(public.rt_visible('chat:' || :'v_a'), 0, 'ATTACK 2b DENY: a withdrawn student''s parent cannot receive on that class');
select tests.clear_authentication();

select tests.authenticate_as(:'v_sib_student'::uuid, 'student');
select is(public.rt_visible('chat:' || :'v_a'), 0, 'ATTACK 2c DENY: the withdrawn sibling cannot receive');
select tests.clear_authentication();

select tests.authenticate_as(:'v_sib_parent'::uuid, 'parent');
select is(public.rt_visible('chat:' || :'v_a'), 1, 'CONTROL 2d: the parent with a sibling still enrolled in the class keeps receiving');
select tests.clear_authentication();

select tests.authenticate_as(:'v_ab_student'::uuid, 'student');
select is(public.rt_visible('chat:' || :'v_a'), 0, 'ATTACK 2e DENY: withdrawn from A, active in B -> A is denied');
select is(public.rt_visible('chat:' || :'v_b'), 1, 'CONTROL 2f: withdrawn from A, active in B -> B receives');
select tests.clear_authentication();

select tests.authenticate_as(:'v_re_student'::uuid, 'student');
select is(public.rt_visible('chat:' || :'v_a'), 1, 'CONTROL 2g: a student re-enrolled after withdrawal receives again');
select tests.clear_authentication();

-- Revocation takes effect on the very next evaluation (join or token refresh re-runs the policy).
update enrollments set status = 'withdrawn' where id = 'e6000000-0000-0000-0000-000000000056';
select tests.authenticate_as(:'v_re_student'::uuid, 'student');
select is(public.rt_visible('chat:' || :'v_a'), 0, 'ATTACK 2h DENY: withdrawn again -> the next evaluation denies');
select tests.clear_authentication();

-- ---------------------------------------------------------------------------------------------
-- GROUP 3: wrong scope
-- ---------------------------------------------------------------------------------------------
select tests.authenticate_as(:'v_teacher_x'::uuid, 'teacher', 'class', 'e6000000-0000-0000-0000-0000000000d1'::uuid);
select is(public.rt_visible('chat:' || :'v_x'), 1, 'CONTROL 3a: teacher of class X receives on X');
select is(public.rt_visible('chat:' || :'v_a'), 0, 'ATTACK 3b DENY: a teacher of another class cannot receive on class A');
select tests.clear_authentication();

-- A teacher who spoofs class A's scope claim is still denied: the policy reads no claim.
select tests.authenticate_as(:'v_teacher_x'::uuid, 'teacher', 'class', 'e6000000-0000-0000-0000-0000000000a1'::uuid);
select is(public.rt_visible('chat:' || :'v_a'), 0, 'ATTACK 3c DENY: a forged class-A scope claim does not open class A');
select tests.clear_authentication();

select tests.authenticate_as(:'v_coord_2'::uuid, 'coordinator', 'session', 'e6000000-0000-0000-0000-000000000012'::uuid);
select is(public.rt_visible('chat:' || :'v_staff_2'), 1, 'CONTROL 3d: coordinator of session 2 receives on session 2 staff');
select is(public.rt_visible('chat:' || :'v_staff_1'), 0, 'ATTACK 3e DENY: a coordinator of another session cannot receive on session 1 staff');
select is(public.rt_visible('chat:' || :'v_a'), 0, 'ATTACK 3f DENY: a coordinator of another session cannot receive on class A');
select tests.clear_authentication();

select tests.authenticate_as(:'v_student'::uuid, 'student');
select is(public.rt_visible('chat:' || :'v_k'), 0, 'ATTACK 3g DENY: a student cannot receive on a KG-Gr 8 class conversation');
select is(public.rt_visible('chat:' || :'v_staff_1'), 0, 'ATTACK 3h DENY: a student cannot receive on the session-staff conversation');
select is(public.rt_visible('chat:' || :'v_lead'), 0, 'ATTACK 3i DENY: a student cannot receive on the leadership conversation');
select tests.clear_authentication();

select tests.authenticate_as(:'v_outsider'::uuid, 'parent');
select is(public.rt_visible('chat:' || :'v_a'), 0, 'ATTACK 3j DENY: an authenticated user with no membership anywhere cannot receive');
select tests.clear_authentication();

-- ---------------------------------------------------------------------------------------------
-- GROUP 4: multi-role user -- an active-role switch never widens what is received
-- (claims are set the way the auth hook sets them after switch_active_role)
-- ---------------------------------------------------------------------------------------------
select tests.authenticate_as(:'v_multirole'::uuid, 'teacher', 'class', 'e6000000-0000-0000-0000-0000000000d1'::uuid);
select is(public.rt_visible('chat:' || :'v_x'), 1, 'CONTROL 4a: multi-role, active as teacher of X -> X receives');
select is(public.rt_visible('chat:' || :'v_a'), 1, 'CONTROL 4b: multi-role, active as teacher of X -> A (via guardianship) receives');
select is(public.rt_visible('chat:' || :'v_b'), 0, 'ATTACK 4c DENY: multi-role, active as teacher -> B is denied');
select tests.clear_authentication();

select tests.authenticate_as(:'v_multirole'::uuid, 'parent');
select is(public.rt_visible('chat:' || :'v_x'), 1, 'CONTROL 4d: after switching to parent -> X unchanged');
select is(public.rt_visible('chat:' || :'v_a'), 1, 'CONTROL 4e: after switching to parent -> A unchanged');
select is(public.rt_visible('chat:' || :'v_b'), 0, 'ATTACK 4f DENY: after switching to parent -> B still denied');

-- A member of both A and X, joined to A, is shown A's signal only.
select is(public.rt_visible('chat:' || :'v_a'), 1, 'CONTROL 4g: joined to A, exactly one row is visible');
select is(
  (select count(*) from realtime.messages where topic <> 'chat:' || :'v_a')::int, 0,
  'ATTACK 4h DENY: joined to A, no row of X (which they also belong to) or of any other conversation is visible'
);
select tests.clear_authentication();

-- ---------------------------------------------------------------------------------------------
-- GROUP 5: malformed and foreign topics, as a genuine participant of A
-- ---------------------------------------------------------------------------------------------
select tests.authenticate_as(:'v_student'::uuid, 'student');
select is(public.rt_visible('chat:' || :'v_a'), 1, 'CONTROL 5a: the well-formed topic receives');
select is(public.rt_visible(''), 0, 'ATTACK 5b DENY: no topic set (a direct read of the transport table) shows nothing');
select is(public.rt_visible('chat:'), 0, 'ATTACK 5c DENY: prefix only');
select is(public.rt_visible('chat:not-a-uuid'), 0, 'ATTACK 5d DENY: non-uuid topic, no cast error raised');
select is(public.rt_visible('chat:' || upper(:'v_a')), 0, 'ATTACK 5e DENY: uppercase uuid');
select is(public.rt_visible('chat:' || :'v_a' || ':typing'), 0, 'ATTACK 5f DENY: trailing suffix');
select is(public.rt_visible('room:' || :'v_a'), 0, 'ATTACK 5g DENY: non-chat prefix');
select is(public.rt_visible(:'v_a'), 0, 'ATTACK 5h DENY: bare uuid');

-- ---------------------------------------------------------------------------------------------
-- GROUP 6: clients are listen-only
-- ---------------------------------------------------------------------------------------------
select throws_ok(
  format('insert into realtime.messages (payload, event, topic, private, extension) values (%L::jsonb, %L, %L, true, %L)',
    '{"id":"forged"}', 'message_saved', 'chat:' || :'v_a', 'broadcast'),
  '42501', null,
  'ATTACK 6a DENY: a participant cannot insert into realtime.messages (no client publish)'
);
select set_config('realtime.topic', 'chat:' || :'v_a', true);
with u as (update realtime.messages set payload = '{"id":"tampered"}'::jsonb returning 1)
select is(
  (select count(*) from u)::int, 0,
  'ATTACK 6b DENY: a participant''s update of realtime.messages touches no row'
);
select throws_ok(
  'delete from realtime.messages',
  '42501', null,
  'ATTACK 6c DENY: a participant cannot delete from realtime.messages'
);
select tests.clear_authentication();

-- ---------------------------------------------------------------------------------------------
-- GROUP 7: unauthenticated. `set role anon`, not clear_authentication(): the latter resets to
-- postgres, which bypasses RLS and would make any "0 rows" check meaningless.
-- ---------------------------------------------------------------------------------------------
set local role anon;
select is(public.rt_visible('chat:' || :'v_a'), 0, 'ATTACK 7a DENY: an unauthenticated client sees zero rows on a class topic');
reset role;

select tests.authenticate_as(:'v_student'::uuid, 'student');
select is(public.rt_visible('chat:' || :'v_a'), 1, 'CONTROL 7b: the same topic still shows its row to a participant');
select tests.clear_authentication();

select * from finish();
rollback;
```

- [ ] **Step 3 — Confirm red.**

Run: `npx supabase test db supabase/tests/190_realtime_chat_delivery.sql supabase/tests/191_realtime_chat_delivery_adversarial.sql`
Expected: both files FAIL. 190 aborts on `relation "public.messages_conversation_created_id_idx" does not exist`; 191 runs but its controls return `0` (no policy exists, so nobody sees anything).

- [ ] **Step 4 — Write the migration.** The human types `/migration realtime_chat_delivery`; the file content is:

```sql
-- ADR-2026-10-07-realtime-chat-signal-then-fetch (issue #6): live chat delivery is a signal;
-- the message itself is fetched under messages RLS.

-- 1. Senders cannot choose a message's id or created_at (design decision 1). Catch-up is
-- "fetch newer than my last message", so both must be stamped by the database.
revoke insert on public.messages from authenticated;
grant insert (conversation_id, sender_user_id, body, mention_targets) on public.messages to authenticated;

-- 2. Catch-up, initial load and older pages all read one conversation in (created_at, id) order.
create index if not exists messages_conversation_created_id_idx
  on public.messages (conversation_id, created_at desc, id desc);

-- 3. Topic parser that cannot raise (design decision 5). Postgres does not promise evaluation
-- order inside a policy's AND, so the cast must sit behind the pattern in a CASE. Lowercase
-- uuids only: that is what the trigger emits.
create or replace function public.chat_topic_conversation_id(p_topic text)
returns uuid
language sql
immutable
set search_path = ''
as $$
  select case
    when p_topic ~ '^chat:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then substr(p_topic, 6)::uuid
  end;
$$;

revoke execute on function public.chat_topic_conversation_id(text) from public, anon;
grant execute on function public.chat_topic_conversation_id(text) to authenticated;

-- 4. The signal. SECURITY DEFINER (design decision 4): realtime.messages has RLS on and clients
-- get no insert policy, and realtime.send() traps its own errors -- as the sender, the signal
-- would vanish without failing anything. The payload is the message id and created_at only.
create or replace function public.broadcast_message_saved()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform realtime.send(
    jsonb_build_object('id', new.id, 'created_at', new.created_at),
    'message_saved',
    'chat:' || new.conversation_id::text,
    true
  );
  return null;
end;
$$;

revoke execute on function public.broadcast_message_saved() from public, anon, authenticated;

create trigger messages_broadcast_saved
  after insert on public.messages
  for each row execute function public.broadcast_message_saved();

-- 5. Channel access: listen-only, membership-derived, reads no role or scope claim.
-- `topic = realtime.topic()` ties each row to the topic being joined, so a participant of one
-- conversation is never shown another conversation's rows. No insert/update/delete policy for
-- any client role and no policy for anon: the only way onto a channel is a row saved to messages.
create policy chat_participants_receive_broadcast on realtime.messages
  for select to authenticated
  using (
    extension = 'broadcast'
    and topic = realtime.topic()
    and public.is_conversation_participant(public.chat_topic_conversation_id(realtime.topic()))
  );
```

- [ ] **Step 5 — Apply and confirm green.**

Run: `npx supabase db reset && npx supabase test db`
Expected: `Result: PASS`, 32 files, 487 tests (190: 34, 191: 47). If `npx supabase` exits 137 on this Mac, re-sign the CLI binary (`codesign --force --sign -`) and start Docker first.

- [ ] **Step 6 — Prove the tests can fail (mutation check).** For each mutation: apply it with `psql` on the local stack, run the two files, confirm the listed assertions go red, then `npx supabase db reset` to restore.

| Mutation | Must go red |
| --- | --- |
| drop `and topic = realtime.topic()` from the policy | 191: every CONTROL (returns 7, not 1) and ATTACK 4h |
| drop the `is_conversation_participant(...)` conjunct | 191: every ATTACK in groups 2–4 |
| add `'body', new.body` to the payload | 190: "exactly two keys", "body is nowhere in the transport store" |
| make the trigger function `security invoker` | 190: "security definer", "exactly one signal was written" and the three after it |

- [ ] **Step 7 — Independent adversarial pass.** Dispatch the `rls-adversarial-tester` agent against `realtime.messages` and `messages` on this branch. Any leak it finds becomes a new numbered case in 191 before the fix.

- [ ] **Step 8 — Amend the spec (Decision A).** In `realtime-chat-delivery.md` → "Data & RLS impact", replace the policy row's expression with `using (extension = 'broadcast' and topic = realtime.topic() and public.is_conversation_participant(public.chat_topic_conversation_id(realtime.topic())))` and append: "`topic = realtime.topic()` added at `/plan` (2026-10-07): without it a participant joined to one topic could see every row in the table."

- [ ] **Step 9 — Commit.**

```bash
git add supabase/migrations/*_realtime_chat_delivery.sql supabase/tests/190_realtime_chat_delivery.sql supabase/tests/191_realtime_chat_delivery_adversarial.sql .docs/specs/system/realtime-chat-delivery.md
git commit -m "feat(#6): message-saved signal, column-level insert grant and listen-only channel policy"
```

---

## Task 2 — `lib/chat/messageList.ts` (pure list logic)

**Files:**
- Create: `lib/chat/messageList.ts`
- Test: `lib/chat/__tests__/messageList.test.ts`

**Interfaces:**
- Produces:
  - `interface ChatMessage { id: string; conversation_id: string; sender_user_id: string; body: string; mention_targets: string[]; created_at: string }`
  - `CATCH_UP_OVERLAP_MS = 10_000`, `CATCH_UP_PAGE_SIZE = 100`, `INITIAL_PAGE_SIZE = 50`
  - `compareMessages(a: ChatMessage, b: ChatMessage): number`
  - `mergeMessages(held: readonly ChatMessage[], incoming: readonly ChatMessage[]): ChatMessage[]`
  - `catchUpCursor(held: readonly ChatMessage[]): string | null`

- [ ] **Step 1 — Write the failing test** `lib/chat/__tests__/messageList.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { catchUpCursor, compareMessages, mergeMessages, type ChatMessage } from '../messageList';

const CONV = '11111111-1111-4111-8111-111111111111';
const msg = (id: string, created_at: string, body = id): ChatMessage => ({
  id,
  conversation_id: CONV,
  sender_user_id: '22222222-2222-4222-8222-222222222222',
  body,
  mention_targets: [],
  created_at,
});

const A = '00000000-0000-4000-8000-00000000000a';
const B = '00000000-0000-4000-8000-00000000000b';
const C = '00000000-0000-4000-8000-00000000000c';

describe('compareMessages', () => {
  it('orders by created_at', () => {
    const early = msg(B, '2026-10-07T12:00:00+00:00');
    const late = msg(A, '2026-10-07T12:00:01+00:00');
    expect(compareMessages(early, late)).toBeLessThan(0);
    expect(compareMessages(late, early)).toBeGreaterThan(0);
  });

  it('orders timestamps that differ only below a millisecond', () => {
    // Date.parse() truncates both of these to the same millisecond.
    const first = msg(B, '2026-10-07T12:00:00.123456+00:00');
    const second = msg(A, '2026-10-07T12:00:00.123457+00:00');
    expect(compareMessages(first, second)).toBeLessThan(0);
  });

  it('treats trailing zeros Postgres trimmed as zeros', () => {
    // Postgres prints .120000 as .12 -- that is earlier than .120001, and equal to .120.
    const trimmed = msg(B, '2026-10-07T12:00:00.12+00:00');
    const later = msg(A, '2026-10-07T12:00:00.120001+00:00');
    expect(compareMessages(trimmed, later)).toBeLessThan(0);
    expect(compareMessages(msg(A, '2026-10-07T12:00:00.12+00:00'), msg(A, '2026-10-07T12:00:00.120+00:00'))).toBe(0);
  });

  it('breaks an exact timestamp tie by id, so the order is stable', () => {
    const at = '2026-10-07T12:00:00.5+00:00';
    expect(compareMessages(msg(A, at), msg(B, at))).toBeLessThan(0);
    expect(compareMessages(msg(B, at), msg(A, at))).toBeGreaterThan(0);
  });
});

describe('mergeMessages', () => {
  it('drops duplicates by id', () => {
    const held = [msg(A, '2026-10-07T12:00:00+00:00')];
    const merged = mergeMessages(held, [msg(A, '2026-10-07T12:00:00+00:00'), msg(B, '2026-10-07T12:00:01+00:00')]);
    expect(merged.map((m) => m.id)).toEqual([A, B]);
  });

  it('returns ascending (created_at, id) order whatever order rows arrive in', () => {
    const at = '2026-10-07T12:00:00+00:00';
    const merged = mergeMessages([msg(C, '2026-10-07T12:00:05+00:00')], [msg(B, at), msg(A, at)]);
    expect(merged.map((m) => m.id)).toEqual([A, B, C]);
  });

  it('slots a late-committing earlier message into place rather than appending it', () => {
    const held = [msg(A, '2026-10-07T12:00:00+00:00'), msg(C, '2026-10-07T12:00:02+00:00')];
    const merged = mergeMessages(held, [msg(B, '2026-10-07T12:00:01+00:00')]);
    expect(merged.map((m) => m.id)).toEqual([A, B, C]);
  });

  it('does not mutate the held list', () => {
    const held = [msg(A, '2026-10-07T12:00:00+00:00')];
    mergeMessages(held, [msg(B, '2026-10-07T12:00:01+00:00')]);
    expect(held).toHaveLength(1);
  });
});

describe('catchUpCursor', () => {
  it('is null when nothing is held (catch-up is then the initial load)', () => {
    expect(catchUpCursor([])).toBeNull();
  });

  it('is the newest held created_at minus the 10 second overlap', () => {
    const held = [msg(A, '2026-10-07T12:00:00+00:00'), msg(B, '2026-10-07T12:00:30+00:00')];
    expect(catchUpCursor(held)).toBe('2026-10-07T12:00:20.000Z');
  });

  it('never lands after the true cursor when the newest timestamp has microseconds', () => {
    const held = [msg(A, '2026-10-07T12:00:30.999999+00:00')];
    expect(catchUpCursor(held)).toBe('2026-10-07T12:00:20.999Z');
  });
});
```

- [ ] **Step 2 — Run red.** `npx vitest run lib/chat/__tests__/messageList.test.ts` → FAIL, `Cannot find module '../messageList'`.

- [ ] **Step 3 — Implement** `lib/chat/messageList.ts`:

```ts
// Pure list logic for chat delivery (System -> realtime-chat-delivery, issue #6). Durable
// history in `messages` is the record; these functions are how every ingestion path -- ping,
// rejoin, foreground, timer, the sender's own saved row -- lands in one ordered, duplicate-free
// list.

export interface ChatMessage {
  id: string;
  conversation_id: string;
  sender_user_id: string;
  body: string;
  mention_targets: string[];
  created_at: string;
}

// `created_at` is the saving transaction's start time, so two near-simultaneous saves can commit
// in the opposite order to their timestamps. Every catch-up re-reads this much history; the merge
// by id makes the overlap free of duplicates.
export const CATCH_UP_OVERLAP_MS = 10_000;
export const CATCH_UP_PAGE_SIZE = 100;
export const INITIAL_PAGE_SIZE = 50;

// [epoch milliseconds, microseconds within that millisecond]. Postgres keeps microseconds and
// trims trailing zeros when it prints them; Date.parse() keeps only milliseconds. Ordering by
// Date alone would shuffle messages saved within the same millisecond.
function timestampParts(iso: string): [number, number] {
  const fraction = /\.(\d+)/.exec(iso)?.[1] ?? '';
  return [Date.parse(iso), Number(fraction.padEnd(6, '0').slice(3, 6))];
}

// Same order as the database's `order by created_at, id`: lowercase uuid strings compare the way
// Postgres compares uuid bytes.
export function compareMessages(a: ChatMessage, b: ChatMessage): number {
  const [aMs, aMicros] = timestampParts(a.created_at);
  const [bMs, bMicros] = timestampParts(b.created_at);
  if (aMs !== bMs) return aMs - bMs;
  if (aMicros !== bMicros) return aMicros - bMicros;
  if (a.id === b.id) return 0;
  return a.id < b.id ? -1 : 1;
}

export function mergeMessages(held: readonly ChatMessage[], incoming: readonly ChatMessage[]): ChatMessage[] {
  const byId = new Map<string, ChatMessage>();
  for (const message of held) byId.set(message.id, message);
  for (const message of incoming) byId.set(message.id, message);
  return [...byId.values()].sort(compareMessages);
}

// `held` is in ascending order, so its last entry is the newest. Truncating to the millisecond
// only ever moves the cursor earlier, which is the safe direction.
export function catchUpCursor(held: readonly ChatMessage[]): string | null {
  const newest = held.at(-1);
  if (!newest) return null;
  return new Date(Date.parse(newest.created_at) - CATCH_UP_OVERLAP_MS).toISOString();
}
```

- [ ] **Step 4 — Run green.** `npx vitest run lib/chat/__tests__/messageList.test.ts` → PASS (11 tests).

- [ ] **Step 5 — Commit.** `git add lib/chat/messageList.ts lib/chat/__tests__/messageList.test.ts && git commit -m "feat(#6): chat message merge, ordering and catch-up cursor"`

---

## Task 3 — `lib/chat/messagesApi.ts` (the five queries)

**Files:**
- Create: `lib/chat/messagesApi.ts`
- Test: `lib/chat/__tests__/messagesApi.test.ts`

**Interfaces:**
- Consumes: `ChatMessage`, `CATCH_UP_PAGE_SIZE`, `INITIAL_PAGE_SIZE` from `./messageList`.
- Produces:
  - `interface NewMessage { conversationId: string; senderUserId: string; body: string; mentionTargets: string[] }`
  - `interface MessagesApi { fetchLatest(conversationId: string): Promise<ChatMessage[]>; fetchSince(conversationId: string, sinceIso: string): Promise<ChatMessage[]>; fetchOlder(conversationId: string, before: ChatMessage): Promise<ChatMessage[]>; insertMessage(input: NewMessage): Promise<ChatMessage>; isConversationReadable(conversationId: string): Promise<boolean> }`
  - `createMessagesApi(client: Pick<SupabaseClient, 'from'>): MessagesApi`

- [ ] **Step 1 — Write the failing test** `lib/chat/__tests__/messagesApi.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { createMessagesApi } from '../messagesApi';
import type { ChatMessage } from '../messageList';

// A PostgREST builder is chainable and awaitable. This recorder is both: every method returns the
// same builder, and awaiting it yields the next queued result. Same idea as the recorder in
// features/teacher/class-update-and-home-feed/api/__tests__/classUpdates.test.ts.
type Result = { data: unknown; error: unknown };
type Call = [string, ...unknown[]];

function mockClient(results: Result[]) {
  const calls: Call[] = [];
  const queue = [...results];
  const builder: Record<string, unknown> = {};
  for (const method of ['select', 'eq', 'gte', 'or', 'order', 'limit', 'range', 'insert', 'single', 'maybeSingle']) {
    builder[method] = vi.fn((...args: unknown[]) => {
      calls.push([method, ...args]);
      return builder;
    });
  }
  builder.then = (resolve: (r: Result) => unknown, reject: (e: unknown) => unknown) =>
    Promise.resolve(queue.shift() ?? { data: [], error: null }).then(resolve, reject);
  const from = vi.fn((table: string) => {
    calls.push(['from', table]);
    return builder;
  });
  return { client: { from } as any, calls };
}

const argsFor = (calls: Call[], method: string) => calls.filter((c) => c[0] === method).map((c) => c.slice(1));

const CONV = '11111111-1111-4111-8111-111111111111';
const ME = '22222222-2222-4222-8222-222222222222';
const COLUMNS = 'id, conversation_id, sender_user_id, body, mention_targets, created_at';
const row = (n: number): ChatMessage => ({
  id: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
  conversation_id: CONV,
  sender_user_id: ME,
  body: `m${n}`,
  mention_targets: [],
  created_at: `2026-10-07T12:00:00.${String(n).padStart(6, '0')}+00:00`,
});
const rows = (count: number, from = 0) => Array.from({ length: count }, (_, i) => row(from + i));

describe('fetchLatest', () => {
  it('reads the newest 50 of one conversation, newest first by (created_at, id)', async () => {
    const { client, calls } = mockClient([{ data: [row(2), row(1)], error: null }]);

    const result = await createMessagesApi(client).fetchLatest(CONV);

    expect(result).toEqual([row(2), row(1)]);
    expect(argsFor(calls, 'from')).toEqual([['messages']]);
    expect(argsFor(calls, 'select')).toEqual([[COLUMNS]]);
    expect(argsFor(calls, 'eq')).toEqual([['conversation_id', CONV]]);
    expect(argsFor(calls, 'order')).toEqual([
      ['created_at', { ascending: false }],
      ['id', { ascending: false }],
    ]);
    expect(argsFor(calls, 'limit')).toEqual([[50]]);
  });

  it('throws the PostgREST error', async () => {
    const { client } = mockClient([{ data: null, error: { message: 'boom' } }]);
    await expect(createMessagesApi(client).fetchLatest(CONV)).rejects.toEqual({ message: 'boom' });
  });
});

describe('fetchSince', () => {
  it('reads at or after the cursor, oldest first, in pages of 100', async () => {
    const { client, calls } = mockClient([{ data: rows(3), error: null }]);

    await createMessagesApi(client).fetchSince(CONV, '2026-10-07T12:00:20.000Z');

    expect(argsFor(calls, 'eq')).toEqual([['conversation_id', CONV]]);
    expect(argsFor(calls, 'gte')).toEqual([['created_at', '2026-10-07T12:00:20.000Z']]);
    expect(argsFor(calls, 'order')).toEqual([
      ['created_at', { ascending: true }],
      ['id', { ascending: true }],
    ]);
    expect(argsFor(calls, 'range')).toEqual([[0, 99]]);
  });

  it('keeps paging until a short page (a long absence is more than one page)', async () => {
    const { client, calls } = mockClient([
      { data: rows(100, 0), error: null },
      { data: rows(100, 100), error: null },
      { data: rows(7, 200), error: null },
    ]);

    const result = await createMessagesApi(client).fetchSince(CONV, '2026-10-07T12:00:20.000Z');

    expect(result).toHaveLength(207);
    expect(argsFor(calls, 'range')).toEqual([[0, 99], [100, 199], [200, 299]]);
  });

  it('asks once more when the last page is exactly full, then stops on the empty page', async () => {
    const { client, calls } = mockClient([
      { data: rows(100, 0), error: null },
      { data: [], error: null },
    ]);

    const result = await createMessagesApi(client).fetchSince(CONV, '2026-10-07T12:00:20.000Z');

    expect(result).toHaveLength(100);
    expect(argsFor(calls, 'range')).toEqual([[0, 99], [100, 199]]);
  });

  it('throws if any page fails, rather than returning a partial catch-up as if it were complete', async () => {
    const { client } = mockClient([
      { data: rows(100, 0), error: null },
      { data: null, error: { message: 'timeout' } },
    ]);
    await expect(createMessagesApi(client).fetchSince(CONV, '2026-10-07T12:00:20.000Z')).rejects.toEqual({ message: 'timeout' });
  });
});

describe('fetchOlder', () => {
  it('reads the 50 messages strictly before the oldest held one, by (created_at, id)', async () => {
    const before = row(5);
    const { client, calls } = mockClient([{ data: [row(4), row(3)], error: null }]);

    const result = await createMessagesApi(client).fetchOlder(CONV, before);

    expect(result).toEqual([row(4), row(3)]);
    expect(argsFor(calls, 'eq')).toEqual([['conversation_id', CONV]]);
    expect(argsFor(calls, 'or')).toEqual([
      [`created_at.lt."${before.created_at}",and(created_at.eq."${before.created_at}",id.lt.${before.id})`],
    ]);
    expect(argsFor(calls, 'order')).toEqual([
      ['created_at', { ascending: false }],
      ['id', { ascending: false }],
    ]);
    expect(argsFor(calls, 'limit')).toEqual([[50]]);
  });
});

describe('insertMessage', () => {
  it('sends exactly the four columns a client may write and reads the saved row back', async () => {
    const saved = row(9);
    const { client, calls } = mockClient([{ data: saved, error: null }]);

    const result = await createMessagesApi(client).insertMessage({
      conversationId: CONV,
      senderUserId: ME,
      body: 'hello',
      mentionTargets: ['teacher'],
    });

    expect(result).toEqual(saved);
    expect(argsFor(calls, 'from')).toEqual([['messages']]);
    // id and created_at are stamped by the database; sending either is refused with 42501.
    expect(argsFor(calls, 'insert')).toEqual([
      [{ conversation_id: CONV, sender_user_id: ME, body: 'hello', mention_targets: ['teacher'] }],
    ]);
    expect(argsFor(calls, 'select')).toEqual([[COLUMNS]]);
    expect(argsFor(calls, 'single')).toEqual([[]]);
  });

  it('throws when the save is refused', async () => {
    const { client } = mockClient([{ data: null, error: { code: '42501' } }]);
    await expect(
      createMessagesApi(client).insertMessage({ conversationId: CONV, senderUserId: ME, body: 'x', mentionTargets: [] }),
    ).rejects.toEqual({ code: '42501' });
  });
});

describe('isConversationReadable', () => {
  it('is true when the conversations row comes back', async () => {
    const { client, calls } = mockClient([{ data: { id: CONV }, error: null }]);

    expect(await createMessagesApi(client).isConversationReadable(CONV)).toBe(true);
    expect(argsFor(calls, 'from')).toEqual([['conversations']]);
    expect(argsFor(calls, 'select')).toEqual([['id']]);
    expect(argsFor(calls, 'eq')).toEqual([['id', CONV]]);
    expect(argsFor(calls, 'maybeSingle')).toEqual([[]]);
  });

  it('is false when RLS hides the row (no row, no error)', async () => {
    const { client } = mockClient([{ data: null, error: null }]);
    expect(await createMessagesApi(client).isConversationReadable(CONV)).toBe(false);
  });

  it('throws on a real error, so a network failure is never mistaken for lost access', async () => {
    const { client } = mockClient([{ data: null, error: { message: 'offline' } }]);
    await expect(createMessagesApi(client).isConversationReadable(CONV)).rejects.toEqual({ message: 'offline' });
  });
});
```

- [ ] **Step 2 — Run red.** `npx vitest run lib/chat/__tests__/messagesApi.test.ts` → FAIL, `Cannot find module '../messagesApi'`.

- [ ] **Step 3 — Implement** `lib/chat/messagesApi.ts`:

```ts
import type { SupabaseClient } from '@supabase/supabase-js';
import { CATCH_UP_PAGE_SIZE, INITIAL_PAGE_SIZE, type ChatMessage } from './messageList';

const COLUMNS = 'id, conversation_id, sender_user_id, body, mention_targets, created_at';

export interface NewMessage {
  conversationId: string;
  senderUserId: string;
  body: string;
  mentionTargets: string[];
}

export interface MessagesApi {
  fetchLatest(conversationId: string): Promise<ChatMessage[]>;
  fetchSince(conversationId: string, sinceIso: string): Promise<ChatMessage[]>;
  fetchOlder(conversationId: string, before: ChatMessage): Promise<ChatMessage[]>;
  insertMessage(input: NewMessage): Promise<ChatMessage>;
  isConversationReadable(conversationId: string): Promise<boolean>;
}

// Every read here is authorized by `messages_member_select` / `conversations_member_select` at
// the moment it runs. That is the whole point of signal-then-fetch (ADR-2026-10-07): nothing in
// this file decides who may read.
export function createMessagesApi(client: Pick<SupabaseClient, 'from'>): MessagesApi {
  return {
    async fetchLatest(conversationId) {
      const { data, error } = await client
        .from('messages')
        .select(COLUMNS)
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .limit(INITIAL_PAGE_SIZE);
      if (error) throw error;
      return (data ?? []) as ChatMessage[];
    },

    async fetchSince(conversationId, sinceIso) {
      const all: ChatMessage[] = [];
      for (let from = 0; ; from += CATCH_UP_PAGE_SIZE) {
        const { data, error } = await client
          .from('messages')
          .select(COLUMNS)
          .eq('conversation_id', conversationId)
          .gte('created_at', sinceIso)
          .order('created_at', { ascending: true })
          .order('id', { ascending: true })
          .range(from, from + CATCH_UP_PAGE_SIZE - 1);
        if (error) throw error;
        const page = (data ?? []) as ChatMessage[];
        all.push(...page);
        if (page.length < CATCH_UP_PAGE_SIZE) return all;
      }
    },

    async fetchOlder(conversationId, before) {
      // Row-wise "(created_at, id) < (before.created_at, before.id)". The timestamp is quoted
      // because it contains characters PostgREST's filter grammar reserves.
      const { data, error } = await client
        .from('messages')
        .select(COLUMNS)
        .eq('conversation_id', conversationId)
        .or(`created_at.lt."${before.created_at}",and(created_at.eq."${before.created_at}",id.lt.${before.id})`)
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .limit(INITIAL_PAGE_SIZE);
      if (error) throw error;
      return (data ?? []) as ChatMessage[];
    },

    async insertMessage({ conversationId, senderUserId, body, mentionTargets }) {
      // Exactly the four columns the grant allows. `id` and `created_at` are the database's.
      const { data, error } = await client
        .from('messages')
        .insert({
          conversation_id: conversationId,
          sender_user_id: senderUserId,
          body,
          mention_targets: mentionTargets,
        })
        .select(COLUMNS)
        .single();
      if (error) throw error;
      return data as ChatMessage;
    },

    async isConversationReadable(conversationId) {
      const { data, error } = await client.from('conversations').select('id').eq('id', conversationId).maybeSingle();
      if (error) throw error;
      return data !== null;
    },
  };
}
```

- [ ] **Step 4 — Run green.** `npx vitest run lib/chat/__tests__/messagesApi.test.ts` → PASS (12 tests).

- [ ] **Step 5 — Commit.** `git add lib/chat/messagesApi.ts lib/chat/__tests__/messagesApi.test.ts && git commit -m "feat(#6): chat message queries — latest, catch-up paging, older pages, four-column insert"`

---

## Task 4 — `lib/chat/conversationChannel.ts` (join and leave)

**Files:**
- Create: `lib/chat/conversationChannel.ts`
- Test: `lib/chat/__tests__/conversationChannel.test.ts`

**Interfaces:**
- Produces:
  - `MESSAGE_SAVED_EVENT = 'message_saved'`
  - `chatTopic(conversationId: string): string`
  - `interface ChannelHandlers { onPing(messageId: string | null): void; onJoined(): void; onJoinFailed(): void; onDown(): void }`
  - `interface ConversationChannel { leave(): Promise<void> }`
  - `joinConversationChannel(client: SupabaseClient, conversationId: string, handlers: ChannelHandlers): Promise<ConversationChannel>`

- [ ] **Step 1 — Write the failing test** `lib/chat/__tests__/conversationChannel.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { chatTopic, joinConversationChannel, type ChannelHandlers } from '../conversationChannel';

const CONV = '11111111-aaaa-4111-8111-111111111111';

function fakeClient() {
  const order: string[] = [];
  let statusCallback: ((status: string) => void) | null = null;
  let broadcastCallback: ((message: { payload?: unknown }) => void) | null = null;
  const channel = {
    on: vi.fn((_type: string, _filter: unknown, callback: (message: { payload?: unknown }) => void) => {
      broadcastCallback = callback;
      return channel;
    }),
    subscribe: vi.fn((callback: (status: string) => void) => {
      order.push('subscribe');
      statusCallback = callback;
      return channel;
    }),
  };
  const client = {
    realtime: {
      setAuth: vi.fn(async () => {
        order.push('setAuth');
      }),
    },
    channel: vi.fn(() => {
      order.push('channel');
      return channel;
    }),
    removeChannel: vi.fn(async () => 'ok'),
  };
  return {
    client: client as unknown as SupabaseClient,
    raw: client,
    channel,
    order,
    status: (status: string) => statusCallback?.(status),
    broadcast: (payload: unknown) => broadcastCallback?.({ payload }),
  };
}

function handlers(): ChannelHandlers & { [K in keyof ChannelHandlers]: ReturnType<typeof vi.fn> } {
  return { onPing: vi.fn(), onJoined: vi.fn(), onJoinFailed: vi.fn(), onDown: vi.fn() };
}

describe('chatTopic', () => {
  it('is chat:<conversation id>', () => {
    expect(chatTopic(CONV)).toBe(`chat:${CONV}`);
  });

  it('lowercases the id, because the channel policy accepts lowercase uuids only', () => {
    expect(chatTopic(CONV.toUpperCase())).toBe(`chat:${CONV}`);
  });
});

describe('joinConversationChannel', () => {
  it('sets Realtime auth from the current session before joining a private channel', async () => {
    const fake = fakeClient();

    await joinConversationChannel(fake.client, CONV, handlers());

    expect(fake.order).toEqual(['setAuth', 'channel', 'subscribe']);
    expect(fake.raw.realtime.setAuth).toHaveBeenCalledWith();
    expect(fake.raw.channel).toHaveBeenCalledWith(`chat:${CONV}`, { config: { private: true } });
    expect(fake.channel.on).toHaveBeenCalledWith('broadcast', { event: 'message_saved' }, expect.any(Function));
  });

  it('reports a successful join, and every rejoin', async () => {
    const fake = fakeClient();
    const h = handlers();
    await joinConversationChannel(fake.client, CONV, h);

    fake.status('SUBSCRIBED');
    fake.status('SUBSCRIBED');

    expect(h.onJoined).toHaveBeenCalledTimes(2);
  });

  it('reports a refused or timed-out join as a failed join', async () => {
    const fake = fakeClient();
    const h = handlers();
    await joinConversationChannel(fake.client, CONV, h);

    fake.status('CHANNEL_ERROR');
    fake.status('TIMED_OUT');

    expect(h.onJoinFailed).toHaveBeenCalledTimes(2);
    expect(h.onJoined).not.toHaveBeenCalled();
  });

  it('reports a closed channel as down', async () => {
    const fake = fakeClient();
    const h = handlers();
    await joinConversationChannel(fake.client, CONV, h);

    fake.status('CLOSED');

    expect(h.onDown).toHaveBeenCalledTimes(1);
  });

  it('surfaces a ping with the message id from the payload', async () => {
    const fake = fakeClient();
    const h = handlers();
    await joinConversationChannel(fake.client, CONV, h);

    fake.broadcast({ id: 'm-1', created_at: '2026-10-07T12:00:00+00:00' });

    expect(h.onPing).toHaveBeenCalledWith('m-1');
  });

  it('still surfaces a ping whose payload is not what we expect (a ping means "catch up now")', async () => {
    const fake = fakeClient();
    const h = handlers();
    await joinConversationChannel(fake.client, CONV, h);

    fake.broadcast(undefined);
    fake.broadcast({ id: 42 });
    fake.broadcast('nonsense');

    expect(h.onPing.mock.calls).toEqual([[null], [null], [null]]);
  });

  it('leave() removes the channel from the socket, once', async () => {
    const fake = fakeClient();
    const joined = await joinConversationChannel(fake.client, CONV, handlers());

    await joined.leave();
    await joined.leave();

    expect(fake.raw.removeChannel).toHaveBeenCalledTimes(1);
    expect(fake.raw.removeChannel).toHaveBeenCalledWith(fake.channel);
  });

  it('is silent after leave(): removing a channel fires CLOSED, which is not news', async () => {
    const fake = fakeClient();
    const h = handlers();
    const joined = await joinConversationChannel(fake.client, CONV, h);

    await joined.leave();
    fake.status('CLOSED');
    fake.status('SUBSCRIBED');
    fake.broadcast({ id: 'm-1' });

    expect(h.onDown).not.toHaveBeenCalled();
    expect(h.onJoined).not.toHaveBeenCalled();
    expect(h.onPing).not.toHaveBeenCalled();
  });

  it('leave() does not throw when removing the channel fails', async () => {
    const fake = fakeClient();
    fake.raw.removeChannel.mockRejectedValueOnce(new Error('socket gone'));
    const joined = await joinConversationChannel(fake.client, CONV, handlers());

    await expect(joined.leave()).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2 — Run red.** `npx vitest run lib/chat/__tests__/conversationChannel.test.ts` → FAIL, `Cannot find module '../conversationChannel'`.

- [ ] **Step 3 — Implement** `lib/chat/conversationChannel.ts`:

```ts
import type { SupabaseClient } from '@supabase/supabase-js';

export const MESSAGE_SAVED_EVENT = 'message_saved';

// The channel policy accepts `chat:<lowercase uuid>` and nothing else. An id that arrives in
// mixed case (a link, a hand-typed route) would otherwise become a join that is refused forever.
export function chatTopic(conversationId: string): string {
  return `chat:${conversationId.toLowerCase()}`;
}

export interface ChannelHandlers {
  /** A message was saved. The id is advisory; the handler's job is "run catch-up now". */
  onPing(messageId: string | null): void;
  /** Joined or rejoined. */
  onJoined(): void;
  /** The join was refused or timed out. supabase-js keeps retrying until leave(). */
  onJoinFailed(): void;
  /** The channel closed underneath us. */
  onDown(): void;
}

export interface ConversationChannel {
  leave(): Promise<void>;
}

function pingedMessageId(payload: unknown): string | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const id = (payload as { id?: unknown }).id;
  return typeof id === 'string' ? id : null;
}

// The only place client code touches Realtime. Listen-only: this module never calls
// channel.send(), and the database has no insert policy that would deliver it if it did.
export async function joinConversationChannel(
  client: SupabaseClient,
  conversationId: string,
  handlers: ChannelHandlers,
): Promise<ConversationChannel> {
  // No argument: use the current session's access token. Private channels are authorized with
  // it, and supabase-js forwards later refreshed tokens to Realtime by itself.
  await client.realtime.setAuth();

  let left = false;
  const channel = client.channel(chatTopic(conversationId), { config: { private: true } });

  channel
    .on('broadcast', { event: MESSAGE_SAVED_EVENT }, (message: { payload?: unknown }) => {
      if (!left) handlers.onPing(pingedMessageId(message.payload));
    })
    .subscribe((status: string) => {
      if (left) return;
      if (status === 'SUBSCRIBED') handlers.onJoined();
      else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') handlers.onJoinFailed();
      else if (status === 'CLOSED') handlers.onDown();
    });

  return {
    async leave() {
      if (left) return;
      left = true;
      // removeChannel, not unsubscribe: a refused channel left on the socket keeps retrying and
      // delays delivery on every other channel sharing that connection (measured at /plan).
      try {
        await client.removeChannel(channel);
      } catch {
        // The socket is already gone; there is nothing left to remove.
      }
    },
  };
}
```

- [ ] **Step 4 — Run green.** `npx vitest run lib/chat/__tests__/conversationChannel.test.ts` → PASS (11 tests). Then `npm run typecheck` → clean (this is where the `SupabaseClient` typing of `channel.on` / `subscribe` is proven; if the `status` parameter type is rejected, annotate it with the exported `REALTIME_SUBSCRIBE_STATES` type from `@supabase/supabase-js` instead of `string` and compare against the same four literals).

- [ ] **Step 5 — Commit.** `git add lib/chat/conversationChannel.ts lib/chat/__tests__/conversationChannel.test.ts && git commit -m "feat(#6): join and leave the private chat channel, listen-only"`

---

## Task 5 — `lib/chat/conversationSession.ts` (catch-up, single flight, access lost)

**Files:**
- Create: `lib/chat/conversationSession.ts`
- Test: `lib/chat/__tests__/conversationSession.test.ts`

**Interfaces:**
- Consumes: `ChatMessage`, `mergeMessages`, `catchUpCursor`, `INITIAL_PAGE_SIZE` (Task 2); `MessagesApi` (Task 3); `ChannelHandlers`, `ConversationChannel` (Task 4).
- Produces:
  - `CATCH_UP_POLL_MS = 30_000`
  - `type ConversationStatus = 'loading' | 'ready' | 'error' | 'unavailable'`
  - `interface ConversationState { messages: ChatMessage[]; status: ConversationStatus; isLive: boolean; hasOlder: boolean }`
  - `INITIAL_CONVERSATION_STATE: ConversationState`
  - `interface SessionDeps { api: MessagesApi; joinChannel(conversationId: string, handlers: ChannelHandlers): Promise<ConversationChannel>; onChange(state: ConversationState): void; pollMs?: number }`
  - `interface ConversationSession { getState(): ConversationState; open(): Promise<void>; close(): Promise<void>; loadOlder(): Promise<void>; send(body: string, mentionTargets?: string[]): Promise<ChatMessage> }`
  - `createConversationSession(conversationId: string, userId: string, deps: SessionDeps): ConversationSession`

- [ ] **Step 1 — Write the failing test** `lib/chat/__tests__/conversationSession.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CATCH_UP_POLL_MS, createConversationSession, type ConversationState } from '../conversationSession';
import type { ChannelHandlers } from '../conversationChannel';
import type { NewMessage } from '../messagesApi';
import type { ChatMessage } from '../messageList';

const CONV = '11111111-1111-4111-8111-111111111111';
const ME = '22222222-2222-4222-8222-222222222222';

// msg(n) was saved n seconds after 12:00:00 UTC.
const msg = (n: number): ChatMessage => ({
  id: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
  conversation_id: CONV,
  sender_user_id: ME,
  body: `m${n}`,
  mention_targets: [],
  created_at: new Date(Date.UTC(2026, 9, 7, 12, 0, n)).toISOString(),
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function harness() {
  const states: ConversationState[] = [];
  let handlers: ChannelHandlers | null = null;
  const leave = vi.fn(async () => {});
  const api = {
    fetchLatest: vi.fn(async (_conversationId: string): Promise<ChatMessage[]> => []),
    fetchSince: vi.fn(async (_conversationId: string, _sinceIso: string): Promise<ChatMessage[]> => []),
    fetchOlder: vi.fn(async (_conversationId: string, _before: ChatMessage): Promise<ChatMessage[]> => []),
    insertMessage: vi.fn(async (_input: NewMessage): Promise<ChatMessage> => msg(0)),
    isConversationReadable: vi.fn(async (_conversationId: string): Promise<boolean> => true),
  };
  const joinChannel = vi.fn(async (_conversationId: string, h: ChannelHandlers) => {
    handlers = h;
    return { leave };
  });
  const session = createConversationSession(CONV, ME, { api, joinChannel, onChange: (s) => states.push(s) });
  const channel = (): ChannelHandlers => {
    if (!handlers) throw new Error('the session never joined a channel');
    return handlers;
  };
  return { session, api, joinChannel, leave, states, channel };
}

// Fake timers leave the microtask queue alone; advancing by 0 drains it.
const settle = () => vi.advanceTimersByTimeAsync(0);
const ids = (state: ConversationState) => state.messages.map((m) => m.id);

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('opening a conversation', () => {
  it('starts loading, joins the channel and loads the newest messages', async () => {
    const h = harness();
    h.api.fetchLatest.mockResolvedValueOnce([msg(2), msg(1)]);
    expect(h.session.getState()).toEqual({ messages: [], status: 'loading', isLive: false, hasOlder: false });

    await h.session.open();
    await settle();

    expect(h.joinChannel).toHaveBeenCalledWith(CONV, expect.any(Object));
    expect(h.api.fetchLatest).toHaveBeenCalledWith(CONV);
    expect(h.session.getState().status).toBe('ready');
    expect(ids(h.session.getState())).toEqual([msg(1).id, msg(2).id]);
    expect(h.states.at(-1)).toEqual(h.session.getState());
  });

  it('reports older messages exist when the first page comes back full', async () => {
    const h = harness();
    h.api.fetchLatest.mockResolvedValueOnce(Array.from({ length: 50 }, (_, i) => msg(i + 1)));

    await h.session.open();
    await settle();

    expect(h.session.getState().hasOlder).toBe(true);
  });

  it('still loads when the channel cannot be joined at all (connection limit, network)', async () => {
    const h = harness();
    h.joinChannel.mockRejectedValueOnce(new Error('no socket'));
    h.api.fetchLatest.mockResolvedValueOnce([msg(1)]);

    await h.session.open();
    await settle();

    expect(h.session.getState()).toMatchObject({ status: 'ready', isLive: false });
    expect(ids(h.session.getState())).toEqual([msg(1).id]);
  });

  it('reports an error when the first load fails, then recovers on the next tick', async () => {
    const h = harness();
    h.api.fetchLatest.mockRejectedValueOnce(new Error('offline'));
    h.api.fetchLatest.mockResolvedValueOnce([msg(1)]);

    await h.session.open();
    await settle();
    expect(h.session.getState().status).toBe('error');

    await vi.advanceTimersByTimeAsync(CATCH_UP_POLL_MS);
    expect(h.session.getState().status).toBe('ready');
    expect(ids(h.session.getState())).toEqual([msg(1).id]);
  });
});

describe('catch-up', () => {
  async function opened(initial: ChatMessage[] = [msg(30)]) {
    const h = harness();
    h.api.fetchLatest.mockResolvedValueOnce(initial);
    await h.session.open();
    await settle();
    h.api.fetchSince.mockClear();
    return h;
  }

  it('on a ping, fetches from the newest held message minus the 10 second overlap', async () => {
    const h = await opened();
    h.api.fetchSince.mockResolvedValueOnce([msg(30), msg(31)]);

    h.channel().onPing(msg(31).id);
    await settle();

    expect(h.api.fetchSince).toHaveBeenCalledWith(CONV, '2026-10-07T12:00:20.000Z');
    expect(ids(h.session.getState())).toEqual([msg(30).id, msg(31).id]);
  });

  it('runs when the channel joins or rejoins, and reports live', async () => {
    const h = await opened();

    h.channel().onJoined();
    await settle();

    expect(h.session.getState().isLive).toBe(true);
    expect(h.api.fetchSince).toHaveBeenCalledTimes(1);
  });

  it('runs every 30 seconds, so a lost ping or a dead connection costs at most that long', async () => {
    const h = await opened();

    await vi.advanceTimersByTimeAsync(CATCH_UP_POLL_MS);
    await vi.advanceTimersByTimeAsync(CATCH_UP_POLL_MS);

    expect(h.api.fetchSince).toHaveBeenCalledTimes(2);
  });

  it('is single flight: pings during an in-flight catch-up cause exactly one more', async () => {
    const h = await opened();
    const first = deferred<ChatMessage[]>();
    h.api.fetchSince.mockReturnValueOnce(first.promise);

    h.channel().onPing(msg(31).id);
    await settle();
    h.channel().onPing(msg(32).id);
    h.channel().onPing(msg(33).id);
    h.channel().onJoined();
    await settle();
    expect(h.api.fetchSince).toHaveBeenCalledTimes(1);

    first.resolve([msg(31)]);
    h.api.fetchSince.mockResolvedValueOnce([msg(31), msg(32), msg(33)]);
    await settle();

    expect(h.api.fetchSince).toHaveBeenCalledTimes(2);
    expect(ids(h.session.getState())).toEqual([msg(30).id, msg(31).id, msg(32).id, msg(33).id]);
  });

  it('keeps what it holds when a later catch-up fails', async () => {
    const h = await opened();
    h.api.fetchSince.mockRejectedValueOnce(new Error('timeout'));

    h.channel().onPing(null);
    await settle();

    expect(h.session.getState().status).toBe('ready');
    expect(ids(h.session.getState())).toEqual([msg(30).id]);
  });

  it('goes not-live when the channel drops, and keeps updating on the timer', async () => {
    const h = await opened();
    h.channel().onJoined();
    await settle();
    h.api.fetchSince.mockClear();

    h.channel().onDown();
    expect(h.session.getState().isLive).toBe(false);

    h.api.fetchSince.mockResolvedValueOnce([msg(31)]);
    await vi.advanceTimersByTimeAsync(CATCH_UP_POLL_MS);
    expect(ids(h.session.getState())).toEqual([msg(30).id, msg(31).id]);
  });
});

describe('sending', () => {
  it('inserts as the current user, merges the saved row at once and returns it', async () => {
    const h = harness();
    h.api.fetchLatest.mockResolvedValueOnce([msg(30)]);
    await h.session.open();
    await settle();
    h.api.insertMessage.mockResolvedValueOnce(msg(40));

    const saved = await h.session.send('hello', ['teacher']);

    expect(h.api.insertMessage).toHaveBeenCalledWith({
      conversationId: CONV,
      senderUserId: ME,
      body: 'hello',
      mentionTargets: ['teacher'],
    });
    expect(saved).toEqual(msg(40));
    expect(ids(h.session.getState())).toEqual([msg(30).id, msg(40).id]);
  });

  it("shows the sender's message once when its own ping follows", async () => {
    const h = harness();
    h.api.fetchLatest.mockResolvedValueOnce([msg(30)]);
    await h.session.open();
    await settle();
    h.api.insertMessage.mockResolvedValueOnce(msg(40));
    await h.session.send('hello');

    h.api.fetchSince.mockResolvedValueOnce([msg(30), msg(40)]);
    h.channel().onPing(msg(40).id);
    await settle();

    expect(ids(h.session.getState())).toEqual([msg(30).id, msg(40).id]);
    expect(h.api.isConversationReadable).not.toHaveBeenCalled();
  });

  it('defaults mention targets to none', async () => {
    const h = harness();
    await h.session.open();
    await settle();

    await h.session.send('hello');

    expect(h.api.insertMessage).toHaveBeenCalledWith(expect.objectContaining({ mentionTargets: [] }));
  });

  it('does not skip history when a message is sent before the first load has succeeded', async () => {
    const h = harness();
    h.api.fetchLatest.mockRejectedValueOnce(new Error('offline'));
    await h.session.open();
    await settle();
    h.api.insertMessage.mockResolvedValueOnce(msg(40));
    await h.session.send('hello');

    // The list now holds one message. The next catch-up must still be the initial load, not
    // "newer than the message I just sent".
    h.api.fetchLatest.mockResolvedValueOnce([msg(40), msg(39), msg(38)]);
    await vi.advanceTimersByTimeAsync(CATCH_UP_POLL_MS);

    expect(h.api.fetchSince).not.toHaveBeenCalled();
    expect(h.api.fetchLatest).toHaveBeenCalledTimes(2);
    expect(ids(h.session.getState())).toEqual([msg(38).id, msg(39).id, msg(40).id]);
  });

  it('propagates a refused save and changes nothing', async () => {
    const h = harness();
    h.api.fetchLatest.mockResolvedValueOnce([msg(30)]);
    await h.session.open();
    await settle();
    h.api.insertMessage.mockRejectedValueOnce({ code: '42501' });

    await expect(h.session.send('hello')).rejects.toEqual({ code: '42501' });
    expect(ids(h.session.getState())).toEqual([msg(30).id]);
  });
});

describe('access lost while the conversation is open', () => {
  async function opened() {
    const h = harness();
    h.api.fetchLatest.mockResolvedValueOnce([msg(30)]);
    await h.session.open();
    await settle();
    h.channel().onJoined();
    await settle();
    h.api.fetchSince.mockClear();
    return h;
  }

  it('clears the list, removes the channel and stops when a pinged message cannot be fetched and the conversation is gone', async () => {
    const h = await opened();
    h.api.isConversationReadable.mockResolvedValueOnce(false);

    h.channel().onPing(msg(31).id); // RLS returns nothing for it
    await settle();

    expect(h.session.getState()).toEqual({ messages: [], status: 'unavailable', isLive: false, hasOlder: false });
    expect(h.leave).toHaveBeenCalledTimes(1);

    h.api.fetchSince.mockClear();
    await vi.advanceTimersByTimeAsync(CATCH_UP_POLL_MS * 2);
    expect(h.api.fetchSince).not.toHaveBeenCalled();
  });

  it('stays as it is when the pinged message is missing but the conversation is still readable', async () => {
    const h = await opened();

    h.channel().onPing(msg(31).id);
    await settle();

    expect(h.api.isConversationReadable).toHaveBeenCalledWith(CONV);
    expect(h.session.getState().status).toBe('ready');
    expect(ids(h.session.getState())).toEqual([msg(30).id]);
    expect(h.leave).not.toHaveBeenCalled();
  });

  it('becomes unavailable when a join is refused and the conversation is gone', async () => {
    const h = await opened();
    h.api.isConversationReadable.mockResolvedValueOnce(false);

    h.channel().onJoinFailed();
    await settle();

    expect(h.session.getState().status).toBe('unavailable');
    expect(h.session.getState().messages).toEqual([]);
    expect(h.leave).toHaveBeenCalledTimes(1);
  });

  it('only goes not-live when a join fails but the conversation is still readable (connection limit)', async () => {
    const h = await opened();

    h.channel().onJoinFailed();
    await settle();

    expect(h.session.getState()).toMatchObject({ status: 'ready', isLive: false });
    expect(h.leave).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(CATCH_UP_POLL_MS);
    expect(h.api.fetchSince).toHaveBeenCalled();
  });

  it('does not conclude anything when the access check itself fails', async () => {
    const h = await opened();
    h.api.isConversationReadable.mockRejectedValueOnce(new Error('offline'));

    h.channel().onJoinFailed();
    await settle();

    expect(h.session.getState().status).toBe('ready');
    expect(ids(h.session.getState())).toEqual([msg(30).id]);
  });

  it('reports unavailable, not an empty chat, to a non-participant who cannot reach Realtime', async () => {
    const h = harness();
    h.joinChannel.mockRejectedValueOnce(new Error('no socket'));
    h.api.fetchLatest.mockResolvedValueOnce([]); // RLS: nothing
    h.api.isConversationReadable.mockResolvedValueOnce(false);

    await h.session.open();
    await settle();

    expect(h.session.getState().status).toBe('unavailable');
  });

  it('reports ready for a readable conversation that simply has no messages yet', async () => {
    const h = harness();
    h.api.fetchLatest.mockResolvedValueOnce([]);

    await h.session.open();
    await settle();

    expect(h.session.getState()).toMatchObject({ status: 'ready', messages: [] });
  });

  it('tries again from scratch when reopened (re-enrolled user returning to the app)', async () => {
    const h = await opened();
    h.api.isConversationReadable.mockResolvedValueOnce(false);
    h.channel().onJoinFailed();
    await settle();
    expect(h.session.getState().status).toBe('unavailable');

    h.api.fetchLatest.mockResolvedValueOnce([msg(50)]);
    await h.session.open();
    await settle();

    expect(h.joinChannel).toHaveBeenCalledTimes(2);
    expect(h.session.getState().status).toBe('ready');
    expect(ids(h.session.getState())).toEqual([msg(50).id]);
  });
});

describe('closing and reopening (background, foreground, leaving the screen)', () => {
  async function opened() {
    const h = harness();
    h.api.fetchLatest.mockResolvedValueOnce([msg(30)]);
    await h.session.open();
    await settle();
    h.channel().onJoined();
    await settle();
    h.api.fetchSince.mockClear();
    return h;
  }

  it('close leaves the channel, stops the timer, reports not-live and keeps the messages', async () => {
    const h = await opened();

    await h.session.close();
    await vi.advanceTimersByTimeAsync(CATCH_UP_POLL_MS * 2);

    expect(h.leave).toHaveBeenCalledTimes(1);
    expect(h.api.fetchSince).not.toHaveBeenCalled();
    expect(h.session.getState().isLive).toBe(false);
    expect(ids(h.session.getState())).toEqual([msg(30).id]);
  });

  it('reopen rejoins and catches up from where it left off, not from scratch', async () => {
    const h = await opened();
    await h.session.close();
    h.api.fetchSince.mockResolvedValueOnce([msg(30), msg(31)]);

    await h.session.open();
    await settle();

    expect(h.joinChannel).toHaveBeenCalledTimes(2);
    expect(h.api.fetchLatest).toHaveBeenCalledTimes(1);
    expect(h.api.fetchSince).toHaveBeenCalledWith(CONV, '2026-10-07T12:00:20.000Z');
    expect(ids(h.session.getState())).toEqual([msg(30).id, msg(31).id]);
  });

  it('open is idempotent: a second open while open does not join twice', async () => {
    const h = await opened();

    await h.session.open();

    expect(h.joinChannel).toHaveBeenCalledTimes(1);
  });

  it('ignores events from a channel it has already left', async () => {
    const h = await opened();
    const stale = h.channel();
    await h.session.close();

    stale.onPing(msg(31).id);
    stale.onJoined();
    await settle();

    expect(h.api.fetchSince).not.toHaveBeenCalled();
    expect(h.session.getState().isLive).toBe(false);
  });

  it('drops the result of a catch-up that was in flight when it closed, and works again on reopen', async () => {
    const h = await opened();
    const inFlight = deferred<ChatMessage[]>();
    h.api.fetchSince.mockReturnValueOnce(inFlight.promise);
    h.channel().onPing(msg(31).id);
    await settle();

    await h.session.close();
    inFlight.resolve([msg(31)]);
    await settle();
    expect(ids(h.session.getState())).toEqual([msg(30).id]);

    h.api.fetchSince.mockResolvedValueOnce([msg(31)]);
    await h.session.open();
    await settle();
    expect(ids(h.session.getState())).toEqual([msg(30).id, msg(31).id]);
  });

  it('leaves a channel whose join finished after the session had already closed', async () => {
    const h = harness();
    const join = deferred<{ leave: () => Promise<void> }>();
    h.joinChannel.mockReturnValueOnce(join.promise);

    const opening = h.session.open();
    await settle();
    await h.session.close();
    join.resolve({ leave: h.leave });
    await opening;

    expect(h.leave).toHaveBeenCalledTimes(1);
  });
});

describe('older pages', () => {
  it('fetches before the oldest held message, merges, and updates hasOlder', async () => {
    const h = harness();
    const firstPage = Array.from({ length: 50 }, (_, i) => msg(i + 100));
    h.api.fetchLatest.mockResolvedValueOnce(firstPage);
    await h.session.open();
    await settle();
    h.api.fetchOlder.mockResolvedValueOnce([msg(99), msg(98)]);

    await h.session.loadOlder();

    expect(h.api.fetchOlder).toHaveBeenCalledWith(CONV, msg(100));
    expect(ids(h.session.getState()).slice(0, 3)).toEqual([msg(98).id, msg(99).id, msg(100).id]);
    expect(h.session.getState().hasOlder).toBe(false);
  });

  it('does nothing when there are no older messages', async () => {
    const h = harness();
    h.api.fetchLatest.mockResolvedValueOnce([msg(1)]);
    await h.session.open();
    await settle();

    await h.session.loadOlder();

    expect(h.api.fetchOlder).not.toHaveBeenCalled();
  });

  it('does not run two older-page fetches at once', async () => {
    const h = harness();
    h.api.fetchLatest.mockResolvedValueOnce(Array.from({ length: 50 }, (_, i) => msg(i + 100)));
    await h.session.open();
    await settle();
    const page = deferred<ChatMessage[]>();
    h.api.fetchOlder.mockReturnValueOnce(page.promise);

    const first = h.session.loadOlder();
    const second = h.session.loadOlder();
    page.resolve([]);
    await Promise.all([first, second]);

    expect(h.api.fetchOlder).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2 — Run red.** `npx vitest run lib/chat/__tests__/conversationSession.test.ts` → FAIL, `Cannot find module '../conversationSession'`.

- [ ] **Step 3 — Implement** `lib/chat/conversationSession.ts`:

```ts
import type { ChannelHandlers, ConversationChannel } from './conversationChannel';
import type { MessagesApi } from './messagesApi';
import { INITIAL_PAGE_SIZE, catchUpCursor, mergeMessages, type ChatMessage } from './messageList';

// A signal can be lost and a connection can be refused (200-connection limit, network). The same
// catch-up runs on this timer, so the chat degrades from instant to at most this late and no
// separate fallback mode exists (design decision 3).
export const CATCH_UP_POLL_MS = 30_000;

export type ConversationStatus = 'loading' | 'ready' | 'error' | 'unavailable';

export interface ConversationState {
  messages: ChatMessage[];
  status: ConversationStatus;
  isLive: boolean;
  hasOlder: boolean;
}

export const INITIAL_CONVERSATION_STATE: ConversationState = {
  messages: [],
  status: 'loading',
  isLive: false,
  hasOlder: false,
};

export interface SessionDeps {
  api: MessagesApi;
  joinChannel(conversationId: string, handlers: ChannelHandlers): Promise<ConversationChannel>;
  onChange(state: ConversationState): void;
  pollMs?: number;
}

export interface ConversationSession {
  getState(): ConversationState;
  open(): Promise<void>;
  close(): Promise<void>;
  loadOlder(): Promise<void>;
  send(body: string, mentionTargets?: string[]): Promise<ChatMessage>;
}

// Everything a conversation does while it is on screen, with no React in it so it can be tested
// directly (the repo has no renderer; same split as setupAutoRefreshOnRegain and its hook).
// `open` / `close` are also foreground / background: messages are kept across them.
export function createConversationSession(
  conversationId: string,
  userId: string,
  deps: SessionDeps,
): ConversationSession {
  let state = INITIAL_CONVERSATION_STATE;
  let active = false;
  // Bumped whenever the current channel stops being ours, so a late callback or a late join
  // from an earlier open cannot act on this one.
  let generation = 0;
  let channel: ConversationChannel | null = null;
  let timer: ReturnType<typeof setInterval> | null = null;
  let running = false;
  let rerun = false;
  // False until one initial load has succeeded. Until then catch-up must be "newest 50", even
  // if the list already holds a message this device just sent.
  let loaded = false;
  let loadingOlder = false;
  const pendingPings = new Set<string>();

  function set(patch: Partial<ConversationState>): void {
    state = { ...state, ...patch };
    deps.onChange(state);
  }

  function stopTimer(): void {
    if (timer !== null) clearInterval(timer);
    timer = null;
  }

  async function becomeUnavailable(): Promise<void> {
    active = false;
    generation += 1;
    stopTimer();
    pendingPings.clear();
    loaded = false;
    const leaving = channel;
    channel = null;
    // A withdrawn user's device stops showing a minors' conversation as soon as it notices.
    set({ messages: [], status: 'unavailable', isLive: false, hasOlder: false });
    if (leaving) await leaving.leave();
  }

  // RLS answers a revoked user with an empty result, not an error, so "nothing new" and "no
  // longer allowed" look the same. Reading the conversations row tells them apart.
  async function checkAccess(): Promise<void> {
    let readable: boolean;
    try {
      readable = await deps.api.isConversationReadable(conversationId);
    } catch {
      return; // Cannot tell. The next ping, failed join or empty catch-up asks again.
    }
    if (active && !readable) await becomeUnavailable();
  }

  async function catchUp(): Promise<void> {
    if (!active) return;
    if (running) {
      rerun = true;
      return;
    }
    running = true;
    try {
      do {
        rerun = false;
        const pinged = [...pendingPings];
        pendingPings.clear();
        const cursor = loaded ? catchUpCursor(state.messages) : null;

        let rows: ChatMessage[];
        try {
          rows =
            cursor === null
              ? await deps.api.fetchLatest(conversationId)
              : await deps.api.fetchSince(conversationId, cursor);
        } catch {
          for (const id of pinged) pendingPings.add(id);
          if (active && !loaded) set({ status: 'error' });
          continue;
        }
        if (!active) break;

        const messages = mergeMessages(state.messages, rows);
        set(
          cursor === null
            ? { messages, status: 'ready', hasOlder: rows.length === INITIAL_PAGE_SIZE }
            : { messages, status: 'ready' },
        );
        loaded = true;

        const held = new Set(messages.map((m) => m.id));
        if (messages.length === 0 || pinged.some((id) => !held.has(id))) await checkAccess();
      } while (rerun && active);
    } finally {
      running = false;
    }
  }

  function handlersFor(openedAs: number): ChannelHandlers {
    const current = () => active && openedAs === generation;
    return {
      onPing(messageId) {
        if (!current()) return;
        if (messageId) pendingPings.add(messageId);
        void catchUp();
      },
      onJoined() {
        if (!current()) return;
        set({ isLive: true });
        void catchUp();
      },
      onJoinFailed() {
        if (!current()) return;
        set({ isLive: false });
        void checkAccess();
      },
      onDown() {
        if (!current()) return;
        set({ isLive: false });
      },
    };
  }

  return {
    getState: () => state,

    async open() {
      if (active) return;
      active = true;
      generation += 1;
      const openedAs = generation;
      if (state.status !== 'ready') set({ status: 'loading' });

      timer = setInterval(() => void catchUp(), deps.pollMs ?? CATCH_UP_POLL_MS);
      void catchUp();

      try {
        const joined = await deps.joinChannel(conversationId, handlersFor(openedAs));
        if (!active || openedAs !== generation) {
          await joined.leave();
          return;
        }
        channel = joined;
      } catch {
        // Cannot connect. The timer keeps the conversation current; nothing is lost.
      }
    },

    async close() {
      if (!active) return;
      active = false;
      generation += 1;
      stopTimer();
      rerun = false;
      const leaving = channel;
      channel = null;
      if (state.isLive) set({ isLive: false });
      if (leaving) await leaving.leave();
    },

    async loadOlder() {
      const oldest = state.messages[0];
      if (!state.hasOlder || loadingOlder || !oldest) return;
      loadingOlder = true;
      try {
        const rows = await deps.api.fetchOlder(conversationId, oldest);
        if (state.status === 'unavailable') return;
        set({ messages: mergeMessages(state.messages, rows), hasOlder: rows.length === INITIAL_PAGE_SIZE });
      } finally {
        loadingOlder = false;
      }
    },

    async send(body, mentionTargets = []) {
      const saved = await deps.api.insertMessage({ conversationId, senderUserId: userId, body, mentionTargets });
      // Merged at once; the ping that follows finds it already present. Returned so the caller
      // can invoke push (ADR-0028). This module does not call push.
      if (state.status !== 'unavailable') set({ messages: mergeMessages(state.messages, [saved]) });
      return saved;
    },
  };
}
```

- [ ] **Step 4 — Run green.** `npx vitest run lib/chat/__tests__/conversationSession.test.ts` → PASS (32 tests). If a test fails, fix the implementation, not the test — each test states a behaviour the spec or the Review focus requires.

- [ ] **Step 5 — Commit.** `git add lib/chat/conversationSession.ts lib/chat/__tests__/conversationSession.test.ts && git commit -m "feat(#6): conversation session — one catch-up path, single flight, 30 s timer, access-lost"`

---

## Task 6 — Hook, app activity and sign-out wiring

**Files:**
- Create: `lib/chat/appActivity.ts`, `lib/chat/signOutCleanup.ts`, `lib/chat/useConversationMessages.ts`
- Test: `lib/chat/__tests__/appActivity.test.ts`, `lib/chat/__tests__/appActivity.native.test.ts`, `lib/chat/__tests__/signOutCleanup.test.ts`
- Modify: `lib/auth/SessionProvider.tsx:74-76` (the `onAuthStateChange` callback)

**Interfaces:**
- Consumes: `createConversationSession`, `INITIAL_CONVERSATION_STATE`, `ConversationState` (Task 5); `createMessagesApi` (Task 3); `joinConversationChannel` (Task 4); `supabase` from `lib/supabase.ts`; `useSession()` from `lib/auth/SessionProvider.tsx` (`session: Session | null`).
- Produces:
  - `watchAppActivity(onActive: () => void, onInactive: () => void): () => void`
  - `removeChannelsOnSignOut(event: string, removeAllChannels: () => unknown): void`
  - `useConversationMessages(conversationId: string): ConversationState & { loadOlder(): Promise<void>; send(body: string, mentionTargets?: string[]): Promise<ChatMessage> }` — the interface #24 builds on.

- [ ] **Step 1 — Write the failing tests.**

`lib/chat/__tests__/appActivity.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
// Web: Platform.OS is 'web' in test/mocks/react-native.ts. The native branch is in
// appActivity.native.test.ts, which overrides that alias locally.
import { watchAppActivity } from '../appActivity';

let originalDocument: typeof globalThis.document;
let fakeDocument: EventTarget & { visibilityState: 'visible' | 'hidden' };

beforeEach(() => {
  originalDocument = globalThis.document;
  fakeDocument = Object.assign(new EventTarget(), { visibilityState: 'visible' as 'visible' | 'hidden' });
  // @ts-expect-error test-only global, not a full DOM
  globalThis.document = fakeDocument;
});
afterEach(() => {
  globalThis.document = originalDocument;
});

const becomes = (state: 'visible' | 'hidden') => {
  fakeDocument.visibilityState = state;
  fakeDocument.dispatchEvent(new Event('visibilitychange'));
};

describe('watchAppActivity (web)', () => {
  it('reports inactive when the tab is hidden and active when it is visible again', () => {
    const onActive = vi.fn();
    const onInactive = vi.fn();
    watchAppActivity(onActive, onInactive);

    becomes('hidden');
    expect(onInactive).toHaveBeenCalledTimes(1);
    expect(onActive).not.toHaveBeenCalled();

    becomes('visible');
    expect(onActive).toHaveBeenCalledTimes(1);
  });

  it('stops reporting after the returned cleanup runs', () => {
    const onActive = vi.fn();
    const onInactive = vi.fn();
    const stop = watchAppActivity(onActive, onInactive);

    stop();
    becomes('hidden');
    becomes('visible');

    expect(onActive).not.toHaveBeenCalled();
    expect(onInactive).not.toHaveBeenCalled();
  });

  it('is a no-op where there is no document (static web export)', () => {
    // @ts-expect-error test-only: simulate a non-browser environment
    globalThis.document = undefined;
    expect(() => watchAppActivity(vi.fn(), vi.fn())()).not.toThrow();
  });
});
```

`lib/chat/__tests__/appActivity.native.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

type AppStateHandler = (next: string) => void;

const remove = vi.fn();
const addEventListener = vi.fn((_event: string, _handler: AppStateHandler) => ({ remove }));
// Closure, not a direct reference: vi.mock is hoisted above these consts (same pattern as
// lib/auth/__tests__/useAutoRefreshOnRegain.native.test.ts).
vi.mock('react-native', () => ({
  Platform: { OS: 'ios' },
  AppState: {
    addEventListener: (event: string, listener: AppStateHandler) => addEventListener(event, listener),
  },
}));

import { watchAppActivity } from '../appActivity';

const handler = (): AppStateHandler => {
  const call = addEventListener.mock.calls.at(-1);
  if (!call) throw new Error('AppState.addEventListener was never called');
  return call[1];
};

beforeEach(() => {
  addEventListener.mockClear();
  remove.mockClear();
});

describe('watchAppActivity (native)', () => {
  it('reports active on "active" and inactive on "background"', () => {
    const onActive = vi.fn();
    const onInactive = vi.fn();
    watchAppActivity(onActive, onInactive);
    expect(addEventListener).toHaveBeenCalledWith('change', expect.any(Function));

    handler()('background');
    expect(onInactive).toHaveBeenCalledTimes(1);

    handler()('active');
    expect(onActive).toHaveBeenCalledTimes(1);
  });

  it('ignores the transient iOS "inactive" state (app switcher, incoming call banner)', () => {
    const onActive = vi.fn();
    const onInactive = vi.fn();
    watchAppActivity(onActive, onInactive);

    handler()('inactive');

    expect(onActive).not.toHaveBeenCalled();
    expect(onInactive).not.toHaveBeenCalled();
  });

  it('removes the AppState subscription on cleanup', () => {
    const stop = watchAppActivity(vi.fn(), vi.fn());
    stop();
    expect(remove).toHaveBeenCalledTimes(1);
  });
});
```

`lib/chat/__tests__/signOutCleanup.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { removeChannelsOnSignOut } from '../signOutCleanup';

describe('removeChannelsOnSignOut', () => {
  it('removes every Realtime channel when the user signs out', () => {
    const removeAllChannels = vi.fn(async () => []);
    removeChannelsOnSignOut('SIGNED_OUT', removeAllChannels);
    expect(removeAllChannels).toHaveBeenCalledTimes(1);
  });

  it.each(['SIGNED_IN', 'TOKEN_REFRESHED', 'USER_UPDATED', 'INITIAL_SESSION'])(
    'leaves channels alone on %s (supabase-js forwards a refreshed token to Realtime itself)',
    (event) => {
      const removeAllChannels = vi.fn();
      removeChannelsOnSignOut(event, removeAllChannels);
      expect(removeAllChannels).not.toHaveBeenCalled();
    },
  );

  it('never throws into the auth listener, whether removal throws or rejects', async () => {
    expect(() =>
      removeChannelsOnSignOut('SIGNED_OUT', () => {
        throw new Error('sync');
      }),
    ).not.toThrow();
    expect(() => removeChannelsOnSignOut('SIGNED_OUT', () => Promise.reject(new Error('async')))).not.toThrow();
    await Promise.resolve(); // an unhandled rejection here would fail the run
  });
});
```

- [ ] **Step 2 — Run red.** `npx vitest run lib/chat/__tests__/appActivity.test.ts lib/chat/__tests__/appActivity.native.test.ts lib/chat/__tests__/signOutCleanup.test.ts` → FAIL, modules not found.

- [ ] **Step 3 — Implement the three modules.**

`lib/chat/appActivity.ts`:

```ts
import { AppState, Platform } from 'react-native';

// Foreground / background for a conversation that is on screen (design decision 2: a device
// listens only while a conversation is visible, so idle apps do not hold one of the 200
// connections). Extracted so both platform branches are testable without a renderer.
export function watchAppActivity(onActive: () => void, onInactive: () => void): () => void {
  if (Platform.OS === 'web') {
    // `document` is absent during Expo Router's static web export.
    if (typeof document === 'undefined') return () => {};
    const onVisibility = () => {
      if (document.visibilityState === 'visible') onActive();
      else onInactive();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }

  const subscription = AppState.addEventListener('change', (next) => {
    if (next === 'active') onActive();
    else if (next === 'background') onInactive();
    // 'inactive' is transient on iOS (app switcher, a call banner); leaving and rejoining the
    // channel for it would churn the connection for nothing.
  });
  return () => subscription.remove();
}
```

`lib/chat/signOutCleanup.ts`:

```ts
// On sign-out every Realtime channel goes, whichever screen was open (spec, Lifecycle table).
// A free function so the rule is testable: SessionProvider cannot be rendered in this repo's
// test setup. It must never throw into the auth listener.
export function removeChannelsOnSignOut(event: string, removeAllChannels: () => unknown): void {
  if (event !== 'SIGNED_OUT') return;
  try {
    void Promise.resolve(removeAllChannels()).catch(() => {});
  } catch {
    // Nothing to remove, or the socket is already gone.
  }
}
```

`lib/chat/useConversationMessages.ts`:

```ts
import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../supabase';
import { useSession } from '../auth/SessionProvider';
import { watchAppActivity } from './appActivity';
import { joinConversationChannel } from './conversationChannel';
import {
  INITIAL_CONVERSATION_STATE,
  createConversationSession,
  type ConversationSession,
  type ConversationState,
} from './conversationSession';
import { createMessagesApi } from './messagesApi';
import type { ChatMessage } from './messageList';

export interface ConversationMessages extends ConversationState {
  loadOlder(): Promise<void>;
  send(body: string, mentionTargets?: string[]): Promise<ChatMessage>;
}

// The interface class-chat-ui (#24) builds on. Thin by design: all behaviour lives in
// conversationSession.ts, where it is tested. Listening lasts exactly as long as the calling
// screen is mounted and the app is in the foreground.
export function useConversationMessages(conversationId: string): ConversationMessages {
  const { session } = useSession();
  const userId = session?.user.id ?? null;
  // State is stored with the (user, conversation) it belongs to and ignored for any other, so
  // switching conversation or account can never show the previous one's messages, even for a
  // single render.
  const key = `${userId ?? ''}:${conversationId}`;
  const [snapshot, setSnapshot] = useState<{ key: string; state: ConversationState } | null>(null);
  const state = snapshot?.key === key ? snapshot.state : INITIAL_CONVERSATION_STATE;
  const conversationRef = useRef<ConversationSession | null>(null);

  useEffect(() => {
    if (!userId) return;

    let mounted = true;
    const conversation = createConversationSession(conversationId, userId, {
      api: createMessagesApi(supabase),
      joinChannel: (id, handlers) => joinConversationChannel(supabase, id, handlers),
      onChange: (next) => {
        if (mounted) setSnapshot({ key, state: next });
      },
    });
    conversationRef.current = conversation;
    void conversation.open();
    const stopWatching = watchAppActivity(
      () => void conversation.open(),
      () => void conversation.close(),
    );

    return () => {
      mounted = false;
      stopWatching();
      conversationRef.current = null;
      void conversation.close();
    };
  }, [conversationId, userId, key]);

  const loadOlder = useCallback(() => conversationRef.current?.loadOlder() ?? Promise.resolve(), []);
  const send = useCallback((body: string, mentionTargets: string[] = []) => {
    const conversation = conversationRef.current;
    if (!conversation) return Promise.reject(new Error('conversation is not open'));
    return conversation.send(body, mentionTargets);
  }, []);

  return { ...state, loadOlder, send };
}
```

- [ ] **Step 4 — Wire sign-out.** In `lib/auth/SessionProvider.tsx`, add the import beside the other local imports:

```ts
import { removeChannelsOnSignOut } from "../chat/signOutCleanup";
```

and replace the `onAuthStateChange` callback (currently `(_event, nextSession) => { refresh(nextSession); }`) with:

```ts
    const { data: authListener } = supabase.auth.onAuthStateChange((event, nextSession) => {
      // Both sign-out paths (this provider's and /no-role's runSignOut) end in SIGNED_OUT.
      removeChannelsOnSignOut(event, () => supabase.removeAllChannels());
      refresh(nextSession);
    });
```

- [ ] **Step 5 — Run green.**

Run: `npm test && npm run typecheck && npm run lint && node scripts/check-secrets.js`
Expected: all pass. If `typecheck` fails on routes that exist, `rm -rf .expo/types` and re-run (stale generated types).

- [ ] **Step 6 — Hand check of the wiring that has no unit test** (the hook and the one line in `SessionProvider`). With `npm run dev` and the local stack up, temporarily render `useConversationMessages(<a seeded class conversation id>)` from `app/(tabs)/chat.tsx` in two browser profiles signed in as `teacher1@bv-seed.test.local` and `multirole@bv-seed.test.local`; confirm: a `send` in one appears in the other without reload; hiding a tab closes its websocket channel (Network → WS) and showing it rejoins; signing out leaves no channel. **Revert the temporary render** — `chat.tsx` stays a placeholder. Record what was observed in the PR description.

- [ ] **Step 7 — Commit.**

```bash
git add lib/chat/appActivity.ts lib/chat/signOutCleanup.ts lib/chat/useConversationMessages.ts lib/chat/__tests__/appActivity.test.ts lib/chat/__tests__/appActivity.native.test.ts lib/chat/__tests__/signOutCleanup.test.ts lib/auth/SessionProvider.tsx
git commit -m "feat(#6): useConversationMessages hook, foreground/background listening, channels removed on sign-out"
```

---

## Task 7 — End-to-end join check (Decision B)

**Files:**
- Create: `scripts/e2e-realtime-join.mjs`
- Modify: `.github/workflows/ci.yml` (job `db-and-rls`, after the `supabase test db` step)

**Interfaces:**
- Consumes: Task 1's migration applied to a running, seeded local stack; seeded logins `teacher1@bv-seed.test.local` and `multirole@bv-seed.test.local` (participants of one class conversation) and `admin1@bv-seed.test.local` (not a participant of it).
- Produces: exit code 0 when the live Realtime service agrees with test 191; non-zero with one line per failed check otherwise.

- [ ] **Step 1 — Write the check** `scripts/e2e-realtime-join.mjs`:

```js
// End-to-end join check for realtime chat delivery (issue #6, ADR-2026-10-07).
//
// supabase/tests/191 simulates how Realtime authorizes a channel join. This script asks the real
// service, over a real websocket, and fails if the two disagree.
//
// LOCAL STACK ONLY. It signs seeded users in by asking the local stack for a magic-link token
// with the local stack's own service key, read at run time from `supabase status`. Nothing is
// stored, and it refuses to run against any host but 127.0.0.1 / localhost.
import { execFileSync } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';

const MEMBER_A = 'teacher1@bv-seed.test.local';
const MEMBER_B = 'multirole@bv-seed.test.local';
const OUTSIDER = 'admin1@bv-seed.test.local';
const JOIN_TIMEOUT_MS = 10_000;
const PING_TIMEOUT_MS = 5_000;
const FORGED_WAIT_MS = 2_000;

const status = JSON.parse(
  execFileSync('npx', ['supabase', 'status', '-o', 'json'], { stdio: ['ignore', 'pipe', 'ignore'] }).toString(),
);
const url = status.API_URL;
if (!['127.0.0.1', 'localhost'].includes(new URL(url).hostname)) {
  console.error(`refusing to run against ${url}: this check is for the local stack only`);
  process.exit(2);
}

const failures = [];
const check = (ok, label) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}`);
  if (!ok) failures.push(label);
};
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const clientOptions = { auth: { persistSession: false, autoRefreshToken: false } };

async function signIn(email) {
  const admin = createClient(url, status.SERVICE_ROLE_KEY, clientOptions);
  const link = await admin.auth.admin.generateLink({ type: 'magiclink', email });
  if (link.error) throw new Error(`could not create a sign-in token for ${email}: ${link.error.message}`);
  const client = createClient(url, status.ANON_KEY, clientOptions);
  const verified = await client.auth.verifyOtp({ token_hash: link.data.properties.hashed_token, type: 'email' });
  if (verified.error) throw new Error(`could not sign in ${email}: ${verified.error.message}`);
  await client.realtime.setAuth(verified.data.session.access_token);
  return { client, userId: verified.data.user.id };
}

function join(client, topic, onPing = () => {}) {
  return new Promise((resolve) => {
    const channel = client.channel(topic, { config: { private: true } });
    channel.on('broadcast', { event: 'message_saved' }, (message) => onPing(message.payload));
    const timeout = setTimeout(() => resolve({ channel, state: 'TIMED_OUT' }), JOIN_TIMEOUT_MS);
    channel.subscribe((state) => {
      if (state === 'SUBSCRIBED' || state === 'CHANNEL_ERROR' || state === 'TIMED_OUT') {
        clearTimeout(timeout);
        resolve({ channel, state });
      }
    });
  });
}

async function conversationIds(client) {
  const { data, error } = await client.from('conversation_participants').select('conversation_id');
  if (error) throw new Error(`could not read conversation_participants: ${error.message}`);
  return new Set(data.map((row) => row.conversation_id));
}

async function main() {
  const a = await signIn(MEMBER_A);
  const b = await signIn(MEMBER_B);
  const outsider = await signIn(OUTSIDER);

  // Fixture preconditions, checked rather than assumed: the seed can change.
  const mine = await conversationIds(a.client);
  const shared = [...(await conversationIds(b.client))].filter((id) => mine.has(id));
  const notTheirs = await conversationIds(outsider.client);
  const conversationId = shared.find((id) => !notTheirs.has(id));
  if (!conversationId) {
    throw new Error(`the seed no longer has a conversation shared by ${MEMBER_A} and ${MEMBER_B} that ${OUTSIDER} is not in`);
  }
  const topic = `chat:${conversationId}`;

  // 1. A participant joins and receives the signal when another participant saves a message.
  const pings = [];
  const joinedA = await join(a.client, topic, (payload) => pings.push(payload));
  check(joinedA.state === 'SUBSCRIBED', 'a participant can join the conversation channel');

  const saved = await b.client
    .from('messages')
    .insert({ conversation_id: conversationId, sender_user_id: b.userId, body: 'e2e join check', mention_targets: [] })
    .select('id, created_at')
    .single();
  check(!saved.error, 'a participant can save a message with the four permitted columns');

  const deadline = Date.now() + PING_TIMEOUT_MS;
  while (pings.length === 0 && Date.now() < deadline) await sleep(50);
  check(pings.length === 1, 'the other participant receives exactly one signal for it');
  check(
    pings.length === 1 && Object.keys(pings[0]).sort().join(',') === 'created_at,id',
    'the signal carries id and created_at and nothing else',
  );
  check(pings.length === 1 && pings[0].id === saved.data?.id, 'the signal names the saved message');

  // 2. Senders cannot choose created_at.
  const backdated = await b.client.from('messages').insert({
    conversation_id: conversationId,
    sender_user_id: b.userId,
    body: 'backdated',
    mention_targets: [],
    created_at: '2020-01-01T00:00:00Z',
  });
  check(backdated.error?.code === '42501', 'a save that supplies created_at is refused (42501)');

  // 3. Clients are listen-only: a send on the channel is not delivered.
  const joinedB = await join(b.client, topic);
  check(joinedB.state === 'SUBSCRIBED', 'the sending participant can also join');
  const before = pings.length;
  await joinedB.channel.send({ type: 'broadcast', event: 'message_saved', payload: { id: 'forged' } });
  await sleep(FORGED_WAIT_MS);
  check(pings.length === before, 'a signal sent by a client on the channel is not delivered');

  // 4. Non-participants and malformed topics are refused. Each refused channel is removed at
  // once: left on the socket it keeps retrying and delays the others.
  for (const [who, client, refusedTopic, label] of [
    ['outsider', outsider.client, topic, 'a non-participant is refused the conversation channel'],
    ['participant', a.client, `chat:${conversationId.toUpperCase()}`, 'an uppercase topic is refused'],
    ['participant', a.client, 'chat:not-a-uuid', 'a malformed topic is refused'],
    ['participant', a.client, `room:${conversationId}`, 'a non-chat topic is refused'],
  ]) {
    const attempt = await join(client, refusedTopic);
    check(attempt.state === 'CHANNEL_ERROR', `${label} (${who})`);
    await client.removeChannel(attempt.channel);
  }

  // 5. The fetch is refused too: history access is what the channel policy mirrors.
  const fetched = await outsider.client.from('messages').select('id').eq('conversation_id', conversationId);
  check(!fetched.error && fetched.data.length === 0, 'a non-participant reads no messages of the conversation');

  await Promise.all([a, b, outsider].map(({ client }) => client.removeAllChannels()));
}

main()
  .catch((error) => {
    console.error(error.message);
    failures.push('the check did not run to completion');
  })
  .finally(() => {
    if (failures.length > 0) {
      console.error(`\n${failures.length} check(s) failed`);
      process.exit(1);
    }
    console.log('\nrealtime end-to-end join check passed');
    process.exit(0);
  });
```

- [ ] **Step 2 — Prove it can fail.** With the local stack up and Task 1 applied, drop the policy and run it:

```bash
docker exec -i "$(docker ps --format '{{.Names}}' | grep '^supabase_db_')" psql -U postgres -d postgres -c "drop policy chat_participants_receive_broadcast on realtime.messages"
node scripts/e2e-realtime-join.mjs
```

Expected: exit 1; `FAIL a participant can join the conversation channel` and `FAIL the other participant receives exactly one signal for it`.

- [ ] **Step 3 — Restore and run green.**

Run: `npx supabase db reset && node scripts/e2e-realtime-join.mjs`
Expected: thirteen `ok` lines, `realtime end-to-end join check passed`, exit 0.

- [ ] **Step 4 — Add the CI step.** In `.github/workflows/ci.yml`, job `db-and-rls`, directly after the `supabase test db (retries on transient registry rate-limits)` step:

```yaml
      - name: Realtime end-to-end join check (issue #6)
        run: node scripts/e2e-realtime-join.mjs
```

- [ ] **Step 5 — Guards.** Run `node scripts/check-secrets.js` and `npm run lint` → both pass (the script contains no key; it reads the local one at run time).

- [ ] **Step 6 — Commit.** `git add scripts/e2e-realtime-join.mjs .github/workflows/ci.yml && git commit -m "test(#6): end-to-end Realtime join check on the local stack, run in db-and-rls"`

---

## Task 8 — Record and hand off

**Files:**
- Modify: `.docs/specs/system/realtime-chat-delivery.md` (stage line; "Client module" table; "Access lost" paragraph; "Carried forward")
- Modify: `.docs/specs/system/_index.md` (the `realtime-chat-delivery` row)

- [ ] **Step 1 — Bring the spec in line with what was built.**
  - Stage line: `/plan` ✓ (2026-10-07) → `/migration` ✓ → `/build` ✓ → next is `/test`.
  - "Client module" table: add `messagesApi.ts` (the five queries), `conversationSession.ts` (catch-up, single flight, timer, access-lost; what the hook wraps), `appActivity.ts`, `signOutCleanup.ts` (Decision C).
  - "Access lost while the conversation is open": add "…or a catch-up leaves the list empty" to the triggers, and "the channel is removed from the socket, not merely unsubscribed" (Decision D, finding 2).
  - "Carried forward → To `/plan`": replace with the two answers from "Verified during `/plan`" above.
- [ ] **Step 2 — Update the `_index.md` row:** append `→ `/plan` ✓ (2026-10-07 — channel policy tightened with `topic = realtime.topic()`; end-to-end join check runs in `db-and-rls`) → `/migration` ✓ → `/build` ✓ — next: `/test``.
- [ ] **Step 3 — Full verification, evidence pasted into the PR description.**

```bash
npx supabase db reset && npx supabase test db     # Result: PASS, 32 files, 487 tests
node scripts/e2e-realtime-join.mjs                 # realtime end-to-end join check passed
npm run lint && npm run typecheck && npm test      # all green
node scripts/check-secrets.js && node scripts/check-migration-fixtures.js && node scripts/gen-adr-index.mjs --check
```

- [ ] **Step 4 — Commit**, then ask the human to type `/test` (the stage records its own gate marker; do not write one by hand).

```bash
git add .docs/specs/system/realtime-chat-delivery.md .docs/specs/system/_index.md
git commit -m "docs(#6): record plan decisions and build status for realtime chat delivery"
```

---

## Carried to `/deploy-staging` (unchanged from the spec, plus one)

- Time the catch-up fetch on cloud staging (#105 lesson) and confirm the cloud access-token lifetime is 3600 s.
- Confirm the cloud project's Realtime setting does not allow public channels to stand in for private ones.
- Repeat the end-to-end join check against staging. `scripts/e2e-realtime-join.mjs` is local-only by design; on staging do it by hand with two real logins (the Task 6 Step 6 procedure), or decide there whether a staging variant is worth having.
- **New:** staging has schema drift (two untracked migrations wrapped every auth call) and must not be `db push`ed until that is reconciled; this migration is additive but rides the same push.

## Spec coverage

| Acceptance criterion | Task |
| --- | --- |
| 1 Live delivery ≈ 2 s | 1 (trigger, index), 5 (catch-up on ping), 7 (measured end to end) |
| 2 Live access equals history access | 1 (policy + 191), 7 |
| 3 Listen-only clients | 1 (191 group 6), 4 (never sends), 7 (forged send not delivered) |
| 4 No loss across gaps | 2, 3, 5 (one catch-up path: open, ping, rejoin, foreground, timer) |
| 5 Revocation | 1 (191 group 2, incl. "withdrawn again → next evaluation denies"), 5 (access-lost) |
| 6 Adversarial coverage | 1 (191, mutation check, `rls-adversarial-tester`), 7 |
| 7 Residency and vendors | no new service; 1 (190: body nowhere in the transport store) |
| 8 Capacity | 5 (timer when not live), 6 (listen only while on screen and in the foreground) |
