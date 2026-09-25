# ADR-2026-09-19-withdrawal-revokes-conversational-access: Withdrawal revokes conversational access outright; the Teacher's own record is untouched

**Status:** Closed · **Category:** Auth/Access · **Date:** 2026-09-19 · **Deciders:** Maulik (decision taken 2026-09-22; the id keeps its 2026-09-19 authoring stamp per ADR-2026-08-21) · **Consulted:** [@arunasharad-coder](https://github.com/arunasharad-coder) (reviewer, PR [#103](https://github.com/cmdfw-bv/CMDFW-BalaVihar-App/pull/103))

**Governs:** System → `core-schema-and-rls` · Teacher → `class-update-and-home-feed` (its `class_updates`/`comments` policies, `is_parent_of_class`, and `resolve_parent_family_label`). **Supersedes [ADR-0037](0037-enrollment-withdrawal-conversational-access.md)'s Decision 3 (time-bounded read), re-grounds its Decision 5 (label resolution), and corrects a factual claim in its Context (see Context fact 4).** ADR-0037's Decisions 2, 4 and 6 carry forward. Re-scopes issue [#96](https://github.com/cmdfw-bv/CMDFW-BalaVihar-App/issues/96).

> **Nothing is built yet.** ADR-0037's migration never landed — `withdrawn_at` exists in no migration, and PR #48's unfiltered behavior is what runs today. This ADR changes a decision, not deployed code.

### Context

ADR-0037 (2026-07-29) settled the enrollment-`status` asymmetry PR #48's review surfaced, choosing **time-bounded read**: a withdrawn family keeps what predates their withdrawal and receives nothing after, via a new `enrollments.withdrawn_at` column and a timestamp predicate on roughly six read policies. It explicitly considered and rejected outright revocation as an "over-correction."

Four facts changed the ground under that choice. The first two reopened it; the last two were found during a pre-draft recheck and materially changed what the decision costs to implement.

**1. The migration was never built.** Issue #96 is open; `grep -rn 'withdrawn_at' supabase/` returns nothing. Reversing ADR-0037 costs a decision record — not a schema change, backfill, or behavior change. That window closes at go-live.

**2. Withdrawal is per-enrollment, not per-account.** A family withdraws from *a class*, not from the app. The same account may hold an active enrollment in another class, another child's enrollment, or a second role. Any revocation is therefore evaluated per policy, which makes a `status = 'active'` predicate both sufficient and simpler than a timestamp comparison. (The wider "who may log in" question is #82's, not this ADR's.)

**3. The Teacher's read path never derived from enrollment.** Every Teacher read policy on `class_updates`/`comments` is scope- or authorship-derived:

| Policy | Predicate | Enrollment join? |
| --- | --- | --- |
| `class_updates_teacher_select` | `class_id = scope_id` | no |
| `comments_teacher_public_select` | `cu.class_id = scope_id` | no |
| `comments_poster_teacher_private_select` | `cu.posted_by = auth.uid()` | no |

ADR-0037's time-bound only ever touched the **parent and student** policies. Its Decision 5 justified relaxing `resolve_parent_family_label` on the grounds that the Teacher "is already permitted to read" the thread — true, but granted by this table, not by Decision 3. Right conclusion, borrowed reasoning; Decision 4 below restates it on the ground it actually stands on.

**4. There are three ways access is derived here, not one — and ADR-0037's Context misstates this.** ADR-0037 asserts that "every parent/student policy across `centers`, `sessions`, `classes`, `students`, `enrollments`, `attendance` joins `enrollments` unfiltered," and builds its "the unfiltered convention is absolute" argument on it. **`students_parent_select` does not join `enrollments`:**

```sql
create policy students_parent_select on students for select
using (
  auth.jwt()->>'active_role' = 'parent'
  and exists (select 1 from family_members fm
              where fm.family_id = students.family_id and fm.user_id = auth.uid())
);
```

A parent sees their child because they share a family, not because the child is enrolled. Auditing all ~65 policies gives three derivation families:

| Derivation | Question it asks | Surfaces |
| --- | --- | --- |
| **Enrollment** | is your child in this class? | `class_updates`, public `comments`, `attendance`, `classes`, `sessions`, `centers`, `enrollments` |
| **Relationship / identity** | is this yours? | `students`, `families`, `consents`, **private `comments`**, `push_subscriptions` |
| **Membership** | are you on this conversation's list? | chat `messages`, `conversations` |

**The structural consequence — the reason this ADR is longer than a filter change: relationship- and membership-derived access cannot be revoked with a predicate.** There is no enrollment join to filter. The only options are to change the policy's shape or to mutate the data it keys off.

This explains something ADR-0037 observed and misread. It noted that ADR-0015 revokes chat access via a trigger that *deletes* `conversation_participants` rows rather than by filtering, and called that "a different mechanism, not a different filter" — treating it as a stylistic difference. It is not. Chat's read policy is membership-derived, so a filter was never available; the trigger was the only option. ADR-0015 hit this constraint first and solved it correctly, and it was recorded as an aside rather than as a rule.

**Consequence for this ADR:** `comments_target_parent_select` — the policy granting a Parent read of their private thread — is **identity-derived** (`target_parent_id = auth.uid()`, no enrollment join). A predicate-only reading of Decision 1 would leave it untouched, so a withdrawn family would keep their private thread while losing the update it hangs from: orphaned comments with no visible parent row, a state nobody designed. Decision 1 therefore has two distinct parts.

### Options Considered

**Read access after withdrawal** (the decision ADR-0037 made and this ADR reopens)

- **Revoke outright** (chosen) — Pros: tightest reading of §12.1 non-negotiable #6; no new column, no trigger, no timestamp predicate; matches ADR-0015's posture for chat, so the two conversational surfaces stop diverging; per-enrollment scoping means a transfer keeps everything in the class transferred *to*. Cons: the family loses read access to the private thread they authored — the objection ADR-0037 found decisive; requires one policy to be rewritten rather than filtered (Decision 1b).
- **Time-bound to the enrollment period** (ADR-0037's choice) — Pros: the family keeps what they were part of and receives nothing new. Cons: requires `withdrawn_at` + trigger + a timestamp predicate on ~6 policies, each a place to get it subtly wrong; the `comments.created_at`-vs-parent-update distinction in ADR-0037 Decision 3 is the kind of subtlety that survives review and fails in production; **and it does not actually reach the private thread either** — ADR-0037 shares the Context fact 4 blind spot exactly, and is saved only by the accident that its intent was to keep that thread. Still leaves the family reading a feed they have left, merely a frozen slice of it.
- **Retain all reads indefinitely** — unchanged from ADR-0037: a departed family reads content authored by other people's minors, forever. Rejected there, rejected here.

**The private thread specifically** — the decision Context fact 4 forced into the open, which neither ADR had previously made explicitly.

- **Revoke it with the rest** (chosen) — Pros: coherent; the orphaned-comment state does not arise; the family's departure is a clean break on conversational surfaces. Cons: the family loses correspondence they authored about their own child; costs a policy rewrite (~6 lines) rather than a filter.
- **Keep it, revoke the feed** — Pros: arguably the most principled split, matching the repo's own "own record" line (`attendance_parent_select` deliberately keeps a parent's child's history). Cons: requires solving the orphan — either an exception in `class_updates_parent_select` so an update carrying the family's own thread stays visible, or standalone rendering of private threads — which is a UI decision, not an RLS one. Rejected as more machinery than the case warrants at pilot scale.
- **Delete the rows** (chat's mechanism) — Cons: destroys the Teacher's half of a conversation they authored, and conflates revoking access with erasing history. Rejected.

**Does revocation extend to the Teacher's view?** — considered and rejected. The Teacher authored half of that conversation; hiding it would delete a staff member's own record. Revoking a departed family's access and erasing history are different operations, and the second is retention's job (`retention_eligible_at` exists on both tables per `20260728140000`), governed by §11 and awaiting org + legal sign-off.

### Decision

1. **Read access on conversational surfaces is revoked on withdrawal.** This has two parts, because the policies are not all shaped alike (Context fact 4). **Supersedes ADR-0037 Decision 3.**

   **1a — enrollment-derived policies gain a filter.** `class_updates_student_select`, `class_updates_parent_select`, `comments_student_public_select` and `comments_parent_public_select` each gain `and e.status = 'active'` on their existing `enrollments` join. No timestamp predicate.

   **1b — the identity-derived private-thread policy is rewritten, not filtered.** `comments_target_parent_select` has no `enrollments` join to filter, so it gains one while keeping its identity check:

   ```sql
   create policy comments_target_parent_select on comments for select
   using (
     auth.jwt()->>'active_role' = 'parent'
     and comments.is_private = true
     and comments.target_parent_id = auth.uid()
     and exists (
       select 1 from class_updates cu
       join enrollments e on e.class_id = cu.class_id
       join students s on s.id = e.student_id
       join family_members fm on fm.family_id = s.family_id
       where cu.id = comments.class_update_id
         and fm.user_id = auth.uid()
         and e.status = 'active'
     )
   );
   ```

   Without 1b, 1a alone produces orphaned comments the family can still read under an update they cannot. **A migration implementing only 1a does not implement this decision.**

2. **Write access is revoked on withdrawal — unchanged from ADR-0037 Decision 2.** `comments_parent_insert`, `comments_student_insert`, and `is_parent_of_class` gain `and e.status = 'active'`. `is_parent_of_class` has exactly one call site (`comments_teacher_insert`'s `with check`), so the effect is precisely that a Teacher cannot open a *new* private thread with a withdrawn Parent.

3. **The sibling case needs no special guard — unchanged from ADR-0037 Decision 4.** These are `exists (…)` subqueries over `enrollments`; a family with another active enrollment in the same class matches on that row and retains full access.

4. **`resolve_parent_family_label` drops its `status = 'active'` filter — same conclusion as ADR-0037 Decision 5, on a justification that does not depend on the time-bound.**

   The reason is not that the withdrawn family retains residual access — under Decision 1 they retain none. It is that **the Teacher's authority to read the thread never derived from the family's enrollment** (Context fact 3). The Teacher sees it because they teach the class and wrote half of it; withdrawal touches neither fact.

   Since the Teacher may read the thread's contents, withholding the *label* conceals nothing — it renders an authorized conversation unattributed, which is what produced the unintended "Private thread" fallback. Two checks confirm no added exposure:

   - **Minors' data (§12.1 #6):** the RPC returns `families.label`, never a student-derived value — deliberate in its original design (`20260724120526`).
   - **Enumeration:** dropping the filter widens it from "currently-enrolled parent of my class" to "ever-enrolled," which reveals nothing new **because Decision 5 leaves `enrollments_*_select` unfiltered** — the Teacher's roster already shows withdrawn enrollments. *This dependency is load-bearing: if `enrollments_*_select` is ever narrowed, this relaxation must be re-examined in the same change.*

5. **Scope is conversational content only — unchanged from ADR-0037 Decision 6.** `classes_*_select`, `students_*_select`, `attendance_*_select`, `enrollments_*_select`, `centers`/`sessions` are untouched and remain unfiltered. A parent keeps their child's attendance history and class record. This ADR narrows conversational access precisely so historical access can stay broad without ambiguity.

6. **`enrollments.withdrawn_at` is not added here; it is deferred to #82 together with the withdrawal path itself.** ADR-0037 Decision 1 is superseded along with the time-bound that required it. Nothing in this ADR reads a withdrawal timestamp.

   The column's remaining value is **retention, not access**: `students.retention_eligible_at`'s own comment defines the provisional policy as "withdrawn/inactive students = last enrollment end date + 90 days," and no such date is recorded anywhere (`enrollments` has `enrolled_at` and no `updated_at`; `audit_log` is constrained `check (action in ('read','denied'))` and never captures writes). That gap is real but not yet live: **nothing in the app can withdraw an enrollment today** — `upsertEnrollment` only ever inserts `status: 'active'`, and no other code path writes `'withdrawn'`. #82 owns the weekly registration sync that will perform withdrawals, so it can add the column in the same change that first makes it meaningful, with no orphan window. **Whoever builds that path must add `withdrawn_at` with it**; deferring past that point makes every withdrawal before it unreconstructable.

7. **Adversarial test `171_…:310` (ATTACK 4f) is inverted, with its rationale recorded in the file.** It asserts a Teacher resolving a withdrawn family's label gets `null`; Decision 4 makes that an allow. Because inverting an adversarial assertion is how a security suite erodes, three conditions bind:

   - **Invert, never delete.** It becomes an explicit ALLOW carrying a comment naming this ADR and stating why the resolution is authorized.
   - **Relabel and relocate.** A slot named `ATTACK 4f DENY` asserting an allow is unreadable; it moves beside the org-wide `CONTROL` assertion and is renamed.
   - **Confirm the perimeter holds.** ATTACK 4c (Teacher A resolving Parent 2, whose child is enrolled in Class B, not A) independently proves the RPC refuses an unrelated family. 4f was the only Group 4 assertion whose caller was legitimately inside the perimeter — its own comment concedes "the family/class/teacher-scope join otherwise lines up." It tested an implementation accident ADR-0037's Context calls undesigned, not an authorization boundary.

8. **This ADR governs mid-year withdrawal only. Annual rollover is deferred to [#82](https://github.com/cmdfw-bv/CMDFW-BalaVihar-App/issues/82), which has not yet been architected.**

   Withdrawal is not the only transition that moves an enrollment off `active`; a year-end rollover does too. Decision 1 read literally would mean **every family loses every prior-year private thread at rollover** — a program-wide change, not the rare withdrawal this ADR reasons about. Neither ADR-0037 nor this ADR's first draft noticed the difference; both said "withdrawal" and silently generalized to "not active."

   Nothing here decides that behavior. Until #82 settles it, Decision 1 covers the mid-year `active → withdrawn` transition, and whoever architects #82 should treat rollover as an open question rather than infer an answer from this predicate. Raised by @arunasharad-coder in review of PR #103.

9. **Chat is already compliant and is not touched.** `enrollments_sync_participants` (ADR-0015, `20260709043451`) fires on `active → withdrawn` and deletes the student's and the family's `conversation_participants` rows, with a sibling guard for a family holding another active enrollment in that class. Messages they authored remain; only participation ends. That is the same posture Decision 1 adopts, reached by the only mechanism membership-derived access allows.

   **The general rule, stated so a fourth ADR does not re-derive it:** enrollment-derived access is revoked with a predicate; relationship- and membership-derived access is revoked by changing the policy's shape (Decision 1b) or by mutating the data it keys off (ADR-0015's trigger). A future item revoking access on any surface must first establish which of the three its policies use.

### Consequences

- **Issue [#96](https://github.com/cmdfw-bv/CMDFW-BalaVihar-App/issues/96) is re-scoped.** It loses `withdrawn_at`, the stamping trigger, and every timestamp predicate; it keeps `and e.status = 'active'` on four read policies, two insert policies and `is_parent_of_class`; and it gains the `comments_target_parent_select` rewrite (Decision 1b) and the ATTACK 4f inversion. Net: smaller than ADR-0037's version, but with one policy rewritten rather than filtered.

- **A withdrawn family loses read access to the private thread they authored.** This is the objection ADR-0037 found decisive, and this ADR accepts it — on an operational fact ADR-0037 did not have. **Registration settles by roughly week 5–6 of the session and transfers are not entertained mid-year** (issue #82's domain notes; confirmed by @arunasharad-coder in review). The window in which a family accumulates correspondence and then loses it is therefore short and early, when little has been written — not the "mid-year transfer goes dark" scenario ADR-0037 pictured. Two further bounds: the correspondence is not deleted (Teacher and oversight retain it; retention governs removal), and a family wanting their own records has the §11 export path — which does not exist yet and is not promised here.

- **Adversarial pgTAP before promotion (§11.3, non-negotiable #4).** Owed: withdrawn-parent read of any `class_update` in that class (denied, pre- and post-withdrawal alike — the pre-withdrawal case is what distinguishes this ADR from ADR-0037); withdrawn-parent and withdrawn-student public-comment read (denied); **withdrawn-parent private-thread read (denied — this is Decision 1b's assertion and the one most likely to pass vacuously if 1b is skipped)**; withdrawn-parent and withdrawn-student comment insert (denied); Teacher cannot open a new private thread with a withdrawn Parent (denied, via `is_parent_of_class`); sibling still enrolled retains full access; re-enrolment restores access; Teacher's label resolution for a withdrawn family resolves. Each shown Red before the migration and Green after.

- **Fixture warning for whoever builds #96.** `171_…:55` creates its withdrawn enrollment by direct `insert` with `status = 'withdrawn'`, not by updating an active row. Any assertion that depends on a withdrawal *transition* having occurred will pass vacuously against that fixture. Build the withdrawn state by `update` where the transition matters.

- **The convention is simpler than ADR-0037's.** Enrollment-derived access to *reference and historical* data stays unfiltered; access to *conversational and participatory* surfaces is `active`-only for both read and write. There is no third "time-bounded" category. Future items should cite this ADR rather than re-deriving from `classes_*_select`.

- **Staff-side read paths are out of scope of the revocation.** Teacher, Coordinator, BV Coordinator and Admin policies on these tables are scope- or authorship-derived and are not touched. A future change routing a staff read through an `enrollments` join inherits this ADR's question.

- **ADR-0037's Context carries a factual error that this ADR corrects but does not edit.** Per the never-edit-a-Closed-ADR rule, ADR-0037's body is unchanged apart from its status line; a pointer banner directs readers here, following the annotation precedent ADR-0034 set for ADR-0036.
