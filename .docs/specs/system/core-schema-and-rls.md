# System — Core schema & RLS foundation

> **owner:** System · **consumers:** all 6 personas + every later System item that touches data (auth-hook wiring, notifications, chat, CSV import) · **scope:** infra / data-layer — RLS-on, no auth-hook wiring · **governing ADR:** ADR-0003 (access-control-rls), ADR-0004 (multipersona-auth-hook — consumed, not implemented here), ADR-0015 (chat-access-model), ADR-0016 (notification-preferences), ADR-0017 (chat-governance-deferred), **ADR-0018 (family/household model, new)**, **ADR-0019 (minors'-record read-audit, new)**, **ADR-0020 (superseded same day by ADR-0021)**, **ADR-0021 (Teacher attendance-write RPC, new)**, **ADR-0027 (role-switcher label active-role-agnostic self-scope read, new — ADR-0019 addendum)** · **covers:** doc 2 §6 open items 1–2 (canonical schema, synthetic seed); doc 3 §6 (data layer & migrations), §5.4 (scope model), §11.2 (consent/audit/retention); doc 1 §10 (data-model additions)

**Stage:** Built — tested, full suite green (73/73; verified live 2026-07-09). `/refine` ✓ → `/architect` ✓ (ADR-0018, ADR-0019, ADR-0021, ADR-0027 addendum) → `/design` ✓ → `/plan` ✓ → `/build` ✓ → `/test` ✓ → next is `/deploy-staging`.

---

## Requirements (refined)

### User story
**As the** System, **I want** the canonical relational schema and its RLS policies established as timestamped migrations — covering the operational core, identity/scope catalog, privacy/compliance tables, notification-subscription plumbing, and chat durability — **so that** every persona feature UoW has real tables to build against with row-level access already provably correct per role × scope, before any feature screen is written.

### Decisions captured during refine
- **UoW boundary excludes the auth hook.** This item ships schema + RLS policies only. RLS is proven with adversarial pgTAP tests that **simulate JWT claims directly** (e.g. via `request.jwt.claims`), not by running real token issuance. The actual Postgres Custom Access Token Hook, magic-link sign-in wiring, and active-role-switch flow (ADR-0004, doc 3 §5.2–§5.3) are a **separate, later System item** that plugs into the `user_roles` table and claim shape this item defines.
- **Full §6.2 table set, in one item.** Mirrors repository-bootstrap's precedent of being intentionally the largest foundational option — every table in doc 3 §6.2 ships together: the canonical core, `user_roles`, `consents`, `audit_log`, `push_subscriptions`, and the chat tables (`conversations`, `conversation_participants`, `messages`), plus retention fields. Splitting these into separate System items was considered and rejected — the tables are small enough, and cross-referencing scope rules across them (e.g. audit_log reading user_roles' scope) is simpler done once.
- **Family model = household unit.** A `families` record is a household: **one family has multiple parent/guardian users and multiple enrolled students.** Each student belongs to exactly one family. This does **not** model split-custody/joint-guardianship across two households — if that surfaces as a real pilot need, it's a follow-up migration, not solved speculatively here.
- **Retention policy value is explicitly not finalized here.** Doc 3 §11.2 requires org + legal sign-off before the retention window/deletion-job behavior is set. This item ships the **schema fields** (e.g. a retention/deletion-eligibility marker per PII-bearing table) and the **column-level hook** for a scheduled job to key off — not the finalized policy value or the job itself.

