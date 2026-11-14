# System — chat-participant-sync — plan

> `/plan` 2026-11-13. Turns the [Design section](chat-participant-sync.md#design-2026-11-13) into ordered, test-first tasks.
> **Stage:** `/refine` ✓ `/architect` ✓ (ADR-2026-11-13) `/design` ✓ `/plan` ✓ (this — signed off by Maulik, 2026-11-14; execution: native) → `/migration` → `/build` → `/test` → `/deploy-staging`.
> **Spec:** [chat-participant-sync.md](chat-participant-sync.md) · **Governing ADR:** [ADR-2026-11-13-class-chat-membership-recount](../../adr/2026-11-13-class-chat-membership-recount.md) · **Issue:** #119

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. The pipeline stages (`/migration`, `/build`, `/test`) are typed by the human. Do the work, show the evidence, then ask them to type the stage command.

**Goal:** class-chat membership follows the rule (teacher / parent of an active child / active Gr 9+ student) whichever order logins and enrollments arrive in, and existing conversations are repaired once.

**Architecture:** migration 1 adds four functions: `is_hs_grade`, `class_chat_entitled`, `recount_class_participants`, and the read-only `class_chat_membership_preview`. Every event that can change a class's membership calls the recount for each affected class. Migration 2 is the one-time repair (the recount over every class conversation). There are no RLS or client changes. The seed and the staging seed stop issuing logins below Gr 9.

**Tech stack:** Postgres 15 + pgTAP (`supabase/migrations/`, `supabase/tests/`), Supabase CLI, Node 22 + Vitest 4 (`scripts/__tests__/`).

**Worktree / branch:** `feat/issue-119-chat-participant-sync` (current). **Shared seam (§12.6):** Tasks 2–5 are the serialized schema seam. They touch `supabase/migrations/` and must not run in parallel with any other item's migration work. Task 6 (seed + staging seed + UAT) depends only on `is_hs_grade` existing (Task 3) and can run alongside Tasks 4–5. Task 8 (docs) can run any time.

## Decisions taken at `/plan` (Maulik, 2026-11-13)

These came out of checking the design against the code. None reverses an ADR decision.

| # | Finding | Decision |
| --- | --- | --- |
| P-1 | `060_chat_rls.sql`, `190_…` and `191_…` create test students with `grade_level 'HS9'`/`'HS10'`, a spelling no real path produces (the CRM import validates `Gr1`–`Gr12`, and the seed writes `'9'`). Under the ratified `is_hs_grade` they stop being participants, so the design's "060 unchanged" cannot hold. | **Respell the fixtures** `'HS9'→'Gr9'`, `'HS10'→'Gr10'` in those three files only, changing the student rows and nothing else. The rule stays exactly as ratified. `170`–`172` also use `'HS9'` but do not read `conversation_participants`, so they are left alone. |
| P-2 | `scripts/seed-staging.mjs` `resolveScopeIds` gives a tester's student persona a login on the first unlinked student of the `'7, 8, 9'` class by `first_name`. That is often a Gr 7–8 child, which contradicts `/refine` Decision 1, and that persona's chat would be empty. The design missed this script. | **Fix it in #119:** claim only Gr 9+ students. Consequence: the claimable pool drops from 9 to 3, so a 4th tester needs `--reset`. |
| P-3 | The design's "pgTAP check that the preview script writes nothing" cannot run, because `supabase test db` cannot include a file outside `supabase/tests/`. | **The preview is a `stable` function, `class_chat_membership_preview()`**, in migration 1. Postgres refuses `insert`/`update`/`delete` inside a non-volatile function, so it cannot write. `supabase/scripts/119_membership_preview.sql` is a one-line wrapper. |

## Global constraints

- **Access control lives in the database** (non-negotiable #1). The grade rule is `is_hs_grade` and nothing else. Any TypeScript list that mirrors it (P-2) only chooses demo data; it never decides access.
- **Schema is code** (non-negotiable #3). Two new migrations: `20261113120000_class_chat_membership_recount.sql` and `20261113130000_class_chat_membership_repair.sql`. **Never edit `20260709043451_chat_sync_triggers.sql`.** Replace function bodies with `create or replace` in the new migration.
- **Tests first, seen to fail** (non-negotiable #4). Every new pgTAP fixture is written **enrol-first** (enrollment row before the `family_members` insert / `students.user_id` set).
- **`is_hs_grade` accepts exactly** `'9' '10' '11' '12' 'Gr9' 'Gr10' 'Gr11' 'Gr12'`. Everything else is false, including null, `''`, `'gr9'`, `' 9'`, `'HS9'`, `'PreK'`, `'KG'` and `'Shishu Vihaar'`.
- **Label precedence** is teacher > parent > student. A relabel is an in-place `update` of `participant_role`. `notify_level` and `notification_default` are never written by the recount.
- **Teacher ground ignores `user_roles.is_active`.**
- **Privileges:** all four new functions are `security definer`, `set search_path = public`, owned by `postgres`. `revoke execute … from public, anon, authenticated` on each.
- **The recount touches only `kind = 'class'` conversations.** The `session_staff` and `leadership` branches of `sync_staff_participants()` are byte-for-byte unchanged.
- **No RLS policy changes, no `audit_log` writes, no client code, no new vendor.**
- **No test-only DB objects in a migration** (ADR-2026-09-07; `scripts/check-migration-fixtures.js` enforces this in CI).
- **Verification runs on an isolated stack** (own `project_id`, 553xx ports), never the shared one. A reset there clobbers other worktrees.

## Review focus

The five conditions the spec implies but does not name, most likely first. Each has a test in the owning task.

1. **An Auth user who is both a teacher and a parent of a class is deleted.** The `family_members` cascade fires a recount while their `user_roles` row still exists. The recount must not insert or keep a row for a user whose `auth.users` row is gone, or the FK check aborts the delete. Expected: the delete succeeds and no participant row remains. `class_chat_entitled` joins `auth.users` for this reason (Task 3, test in Task 4).
2. **A multi-row `insert into enrollments`**, as in `domain.sql` and CSV phase 2. Expected: every enrolled family and Gr 9+ student is present after the one statement (Task 4).
3. **An active-role switch** (`switch_active_role` / the auth hook flipping `user_roles.is_active`). Expected: no participant row changes, and no `notify_level` is reset (Task 4).
4. **A user who is a class teacher and also a session coordinator.** A class recount must never delete or relabel their `session_staff` or `leadership` rows (Task 3).
5. **`students.user_id` repointed to a user who is already a `parent` participant of that class** (an older sibling's guardian account reused). Expected: one row, label `parent` (precedence), with no duplicate-key error (Task 4).

## Verified during `/plan`

| Fact | Where |
| --- | --- |
| The only writer of `conversation_participants` is `20260709043451`. No trigger on `conversation_participants`, so the recount cannot loop. | grep of `supabase/migrations/` |
| The only `user_roles` updates in the codebase are `is_active` flips, so insert/delete triggers are enough. | `20260711041635`, `20260711042538` |
| `enrollments.student_id` and `students.family_id` are `on delete restrict`; `family_members` cascades from `families` and `auth.users`; `students.user_id` is `on delete set null`. | `20260709032506` |
| Only `060` reads `conversation_participants` directly. `190`/`191` depend on membership through `is_conversation_participant`. `scripts/e2e-realtime-join.mjs` uses `teacher1@`/`multirole@`/`admin1@`, which are unaffected by the seed change. | grep |
| Only `108` and `UAT.md` name `studentN@` logins. | grep |

---

### Task 1: Respell the chat-test fixtures to a real grade spelling (P-1)

**Files:** Modify `supabase/tests/060_chat_rls.sql`, `supabase/tests/190_realtime_chat_delivery.sql`, `supabase/tests/191_realtime_chat_delivery_adversarial.sql`.

- [x] **Step 1:** In those three files, replace the student `grade_level` literals `'HS9'`→`'Gr9'` and `'HS10'`→`'Gr10'`. Leave class `grade_band` values (`'HS9-12'`) and everything else as they are.
- [x] **Step 2:** Run `npx supabase test db` on the isolated stack. Expected: all files PASS, with no behaviour change on `main`'s schema.
- [x] **Step 3:** Commit: `test(#119): respell chat fixtures' student grades to the CRM vocabulary`.

### Task 2: Adversarial matrix, Red against current main (AC#10)

**Files:** Create `supabase/tests/201_chat_participant_sync_adversarial.sql`.

**Interfaces.** Consumes only existing objects (`tests.create_supabase_user`, `tests.authenticate_as`, `messages`), so the file runs against `main`'s schema. It must not call any function from Task 3.

**Fixture** (UUID prefix `e2010000-…`, all enrol-first): one session with class **A** (`grade_band '7, 8, 9'`) and class **B**, plus one message posted by A's teacher in each class conversation. Users:

- `teacher_parent`: teacher of A, and a guardian of family F1, whose child is active in A.
- `two_home`: a guardian in F2 and F3, each with an active child in A.
- `sib_parent`: guardian of F4, with children S1 (later withdrawn) and S2 (stays) in A.
- `wd_parent`: guardian of F5, whose only child is withdrawn from A before the parent is linked.
- `parent_b`: guardian of F6, whose child is active in B only.
- Students in A: `stu9` (`'Gr9'`), `stu8` (`'8'`), `stu7` (`'Gr7'`), all active.
- `stu_regrade`: active in A, starts at `'9'`.
- `parent_unlink`: a guardian later deleted from `family_members`.
- `stu_clear`: a Gr 9 student whose `user_id` is later cleared.

**Access probe.** Each assertion runs `tests.authenticate_as(<user>, <role>, …)` and then `select count(*) from messages where conversation_id = :'v_conv_a'`. Expect 1 for access and 0 for denial. Never assert after `tests.clear_authentication()` (it runs as superuser).

- [x] **Step 1: Write the assertions** (names are the pgTAP descriptions):
  - `GRANT parent linked after enrollment reads A`, and the same for each guardian of F1–F4.
  - `GRANT Gr9 student linked after enrollment reads A` (`stu9`).
  - `DENY Gr8 student in the combined class` (`stu8`) and `DENY Gr7 student in the combined class` (`stu7`).
  - `DENY parent of class B reads A` (`parent_b`).
  - `DENY family whose only child withdrew` (`wd_parent`).
  - `GRANT sibling guard: parent keeps A after one child withdraws` (`sib_parent`, after S1 → withdrawn).
  - `GRANT teacher-parent keeps A after own child withdraws` (F1 child → withdrawn).
  - `GRANT teacher-parent keeps A after losing the teacher role, as parent`: re-activate F1's child, delete the teacher `user_roles` row, assert access, and as superuser assert `participant_role = 'parent'`.
  - `GRANT two-household guardian keeps A after unlinking from one` (delete the F2 link).
  - `DENY regrade 9→8 removes`, then `GRANT regrade 8→9 restores` (`stu_regrade`).
  - `DENY unlinked guardian` (`parent_unlink`) and `DENY cleared student login` (`stu_clear`).
  - `notify_level survives a recount`: as superuser, set `teacher_parent`'s `notify_level = 'muted'` before the relabel step, and assert it is still `'muted'` after.
  - **No vacuous DENYs.** Every removal DENY (withdrawal, unlink, clear, regrade 9→8) is preceded by a GRANT for the same user in the same file, so the denial proves a removal and not a user who was never added.
- [x] **Step 2: Run on the isolated stack at the current schema.** Expected: FAIL. On `main` the enrol-first order adds nobody, so every GRANT fails. The never-granted DENYs (Gr 7, Gr 8, class-B parent, withdrawn family) pass. Paste the failing list into the commit message body.
- [x] **Step 3:** Commit: `test(#119): adversarial membership matrix, red on main`.

### Task 3: The rule, the recount and the preview (migration 1, functions)

**Files:** Create `supabase/migrations/20261113120000_class_chat_membership_recount.sql`; create `supabase/tests/200_chat_participant_sync.sql`.

**Interfaces (Produces):**

- `public.is_hs_grade(p_grade text) returns boolean`: `language sql immutable security definer`.
- `public.class_chat_entitled(p_class_id uuid) returns table (user_id uuid, participant_role text)`: `stable`. One row per user, with the label chosen by precedence. Users whose `auth.users` row does not exist are excluded (Review focus 1).
- `public.recount_class_participants(p_class_id uuid) returns void`: volatile. Looks up `conversations` where `kind='class' and scope_type='class' and scope_id=p_class_id`, and returns quietly if there is none. Then it runs delete → in-place relabel → `insert … on conflict (conversation_id, user_id) do nothing`, against `class_chat_entitled`, restricted to that one `conversation_id`.
- `public.class_chat_membership_preview() returns table (class_id uuid, action text, participant_role text, n bigint)`: `stable`. `action` is one of `'add'`, `'remove'` or `'relabel'`. For `relabel`, `participant_role` is the **new** label. Only rows with `n > 0` are returned. No user ids and no names.

- [x] **Step 1: Write `200` part 1** (`plan(N)`; fixtures enrol-first, prefix `e2000000-…`):
  - `is_hs_grade` truth table: `is(is_hs_grade(x), true)` for each of the 8 accepted values; `false` for `null`, `''`, `'gr9'`, `' 9'`, `'9 '`, `'HS9'`, `'Gr 9'`, `'8'`, `'Gr8'`, `'13'`, `'PreK'`, `'KG'` and `'Shishu Vihaar'`.
  - `class_chat_entitled` on a hand-built class returns exactly the expected `(user_id, participant_role)` set, using `results_eq` ordered by `user_id`. It covers teacher-parent → `teacher`, parent-with-a-Gr9-login → `parent`, a Gr 8 login absent, a withdrawn-only family absent, and a `relationship = 'aunt'` member present as `parent`.
  - Recount reconciles: insert a stray row (`participant_role 'student'` for a Gr 8 login) and delete a rightful parent row, call the recount, and assert the table equals `class_chat_entitled`.
  - `recount is idempotent`: snapshot `(id, user_id, participant_role, notify_level, notification_default)`, recount twice, assert unchanged (row `id`s included, so nothing was delete-and-reinserted).
  - `relabel keeps notify_level and notification_default`.
  - `class with no conversation row: recount returns without error` (`lives_ok`, after deleting that class's conversation as superuser).
  - Review focus 4: `recount leaves session_staff and leadership rows untouched` for a user who is a class teacher and a session coordinator.
  - Privileges: for each of the 4 functions, `ok(not has_function_privilege('anon', '<sig>', 'execute'))`, the same for `authenticated`, and `ok(has_function_privilege('postgres', …))`.
  - Preview: `is((select provolatile from pg_proc where proname='class_chat_membership_preview'), 's')`. On the broken fixture above it returns `add parent 1` and `remove student 1`. After the recount it returns 0 rows. Counts of `conversation_participants` before and after the preview call are equal.
- [x] **Step 2:** Run `npx supabase test db`. Expected: `200` FAILS (functions do not exist).
- [x] **Step 3: Implement** the four functions in the migration, plus `revoke execute on function … from public, anon, authenticated` for each. `class_chat_entitled` is a `union all` of the three grounds with a rank (teacher 1, parent 2, student 3), then `distinct on (user_id) … order by user_id, rank`, joined to `auth.users`.
- [x] **Step 4:** Run. Expected: `200` part 1 PASS. `201` still Red (no triggers yet). Everything else green.
- [x] **Step 5:** Commit: `feat(#119): class-chat entitlement rule, recount and read-only preview`.

### Task 4: Wire every event to the recount (migration 1, triggers)

**Files:** Modify `supabase/migrations/20261113120000_class_chat_membership_recount.sql` (append); modify `supabase/tests/200_chat_participant_sync.sql` (part 2).

**Interfaces:** Consumes `recount_class_participants(uuid)` from Task 3. Produces these triggers:

| Trigger (on table) | Timing / events | Function | Classes recounted |
| --- | --- | --- | --- |
| `enrollments_sync_participants` (dropped and recreated) | `after insert or update or delete`, for each row | `sync_class_participants()` (body replaced) | `new.class_id`; also `old.class_id` when it differs or on delete |
| `family_members_sync_participants` (new) | `after insert or update or delete` | `sync_family_member_participants()` | distinct `class_id` of any-status enrollments of students in `old.family_id` ∪ `new.family_id` |
| `students_sync_participants` (new) | `after update of user_id, grade_level, family_id … when (old.user_id is distinct from new.user_id or old.grade_level is distinct from new.grade_level or old.family_id is distinct from new.family_id)` | `sync_student_participants()` | distinct `class_id` of that student's any-status enrollments |
| `user_roles_sync_participants` (unchanged) | — | `sync_staff_participants()`: only the two `scope_type='class' and role='teacher'` branches change, to `perform recount_class_participants(scope_id)` | `scope_id` |

All new trigger functions are `security definer`, `set search_path = public`, and `return coalesce(new, old)`.

- [x] **Step 1: Write `200` part 2**, each case enrol-first:
  - AC#1–3: guardian link → `parent` row; student login set → `student` row at Gr 9, none at Gr 8.
  - AC#2 / edge cases: a family with children in two classes in two sessions → rows in both, none in a third class. Two children in the same class → one row.
  - AC#6 / AC#7: unlink → row gone; clear → gone; repoint → old gone, new present.
  - D-1: enrollment `delete` → gone. Enrollment `class_id` A→B → gone from A, present in B in one statement. Student `family_id` change → old family's guardian leaves (no other ground), new family's guardian joins.
  - Re-enrol after withdrawal → restored.
  - Auth cascades: `delete from auth.users` for a guardian → no participant row; for a student → `students.user_id` is null and no row.
  - **Review focus 1:** `lives_ok` deleting the `auth.users` row of a teacher-parent, then no rows for that user.
  - **Review focus 2:** one multi-row `insert into enrollments` of three students (Gr9-with-login, Gr8-with-login, guardian-linked family) → exactly the Gr 9 student and the guardian are present.
  - **Review focus 3:** flip `user_roles.is_active` for a teacher and a parent (as `switch_active_role` does) → the participant snapshot is unchanged, including `id`.
  - **Review focus 5:** set `students.user_id` to a user already a `parent` participant → one row, `parent`.
  - Write as `service_role` (the CSV import's role): `set local role service_role; insert into family_members …` → row present (the revokes do not break trigger firing).
- [x] **Step 2:** Run. Expected: part 2 FAILS (no triggers).
- [x] **Step 3: Implement** the trigger functions and the `drop trigger … / create trigger …` statements in the table above.
- [x] **Step 4:** Run the full suite. Expected: `200` PASS, **`201` PASS (Red → Green)**, `060`, `190`, `191` PASS.
- [x] **Step 5:** Commit: `feat(#119): recount class-chat membership on every event that changes it`.

### Task 5: One-time repair migration (AC#8)

**Files:** Create `supabase/migrations/20261113130000_class_chat_membership_repair.sql`, `supabase/scripts/119_membership_preview.sql`; modify `supabase/tests/200_chat_participant_sync.sql` (part 3).

- [x] **Step 1: Write `200` part 3.** Corrupt a fixture as superuser with `alter table … disable trigger` inside the test transaction: a missing parent, a Gr 7 student row, and a teacher stored as `parent`. Run the **exact repair statement** `select recount_class_participants(scope_id) from conversations where kind = 'class';` and assert that the preview returns 0 rows and the table equals `class_chat_entitled` per class. Run it again and assert the row snapshot (with `id`s) is unchanged.
- [x] **Step 2:** Run. Expected: PASS for the function logic (already built). This part pins that the repair statement is correct. The migration file is what Step 3 adds.
- [x] **Step 3:** Write the migration as that one statement, with a header comment saying it is idempotent, changes no schema, and on staging is applied by `psql -f` **after** reading the preview (spec "Staging repair"). Write `supabase/scripts/119_membership_preview.sql` as `select * from class_chat_membership_preview() order by class_id, action, participant_role;`, with a header saying it is counts-only and read-only.
- [x] **Step 4:** `npx supabase db reset` on the isolated stack, then run the script with `psql`. Expected: 0 rows. Run the full suite: green.
- [x] **Step 5:** Commit: `feat(#119): one-time class-chat membership repair + staging preview`.

### Task 6: Seed and staging seed issue no logins below Gr 9 (Decision 1, P-2)

**Files:** Modify `supabase/seed/seed.sql:66-84`, `supabase/tests/108_seed_pilot_logins.sql`, `scripts/_seed-staging.mjs`, `scripts/seed-staging.mjs:212-220`, `scripts/__tests__/seed-staging.test.ts`, `UAT.md` (line 35, line 38 note, UAT-11/12/13 account lines); check `supabase/tests/106_seed_student_roles.sql`.

**Interfaces:** Consumes `is_hs_grade` (Task 3). Produces `export const HS_GRADE_LEVELS` in `scripts/_seed-staging.mjs`, a frozen array of exactly the 8 accepted values, commented as mirroring `is_hs_grade` for demo-data selection only.

- [x] **Step 1: Write the failing tests.**
  - `108`: `'F3 7-8-9 class: exactly 3 students have a login, all Gr 9+'` (count = 3, and count where `not is_hs_grade(grade_level)` = 0). The pairing test becomes `'student1@ is "Student 9-1" and <derived>@ is a guardian of that student''s family (UAT-11/12/13)'`. Add `'seeded class conversations match the entitlement rule'`: `is((select count(*) from class_chat_membership_preview()), 0)`.
  - Vitest: `HS_GRADE_LEVELS` equals exactly `['9','10','11','12','Gr9','Gr10','Gr11','Gr12']`. Also `resolveScopeIds` filters candidates with `.in('grade_level', HS_GRADE_LEVELS)`, asserted with a minimal fake Supabase client that records the query-builder calls. (The file has no `resolveScopeIds` test today, so this is new.)
- [x] **Step 2:** Run `npx supabase db reset && npx supabase test db` (isolated) and `npx vitest run scripts/__tests__/seed-staging.test.ts`. Expected: both FAIL.
- [x] **Step 3: Implement.**
  - `seed.sql`: add `and is_hs_grade(st.grade_level)` to the student-login loop, and rewrite the `PILOT EXCEPTION (#19)` comment to say the exception is withdrawn (#119, ADR-0015).
  - `seed-staging.mjs`: add `.in('grade_level', HS_GRADE_LEVELS)` to the first-run query, and update the "no unlinked student left" message to mention the Gr 9+ pool.
- [x] **Step 4: Derive the new pairing. Do not guess it.** After the reset, run:
  `select su.email, st.first_name, st.last_name, gu.email from auth.users su join students st on st.user_id = su.id join family_members fm on fm.family_id = st.family_id join auth.users gu on gu.id = fm.user_id where su.email = 'student1@bv-seed.test.local';`
  Put that guardian into `108` and `UAT.md` (UAT-11/12/13 and the line 38 note). Then confirm UAT-12/13's "Parent A and Parent B both have a child in the same class" still holds for the accounts named, and swap in a derived second parent if not. UAT line 35 becomes `student1@ … (through student3)` with "(the Gr 9 students of the F3 7, 8, 9 class have logins)".
- [x] **Step 5:** Re-check `106`. Its assertions are existence/consistency checks with no count of 9, so it needs no change. Confirm it stays green.
- [x] **Step 6:** Run everything. Expected: pgTAP, vitest, `npm run typecheck` and `npm run lint` all green.
- [x] **Step 7:** Commit: `fix(#119): seed and staging seed issue student logins only at Gr 9+`.

### Task 7: Measure the import cost (design "CSV import timing")

**Files:** none committed except the results table appended to this plan.

- [x] **Step 1:** On the isolated stack after a reset, run `explain (analyze, buffers) select recount_class_participants(<largest seeded class id>);` and record the execution time.
- [x] **Step 2:** Time linking all 20 seed families' guardians with triggers on, against the same run with the three new triggers disabled. Use the `family_members` inserts copied from `seed.sql` in one transaction, `\timing`, and `rollback`. Record both.
- [x] **Step 3:** Acceptance: the added time is **< 1 s**. If not, **stop and return to `/architect`**. Do not batch around the trigger.
- [x] **Step 4:** Commit the table: `docs(#119): recount timing on seed-sized import`.

**Results (`/build` 2026-11-14, isolated stack `bv-iso-119`, after `db reset` at `118b5c0`):**

| Measurement | Result |
| --- | --- |
| `recount_class_participants` on the largest seeded class (F3 "7, 8, 9", 9 enrolled), `explain (analyze, buffers)` | **5.42 ms** execution, 1,253 shared buffer hits |
| Re-link all seed guardians (27 `family_members` rows, one `insert … select`), `family_members_sync_participants` **off**: 3 runs | 0.42 / 0.55 / 0.37 ms (avg 0.45) |
| The same, trigger **on**: 3 runs | 51.74 / 42.13 / 37.94 ms (avg 43.94) |
| **Added time** | **≈ 44 ms avg, 52 ms worst.** Acceptance (< 1 s) **met**, about 20× under. |

Method: each run is in its own rolled-back subtransaction. The links are deleted with the trigger off, and class conversations are recounted so the parent rows are really gone, then the links are re-inserted under a `clock_timestamp()` stopwatch. Proof the trigger did the work: in every ON run, parent participants went 0 → 45; in every OFF run they stayed 0. The timer covers the insert only, which matches a CSV phase-2 link batch. 27 links rather than 26, because the seed also links `multirole@` as a guardian.

### Task 8: Records

**Files:** Modify `.docs/adr/2026-11-13-class-chat-membership-recount.md`, `.docs/specs/system/chat-participant-sync.md`, `.docs/specs/system/_index.md`.

- [ ] **Step 1:** ADR: add a dated **Addendum 2026-11-13 (`/design` D-1)** recording the three narrowing events (enrollment delete, enrollment class change, student family change), using the precedent wording of the Ratified note. No status change. Run `node scripts/gen-adr-index.mjs` only if the index output changes.
- [ ] **Step 2:** Spec: add a "Plan (2026-11-13)" pointer with P-1 to P-3. In Testing, amend "060 is unchanged" to "060/190/191 change only the student `grade_level` spelling (P-1)", and in Staging repair step 3 name the preview function.
- [ ] **Step 3:** `_index.md` row: record each stage as it completes (`/plan` ✓ was recorded at sign-off).
- [ ] **Step 4:** Commit: `docs(#119): plan — tasks, P-1..P-3, ADR D-1 addendum`.

---

## AC → task

| AC | Task |
| --- | --- |
| 1, 2, 3, 6, 7 | 4 (`200` part 2), 2 (`201`) |
| 4 | 3 (truth table), 4, 6 (seed) |
| 5 | 4 (`060` green, re-enrol, withdrawal via `201`) |
| 8 | 5 |
| 9 | 3 (entitled set, revokes), 2 (DENYs) |
| 10 | 2 → green in 4 |
| 11 | DB-only. Task 6's script change selects demo data only. |

## Handed to `/deploy-staging` (not this plan's to run)

Compare `schema_migrations`, then `psql -f` migration 1, run `supabase/scripts/119_membership_preview.sql` (expect adds for parents and Gr 9 students, removes for Gr 7–8 rows, no teacher removes), then `psql -f` migration 2 and re-run the preview (expect 0 rows). **Never `db push`.** Also for `/deploy-staging`: testers whose staging student persona already claimed a Gr 7–8 child before #119 keep that login, with an empty chat. Deleting those logins is that stage's hygiene call (spec, Out of scope).
