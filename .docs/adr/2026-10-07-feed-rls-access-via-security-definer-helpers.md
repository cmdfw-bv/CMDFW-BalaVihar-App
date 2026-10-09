# ADR-2026-10-07-feed-rls-access-via-security-definer-helpers: Feed read-access membership checks move from inline RLS into caller-scoped SECURITY DEFINER helpers

**Status:** Accepted · **Category:** Auth/Access · **Date:** 2026-10-07 · **Deciders:** [@arunasharad-coder](https://github.com/arunasharad-coder) (author, issue [#105](https://github.com/cmdfw-bv/CMDFW-BalaVihar-App/issues/105), PR [#117](https://github.com/cmdfw-bv/CMDFW-BalaVihar-App/pull/117)) · **Consulted:** [@mehtamaulik-creator](https://github.com/mehtamaulik-creator) (reviewer, PR #117 — requested this record and independently verified no leak)

**Governs:** System → `core-schema-and-rls` · Teacher → `class-update-and-home-feed` (the `class_updates`, `comments`, `centers`, `sessions`, `classes` SELECT policies and the 15 helper functions they call). Relates to [ADR-2026-09-19](2026-09-19-withdrawal-revokes-conversational-access.md) (whose `status = 'active'` withdrawal predicate is preserved by the paired-helper split below).

### Context

The teacher feed timed out on cloud staging (#105 — Postgres `57014`, ~50 s, even at **zero rows**). Root cause: the parent/student SELECT policies on `class_updates`/`comments` and the embedded reference tables (`centers`/`sessions`/`classes`) used inline `exists (select … from enrollments → students → family_members …)`. Each of those tables is itself RLS-protected, so evaluating one policy triggered a **nested RLS cascade** — the planner re-evaluated the inner tables' own policies, recursively, producing hundreds of sub-plans. On the free-tier shared DB that collapsed into a statement-timeout.

Non-negotiable #1 is **"access control is RLS in the database."** The fix changes *how* the membership predicate is evaluated for ~29 SELECT policies across 5 tables, so it is architecturally significant under §12.10 (new RLS shape, perf, minors'-data access) and must be recorded here even though it is behaviour-preserving.

### Options Considered

1. **Keep inline RLS, tune indexes / query.** Pros: no mechanism change; stays purely declarative. Cons: does not remove the nested-RLS recursion, which is the actual cost; verified to still time out on cloud. Rejected.
2. **Caller-scoped SECURITY DEFINER membership helpers (chosen).** Replace each inline membership `exists` with a `security definer` function that answers one yes/no about the **caller's own** membership. `security definer` runs the body as the function owner, bypassing the inner tables' RLS — so the recursion disappears. Pros: eliminates the cascade (the timeout cause); keeps every policy and every table RLS-on and default-deny; the predicate is unchanged. Cons: moves a slice of enforcement logic behind a definer boundary (this ADR); a membership helper that took a *target user id* would be an oracle, so the design must forbid that; introduces a per-row function-call cost (see Consequences).
3. **Set-returning / indexed reformulation.** Pros: Maulik's review shows a set-returning variant is ~7× faster with ~65× fewer buffers. Cons: larger rewrite; wants its own measurement on staging. **Deferred as the performance follow-up**, not this change.

### Decision

Evaluate feed read-membership through 15 `SECURITY DEFINER` helper functions (`is_student_of_class`, `is_guardian_of_class`, `is_active_student_of_class`, `is_active_guardian_of_class`, `is_student_of_comment`, `is_guardian_of_comment`, `is_guardian_in_session`, `is_student_in_session`, `is_guardian_in_center`, `is_student_in_center`, `class_in_session`, `class_in_center`, `session_in_center`, plus the pre-existing `is_parent_of_class` and `resolve_parent_family_label`), called from the `class_updates`/`comments`/`centers`/`sessions`/`classes` SELECT policies.

The safety argument — why this stays within non-negotiable #1:

- **RLS remains ON and default-deny on every table.** The policies still gate every read; only the membership *sub-query* moved behind the definer boundary. Nothing is readable without a matching policy.
- **The membership helpers are caller-scoped and take no target-user argument.** They read `auth.uid()` internally, so a caller can only ever learn about **their own** enrollment/guardianship — granting `execute` to `authenticated` leaks nothing. All are `revoke execute … from public, anon`.
- **The two helpers that do take a user id** (`is_parent_of_class`, `resolve_parent_family_label`) are gated by the caller's JWT role **and** scope (teacher-of-this-class / coordinator-of-this-session / bv_coordinator / admin), and `resolve_parent_family_label` returns `families.label` only — never student-derived data.
- **The reference-data containment helpers** (`class_in_session`/`class_in_center`/`session_in_center`) touch no user data; they answer only whether two org-structure rows are related.
- **The paired split preserves [ADR-2026-09-19](2026-09-19-withdrawal-revokes-conversational-access.md)'s scope:** `is_active_*` variants carry `enrollments.status = 'active'` and serve the conversational policies (withdrawn families lose feed/comments); the status-agnostic variants serve the reference-data reads (unchanged), so withdrawal does not over-reach into a family's own child's class record.

Enforced by `supabase/tests/172_feed_rls_helpers_adversarial.sql` (helper wiring + the Decision-5 boundary) alongside `171` (conversational withdrawal) and `010`.

### Consequences

- The #105 timeout cause (recursive RLS re-evaluation) is removed.
- **Performance is only partly settled.** A `SECURITY DEFINER` function with a per-row argument cannot be inlined, so it executes once per row; `SubPlan` count (which drove the earlier "drop the wrapping" call) does **not** reflect this. Maulik's buffer measurement: the parent path is ~54–66 ms / ~19,670 buffers vs ~40 for the role-only paths, growing linearly with `class_updates`. The structural win is real, but the final feed performance must be **re-measured on staging as the teacher role** (the cloud `57014` itself is not reproducible locally), and the set-returning reformulation (Option 3) and re-adding the `(select auth.jwt())` wrapping (a measured ~15% effect) are **tracked follow-ups**, not closed here.
- A material slice of read-enforcement now lives in `SECURITY DEFINER` bodies; the caller-scoping invariant above is the thing a future maintainer must preserve. Any new membership helper must key off `auth.uid()` and take no target-user id, or carry a role+scope gate.
- The paired-helper split must be maintained: adding a withdrawal-sensitive policy means wiring it to an `is_active_*` variant, not the agnostic one. `172` guards this.
