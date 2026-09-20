# ADR-2026-09-19-withdrawal-revokes-conversational-access: Withdrawal revokes conversational access outright; the Teacher's own record is untouched

**Status:** Proposed · **Category:** Auth/Access · **Date:** 2026-09-19 · **Deciders:** Maulik (proposer and decider) · **Consulted:** [@arunasharad-coder](https://github.com/arunasharad-coder) (reviewer — asked to test the RLS shape and the adversarial-test inversion; the call itself sits with the decider). The reversibility clause in Consequences is the part worth a deliberate "yes".

**Governs:** System → `core-schema-and-rls` · Teacher → `class-update-and-home-feed` (its `class_updates`/`comments` policies, `is_parent_of_class`, and `resolve_parent_family_label`). **Supersedes [ADR-0037](0037-enrollment-withdrawal-conversational-access.md)'s Decision 3 (time-bounded read) and re-grounds its Decision 5 (label resolution) on a different justification.** ADR-0037's Decisions 1, 2, 4 and 6 are carried forward — two of them unchanged, two amended as noted below. Re-scopes issue [#96](https://github.com/cmdfw-bv/CMDFW-BalaVihar-App/issues/96) (the unbuilt migration ADR-0037 owed).

> **Nothing has been built yet.** ADR-0037's migration never landed — `withdrawn_at` exists in no migration, and the unfiltered PR #48 behavior is what runs today. This ADR changes a decision, not deployed code. That is why it is cheap now and expensive in three months.

### Context

ADR-0037 (2026-07-29) settled the enrollment-`status` asymmetry that PR #48's review surfaced. It chose **time-bounded read**: a withdrawn family keeps what predates their withdrawal and receives nothing after it, implemented with a new `enrollments.withdrawn_at` column plus a timestamp predicate on roughly six read policies. It explicitly considered and rejected outright revocation as an "over-correction."

Two things have since changed the ground under that choice.

**1. The migration was never built.** Issue #96 is open; `grep -rn 'withdrawn_at' supabase/` returns nothing. ADR-0037's chosen option exists only on paper. Reversing it costs a decision record and an edit to one unbuilt issue — not a schema change, not a data backfill, not a deployed-behavior change. ADR-0037's own Consequences anticipated the opposite situation ("it must land after PR #48 merges, since it edits policies that PR introduces"); that urgency did not materialize, and the window to choose differently is still open.

**2. Withdrawal is per-enrollment, not per-account.** A family withdraws from *a class*, not from the app. There is no "withdrawn user" state to lock out — the same account may hold an active enrollment in another class, another child's enrollment, or a second role entirely. Any revocation must therefore be evaluated per enrollment-derived policy, which is what makes a clean `status = 'active'` predicate both sufficient and simpler than a timestamp comparison.

**3. A structural fact ADR-0037 did not state, which its Decision 5 silently depended on.** Every Teacher read policy on `class_updates`/`comments` is **scope-derived or authorship-derived, and never joins `enrollments`**:

| Policy | Predicate | Enrollment join? |
| --- | --- | --- |
| `class_updates_teacher_select` | `class_id = scope_id` | no |
| `comments_teacher_public_select` | `cu.class_id = scope_id` | no |
| `comments_poster_teacher_private_select` | `cu.posted_by = auth.uid()` | no |

ADR-0037's time-bound only ever touched the **parent and student** policies. It never reached the Teacher's side at all. This matters because Decision 5 justified relaxing `resolve_parent_family_label` on the grounds that the Teacher "is already permitted to read" the thread — a premise that reads as though it were granted by Decision 3, but is in fact granted by the table above, independently of any decision this ADR or ADR-0037 makes.

That distinction is the whole reason this ADR restates Decision 5 rather than copying it.

### Options Considered

**Read access after withdrawal** (the decision ADR-0037 made and this ADR reopens)

- **Revoke outright** (chosen) — Pros: tightest reading of §12.1 non-negotiable #6; no new column, no trigger, no timestamp predicate — the policies gain `and e.status = 'active'` and nothing else, which is materially easier for three non-technical maintainers to read and for adversarial pgTAP to cover exhaustively; matches ADR-0015's posture for chat, so the two conversational surfaces stop diverging; per-enrollment scoping means a mid-year transfer keeps everything in the class they transferred *to*. Cons: the family loses read access to the private Teacher↔Parent thread **they themselves wrote** about their own child — the objection ADR-0037 found decisive. Reversing later is not free (see Consequences).
- **Time-bound to the enrollment period** (ADR-0037's choice) — Pros: the family keeps exactly what they were part of and receives nothing new; the "own correspondence" objection does not arise. Cons: requires `withdrawn_at` + trigger + a timestamp predicate on ~6 policies, each of which is a place to get it subtly wrong; the `comments.created_at`-vs-parent-update distinction in ADR-0037 Decision 3 is exactly the kind of subtlety that survives review and fails in production; still leaves the family reading a feed they have left, merely a frozen slice of it.
- **Retain all reads indefinitely** — unchanged from ADR-0037: a departed family reads content authored by other people's minors, forever. Rejected there, rejected here.

**Does revocation extend to the Teacher's view of the thread?** — considered and rejected. Symmetry suggests a clean break should remove the Teacher's private-thread card too. It should not: the Teacher **authored half of that conversation**, and hiding it would delete a staff member's own record of a discussion they were party to. Revoking the departed family's access and erasing the history are different operations; the second is retention's job (`retention_eligible_at` already exists on both tables, `20260728140000`), governed by §11 and still awaiting org + legal sign-off. Conflating them would let an access decision quietly perform a deletion.

**`resolve_parent_family_label`'s `status = 'active'` filter** — see Decision 4; the conclusion matches ADR-0037 Decision 5, the reasoning does not.

### Decision

1. **Read access on conversational surfaces is revoked on withdrawal.** `class_updates_student_select`, `class_updates_parent_select`, and the `comments_*_select` parent/student branches gain `and e.status = 'active'`. No timestamp predicate. **Supersedes ADR-0037 Decision 3.**

2. **Write access is revoked on withdrawal — unchanged from ADR-0037 Decision 2.** `comments_parent_insert`, `comments_student_insert`, and `is_parent_of_class` gain `and e.status = 'active'`. Under this ADR the read and write predicates become *identical*, which is the simplification the time-bound forfeited.

3. **The sibling case still needs no special guard — unchanged from ADR-0037 Decision 4.** These are `exists (…)` subqueries over `enrollments`; a family with another active enrollment in the same class matches on that row and retains full access automatically.

4. **`resolve_parent_family_label` drops its `status = 'active'` filter — same conclusion as ADR-0037 Decision 5, on a justification that does not depend on the time-bound.**

   The reason is *not* that the withdrawn family retains some residual access — under Decision 1 they retain none. The reason is that **the Teacher's authority to read the thread never derived from the family's enrollment in the first place** (Context fact 3). The Teacher sees that thread because they teach the class and wrote half of it. Withdrawal does not touch either fact, under ADR-0037's rule or this one.

   Given the Teacher may read the thread's full contents, withholding the *label* conceals nothing. It degrades a conversation the Teacher is authorized to read into an unattributed one, which is how the unintended "Private thread" fallback arose. Two checks confirm the relaxation adds no exposure:

   - **Minors' data (§12.1 #6):** the RPC returns `families.label`, never a student-derived value — deliberate in its original design (`20260724120526`). No minor's name is reachable through this path, before or after the change.
   - **Enumeration:** dropping the filter widens the RPC from "currently-enrolled parent of my class" to "ever-enrolled." This reveals nothing new **because Decision 5 below leaves `enrollments_*_select` unfiltered** — the Teacher's roster already shows withdrawn enrollments. *This argument is load-bearing on Decision 5. If `enrollments_*_select` is ever narrowed, this relaxation must be re-examined in the same change.*

5. **Scope is conversational content only — unchanged from ADR-0037 Decision 6.** `classes_*_select`, `students_*_select`, `attendance_*_select`, `enrollments_*_select`, `centers`/`sessions` are untouched and remain unfiltered. A parent keeps their child's attendance history and class record after withdrawal. This ADR narrows conversational access precisely so that this historical access can stay broad without ambiguity.

6. **`enrollments.withdrawn_at` is not added.** ADR-0037 Decision 1 is superseded along with the time-bound that required it. Nothing in this ADR reads a withdrawal timestamp. See Consequences for what this forecloses.

7. **Adversarial test `171_…:310` (ATTACK 4f) is inverted, with its rationale recorded in the file.** It currently asserts that a Teacher resolving a withdrawn family's label gets `null`. Decision 4 makes that an allow. Because inverting an adversarial assertion is exactly the move that erodes a security suite, three conditions bind:

   - **Invert, never delete.** It becomes an explicit ALLOW assertion carrying a comment that names this ADR and states why the resolution is authorized. Coverage is preserved, not dropped.
   - **Relabel and relocate.** A slot named `ATTACK 4f DENY` that asserts an allow is unreadable. It moves beside the existing org-wide `CONTROL` assertion and is renamed accordingly.
   - **Confirm the perimeter is still covered.** It is: ATTACK 4c (Teacher A resolving Parent 2, who has *no* enrollment link to Class A) independently proves the RPC refuses an unrelated family. 4f was the only assertion in Group 4 whose caller was legitimately inside the perimeter — its own comment concedes "the family/class/teacher-scope join otherwise lines up." It was testing an implementation accident that ADR-0037's Context itself describes as undesigned, not an authorization boundary.

### Consequences

- **Issue [#96](https://github.com/cmdfw-bv/CMDFW-BalaVihar-App/issues/96) is re-scoped, not cancelled.** It loses the `withdrawn_at` column, the stamping trigger, and every timestamp predicate; it keeps `and e.status = 'active'` on the parent/student read and write policies plus `is_parent_of_class`, and gains `resolve_parent_family_label`'s revoke and the ATTACK 4f inversion. The migration gets materially smaller.

- **Reversibility is the real cost of this ADR, and it is asymmetric.** The withdrawal moment is recorded nowhere. Choosing not to add `withdrawn_at` means that if the time-bound is ever wanted back, every withdrawal that happened in the interim is unreconstructable — those families could not have their access restored to the correct slice. ADR-0037 flagged exactly this ("deferring the column would permanently foreclose the time-bound option"). It costs nothing today because **no withdrawals exist pre-pilot**; it costs increasingly more each month after go-live. *This is the clause to disagree with if any part of this ADR is wrong.*

- **A withdrawn family loses read access to the private thread they authored.** This is the objection ADR-0037 found decisive, and this ADR accepts it rather than answering it. Two things bound the harm: the correspondence is not deleted (the Teacher and oversight retain it, and retention governs its eventual removal), and a family wanting their own records has the §11 export path — which does not exist yet and is not promised by this ADR.

- **Adversarial pgTAP before promotion (§11.3, non-negotiable #4).** Owed: withdrawn-parent read of any `class_update` in that class (denied, pre- and post-withdrawal alike — the pre-withdrawal case is the assertion that distinguishes this ADR from ADR-0037); withdrawn-parent and withdrawn-student comment insert (denied); withdrawn-family private-thread read (denied — inverted from ADR-0037's expectation); sibling-still-enrolled retains full access; re-enrolment restores access; Teacher's label resolution for a withdrawn family (resolves, per Decision 4 and Decision 7).

- **The convention for future items is simpler than ADR-0037's.** Enrollment-derived access to *reference and historical* data stays unfiltered; access to *conversational and participatory* surfaces is `active`-only for both read and write. There is no longer a third "time-bounded" category. A future item touching either should cite this ADR.

- **Staff-side read paths are explicitly out of scope of the revocation.** Teacher, Coordinator, BV Coordinator and Admin policies on these tables are scope- or authorship-derived (Context fact 3) and are not touched. Any future change that routes a staff read through an `enrollments` join inherits this ADR's question and should cite it.

- **ADR-0015 (chat) is unaffected but now aligned.** Chat revokes via a participants-table trigger; this revokes via a policy predicate. Different mechanisms, same posture — a departed family does not read a live conversation. The two no longer need reconciling in opposite directions.
