# ADR-0037: Enrollment withdrawal revokes participation and future content, not history — time-bounded read on conversational surfaces

**Status:** Closed · **Date:** 2026-07-29 · **Deciders:** Project owner + architect
**Governs:** System → `core-schema-and-rls` (`.docs/specs/system/core-schema-and-rls.md`, schema addendum: `enrollments.withdrawn_at`) · Teacher → `class-update-and-home-feed` (`.docs/specs/teacher/class-update-and-home-feed.md`, its `class_updates`/`comments` policies and `is_parent_of_class`). Establishes the **org-wide convention** for enrollment-derived access to conversational content. Resolves [issue #58](https://github.com/cmdfw-bv/CMDFW-BalaVihar-App/issues/58), deferred from PR #48 code review (Important #4). Complements ADR-0015 (chat access) and ADR-0032 (comment privacy); **changes no Closed ADR** and leaves the existing `classes_*_select`/`attendance_*_select` convention intact.

### Context

PR #48's code review found that `class_updates_student_select`, `class_updates_parent_select`, `comments_*_select`, `comments_*_insert`, and `is_parent_of_class` all join `enrollments` with **no `status` filter**, while two things inside the same feature — `resolve_parent_family_label` (`20260724120526:23`) and `dispatchClassUpdate` (`netlify/functions/push-send.ts`) — filter `status = 'active'`. Net effect as built: a withdrawn family retains full read **and comment** access indefinitely, but the Teacher's private-thread card can no longer resolve their label and falls back to the generic "Private thread". Nobody designed that combination. The author correctly declined to settle it inside one feature PR.

Three facts establish the shape of the decision:

**1. The "unfiltered convention" is absolute — and narrower than it appears.** `20260709032818_core_operational_rls_policies.sql` contains **zero** occurrences of `status`; every parent/student policy across `centers`, `sessions`, `classes`, `students`, `enrollments`, `attendance` joins `enrollments` unfiltered. But **every one of those policies is `for select`.** There are no parent- or student-facing *write* policies in that file at all, because until `comments` existed no parent or student could write anything. The convention is a **read** convention and has never spoken to writes.

**2. Chat's revocation is a different mechanism, not a different filter.** ADR-0015 does not filter `status` in a policy — a trigger (`20260709043451:76`) deletes rows from the `conversation_participants` membership table on withdrawal. It also carries a **sibling guard**: the family is removed only if no *other* active enrollment for that family remains in that class.

**3. `enrollments` has `enrolled_at` but no `withdrawn_at`.** The moment of withdrawal is not recorded anywhere, and is unrecoverable after the fact.

The two precedents are therefore not in conflict — they cover different kinds of data. The unfiltered convention protects **immutable history about your own child** (attendance records, which class they were in); revoking that would be wrong, and `attendance_parent_select` deliberately embodies that. Chat's revocation governs **live group participation**. `class_updates`/`comments` is the first surface that is **both**: the family's own private correspondence they authored, *and* a live feed that keeps producing new posts and new comments **authored by other people's minors** about a class their child has left. A single blanket answer is wrong in one direction or the other.

### Options Considered

**Write access after withdrawal** — considered but not contested: no option was identified under which a departed family should insert new comments into a live class feed, and revoking it does not diverge from the read-only unfiltered convention. Taken as settled, not put to a vote.

**Read access after withdrawal**

- **Time-bound to the enrollment period** (chosen) — Pros: strictest defensible reading of §12.1 non-negotiable #6 — the family keeps exactly what they were part of, including the private thread they themselves wrote, and receives nothing new; no minor's content authored after their departure is ever exposed to them; the sibling case falls out for free (see Decision). Cons: requires `enrollments.withdrawn_at` plus a trigger, a timestamp predicate on ~6 read policies, and adversarial pgTAP; marginally more complex policies to read.
- **Retain all reads indefinitely** — Pros: zero read-side migration; matches the org-wide `classes_*_select` convention exactly. Cons: a family that left the program keeps reading new posts and new comments written by other people's children, about a class their child no longer attends, forever — a live minimization problem on minors'-adjacent content, not merely a retention one. Rejected.
- **Revoke all reads on withdrawal** — Pros: closest to ADR-0015, tightest minimization, no new column. Cons: the family instantly loses the private Teacher↔Parent thread they authored about their own child, and a mid-year transfer goes dark immediately — cutting directly against the "own record" principle `attendance_parent_select` establishes. Rejected as over-correction.

**Capturing `withdrawn_at`** — required by the chosen option. Independently: because the withdrawal moment is unrecorded and unrecoverable, deferring the column would permanently foreclose the time-bound option for every withdrawal occurring before it was added. Adding it now costs nothing (no withdrawals exist pre-pilot).

### Decision

1. **`enrollments` gains `withdrawn_at timestamptz` (nullable).** A trigger stamps `now()` when `status` transitions `active → withdrawn`, and resets it to `null` on `withdrawn → active` (re-enrolment). Null means currently enrolled.
2. **Write access is revoked on withdrawal.** `comments_parent_insert` and `comments_student_insert` gain `and e.status = 'active'`. `is_parent_of_class` gains the same — it gates *starting* a private thread, a write-side action. This fills a gap in the `select`-only convention rather than diverging from it.
3. **Read access is time-bounded to the enrollment period.** Each enrollment-derived read policy admits a row when the family is still active **or** the row predates their withdrawal:
   ```sql
   and (e.status = 'active' or class_updates.created_at <= e.withdrawn_at)
   ```
   `comments` policies gate on `comments.created_at` (not the parent update's), so a comment posted after withdrawal onto an older update stays hidden.
4. **The sibling case needs no special guard.** Because these are `exists (…)` subqueries over `enrollments`, a family with another active enrollment in the same class matches on that row and retains full access automatically — the same outcome ADR-0015's trigger achieves with an explicit `not exists` clause, obtained here for free.
5. **The within-feature asymmetry is reconciled on a stated principle: new content flows are active-only; historical display follows what the reader may already see.**
   - `dispatchClassUpdate` **keeps** `status = 'active'` — a push notification is new content.
   - `resolve_parent_family_label` **drops** its `status = 'active'` filter — it is a display-label lookup for a thread the Teacher is already permitted to read, and filtering it is what produced the "Private thread" fallback nobody intended.
6. **Scope is conversational content only.** `classes_*_select`, `students_*_select`, `attendance_*_select`, `enrollments_*_select`, `centers`/`sessions` are **unchanged** and remain unfiltered. A parent keeps their child's attendance history and class record after withdrawal; that is correct and this ADR does not touch it.

### Consequences

- **A migration is owed, owned by this ADR:** the `withdrawn_at` column + trigger, the `status`/timestamp predicates on `class_updates`/`comments` policies, `is_parent_of_class`, and `resolve_parent_family_label`'s revoke. It **must land after PR #48 merges**, since it edits policies that PR introduces — it cannot be folded into #48 without re-opening a reviewed, CI-green PR.
- **Adversarial pgTAP is required before promotion** (§11.3, non-negotiable #4): withdrawn-parent read of a pre-withdrawal update (allowed) vs. a post-withdrawal update (denied), withdrawn-parent comment insert (denied), withdrawn-family private-thread read (allowed), sibling-still-enrolled retains full access, re-enrolment restores access, and the Teacher's label resolution for a withdrawn family (resolves, no fallback).
- **`enrollments.withdrawn_at` is an operational column, not PII**, and needs no new RLS surface — `enrollments_*_select` policies already scope the row.
- **The convention is now explicit for future items:** enrollment-derived access to *reference and historical* data stays unfiltered; access to *conversational or participatory* surfaces is active-for-write and time-bounded-for-read. A future item touching either should cite this ADR rather than re-deriving from `classes_*_select`.
- **Residual scope:** this ADR does not address bulk export or the eventual retention-deletion job (§11, still awaiting org + legal sign-off). Time-bounded read narrows exposure but is not a deletion policy; when retention is finalized, `withdrawn_at` is the natural key for it.