### Acceptance criteria
1. **Canonical operational core** exists as migrations: `centers → sessions → classes → enrollments → attendance → students → families`, with foreign keys expressing the hierarchy (a class belongs to a session belongs to a center; an enrollment links a student to a class; attendance links to an enrollment) and RLS **on** every table.
2. **`families` as household unit.** A family has many parent-role users and many enrolled students; each student belongs to exactly one family. Modeled per the decision above.
3. **`user_roles` catalog.** `(user_id, role, scope_type ∈ {org,center,session,class}, scope_id)`, many rows per user. RLS: **not client-writable**; read access reserved for the (future) auth hook's `supabase_auth_admin` context (§5.5) — this item locks the table down correctly even though the hook itself isn't wired yet.
4. **`consents` table.** Parental + media consent, timestamped, revocable, scoped to the subject's family/org; RLS restricts to the subject's own family (parent-visible) plus admin/coordinator per scope.
5. **`audit_log` table.** Append-only; records actor, action, target, timestamp on access to a minor's record; RLS: insert-only for the recording mechanism, read-scoped to admin/coordinator per §5.4.
6. **`push_subscriptions` table.** RLS-scoped to the owning user only; columns hold endpoint/keys with **no PII in any payload column** (§8.1, privacy-rules).
7. **Chat durability tables** — `conversations`, `conversation_participants`, `messages` — per ADR-0015/0016/0017: `conversation_participants` carries member **role** and grade-band-derived membership, plus `notify_level` (`all|mentions|muted`) and a per-user `notification_default`; `messages` carries mention-target columns (`@Parents`/`@Students`/`@individual`). RLS mirrors channel access and **enforces no open student-to-student DMs**.
8. **Retention fields.** PII-bearing tables carry the schema-level hook (marker/column) a scheduled deletion job will later key off — value/job behavior explicitly deferred (see decisions above).
9. **RLS proven, not assumed.** An adversarial pgTAP suite exercises role × scope combinations (Parent/Student/Teacher/Coordinator/BV Coordinator/Admin, each at its correct scope from doc 3 §5.4) against every table above, using simulated JWT claims, and proves **no cross-scope leakage** — especially of minors' records. This suite is the merge gate (constitution rule #4; doc 3 §11.3/§12).
10. **Synthetic seed only.** `supabase/seed/` ships realistic **synthetic** POC data generated from scratch (doc 2 §6 open item 2); `db reset` re-applies migrations + seed cleanly (repository-bootstrap's existing acceptance criterion 5). **No real minors' data in any non-prod environment, ever.**
11. **Migrations are the only path.** Every table/policy above lands as a timestamped SQL migration in `supabase/migrations/` (doc 3 §6.1) — nothing hand-applied via Studio.

### Edge cases
- **Cross-scope leakage via joins.** A Teacher (class scope) or Parent (own-children scope) must not reach another class's/family's rows even by joining through session/center — this is exactly what the adversarial suite (#9) must catch, not just direct-table selects.
- **Multi-role, multi-scope same user.** A single `user_id` holds several `user_roles` rows (e.g. Parent + Teacher + Coordinator) — RLS tests must prove that simulating each role's claim set independently yields only that role's correct scope, since the real active-role switch is out of scope here.
- **Coordinator vs BV Coordinator boundary.** Session-scoped Coordinator sees only their session's classes; org-scoped BV Coordinator/Admin see the rollup — must be provably distinct even in the pilot's degenerate single-session case.
- **Chat governance under simulated claims.** ADR-0017's adult-presence-oversight rule (no open student DMs) must hold even though the real hook doesn't exist yet — tests simulate a Student-role claim and prove no P2P DM path exists.
- **Audit-log completeness.** "Access to a minor's record" includes reads, not just writes — flag for `/architect`/`/design`: native Postgres triggers don't fire on `SELECT`, so the mechanism (view, security-definer function, or query-level logging) is an open technical question for the next stage, not resolved here. *(Resolved: ADR-0019 + the "Data & RLS impact" design section below — hybrid RPC, including denied-attempt logging.)*
- **Retention job accidentally deleting POC data.** Because the policy value isn't finalized, the schema must not ship any default that actually triggers deletion — fields are inert until a later item sets real policy.
- **CSV enrollment import target shape.** The schema must be shaped to receive the doc 2 §2 CSV import, but the import mechanism itself (script/function) is a separate System item — not built here.

### Priority
**POC-core, foundational.** Second root dependency after repository-bootstrap: no persona feature UoW, and no later System item (auth hook, notifications, chat delivery, CSV import), can be tested against real access control until this lands.

### Consumers (cross-persona)
All six POC personas' feature UoWs (every table they read/write). The auth-hook System item consumes `user_roles`' shape. The notifications System item consumes `push_subscriptions`. The chat/realtime work consumes `conversations`/`conversation_participants`/`messages`. The CSV-import System item consumes the enrollment/student/family shape.

### Access scope (§5.4)
**RLS-on for every table, keyed to the scope model:** Parent → own-children; Student → self; Teacher → own class; Coordinator → own session; BV Coordinator/Admin → org. Policies are written and adversarially tested against **simulated** claims in this item; they become live against **real** claims once the auth-hook item lands — no policy rewrite should be needed at that point, only the claims source changing from simulated to real.

### Explicitly out of scope (so a later item picks them up)
- The Postgres Custom Access Token Hook, magic-link sign-in wiring, and active-role-switch UX (separate System item; ADR-0004).
- CSV enrollment import mechanism (script/function) — schema shape only, here.
- Push-send delivery logic and SES email sending (separate notifications System item) — `push_subscriptions` table shape only, here.
- Realtime chat delivery mechanism (Supabase Realtime broadcast wiring) — durable tables only, here.
- Retention/deletion job implementation and the finalized retention policy value (needs org + legal sign-off, per doc 3 §11.2).
- Audit-log SELECT-capture mechanism — **resolved by ADR-0019** (hybrid RPC for cross-scope reads; see below).

---

## Architect review — sign-off (2026-07-08)

**Outcome: signed off, 2 ADRs recorded.** The brief is sound against the architecture — scope model (§5.4), RLS-on-every-table (non-negotiable #1), US residency (no processor choice made here), and minors'-data minimization all check out. Two genuinely new decisions were surfaced and recorded rather than left implicit:

1. **ADR-0018 — family/household model.** The refine-stage decision (one family per student; a household holds multiple guardians + multiple students; split-custody explicitly out of scope) is a real schema-shape/access-pattern decision for the Parent `own-children` scope, not something doc 3 had already settled — recorded as an ADR rather than folded silently into the migration.
2. **ADR-0019 — minors'-record read-audit mechanism.** The brief correctly flagged this as unresolved rather than guessing. Decision: **hybrid** — Parent/Student self-scope reads stay plain RLS-scoped `select` (unaudited by design); Teacher/Coordinator/BV Coordinator/Admin reads of a record they don't own by self/parent scope route through a security-definer RPC that checks scope and writes `audit_log` atomically, with direct `select` revoked for those roles beyond their own scope so the RPC can't be bypassed.

**Not ADR-worthy (execution/delivery detail, no new decision):**
- **Auth-hook exclusion + simulated-JWT-claims testing.** Already the standard, Supabase-recommended way to pgTAP-test RLS (`request.jwt.claims`); doesn't introduce a new access pattern, external processor, or minors'-data exposure. Covered by the existing standing test obligation (§11.3) and ADR-0003/ADR-0004 — no new record needed.
- **Bundling the full §6.2 table set into one item.** A UoW-boundary/delivery-sequencing choice (§12.6), not a system-architecture decision — mirrors the repository-bootstrap precedent of the largest-viable foundational slice.

**Hand-off → `/design`:** produce the detailed spec — exact table/column DDL, the RPC function signatures + grant/revoke matrix from ADR-0019, the `family_members` linking shape from ADR-0018, the RLS policy set per table keyed to simulated claims, the pgTAP adversarial test plan (role × scope, including the RPC-bypass check), and the synthetic seed data plan.

---

## Design (detailed spec)

> **Stage:** 1 — Design ✓ (this section). `/refine` ✓ → `/architect` ✓ (ADR-0018, ADR-0019) → `/design` ✓ → next is `/plan`.
> **Design decisions captured this pass:** (1) **attendance** = `present`/`absent` only, one row per enrollment per class-meeting date; (2) **enrollments** = exactly one active class per student per session (partial-unique constraint); (3) **consents** = per-student rows (`participation`, `media`), not per-family blanket.

### Table catalog (conceptual DDL — exact SQL syntax is `/migration`'s job)

**Operational core**

| Table | Key columns | Notes |
|---|---|---|
| `centers` | `id, name, created_at` | Root of the hierarchy. |
| `sessions` | `id, center_id→centers, name, start_date, end_date, created_at` | A term (e.g. "2026-Fall") at a center. |
| `classes` | `id, session_id→sessions, name/grade_band, created_at` | e.g. "Grade 3", "HS Gr9-12". |
| `families` | `id, label, created_at` | Household unit (ADR-0018). `label` is a display name only, no PII requirement. |
| `family_members` | `id, family_id→families, user_id→auth.users, relationship, created_at`, unique(`family_id,user_id`) | Multiple guardians per household (ADR-0018). |
| `students` | `id, family_id→families (not null), first_name, last_name, grade_level, external_member_id (nullable), user_id→auth.users (nullable), created_at` | `user_id` populated **only** for HS (Gr9+) students who get provisioned accounts (ADR-0015) — KG–Gr8 students have no login. Minimal columns only (no DOB) — data minimization. |
| `enrollments` | `id, student_id→students, class_id→classes, session_id→sessions (denormalized), status ('active'/'withdrawn'), enrolled_at`, **partial unique** on `(student_id, session_id) where status='active'` | Enforces exactly one active class per student per session (this pass's decision). |
| `attendance` | `id, enrollment_id→enrollments, class_meeting_date, status ('present'/'absent'), marked_by→auth.users, submitted_at`, unique(`enrollment_id, class_meeting_date`) | One row per student per class-meeting date (this pass's decision). |

**Identity/scope catalog**

| Table | Key columns | Notes |
|---|---|---|
| `user_roles` | `id, user_id→auth.users, role enum('student','parent','teacher','coordinator','bv_coordinator','admin'), scope_type enum('org','center','session','class'), scope_id (nullable for org), created_at` | Per §5.2. `scope_id` is polymorphic (targets `centers`/`sessions`/`classes` depending on `scope_type`) — not a literal FK across types; validated by a check constraint + convention, documented so `/migration` doesn't try to force a single-target FK. |

**Privacy/compliance**

| Table | Key columns | Notes |
|---|---|---|
| `consents` | `id, student_id→students, consent_type enum('participation','media'), granted boolean, granted_by→auth.users, granted_at, revoked_at (nullable)`, unique(`student_id, consent_type`) | Per-student (this pass's decision). Revocation = set `revoked_at`, never delete the row. |
| `audit_log` | `id, actor_user_id→auth.users, actor_role, action, target_table, target_id, target_student_id→students (nullable), accessed_at` | Append-only. Scoped strictly to **reads** of `students`/`attendance`/`consents` via the ADR-0019 RPCs (see below) — writes are already attributed via `marked_by`/`granted_by`, so they don't need a redundant audit row. |

**Notifications plumbing**

| Table | Key columns | Notes |
|---|---|---|
| `push_subscriptions` | `id, user_id→auth.users, endpoint (unique), p256dh_key, auth_key, created_at` | Owner-only RLS via plain `auth.uid() = user_id` — this does **not** depend on the custom auth hook (base JWT `sub` claim is always present), so it's fully testable even before the hook lands. No PII in any column. |

**Chat durability (ADR-0015/0016/0017)**

| Table | Key columns | Notes |
|---|---|---|
| `conversations` | `id, kind enum('class','session_staff','leadership'), scope_type enum('class','session','org'), scope_id (nullable for org), created_at` | |
| `conversation_participants` | `id, conversation_id→conversations, user_id→auth.users, participant_role, notify_level enum('all','mentions','muted'), created_at`, unique(`conversation_id,user_id`) | Auto-populated by a trigger on `enrollments`/class-staff changes per ADR-0015's grade-band membership rule — **in scope here** (data integrity), while the Realtime broadcast wiring itself stays out of scope. |
| `messages` | `id, conversation_id→conversations, sender_user_id→auth.users, body, mention_targets (text[]: `parents`/`students`/`individual:<user_id>`), created_at` | |

**Retention (schema ships; provisional POC value locked in, doc 3 §11.2)**

- `students`, `attendance`, `consents`, `messages` each carry a nullable `retention_eligible_at timestamptz` column. **No job reads it yet** — the column is inert until a later item builds the scheduled-deletion job — but the POC now documents a **provisional working value** rather than leaving the number itself open:

  > **Provisional POC retention policy (NOT legally binding — placeholder pending real org/legal sign-off):**
  > - Active students/families: retained indefinitely while enrolled.
  > - Withdrawn/inactive students: `retention_eligible_at` = last enrollment's end date + 90 days.
  > - `consents`: retained as long as the associated student record exists.
  > - `messages`: retained per ADR-0017 (purged at pilot close, not by this column).

  This value is **superseded the moment real org/legal sign-off happens** — since no job reads the column yet, documenting a provisional number carries no actual deletion risk, it just means `/plan`/`/migration` has a concrete target to size the column against instead of an open question.

### Data & RLS impact

**Minors'-record read-audit (ADR-0019) — the key mechanism:**

There is no separate Postgres role per app-role (Teacher/Coordinator/etc. are all just `authenticated` with different JWT claims), so the enforcement isn't a table-level `GRANT`/`REVOKE` — it's entirely in the **RLS policy predicates**:

- On `students`, `attendance`, `consents`: the plain `SELECT` RLS policy contains **only** a Parent-own-child predicate (`family_id` matches the caller's linked family) and a Student-self predicate (`user_id` matches caller). **No predicate exists for Teacher/Coordinator/BV Coordinator/Admin** — for those roles, a direct `select` against these three tables returns **zero rows**, not an error.
- Three `SECURITY DEFINER` RPC functions are the *only* path staff roles have to this data:
  - `get_student_for_staff(p_student_id uuid)` — Teacher (student in own class), Coordinator (own session), BV Coordinator/Admin (org). Checks scope internally against `enrollments`/`classes`/`sessions`; on match, inserts one `audit_log` row (`action='read', target_table='students', target_id=p_student_id, target_student_id=p_student_id`) and returns the row; on scope mismatch, inserts one `audit_log` row (`action='denied'`, same target columns) and returns nothing.
  - `get_class_roster_for_staff(p_class_id uuid)` — returns the joined student roster for a class; scope-checked the same way; inserts one `audit_log` row **per student returned** on success, or one `action='denied'` row (target_table='classes', target_id=p_class_id) if the caller has no scope over the class at all.
  - `get_class_attendance_for_staff(p_class_id uuid, p_date_from date, p_date_to date)` — returns attendance rows for a class/date range; inserts one `audit_log` row per distinct student touched on success, or one `action='denied'` row on scope mismatch.
  - `get_consents_for_staff(p_student_id uuid)` — Coordinator/BV Coordinator/Admin only (not Teacher — consent status isn't a teaching-day need); same success/denied audit pattern.
  - **Every RPC logs both outcomes** — `audit_log.action ∈ {'read','denied'}`. A denied attempt is not silent: it's the same defense-in-depth posture (doc 3 §11.1) as the rest of this item, and gives Admin a real trail if a client is misconfigured or probing out-of-scope data.
- `audit_log` itself has **no direct `INSERT`/`UPDATE`/`DELETE` grants for `authenticated`/`anon` at all** — only the `SECURITY DEFINER` functions (owned by a non-RLS-subject role) can write to it, so a client cannot forge an audit entry or skip one.
- Organizational metadata (`centers`/`sessions`/`classes`/`enrollments`) is **not** RPC-gated — it doesn't carry a minor's name/PII directly, so plain scope-keyed RLS (Teacher=own class, Coordinator=own session, BV Coordinator/Admin=org) applies normally.

**RLS policy matrix (plain-select, per §5.4 scope model):**

| Table | Parent | Student | Teacher | Coordinator | BV Coordinator | Admin |
|---|---|---|---|---|---|---|
| `centers`/`sessions`/`classes` | read (own child's) | read (own) | read (own class) | read (own session) | read (org) | read (org) |
| `enrollments` | own children | self | own class | own session | org | org |
| `students`/`attendance`/`consents` | own children (direct) | self (direct) | **none direct — RPC only** | **none direct — RPC only** | **none direct — RPC only** | **none direct — RPC only** |
| `attendance` (write) | — | — | insert/update, own class | — | — | — |
| `user_roles` (read) | — | — | — | — | none client-side (auth-hook context only, §5.5) | none client-side (auth-hook context only, §5.5) |
| `user_roles` (write/approve) | — | — | — | — | — | — |
| `push_subscriptions` | owner only (`auth.uid()`) | owner only | owner only | owner only | owner only | owner only |
| `conversations`/`participants`/`messages` | per membership row | per membership row (no open P2P DM — ADR-0015) | per membership row | per membership row | per membership row | per membership row |

> **On the `user_roles` (write/approve) row being empty for everyone, including Admin:** doc 2 gives Admin (and, within their own scope, Coordinator/BV Coordinator) a real capability BV Coordinator's row-read scope doesn't cover — **user/role management** ("assign with session context, approve, reject"). That is deliberately **not** a client-side RLS `INSERT`/`UPDATE` policy on `user_roles` in this item. `user_roles` is the security-critical claims catalog the auth hook reads to stamp JWTs (§5.2) — granting any client-side write path to it, even scope-limited, would be a hole in the exact table that decides access everywhere else. Per doc 3's stack-fit table, the approval/role-assignment workflow is meant to run through a **privileged Netlify serverless function using the service-role key** (which bypasses RLS by design, same trust tier as the auth hook) — **owner locked: System** (`user-role-approval`, named in the System backlog index), not built here. This item's job is to ship `user_roles` locked down correctly so that later function has a safe table to write to.

### pgTAP adversarial test plan (the merge gate — §11.3/§12.4)

For every table above, using **simulated** `request.jwt.claims` (no real hook), assert:
1. **Positive case** — each role sees exactly its in-scope rows (Parent → own children only; Teacher → own class only; Coordinator → own session, not sibling sessions in the same center; BV Coordinator/Admin → org-wide, degenerate single-session at pilot).
2. **Negative case (cross-scope)** — every role gets **zero** rows for out-of-scope data, including via join paths (e.g. Teacher joining `attendance → enrollments → students` of another class must still yield nothing).
3. **RPC-bypass check** — a Teacher's plain `select * from students where id = <in-class student>` returns **zero rows**; calling `get_student_for_staff(<same id>)` returns the row **and** creates exactly one `audit_log` row with `action='read'`. Repeat for Coordinator/BV Coordinator/Admin and for `attendance`/`consents`.
3a. **Denied-attempt logging** — a Teacher calling `get_student_for_staff` for a student **outside** their class returns no row **and** creates exactly one `audit_log` row with `action='denied'`. Same for every other staff role/RPC pairing.
4. **Audit-log integrity** — a direct `insert into audit_log` from an `authenticated` session fails; only the RPC path succeeds.
5. **Multi-role isolation** — a single `user_id` with multiple `user_roles` rows (e.g. Parent+Teacher+Coordinator) is tested once per simulated role, proving each yields only that role's scope (no cross-contamination since the real active-role switch doesn't exist yet).
6. **Chat governance** — simulating a Student claim, prove no query/RLS path allows creating or reading a P2P DM `conversation` with another student (ADR-0015/0017).
7. **Enrollment uniqueness** — inserting a second `active` enrollment for the same student in the same session fails (partial-unique constraint).

### Synthetic seed data plan (doc 2 §6 item 2)

`supabase/seed/` generates, from scratch, entirely synthetic: 1 center → 1–2 sessions → 3–5 classes spanning KG–HS grade bands → ~30–50 students across ~20 families (some multi-guardian, some multi-child, per ADR-0018) → enrollments → several weeks of attendance → sample consents (mixed granted/withheld) → `user_roles` rows giving at least one account **Parent+Teacher+Coordinator+BV Coordinator** multi-role coverage (thinnest-slice scenario, doc 2 §5) → seeded `conversation_participants` matching the grade-band rule. **No real names, emails, or any data derived from actual program members.**

### UI
**N/A — no screens.** Pure data-layer item (tables, RLS, RPC functions, seed). The design DoD (design-system skill) doesn't apply here — inherited by the feature UoWs that build screens on top of `get_*_for_staff` RPCs and the RLS-scoped tables.

### Edge cases (carried + refined)
- **RPC scope-check failure mode:** an out-of-scope call (e.g. Teacher requesting a student not in their class) returns **no rows** (not an error/exception, so it doesn't leak existence via error messages) **and** writes an `audit_log` row with `action='denied'` — locked in above.
- **Enrollment mid-session class change:** a student switching classes within the same session means ending one `enrollments` row (`status='withdrawn'`) and starting another — the partial-unique index only constrains *active* rows, so this is representable without a schema change.
- **`family_members` vs `students.family_id`:** a parent user can belong to exactly the families they're linked to via `family_members`; `own-children` scope resolves as "students where `family_id` in (my linked families)" — supports one parent across two households only if genuinely linked to both (still no split-custody *single-student* modeling, per ADR-0018 — **re-confirmed out of scope during `/design`, 2026-07-08**; a follow-up migration if a real pilot household needs it).
- **HS student without a login yet:** `students.user_id` starts null at enrollment and is populated once the (separate, later) account-provisioning/auth-hook item creates their account — this table must tolerate that gap cleanly (nullable, no NOT NULL constraint).

### Out of scope (unchanged from refine, confirmed still correct)
- Auth hook, magic-link wiring, active-role switch (separate System item).
- CSV import mechanism, push-send delivery, SES sending, Realtime broadcast wiring (each a separate item — this item ships only the tables/RPCs/policies they'll sit on).
- Retention job **implementation** (the scheduled deletion mechanism itself) — the provisional POC value is now locked in above, but it's a placeholder number, not real legal sign-off, and no job acts on it yet.
- **User/role approval workflow** (Admin's "assign with session context, approve, reject"; Coordinator's in-session approvals; BV Coordinator's cross-session approvals) — a privileged, service-role-backed Netlify function against `user_roles`, not a client RLS write path. This item ships `user_roles` locked down (no client write policy) so that function has a safe table to target. **Owner locked: System** (`.docs/specs/System/user-role-approval.md`, future item) — one function, one spec; Admin/Coordinator/BV Coordinator cross-reference it as consumers, each calling it with their own scope argument, mirroring this item's own ownership pattern.

---

## Sign-off
- [x] **Human sign-off on this design** (2026-07-08, shree.srinivas@outlook.com) → ready for **`/plan`**.

---

## Architect review — deferred-findings pass (2026-07-09)

Two documentation-level findings from the item's final whole-branch review (build complete, tests green, pushed as `033ca8a`) were deferred to a future `/architect` pass rather than blocking merge. This pass resolves both.

1. **Teacher `attendance` UPDATE bypasses the ADR-0019 audit RPC — real gap, not just documentation.** `attendance_teacher_update`'s `USING`/`RETURNING` lets a Teacher read full row data via a no-op update, with zero `audit_log` entry — contradicts ADR-0019's requirement that all non-self/parent staff reads of a minor's record are audited. **ADR-0020 recorded** (addendum to ADR-0019, not a supersession): add an `AFTER UPDATE` trigger on `attendance` that writes an `audit_log` row (`action='read'`) whenever a Teacher updates a row, closing the bypass natively (UPDATE triggers fire, unlike SELECT). **Follow-up migration required** — not built in this pass; routes to `/design`/`/migration` as a small addition to the existing `core-schema-and-rls` item (trigger + trigger function + one new pgTAP assertion), not a new backlog item.
2. **Unguarded `scope_id` JWT-claim casts (13 occurrences, 2 migration files) — not ADR-worthy.** `(auth.jwt()->>'scope_id')::uuid` throws on a malformed claim before any audit write. Assessed as a robustness **precondition**, not an access-control decision — no new access pattern, no schema change. Recorded as a requirement to carry into `auth-hook-and-identity` when that item is `/refine`d: the real Custom Access Token Hook must guarantee `scope_id` is always a valid UUID (or absent) for every issued token, since every RLS policy and RPC in this item assumes that shape unguarded.

**Hand-off:** `core-schema-and-rls` gets one small follow-up migration (ADR-0020's trigger) before its next `/test` pass. `auth-hook-and-identity` (not yet started) carries finding 2 as a spec precondition when it's next `/refine`d.

---

## Design addendum — ADR-0020 (superseded same day) → ADR-0021 (Teacher attendance-write RPC, 2026-07-09)

**Stage:** 1 — Design (second addendum to the design signed off 2026-07-08; replaces the first addendum above ADR-0020, superseded before it was ever built). No new UoW, no new spec file — folded into this item per ADR-0021's Consequences (owner locked: System, `core-schema-and-rls`).

**Why this replaces the ADR-0020 addendum:** implementing ADR-0020's trigger (as Task 11) surfaced during TDD that its premise didn't hold. Root-cause investigation found `attendance_teacher_update`/`attendance_teacher_insert` (Task 2, shipped in `033ca8a`) have never actually been usable by a real client: Postgres RLS requires SELECT-policy-equivalent visibility to locate rows for `UPDATE` and for any `RETURNING` clause, and Teacher was deliberately given zero SELECT policy on `attendance` (ADR-0019). A Teacher `UPDATE` silently matches zero rows; a Teacher `INSERT ... RETURNING *` (what `supabase-js`'s `.insert().select()` sends) throws an outright RLS error. No prior test asserted a row-count on a Teacher write, so this shipped unnoticed. See ADR-0021 for full detail — this section documents the resulting design.

### DDL-level spec

```sql
create or replace function mark_attendance_for_staff(
  p_enrollment_id uuid,
  p_class_meeting_date date,
  p_status text
)
returns attendance
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text := auth.jwt()->>'active_role';
  v_scope_id uuid := nullif(auth.jwt()->>'scope_id','')::uuid;
  v_authorized boolean := false;
  v_row attendance%rowtype;
begin
  if v_role = 'teacher' then
    v_authorized := exists (
      select 1 from enrollments e
      where e.id = p_enrollment_id and e.class_id = v_scope_id
    );
  end if;

  if not v_authorized then
    insert into audit_log (actor_user_id, actor_role, action, target_table, target_id, target_student_id)
    values (auth.uid(), v_role, 'denied', 'attendance', p_enrollment_id, null);
    return null;
  end if;

  insert into attendance (enrollment_id, class_meeting_date, status, marked_by)
  values (p_enrollment_id, p_class_meeting_date, p_status, auth.uid())
  on conflict (enrollment_id, class_meeting_date)
  do update set status = excluded.status, marked_by = excluded.marked_by, submitted_at = now()
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function mark_attendance_for_staff(uuid, date, text) from public;
grant execute on function mark_attendance_for_staff(uuid, date, text) to authenticated;
```

Plus, in the same migration: drop `attendance_teacher_insert` and `attendance_teacher_update` (Task 2), and `revoke insert, update on attendance from authenticated` (the `select` grant/policies for Parent/Student are untouched — only Teacher ever had insert/update).

- **No `audit_log` row on a successful mark/correction** — `marked_by`/`submitted_at` already attribute the write; matches the original design rationale ("writes are already attributed... don't need a redundant audit row"). A **denied** (out-of-scope) call *does* log one `audit_log` row, matching the existing `get_*_for_staff` RPCs' denied-logging precedent (defense-in-depth, doc 3 §11.1) — this is the one asymmetry between successful and denied calls, intentional.
- **Upsert on the existing unique constraint** `(enrollment_id, class_meeting_date)` (Task 2) — one call handles both the initial mark and a same-day correction; no separate insert-vs-update branching needed.
- **Migration placement:** new timestamped migration appended after `20260709045311_retention_fields.sql`, not a rewrite of `20260709032818_core_operational_rls_policies.sql` — additive, per constitution #3.
- **Client impact:** any staff-facing screen marking/correcting attendance calls `mark_attendance_for_staff(...)`, not `.from('attendance').insert()/.update()` — same constraint the existing read RPCs already impose on staff reads, now extended to this one write.

### pgTAP addition (extends the existing adversarial suite, §"pgTAP adversarial test plan" above)
- Teacher direct `insert`/`update` on `attendance` now returns nothing / fails outright — locked down like the read RPCs (proves the grant revocation + policy drop actually took effect, not just assumed).
- `mark_attendance_for_staff` succeeds for an in-class Teacher on a **new** date (insert branch) and on an **existing** date (update/correction branch via the upsert), returning the row each time.
- An out-of-class Teacher's call returns nothing and creates exactly one `audit_log` row (`action='denied'`, `target_table='attendance'`).
- No `audit_log` row is created by a successful in-scope call (confirms the "no redundant audit row" decision holds).

### Out of scope (unchanged)
Everything already listed in the item's "Out of scope" section above; this addendum touches only `attendance`'s write path.

### Sign-off
- [x] **Human sign-off on this addendum** (2026-07-09, shree.srinivas@outlook.com) → ready for **`/plan`** (rewrite Task 11 of `core-schema-and-rls.plan.md`) → **`/migration`**.

---
