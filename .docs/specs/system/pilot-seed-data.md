# System — pilot-seed-data (reusable synthetic dataset, real F3 shape)

> **owner:** System · **consumers:** all dev/test (local `db reset`, CI/pgTAP, RLS-adversarial, every persona UI) **+ #65 cloud staging seed** · **scope:** infra / test-data — a reusable, `tests.*`-free synthetic domain dataset loaded identically local + cloud · **governing ADR:** [ADR-2026-09-14-synthetic-seed-shared-data-per-env-accounts](../../adr/2026-09-14-synthetic-seed-shared-data-per-env-accounts.md) (the #19↔#65 seam — Option A) · **covers:** GitHub #19; the shared `domain.sql` consumed by #65

> **Stage:** `/refine` ✓ → `/architect` ✓ (2026-09-14) → `/design` ✓ (2026-09-15) → next is `/plan`.

## Requirements (refined)

### Reality check (why this issue's original scope is stale)
The issue body asks to *"replace the 5-band placeholder seed with the real 13-grade structure."* **That replacement has already happened** — the current `supabase/seed/seed.sql` already builds Frisco · F3 · 13 individual grade classes · ~20 families · ~35 students · enrollments · attendance · class-updates · consents · every persona account (its header even notes it dropped the old grade-bands). So the *shape* work is largely done.

The **real remaining gap**, surfaced by the #65 data-ownership split (2026-09-14), is twofold:
1. The seed is built entirely on **`tests.create_supabase_user(...)`** — the local-only fixture factory that was deliberately removed from cloud (#66/#86/#89). So the cloud staging seed (#65) **cannot reuse it**.
2. The synthetic **data** and the **account creation** are entangled in one block; #65 needs the **data** as a standalone, reusable artifact it can load into cloud, then create cloud accounts its own way (Auth Admin API).

Plus a **shape correction** from the real 2026–27 F3 attendance sheet: F3 runs **5 combined classes** (PreK–grade 9) **+ a kept-empty 10–12 row = 6 class rows**, replacing the current seed's individual per-grade classes. *(Full BV grade catalog = **14 levels**: PreK, KG, 1–12. Today's `seed.sql` lists only 13 — it **skips KG**; our F3 seed fixes that, since KG sits in the "KG, 1, 2" class. Grade composition is **per-session** — not every session offers every grade, e.g. F1/F2 have no PreK — so nothing may assume a fixed grade set; the schema already provisions for this via per-session `classes` rows.)*

### User story
As the **System** (on behalf of the volunteer maintainers), I want the synthetic pilot dataset to be a **reusable, `tests.*`-free artifact** that loads identically on **local dev** and **cloud staging**, shaped like the **real F3 session**, so that the same realistic data powers local tests + persona UI *and* the #65 cloud staging seed — without the laptop-only auth-user factory that can't run in the cloud.

