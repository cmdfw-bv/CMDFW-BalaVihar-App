# System — chat participant sync

> **owner:** System · **consumers:** Parent, Student (primary — they are the personas currently excluded); Teacher, Coordinator, BV Coordinator, Admin unaffected (their membership derives from `user_roles`, which already works); Student `class-chat-ui` (#24) is the blocked client consumer · **scope:** engine — keep `conversation_participants` in step with *all* the events that change who belongs to a class conversation, not just enrollment; plus a one-time repair of existing rows. No new tables · **governing ADR:** [ADR-2026-11-13-class-chat-membership-recount](../../adr/2026-11-13-class-chat-membership-recount.md). Constrained by ADR-0015 (chat access model), ADR-0022 (CSV import DB-first boundary — see "Why the obvious fix is unavailable"), ADR-2026-09-19 (withdrawal revokes conversational access), ADR-0018 (family/household model) · **covers:** issue [#119](https://github.com/cmdfw-bv/CMDFW-BalaVihar-App/issues/119); 3_ARCHITECTURE §9.1–§9.3, §11.3

**Stage:** `/refine` ✓ (2026-11-13, human sign-off on both open decisions) → `/architect` ✓ (2026-11-13, governing ADR-2026-11-13-class-chat-membership-recount — see "Architect review" below) → **next: `/design`**. The [`_index.md`](_index.md) row is authoritative if these ever disagree (§12.12).

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
