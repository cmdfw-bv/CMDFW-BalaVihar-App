# System — chat participant sync

> **owner:** System · **consumers:** Parent, Student (primary — they are the personas currently excluded); Teacher, Coordinator, BV Coordinator, Admin unaffected (their membership derives from `user_roles`, which already works); Student `class-chat-ui` (#24) is the blocked client consumer · **scope:** engine — keep `conversation_participants` in step with *all* the events that change who belongs to a class conversation, not just enrollment; plus a one-time repair of existing rows. No new tables · **governing ADR:** [ADR-2026-11-13-class-chat-membership-recount](../../adr/2026-11-13-class-chat-membership-recount.md). Constrained by ADR-0015 (chat access model), ADR-0022 (CSV import DB-first boundary — see "Why the obvious fix is unavailable"), ADR-2026-09-19 (withdrawal revokes conversational access), ADR-0018 (family/household model) · **covers:** issue [#119](https://github.com/cmdfw-bv/CMDFW-BalaVihar-App/issues/119); 3_ARCHITECTURE §9.1–§9.3, §11.3

**Stage:** `/refine` ✓ (2026-11-13, human sign-off on both open decisions) → `/architect` ✓ (2026-11-13, governing ADR-2026-11-13-class-chat-membership-recount — see "Architect review" below) → `/design` (2026-11-13, spec written + human sign-off — see "Design" below) → `/plan` ✓ (2026-11-14, [plan](chat-participant-sync.plan.md) signed off by Maulik; native execution) → next: `/migration`. The [`_index.md`](_index.md) row is authoritative if these ever disagree (§12.12).

---

## Requirements (refined)

### User story

As a Parent or Student whose login was created after my child's enrollment was imported, I want to be a member of my class conversation anyway, so that the class chat I am given access to is not empty — and as the System, I want membership to follow the link whichever order the link and the enrollment arrive in.

### The defect, precisely

`conversation_participants` is written by one trigger, `enrollments_sync_participants` (`supabase/migrations/20260709043451_chat_sync_triggers.sql`), which fires `after insert or update on enrollments` and nothing else. Inside `sync_class_participants()` it reads `students.user_id` and `family_members` **at that instant** and writes whoever it finds.

There is no trigger on `family_members` insert, and none on `students.user_id` being set. So a login linked after the enrollment row exists is never added by anything.

Both real data paths link logins after the enrollment:

| Path | Order | Result |
| --- | --- | --- |
| **CSV import** (`netlify/functions/csv-import.ts`) | Phase 2 commits families, students, enrollments (`students.user_id = null`, no `family_members`). Phase 3, post-commit, calls `linkGuardian` and `linkStudentUser`. | Trigger fires in phase 2 and finds nobody. |
| **Seed** | `supabase/seed/domain.sql` enrols; `supabase/seed/seed.sql`, loaded after, inserts `family_members` and sets `students.user_id`. | Same. |

**Re-import does not repair it.** `upsertEnrollment` skips a child who already holds an active enrollment for the session, so the enrollment row is never written again and the trigger never re-fires. ADR-0022 further specifies that re-import treats already-linked `family_members` and `students.user_id` as no-ops, so no insert occurs on the link side either. Nothing in the system self-heals; existing rows need an explicit repair.

**Effect:** after an import, class conversations contain staff only. Parents and students read no messages and are refused the live channel, because both derive from `conversation_participants` (`messages_member_select`, and #6's channel policy via `is_conversation_participant`).

**Why the tests missed it:** `supabase/tests/060_chat_rls.sql:15-24` inserts `family_members` first and `enrollments` second — the one ordering that works. Every new case in this item must be written in the order that fails.

### Why the obvious fix is unavailable

Reordering the import so logins are created first is **ruled out by ADR-0022 (Closed)**, which chose DB-first/auth-after-commit precisely so that a Postgres rollback can never orphan an `auth.users` row and break re-import. The ordering that breaks chat membership is a deliberate, well-reasoned decision, not an oversight. The fix therefore belongs on the **link events**, in the database, and must leave ADR-0022's boundary intact. Any `/architect` proposal that reorders the import phases is superseding a Closed ADR and must say so.

### Decisions captured during refine (human-confirmed 2026-11-13)

**Decision 1 — the ADR-0015 grade band becomes a database rule, and the seed is corrected.** Both halves, not either.

ADR-0015 sets class-chat membership by grade band: PreK–Gr 8 is Teacher ↔ Parents, and Students join from Gr 9. Four parts of the system currently disagree about a 7th grader in the pilot's combined `'7, 8, 9'` class:

| Where | What it says today |
| --- | --- |
| ADR-0015 | No chat. Students join from Gr 9. |
| CSV import | Agrees — `csv-import.ts:230` gates `linkStudentUser` on `HS_GRADE_BANDS` (`Gr9`–`Gr12`), so a 7th grader never receives a login. |
| Pilot seed | Disagrees — `seed.sql:72-84` gives a login to every student in that class, ordered by `grade_level`, 7th and 8th graders included. |
| The trigger | No opinion — adds any enrolled student holding a login, at any grade. |

Decided: **the trigger enforces the grade band itself** (a non-HS student is never added as a participant, on any path), **and** the seed stops issuing logins below Gr 9 in that class. The reasoning is non-negotiable #1: access control is enforced in the database, never in client or script code only. The import's check is TypeScript, which is exactly the shape that rule excludes for minors' data.

> **Correction to the issue.** #119 states that fixing the membership gap "would put Grade 7 and 8 students into their class chat unless a grade rule is added." That holds for the seed but **not** for CSV import, which never creates their login. The live exposure today is demo data only. The decision above is therefore about where enforcement belongs, not about introducing a rule that did not exist.

**Decision 2 — the removal cases are in scope, symmetrically.** A family member unlinked from a family loses their participant row; a student whose `user_id` is cleared loses theirs. Both carry the **sibling guard** the withdrawal path already uses: a family with another child still actively enrolled in that class keeps its membership. This matches ADR-2026-09-19 Decision 9's existing posture, so membership follows the link in both directions and there is one rule to hold in mind.

**Priority: POC-core.** It blocks `class-chat-ui` (#24) from being useful — without it, Parents and Students open a conversation they are not members of. It does **not** block #6, which changes no membership rule and is already merged.

### Acceptance criteria

1. **Order independence.** A parent or student becomes a member of the right class conversation whether their login is linked before or after the enrollment is written. Both orderings are covered by tests; the enrol-first order is the one that fails today.
2. **Guardian linked.** Inserting a `family_members` row adds that user as a `parent` participant of the class conversation of **every** class where that family has a child with an `active` enrollment — not only one class, since a family may have children in several classes and sessions.
3. **Student login set.** Setting `students.user_id` (null → value) adds that user as a `student` participant of every class where that student has an `active` enrollment, **subject to AC#4**.
4. **Grade band enforced in the database.** A student below Gr 9 is never added as a participant, on any path — the new link-side paths, the existing enrollment path, and the one-time repair alike. The rule keys off the **student's own** `grade_level`, not the class's `grade_band`, because the pilot's classes combine grades. It must accept both vocabularies in use today (`'9'` from the seed, `'Gr9'` from import) until #93 reconciles them, and must fail closed on a grade it cannot interpret.
5. **Existing enrollment path keeps working and gains the grade rule.** `enrollments_sync_participants` continues to behave as it does today for the link-first ordering, with AC#4 now applied to its student insert. No regression to the withdrawal behaviour ADR-2026-09-19 Decision 9 relies on.
6. **Guardian unlinked.** Deleting a `family_members` row removes that user's `parent` participant row from the affected class conversations, **unless** the family still has another child with an `active` enrollment in that same class (sibling guard).
7. **Student login cleared or changed.** Clearing `students.user_id` removes that user's `student` participant row. Repointing it from one user to another removes the old and adds the new, subject to AC#4.
8. **One-time repair.** A migration repairs conversations that are already wrong. It adds only families and students with an `active` enrollment — ADR-2026-09-19 revokes conversational access on withdrawal outright, with the sibling guard — and it applies AC#4, so it must also **remove** any existing participant row the grade rule would not have admitted. It is idempotent and safe to run on an environment that is already correct.
9. **Nothing widens.** No participant row is created for anyone who is not a parent of, or an actively enrolled Gr 9+ student in, that class. The change adds no new way to reach a minors' conversation, and grants nothing that ADR-0015's ladder does not already specify.
10. **Adversarial coverage before promotion (§11.3, non-negotiable #4).** Owed, each shown Red before the change and Green after: parent linked after enrollment reaches the chat; student linked after enrollment reaches it only at Gr 9+; a Gr 7 and a Gr 8 student in the combined class are denied; a parent of another class is denied; a withdrawn family is not added by the repair; a family with one child withdrawn and a sibling still enrolled retains membership through both the removal paths and the repair; an unlinked guardian loses access; a cleared student login loses access.
11. **Residency and vendors.** Database-only change. No new vendor, no PII leaves the US perimeter, no new client surface.

### Edge cases

- A family has children in two different classes, or two different sessions. Linking one guardian must add them to each of those class conversations, and to no others.
- A family has two children in the **same** class. One guardian link produces one participant row, not two, and unlinking that guardian while either child remains active keeps the row.
- A guardian is linked to two families (ADR-0018 permits it). They become a participant of both families' class conversations, and unlinking from one leaves the other intact.
- `family_members.relationship` is not `'guardian'`. The current trigger adds every family member as `parent` regardless of relationship; this item preserves that behaviour rather than silently narrowing it. `/architect` to confirm that is still intended.
- A student's login is set while their only enrollment is `withdrawn`. Nothing is added.
- An enrollment is created for a student who already holds a login, in the link-first order. The existing enrollment trigger handles it; the new paths must not double-insert (the `on conflict do nothing` shape is already there).
- A student is re-enrolled after withdrawal, with their login already linked. Membership is restored by the enrollment path.
- A class has no conversation row yet. The existing trigger returns early in that case; the new paths must do the same rather than fail the transaction.
- The repair runs on an environment whose participants are already correct, or runs twice. Both are no-ops.
- A `grade_level` value in neither vocabulary (free text, blank, a label from a future import). AC#4 fails closed: no student participant.

### Consumers

Parent and Student are the personas this unblocks, through `class-chat-ui` (#24). Teacher, Coordinator, BV Coordinator and Admin membership comes from `user_roles` via `sync_staff_participants()` and is unaffected. `realtime-chat-delivery` (#6) consumes the corrected membership with no change of its own — its channel policy already reads `conversation_participants`.

### Access scope (§5.4)

Engine-level, membership-derived. All enforcement is in the database: triggers plus a migration, no client code and no RLS policy changes expected. The set of people who *may* be participants is unchanged from ADR-0015 — this item makes the stored list match the rule that was already decided, and narrows it at the grade band. `conversation_participants` is written by `security definer` trigger functions today and that shape continues; `/architect` to confirm no privilege widening.

### Privacy framing (§11, non-negotiable #6)

- This is minors' conversational data. The change **narrows** access at the grade band and **widens** it only to the parents and HS students ADR-0015 already names, so data minimization is served on both counts.
- Enrollment is the consent signal (ADR-2026-09-15); no consent check is added.
- No new access to a minor's record is created, so no new `audit_log` surface is expected. `/architect` to confirm, as #6 did.
- The repair touches real rows on staging. Its blast radius and who runs it belong to `/design` and `/deploy-staging`, not here — note the standing rule that staging carries untracked drift and must not be `db push`ed blind.

### Flagged gaps (not this item's to fix — for `/architect` to route)

- **#93, grade vocabulary.** AC#4 has to straddle two spellings of the same grade because `students.grade_level` receives `'7'` from the seed and `'Gr7'` from `csv-import.ts:163`. This item works around it; #93 owns reconciling it, and should retire the workaround when it lands.
- **Nothing in the app withdraws an enrollment yet.** ADR-2026-09-19 Decision 6 records that `upsertEnrollment` only ever writes `status: 'active'`, and #82 owns the registration sync that will perform withdrawals. The sibling-guard paths in AC#6 and AC#8 are therefore exercised by tests and the repair, not yet by a live code path.
- **Nothing in the app unlinks a family member or clears a student login either.** Decision 2's removal paths are defensive: they close the gap before a path exists that could open it. Worth stating plainly so `/architect` prices them as prevention rather than a live bug.
- **Annual rollover is undecided** (ADR-2026-09-19 Decision 8, #82). "Active enrollment" in AC#2/#3/#8 means the mid-year sense. Whoever architects rollover must revisit what membership does when a year ends.

---

## Architect review (2026-11-13)

**Sign-off:** brief is sound; not bounced. Owner (System), consumers and scope confirmed. ADR-0022 is untouched — the import's phase order stays as it is; the fix lives on the link events. Governing ADR: [ADR-2026-11-13-class-chat-membership-recount](../../adr/2026-11-13-class-chat-membership-recount.md).

**Three decisions taken (Maulik, 2026-11-13):**

1. **One recount routine** (not a patch per event). A single `security definer` function computes who is entitled to a class conversation now — teacher by class role; parent by a family with an `active` child in the class; student by own `active` enrollment **and** the Gr 9 rule — and reconciles the stored rows: adds the missing, removes those with no remaining ground, leaves still-entitled rows in place so `notify_level` survives. Label precedence teacher > parent > student. Every event and the repair call it. `execute` revoked from `public`/`anon`/`authenticated`.
2. **Stay while any ground remains, on every path, including the existing ones.** Found in review: the merged withdrawal branch and `sync_staff_participants()`'s teacher delete each remove a person who is still entitled on another ground (a teacher whose own child withdraws; a guardian in two households). Both now route through the recount. This is a live defect fixed, slightly beyond the original brief.
3. **A `students.grade_level` change triggers the recount**, so a 9→8 correction removes the student at once and 8→9 adds them.

**Amendments to the brief:**

- **Events** (adds to AC#2/#3/#6/#7): `family_members` insert/delete; `students` update of `user_id` **or `grade_level`**; `enrollments` insert/update; the class-teacher branch of `user_roles` insert/delete.
- **AC#4** is a single immutable function accepting exactly `'9'`–`'12'` and `'Gr9'`–`'Gr12'`; anything else is false.
- **AC#8** (repair) is the recount run once per class conversation — not separate code.
- **AC#10** gains: teacher-parent survives their child's withdrawal; teacher-parent losing the teacher role while their child is active stays, relabelled `parent`; two-household guardian survives unlinking from one; grade 9→8 removes, 8→9 adds; `notify_level` survives a recount. All fixtures in the enrol-first order.
- **Edge case resolved:** `relationship` ≠ `'guardian'` keeps today's behaviour — every family member counts as a parent.
- **Confirmed:** no RLS policy changes; no new `audit_log` surface; no new vendor; no privilege widening.

**Ratified (Maulik, 2026-11-13):** the ADR's remaining commitments were put to the project owner and confirmed — label precedence teacher > parent > student (which also decides the ADR-0016 default a multi-ground person gets, and means an `@Parents` mention does not reach a teacher-parent as a parent), in-place relabelling to preserve `notify_level`, the relationship-agnostic parent rule, the grade function's exact accepted set, and the any-status recount breadth on `family_members`. Decision 2's reach into merged code (the withdrawal branch and `sync_staff_participants()`) was chosen in the review and re-confirmed here, since it means #119 touches code #6 depends on. See the ADR's `Ratified` note for the reasoning. `/design` may rely on all five; none is open.

**For `/design`:** confirm the CSV import's phase 3 (one recount per linked family × class) stays within the function timeout; specify the repair's run on staging given the untracked drift (never a blind `db push`).

---

## Design (2026-11-13)

**Sign-off:** ✓ Maulik, 2026-11-13 — the design and all five "please confirm" items on the sign-off page (seed logins 9 → 3 with the UAT re-pin; one entitlement rule; repair as its own migration; Gr 7–8 staging logins left to `/deploy-staging`; Decision 6 as an ADR addendum). Plain-language sign-off page: the #119 Artifact ("The empty class chat"), Version 5 — https://claude.ai/artifact/FVBEZr83s6oYCFscJytAEM (private; share from its Share menu).

**Design-system mirror:** not applicable. This item has no client surface (AC#11), so no `design/sankalp/bv-connect` reference is used. What users see is designed in `class-chat-ui` (#24).

### Design decisions

| # | Decision | Who |
| --- | --- | --- |
| D-1 | **Three more events trigger the recount** on top of the ADR's list: an enrollment **deleted** outright, an enrollment's `class_id` **changed** (recount old and new class), and a student's `family_id` **changed**. Each can only remove access or move it to the correct chat; none can widen it. Nothing in the app does any of these today, so they are defensive, like Decision 2. This extends ADR Decision 2's event list in the narrowing direction only; it does not reverse any ADR decision, so `/plan` records it as a dated addendum on the ADR (same precedent as the Ratified note), not a supersede. | Maulik, 2026-11-13 |
| D-2 | **The entitlement rule is one function, `class_chat_entitled(class_id)`**, which returns the entitled set without writing. Both the recount and the staging preview read it, so the rule is written exactly once. | design call |
| D-3 | **The repair is its own migration, separate from the function/trigger migration**, so staging can install the new rule, preview the diff, and then repair. | design call |
| D-4 | **The seed reuses the database grade function** (`is_hs_grade`) to decide who gets a login, rather than a second copy of the rule in seed SQL. | design call |

### Behavior

**The rule** (ADR Decision 1, unchanged). For one class conversation, a user is entitled when any of these holds, with label precedence teacher > parent > student:

1. **teacher**: `user_roles` row with `role = 'teacher'`, `scope_type = 'class'`, `scope_id = class`. `is_active` is ignored: it marks the *currently selected* role, not whether the grant exists (`20260711035943`), and today's staff sync ignores it too.
2. **parent**: any `family_members` row (any `relationship`) for a family with at least one student holding an `active` enrollment in the class.
3. **student**: `students.user_id` of a student with an `active` enrollment in the class **and** `is_hs_grade(students.grade_level)`.

**The recount, `recount_class_participants(class_id)`.** It finds the `kind = 'class'` conversation for the class and returns quietly if there is none. Otherwise it reconciles `conversation_participants` against `class_chat_entitled`:
- **delete** rows whose user is not in the entitled set;
- **update `participant_role` in place** where the stored label differs from the entitled label (`notify_level` and `notification_default` untouched);
- **insert** missing entitled users, `on conflict (conversation_id, user_id) do nothing`.

It is idempotent: running it twice, or on a correct conversation, changes nothing.

**Events → which classes are recounted** (all row-level `after` triggers, all in the writing transaction):

| Table · event | Classes recounted |
| --- | --- |
| `enrollments` insert | `new.class_id` |
| `enrollments` update | `new.class_id`, and `old.class_id` if different (D-1) |
| `enrollments` delete *(new, D-1)* | `old.class_id` |
| `family_members` insert / delete / update | every class where a student of `new.family_id` / `old.family_id` has an enrollment of **any** status (ratified item 5) |
| `students` update of `user_id`, `grade_level`, or `family_id` *(family_id new, D-1)* | every class where that student has an enrollment of any status |
| `user_roles` insert / delete, class-teacher branch | `scope_id` |
| `user_roles` update of `user_id`/`role`/`scope_type`/`scope_id` *(new, #135)* | old row as a delete, then new row as an insert (`is_active`-only updates fire nothing) |

- `sync_class_participants()` keeps its trigger name (`enrollments_sync_participants`), but its body is replaced by the recount call and the trigger gains `delete`. The withdrawal branch's hand-written delete is gone, because the recount covers it (ADR Decision B1).
- In `sync_staff_participants()`, the class-teacher insert and delete branches call the recount. The `session_staff` and `leadership` branches are **unchanged**.
- `students` delete needs no trigger: `enrollments.student_id` is `on delete restrict`, so a student with enrollments cannot be deleted. Deleting a family cascades `family_members` deletes, which fire their own trigger.
- An `auth.users` delete cascades to `family_members` (delete trigger fires) and sets `students.user_id` to null (the `update of user_id` trigger fires on the referential action). `conversation_participants.user_id` also cascades directly. Either way the row goes; the tests pin both.
- No trigger exists on `conversation_participants` (checked), so the recount's writes cannot loop.

**`is_hs_grade(text) returns boolean`.** It is `immutable` and returns true for exactly `'9'`, `'10'`, `'11'`, `'12'`, `'Gr9'`, `'Gr10'`, `'Gr11'`, `'Gr12'`, and false for everything else, including null, blank, and different case or spacing such as `'gr9'` or `' 9'`. That is fail-closed (ratified item 4). #93 narrows it to one spelling.

### Data & RLS impact

**Migrations** (timestamped, `supabase/migrations/`):

1. `<ts>_class_chat_membership_recount.sql` creates `is_hs_grade`, `class_chat_entitled`, and `recount_class_participants`. It replaces the `sync_class_participants()` and `sync_staff_participants()` bodies, recreates `enrollments_sync_participants` as `after insert or update or delete`, and adds `family_members_sync_participants` and `students_sync_participants` (`after update of user_id, grade_level, family_id`). It changes **no existing rows**; it only changes what future writes do.
2. `<ts+1>_class_chat_membership_repair.sql` runs `select recount_class_participants(scope_id) from conversations where kind = 'class'`. It is idempotent (AC#8).

**Privileges** (ADR Decision 4). All three functions are `security definer` with `set search_path = public`. `execute` is revoked from `public`, `anon`, and `authenticated` on `recount_class_participants` and `class_chat_entitled`. `is_hs_grade` follows the same revoke: nothing outside the database needs it, and the seed runs as a superuser. pgTAP asserts each revoke.

**RLS:** no policy changes. `messages_member_select` and #6's channel policy already read `conversation_participants`. **`audit_log`:** no new surface (ADR Decision 5). **Tables:** none added, no columns changed.

**CSV import timing (ADR Consequences, "for /design").** Phase 3 makes one Auth Admin HTTP call per new login (hundreds of ms each). Each `linkGuardian`/`linkStudentUser` insert now adds one recount per class of that family, typically one to three classes of a few dozen rows each, so roughly milliseconds. The HTTP calls dominate by about two orders of magnitude. `/plan` must still **measure, not assume**:
- `explain analyze` of `recount_class_participants` on the largest seeded class;
- the wall-clock time of linking all 20 seed families with the recount triggers in place, against the same run without them on a clean local stack.

Acceptance: the added time is under 1 s for the seed-sized import, which stays well inside Netlify's synchronous function limit. If it is not, stop and return to `/architect`; do not batch around the trigger.

**Staging repair: preview, then apply.** `/deploy-staging` owns the run; this is what it must do.
1. **Do not `supabase db push`** (staging carries untracked drift, see the #105 history). Compare staging's `supabase_migrations.schema_migrations` with the repo first.
2. Apply migration 1 **on its own**, via `psql -f`, and record it in `schema_migrations`. This changes no rows.
3. Run the **read-only preview** `supabase/scripts/119_membership_preview.sql`, a one-line wrapper over the `stable` function `class_chat_membership_preview()` (plan P-3; Postgres refuses writes inside it). It compares `class_chat_entitled` with the stored rows for every class conversation and prints, per class, **counts only**: rows to add, remove, or relabel, broken down by label. It prints no names or emails (minors' data minimization). A human reads it. The expected staging result is: adds for parents and Gr 9 students, removes for any Gr 7–8 student rows, and no teacher removals.
4. Apply migration 2 the same way. Re-run the preview; it must show zero changes.

**Seed correction (`/refine` Decision 1).** `seed.sql`'s student-login loop adds `and is_hs_grade(st.grade_level)`, which drops logins from 9 to **3** (`student1@`–`student3@`, the Gr 9 students). Knock-on changes the plan must carry:
- `108_seed_pilot_logins.sql`: count 9 → 3, and re-pin the `student1@` ↔ parent pairing test. `student1@` becomes `Student 9-1`, so its guardian is no longer `parent17a@`.
- `106_seed_student_roles.sql`: re-check any count.
- `UAT.md`, line 35 (account table) and UAT-11/12/13 (`student1@` + `parent17a@` pairing): update to the new pairing, derived from the seed, not guessed.
- The comment at `seed.sql:66` ("PILOT EXCEPTION (#19)") is rewritten: the exception is withdrawn.

### UI

None. No screen, component, or copy changes. Effect visible to users, through #24 once it lands: a parent or Gr 9+ student opening their class chat sees the conversation's messages instead of an empty or refused view.

### Testing (TDD, Red first; all fixtures in the enrol-first order)

- `200_chat_participant_sync.sql`, behaviour: every AC#1–#9 case plus D-1's three events, `is_hs_grade` truth table (both vocabularies, the PreK/KG/Shishu Vihaar/blank/null/case variants), idempotence (recount twice = no change), no-conversation class returns without error, `notify_level` survives a relabel, and execute-revoke assertions.
- `201_chat_participant_sync_adversarial.sql`, the §11.3 role × scope × grade × ground-count matrix from AC#10 and the ADR's additions. Each case is shown **Red** against current `main` before the migration. Access is checked as the user (`set role authenticated` + claims) reading `messages`, not just by counting rows. Per the standing rule, "no access" is asserted with `set role anon`/`authenticated`, never `clear_authentication()` (superuser).
- `060_chat_rls.sql`, `190` and `191` change only the student `grade_level` spelling (`'HS9'`→`'Gr9'`, `'HS10'`→`'Gr10'`; plan P-1), and must stay green. `060` remains the link-first order regression.
- `190`/`191` (#6 realtime) must stay green, because #119 now replaces code #6 depends on (ratified item 1).
- The preview gets a pgTAP check that it writes nothing: the function is `stable` (`provolatile = 's'`), and row counts before and after the call are equal (plan P-3).

### Edge cases (beyond the refined list, which all still hold)

- An enrollment moves class while active: the old class drops the student and family (unless a sibling remains) and the new class gains them, in one transaction.
- A student moves family: the old family's guardians leave the student's classes unless another child grounds them; the new family's guardians join.
- A guardian is deleted from Auth: the cascade removes them everywhere; no orphan participant remains.
- A teacher's class role is deleted while they are also an active parent there: they stay, relabelled `parent`, with `notify_level` kept.
- The repair runs on local, staging, or a future prod that is already correct: the preview shows zero changes and the repair is a no-op.

### Out of scope

- Reconciling grade vocabulary (#93), and retiring `is_hs_grade`'s dual spelling once that lands.
- Annual rollover and grade promotion (#82, ADR-2026-09-19 Decision 8). Promotions will flow through the `grade_level` trigger automatically.
- Revoking existing **Auth logins** of Gr 7–8 students on staging. This item removes their chat membership; whether their logins are deleted is a staging-hygiene call for `/deploy-staging`.
- Any UI (#24), notification defaults per label (ADR-0016), and `session_staff`/`leadership` membership.
- Batching or deferring recounts (statement-level triggers). Only revisit if the timing check fails.

### Acceptance criteria → design

| AC | Where |
| --- | --- |
| 1, 2, 3, 6, 7 | event table + recount; `200` |
| 4 | `is_hs_grade`, used by `class_chat_entitled` and the seed |
| 5 | `enrollments_sync_participants` → recount; `060` stays green |
| 8 | migration 2 + staging preview/apply procedure |
| 9 | `class_chat_entitled` is exactly ADR-0015's ladder; revokes |
| 10 | `201` |
| 11 | DB-only; no vendor, no client |

## Plan (2026-11-13)

**[chat-participant-sync.plan.md](chat-participant-sync.plan.md)**: 8 test-first tasks, signed off by Maulik 2026-11-14. Three decisions came out of checking this design against the code. None reverses an ADR decision:

- **P-1.** `060`/`190`/`191` fixtures used the grade spelling `'HS9'`/`'HS10'`, which no real path produces. They are respelled `'Gr9'`/`'Gr10'`, and the rule stays as ratified.
- **P-2.** The staging seed's student persona now claims only a Gr 9+ student (`HS_GRADE_LEVELS`, which mirrors `is_hs_grade` for demo-data selection only). The claimable pool drops 9 → 3, so a 4th tester needs `--reset`.
- **P-3.** The preview is a `stable` function, `class_chat_membership_preview()`, so it cannot write. The script is a wrapper over it.

Measured at `/build`: linking all 27 seed guardians costs about 44 ms more with the recount on (52 ms worst), against a < 1 s bar. A single-class recount takes 5.4 ms (plan, Task 7 results).

## Test (2026-11-14)

The `/test` adversarial RLS audit found two gaps, and both are fixed in the same migration before merge (ADR addendum 2026-11-14):

- **[#134](https://github.com/cmdfw-bv/CMDFW-BalaVihar-App/issues/134):** a concurrent withdrawal and guardian link left a withdrawn-only family in the chat. `recount_class_participants` now takes a per-class `pg_advisory_xact_lock` before it reads, and the multi-class triggers recount in `class_id` order. Both orderings were reproduced live with two sessions: Red before, chat empty after. The re-audit then found a class-move race: an enrollment A→B committing during a guardian link left the guardian out of B. The `family_members`/`students` triggers now repeat until a fresh read of their class list finds nothing new. Reproduced Red (B entitled 2, stored 1), then Green (both stored).
- **[#135](https://github.com/cmdfw-bv/CMDFW-BalaVihar-App/issues/135):** moving a teacher or coordinator by `UPDATE` left the old membership in place. The new `user_roles_sync_participants_on_move` trigger fixes it.

Tests: `supabase/tests/202_chat_participant_sync_serialization.sql` (10 assertions). It checks that the per-class lock is held on the direct and trigger paths, with an untouched-class control, and covers the teacher, teacher-parent and coordinator moves.