### Acceptance criteria
1. **`tests.*`-free domain dataset.** The synthetic domain data contains **no `tests.*` calls**, so it can load into a cloud project that has no fixture surface (post-#89).
2. **Loads in both places, authored once.** The same dataset artifact is loaded by local `supabase db reset` (config.toml seed path) **and** is consumable by the #65 cloud loader (`scripts/seed-staging.mjs` → `applyDomainData`). No second copy.
3. **Real F3 shape — 6 class rows** (5 running combined classes + 1 kept-empty 10–12), matching the actual attendance sheet, names mirroring the sheet:
   - F3 Pre-K → **PreK**
   - F3 KG, 1st & 2nd → **KG, 1, 2**
   - F3 3rd & 4th → **3, 4**
   - F3 5th & 6th → **5, 6**
   - F3 7th, 8th & 9th → **7, 8, 9**
   - F3 10th, 11th & 12th → **10, 11, 12**
4. **The 10–12 class is deliberately empty** (0 enrollments) — a real, realistic edge case (the sheet has it; registration is 0). Dashboards/queries must handle a 0-enrollment class gracefully.
5. **Grade coverage** — students span PreK, KG, and grades 1–9 (the 10–12 class stays empty); each student's `grade_level` is set and each is enrolled in the class whose grade range contains their grade.
6. **Realistic families/enrollments** — multiple families incl. multi-guardian + multi-child households (ADR-0018), students distributed across the 5 populated classes.
7. **Demo-ready variety preserved** — attendance + class updates still produce a deliberate mix of compliant / partial / non-compliant classes (keep the current compliance-dashboard demo value), derived from `class_meetings` (not a hardcoded calendar).
8. **No schema/migration change** — data only; tables + RLS unchanged. (A combined-class label fits `classes.grade_band` as a single text value; no new column — to be confirmed at `/architect`.)
9. **Entirely synthetic — no real member data, ever** (non-negotiables #5/#6). PreK is what was called "Shishu Vihaar"; the app/data uses **PreK**.

### Edge cases
- **Empty top class** (10–12, 0 enrollments) — the point of including it; verify nothing assumes every class has students.
- **Account-linked rows** — some domain rows reference auth users (`students.user_id`, `family_members.user_id`, `attendance.marked_by`, `class_updates.posted_by`, `consents.granted_by`, `user_roles`). The reusable "pure data" cannot create these without accounts → the split between *account-free data* and *account-linked rows* is the key design question (see Open question).
- **Local vs cloud accounts differ** — local uses `tests.create_supabase_user`; cloud uses the Auth Admin API (#65). The dataset must assume neither.
- **Combined classes are per-year** — this 6-class combination is **2026–27 only**; it depends on registration and how **program leadership** splits classes + assigns curriculum each year. The seed is a *snapshot* — nothing may hard-code these groupings as permanent.
- **Grade → class mapping** for combined classes (e.g., a Grade 1 student belongs to the "KG, 1, 2" class).
- **Which students get an app login** (older grades) — a rule to preserve; interacts with the now-empty top class.

### Priority
**POC-core (test data).** Blocks **#65** AC#5/#6 (staging seed), and underpins RLS/adversarial tests + every persona UI. Independent — startable now (no other in-flight blocker).

### Consumers
All dev/test: local `db reset`, CI/pgTAP + RLS-adversarial, every persona UI, **and #65 cloud staging**. Owned by **System**.

### Access scope
N/A — data authoring / infra, not a runtime access feature. Loaded as local superuser (local) or service-role (cloud, via #65); **RLS unchanged** — runtime access stays gated by existing policies.

### Out of scope
- **Curriculum per class** — real (the sheet assigns curriculum), but the POC data model has no curriculum field. Flag as a possible future attribute; **not** added here.
- **Per-year class re-combination logic / the "who splits the classes" surface** — that's the separate **class-config** concern (answer: **program leadership, per year, per registration**). #19 only snapshots this year.
- **Cloud account provisioning** (Auth Admin API) — that's **#65**.
- **Populating other centers/sessions** — the catalog names (Saaket, Chitrakoot, F1/F2, …) stay as names only; only F3 is fully populated.

### Resolved at `/architect` (2026-09-14) — the #19 ↔ #65 seam
Decided via [ADR-2026-09-14-synthetic-seed-shared-data-per-env-accounts](../../adr/2026-09-14-synthetic-seed-shared-data-per-env-accounts.md) (**Option A**): the reusable, `tests.*`-free shared file holds only **account-free** rows (centers, session, classes, families, students-without-login, enrollments); each environment creates its **own accounts** and the **account-linked rows** (role grants, `students.user_id`, `family_members`, `attendance`, `class_updates`, `consents`) on top — local via `tests.*`, cloud via #65's Auth Admin path. No schema change (Option B was blocked by `class_updates.posted_by NOT NULL`). Account-linked demo activity is generated per-environment (local keeps the rich compliance variety; cloud gets a sufficient subset). `/design` details the shared file's exact contents + the per-environment layering.

---

## Design (detailed spec)

> `/design` 2026-09-15. **Non-UI, data-only item** — no screen, so the Open-Design/UI step is **N/A** (stated, not skipped). Design turns the Option-A seam (above) into the concrete file split + the exact F3 dataset.

### A. The shared file — `supabase/seed/domain.sql` (account-free, `tests.*`-free)
Loaded **identically** by local `db reset` (via `config.toml`) and by #65's cloud loader. Contains **only rows that reference no auth user**:

1. **Center** — `Frisco`.
2. **Session** — `F3` (ADR-0031 schedule: Sundays, `day_of_week=0`, 14:00–15:30, `2026-01-11`→`2026-05-24`).
3. **The 6 F3 classes** (names mirror the real attendance sheet; `grade_band` = the combined label). Inserting each class fires ADR-0038's `classes_generate_class_meetings` trigger → `class_meetings` auto-populate (also account-free):

   | class `name` | `grade_band` | grades placed here | students |
   |---|---|---|---|
   | F3 Pre-K | `PreK` | PreK | 3 |
   | F3 KG, 1st & 2nd | `KG, 1, 2` | KG, 1, 2 | 9 |
   | F3 3rd & 4th | `3, 4` | 3, 4 | 6 |
   | F3 5th & 6th | `5, 6` | 5, 6 | 6 |
   | F3 7th, 8th & 9th | `7, 8, 9` | 7, 8, 9 | 9 |
   | F3 10th, 11th & 12th | `10, 11, 12` | 10, 11, 12 | **0 (empty)** |

4. **Families** — ~20 households (about a third multi-child; a few multi-guardian — modeled once accounts exist, see §B; the `families` rows themselves are account-free).
5. **Students** — **~33 total**, roughly **3 per grade level** (PreK, KG, 1–9), `user_id` **null** here; each `grade_level` set and each enrolled in the class whose `grade_band` contains its grade (grade→class map above). The 10–12 class gets **no students**.
6. **Enrollments** — one active enrollment per student in their class (`status='active'`, `enrolled_at` = the session `start_date`, per the existing seed's compliance-window reasoning).
7. **Real center/session catalog** (names + schedule only, non-PII, doc 1 §9a) — the other centers/sessions (Saaket, Chitrakoot, F1, F2, S1, S2, S4, C1, C2) as **names only, unpopulated** (only F3 is fully populated).

### B. Per-environment layer — accounts + account-linked rows (NOT in the shared file)
After `domain.sql` loads, each environment creates its **own accounts** and the rows that reference them. **Local `seed.sql`** (refactored to run *after* `domain.sql`) does this via `tests.create_supabase_user`; **cloud #65** does it via the Auth Admin API (its own concern):

- **Teacher** per class (6) → `user_roles(teacher, class, <class_id>)`.
- **Student logins** — **general rule: grade 9+ gets a login**; **pilot exception (per issue owner, this year): the whole `F3 7th, 8th & 9th` class gets logins** (all 9), so the student experience is demoable/pilotable. Set `students.user_id` for those; `user_roles(student, org, null)` (self-scope resolves via `students.user_id`). (Effectively 9 student logins, since 10–12 is empty.)
- **Parents/guardians** → `family_members(family_id, user_id, 'guardian')` + `user_roles(parent, org, null)`; some families multi-guardian.
- **Coordinator** (session), **bv_coordinator** (org), **admin** (org), and one **multi-role** account (parent+teacher+coordinator+bv_coordinator) — mirroring today's seed.
- **Attendance + class_updates (demo variety, LOCAL)** — keep the existing deliberate mix of compliant / partial / non-compliant across the 5 populated classes (derived from `class_meetings`, not a hardcoded calendar); `marked_by`/`posted_by` = the class's teacher. **Cloud gets a lighter subset (#65's call), not byte-identical** (ADR trade-off).
- **Consents** — per student: `participation=true`, `media` varied; `granted_by` = a guardian in the family.

### C. Load-order wiring
`config.toml` `sql_paths` becomes: `["./seed/00_test_fixtures.sql", "./seed/domain.sql", "./seed/seed.sql"]` — fixtures (the `tests.*` factory) → shared account-free data → local accounts + linked rows. #65's loader path constant (`scripts/seed-staging.mjs` `DOMAIN_SQL_PATH`) updates to `supabase/seed/domain.sql`.

### Data & RLS impact
**No schema/migration change** — `domain.sql` writes existing tables only; a combined-class label fits `classes.grade_band` (single text). **RLS unchanged** — loaded privileged (local superuser / cloud service-role), but *runtime* access stays gated by existing policies. **Entirely synthetic** — no real member data, ever (non-negotiables #5/#6). `students.user_id`, `attendance.marked_by`, `consents.granted_by` are nullable (safe to omit in `domain.sql`); `class_updates.posted_by` is NOT NULL → class_updates live only in the account layer (§B), never in `domain.sql`.

### UI
**N/A** — data-only; no screen, component, or Open-Design reference. Stated explicitly per the `/design` checklist.

### Edge cases
- **Empty 10–12 class** — the class row exists with 0 enrollments; nothing may assume every class has students (the point of including it).
- **Account-linked ordering** — accounts must exist before §B rows; `domain.sql` must not reference any auth user.
- **Idempotency/reset** — `domain.sql` assumes a freshly-reset schema (local `db reset` drops+recreates; #65 `--reset` wipes first). It need not guard against a dirty DB beyond that assumption (noted for `/plan`).
- **Grade→class mapping** is the single source of which class a student joins; keep it in one place so a grade can't land in two classes.
- **Per-session grade composition varies** — not every session offers every grade (e.g. F1/F2 have no PreK), and a session may add a grade later. Nothing (query, test, seed) may assume a fixed grade set or that "every session has PreK." The schema already provisions for this (classes are per-session rows); #19 populates **F3 only** (which does have PreK) and leaves other sessions as names-only.
- **Login-eligibility** interacts with the empty top class — with 10–12 empty, the pilot exception on the 7-8-9 class is what yields any student logins.

### Out of scope
- **Curriculum per class** (the POC's syllabus dataset) — no schema field; future.
- **Cloud account provisioning** (Auth Admin API) — **#65**.
- **Per-year re-combination logic / who splits classes** — the class-config concern (program leadership, per registration); #19 snapshots this year only.
- **Populating non-F3 sessions** — catalog names only.

### Handoff
No `/migration` (no schema change). → **`/plan`**: tasks for authoring `domain.sql` (TDD — row-count/shape assertions), refactoring `seed.sql` to build on it, the `config.toml` + `DOMAIN_SQL_PATH` wiring, and updating the affected pgTAP/RLS fixtures to the new 6-class shape.
