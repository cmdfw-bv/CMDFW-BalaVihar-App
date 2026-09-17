# ADR-2026-09-14-synthetic-seed-shared-data-per-env-accounts: Synthetic seed splits account-free shared data from per-environment account-linked rows

**Status:** Closed · **Category:** Infra/Process · **Date:** 2026-09-14 · **Deciders:** #19 architect review (2026-09-14); Option A approved by the item owner

### Context
#19 (`pilot-seed-data`) must deliver a synthetic dataset that is loaded in **two environments with different account-creation mechanisms**:
- **local dev** — `supabase db reset` runs SQL and may use the local-only fixture factory `tests.create_supabase_user(...)`;
- **cloud staging (#65)** — must **not** use `tests.*` (removed from cloud by #66/#86/#89) and creates auth users via the **Auth Admin API** (JS/HTTP, not SQL).

Because auth users are created differently per environment, they **cannot live in one shared artifact**. And several domain rows *reference* an auth user — `user_roles`, `family_members`, `students.user_id`, `attendance.marked_by`, `class_updates.posted_by`, `consents.granted_by`. Crucially, **`class_updates.posted_by` is `NOT NULL`** (verified in `20260728150000_...`): a class-update row cannot be created without a real account. So "where is the line between the shared reusable data and the per-environment account work?" is a genuine cross-component decision (the #19 ↔ #65 seam) that all tests and both environments depend on.

### Options Considered
- **A. Structure shared, people separate (chosen)** — the shared reusable file holds only rows that reference **no** auth user; each environment creates its own accounts + the rows that reference them.
  - *Pros:* one simple rule ("references a login → not in the shared file"); **no schema change**; matches reality (accounts are already environment-specific); the shared file loads identically everywhere.
  - *Cons:* account-linked demo activity (`attendance`/`class_updates`) is generated per-environment, so it is not byte-identical between local and cloud.
- **B. One shared file, fill people in later** — put everything in the shared file with the "who" columns blank, fill them after accounts exist.
  - *Pros:* all data logic in one place.
  - *Cons:* **blocked** — `class_updates.posted_by` is `NOT NULL`, so the row can't be inserted blank without a **schema change** (out of scope, and it would weaken a real integrity constraint); also a fragile two-pass.
- **C. Two shared files: structure + activity** — a structure file plus an activity file (attendance/updates), both run in both environments, the activity file resolving accounts by a shared key.
  - *Pros:* no duplication of the activity-generation logic.
  - *Cons:* the activity file must resolve accounts by a key that **differs** between local (`teacherN@bv-seed.test.local`) and cloud (`<base>+bv-teacher@…`) → needs parameterization; more machinery than a synthetic seed warrants.

### Decision
**Option A.** The reusable, `tests.*`-free artifact (#19's shared domain data, loaded identically by local `db reset` and by #65's cloud loader) contains **only rows that reference no auth user**: `centers`, `sessions`, `classes`, `families`, `students` (with `user_id` null), `enrollments`. Each environment then creates its **own accounts** (local: `tests.*`; cloud: Auth Admin API) and the **rows that reference an account** (`user_roles`, `family_members`, `students.user_id`, `attendance`, `class_updates`, `consents`). Accepted trade-off: account-linked **demo activity is generated per-environment** — local keeps its rich compliant/partial/non-compliant variety for the compliance-dashboard tests; cloud staging gets a sufficient subset for the sign-in walk / demo — rather than byte-identical.

### Consequences
- **No schema / RLS / migration change** — Option B's blocker (`class_updates.posted_by NOT NULL`) is avoided by construction.
- **Defines the #19 ↔ #65 interface:** #19 delivers the shared account-free data; #65 owns cloud accounts + the account-linked rows; the local `seed.sql` is refactored to *load the shared data, then* create its own accounts + account-linked rows.
- The seed stays **entirely synthetic** (no real member data) — residency + minors' non-negotiables (#5/#6) are unaffected; this ADR governs synthetic test data only.
- The rich activity variety the compliance-dashboard tests depend on **stays in the local seed**; cloud staging is not guaranteed byte-identical activity (acceptable — local is the test rig, cloud is the demo / sign-in proof).
- **Follow-ups:** `/design #19` specifies the shared file's exact contents and how each environment layers accounts on top; #65's already-built loader shell (`scripts/seed-staging.mjs`) applies the shared file and provisions accounts.
