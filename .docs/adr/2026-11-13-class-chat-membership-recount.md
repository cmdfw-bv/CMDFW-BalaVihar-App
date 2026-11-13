# ADR-2026-11-13-class-chat-membership-recount: Class-chat membership is recomputed by one database routine on every event that changes it; the Gr 9 band is a database rule

**Status:** Closed · **Category:** Auth/Access · **Date:** 2026-11-13 · **Deciders:** Maulik (architect review of issue [#119](https://github.com/cmdfw-bv/CMDFW-BalaVihar-App/issues/119), 2026-11-13)

**Governs:** System → `chat-participant-sync`. **Implements [ADR-0015](0015-chat-access-model.md)'s grade-band membership in the database** (ADR-0015 stays Closed; its rule is unchanged, only where it is enforced). **Re-implements the mechanism [ADR-2026-09-19](2026-09-19-withdrawal-revokes-conversational-access.md) Decision 9 describes** — withdrawal still revokes class-chat participation outright, with the sibling guard — without changing that decision. **Leaves [ADR-0022](0022-csv-import-auth-provisioning-boundary.md) intact:** the import keeps its DB-first / auth-after-commit order; nothing here reorders its phases.

**Ratified 2026-11-13 (Maulik).** The three decisions above (one recount routine; stay while any ground remains; a `grade_level` change re-counts) were taken in the architect review. Four further commitments of the Decision section had not been put to the project owner separately; Decision 2 was chosen in the review but carried a consequence worth re-stating. All were confirmed explicitly:

1. **Decision 2's reach into merged code** — routing the merged withdrawal branch and `sync_staff_participants()`'s class-teacher delete through the recount. Chosen in the review itself (Option B1); re-stated here because it means #119 now modifies code that the merged, staging-deployed `realtime-chat-delivery` (#6) depends on. Option B2 (new paths only) was declined on the ground that keeping two hand-written deletes alongside the recount is *more* code to maintain, not less, and would let the new guardian-unlinked path reproduce the same defect. The wider blast radius is a review and test obligation, covered by AC#10, not a design change.
2. **Label precedence teacher > parent > student**, which also decides which ADR-0016 notification default a person with more than one ground receives, and means an `@Parents` mention does not reach a teacher-parent as a parent.
3. **Relabelling `participant_role` in place** rather than delete-and-reinsert, so `notify_level` and `notification_default` survive a change of ground.
4. **The grade function's accepted set** being exactly `'9'`-`'12'` and `'Gr9'`-`'Gr12'`, returning false for `PreK`, `KG`, `Shishu Vihaar` and anything else.
5. **A `family_members` change recounting every class where that family has a child enrolled at any status**, not only `active` — required so that removals are processed, and broader than the `active` sense the rest of the spec uses.

No decision is reversed, so this is a dated completion of the record rather than a supersede (precedent: ADR-0022's corrected Consequences bullet, ADR-0019's addendum). `/design` may rely on all five.

### Context

`conversation_participants` for class conversations is written by `sync_class_participants()` (`20260709043451`), which fires only on `enrollments` insert/update and reads `students.user_id` and `family_members` at that instant. Five facts checked during this review shape the decision:

1. **Both real data paths link logins after enrollment.** CSV import links in phase 3, after the phase-2 commit (ADR-0022, Closed, chosen to prevent orphaned `auth.users`); the seed links in `seed.sql` after `domain.sql`. So the enrollment trigger finds nobody, and re-import never re-fires it. Reordering the import is not available without superseding ADR-0022, and is not proposed.
2. **One row per person per conversation.** `conversation_participants` is `unique (conversation_id, user_id)` with a single `participant_role`. A person with two grounds for membership — a teacher whose own child is in the class (`user_roles` permits it), or a guardian in two households with children in the same class (`family_members` is `unique (family_id, user_id)`, not unique per user) — holds one row.
3. **Removal today deletes that row without asking whether another ground remains.** The withdrawal branch deletes the family's members guarded only by *that family's* other active enrollments; `sync_staff_participants()` deletes a removed teacher outright. Either can remove someone still entitled — e.g. a teacher drops out of the chat for the class they teach when their child withdraws. This is a live defect in merged code, not hypothetical.
4. **The row carries user preferences.** `notify_level` and `notification_default` live on the participant row (ADR-0016, `notifications-infra`). Any mechanism that deletes and re-inserts a still-entitled person's row silently resets their notification choice.
5. **The grade band has no database enforcement.** The only check is TypeScript (`csv-import.ts:230`, `HS_GRADE_BANDS`); the seed issues logins to Gr 7–8 students in the combined `'7, 8, 9'` class, and the trigger admits any student holding a login. `students.grade_level` is free text, spelled `'9'` by the seed and `'Gr9'` by import (#93).

### Options Considered

**Decision A — mechanism**

- **A1. One recount routine (chosen)** — a single `security definer` function computes, for one class conversation, the set of people entitled to be in it right now, and reconciles the stored rows to that set. Every event that can change the set calls it for each affected class; the one-time repair calls it once per class.
  - *Pros:* one statement of the rule, so the triggers and the repair cannot disagree; the repair is not separate code; the sibling guard, the two-household guardian and the teacher-parent all fall out of "is there still any ground?" rather than being special-cased per path; still-entitled rows are left in place, preserving notification preferences.
  - *Cons:* each event recomputes a whole class (tens of rows) instead of touching one row — negligible at pilot scale, and bounded by class size at any scale; a guardian link touches every class their family's children are in.
- **A2. A patch per event** — separate insert/delete logic on each of `family_members` insert/delete, `students.user_id` set/clear/repoint, and the enrollment trigger, plus a separately written repair.
  - *Pros:* smallest per-event change; closest to the existing code.
  - *Cons:* six copies of the eligibility rule and the sibling guard to keep in step; the repair is a seventh; each copy must independently get the two-ground cases right, which the existing code already gets wrong (fact 3).
- **A3. Derive membership instead of storing it** — replace the table with a view or policy predicate.
  - *Cons:* rejected — `notify_level` needs a stored row (fact 4), and #6's channel policy and `messages` RLS key off the table; a much larger change for no gain over A1.

**Decision B — a person with more than one ground**

- **B1. Stay while any ground remains, on every path including the existing ones (chosen)** — the recount decides; the withdrawal branch and `sync_staff_participants()`'s class-teacher delete both route through it.
  - *Pros:* fixes fact 3 where it lives today, not only on the new paths; one rule.
  - *Cons:* touches `sync_staff_participants()`, slightly beyond #119's original brief.
- **B2. New paths only**; log the existing defect separately. *Cons:* leaves a known access bug in merged code alongside a mechanism that already solves it.
- **B3. Out of scope.** *Cons:* the new "guardian unlinked" path would reproduce the defect.

**Decision C — grade changes**

- **C1. A `students.grade_level` change triggers the recount (chosen).** *Pros:* the Gr 9 rule holds continuously — a student corrected from 9 to 8 leaves the chat at once. *Cons:* one more trigger.
- **C2. Not now.** *Cons:* a typo fix can leave a sub-Gr 9 minor in the chat until an unrelated event, which contradicts making the band a database rule at all.

### Decision

1. **One routine decides class-chat membership.** For a class conversation, a person is entitled when **any** of these holds:
   - **teacher** — a `user_roles` row `role = 'teacher', scope_type = 'class', scope_id = <class>`;
   - **parent** — a `family_members` row for a family with at least one student holding an `active` enrollment in the class (any `relationship` value — current behaviour preserved, per ADR-0018 every family member is a guardian of the household);
   - **student** — the user is `students.user_id` of a student with an `active` enrollment in the class **and** that student passes the grade rule (Decision 3).

   The routine inserts missing entitled people, deletes rows for people with no remaining ground, and **leaves the row of anyone still entitled in place** (preserving `notify_level` / `notification_default`). If the label they are entitled under differs from the stored one, it updates `participant_role` in place. **Label precedence: teacher > parent > student.** It acts only on `kind = 'class'` conversations; `session_staff` and `leadership` stay with `sync_staff_participants()` unchanged. If the class has no conversation row, it returns without error.

2. **Events that call it, for every affected class:** `enrollments` insert/update (replacing the current body of `sync_class_participants()`); `family_members` insert/delete (each class where that family has an enrolled child, any status); `students` update of `user_id` or `grade_level` (each class that student is enrolled in); and the class-teacher branch of `sync_staff_participants()` on `user_roles` delete/insert. The one-time repair migration calls it for every class conversation; it is idempotent by construction.

3. **The Gr 9 band is enforced by an immutable database function**, keyed off the **student's own** `grade_level` (not the class `grade_band`): it accepts exactly `'9'`–`'12'` and `'Gr9'`–`'Gr12'` and returns false for anything else — fails closed. #93 retires the dual spelling when it reconciles the vocabulary. The seed also stops issuing logins below Gr 9 in the combined class (`/refine` Decision 1); the database rule does not depend on that.

4. **Privilege does not widen.** The routine and the grade function are `security definer` with `set search_path = public`; `execute` on the routine is revoked from `public`, `anon` and `authenticated` — only triggers and migrations call it. No RLS policy changes. The entitled set is exactly ADR-0015's ladder, narrowed at the grade band.

5. **No new `audit_log` surface.** Membership maintenance by triggers is not a read of a minor's record; access to messages remains governed and audited as before. Consistent with #6's review.

### Consequences

- **Fixes #119** for both orderings, with no change to the import's phase order (ADR-0022).
- **Fixes an existing defect** (fact 3): withdrawing a teacher's own child, or removing one of a guardian's two households, no longer removes someone still entitled. Tests must show this Red before and Green after.
- **Adversarial coverage (§11.3) widens** to role × scope × grade × ground-count. The owed cases in the spec's AC#10 are extended with: teacher-parent survives child withdrawal; teacher-parent survives losing their teacher role while their child is active (and is relabelled `parent`); two-household guardian survives unlinking from one; grade corrected 9→8 removes, 8→9 adds; notification preference survives a recount. All fixtures in the enrol-first order (`060_chat_rls.sql` uses the only order that works today).
- **Performance:** each triggering write recounts the affected classes in the same transaction. A CSV import of N families runs O(N × classes-per-family) recounts; acceptable at pilot scale, and `/design` should confirm the import's phase-3 time stays within the function timeout.
- **The repair touches staging data.** Staging carries untracked schema drift and must not be `db push`ed blind; `/deploy-staging` owns how the repair is applied.
- **Open, not decided here:** annual rollover (#82, ADR-2026-09-19 Decision 8) — the recount uses the mid-year meaning of `active`; grade promotion at rollover will flow through Decision 2's `grade_level` trigger once #82 decides how rollover writes grades.
