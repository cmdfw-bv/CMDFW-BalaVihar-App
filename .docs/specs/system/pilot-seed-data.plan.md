# System — pilot-seed-data — plan

> `/plan` 2026-09-15. Turns the [Design section](pilot-seed-data.md) into ordered, test-first tasks.
> **Stage:** `/refine` ✓ `/architect` ✓ (ADR-2026-09-14, Option A) `/design` ✓ `/plan` (this) → **`/migration` N/A** (no schema change) → `/build` → verify.
> **Spec:** [pilot-seed-data.md](pilot-seed-data.md) · **Governing ADR:** [ADR-2026-09-14-synthetic-seed-shared-data-per-env-accounts](../../adr/2026-09-14-synthetic-seed-shared-data-per-env-accounts.md)

**Goal:** split the synthetic seed into a reusable, `tests.*`-free `domain.sql` (account-free structure, loaded identically local + cloud) plus the existing local account layer, and reshape it to the real F3 (6 class rows: 5 running PreK–9 + empty 10–12).

**Architecture:** Per the governing ADR (Option A): `supabase/seed/domain.sql` holds only rows that reference no auth user (centers, session, classes, families, students-without-login, enrollments). `seed.sql` is refactored to run *after* it and add accounts (`tests.*`) + account-linked rows. `config.toml` loads them in order. #65's cloud loader consumes the same `domain.sql`. **No schema/RLS/migration change.**

**Tech stack:** Postgres SQL (Supabase seed files), pgTAP tests (`supabase/tests/`), `supabase db reset` / `supabase test db`.

## Global constraints (from the spec)
- **Entirely synthetic** — no real member data, ever (non-negotiables #5/#6).
- **`domain.sql` contains NO `tests.*` calls** and **no row referencing `auth.users`** (`class_updates.posted_by` is NOT NULL → class_updates live only in the account layer).
- **No schema/RLS change** — existing tables only; combined-class label fits `classes.grade_band` (single text).
- **Real F3 shape:** 6 class rows — PreK · KG,1,2 · 3,4 · 5,6 · 7,8,9 (running) + 10,11,12 (**empty**); ~33 students (~3/grade, PreK–9); ~20 families.
- **Login rule:** general Gr9+; **pilot exception — all of the `7,8,9` class get logins** (≈9 student logins).
- **Grade tokens (decision, see Flagged):** the seed uses the **real** tokens (`PreK`, `KG`, `1`–`12`) + real combined class names; this diverges from `csv-parse.ts`'s `VALID_GRADE_BANDS` — tracked separately, out of scope here.

## Shared seam (§12.6)
- **No schema side** — zero migrations; nothing serializes against other in-flight schema work.
- **Files:** `supabase/seed/domain.sql` (new), `supabase/seed/seed.sql` (refactor), `supabase/config.toml` (load order), `scripts/seed-staging.mjs` (`DOMAIN_SQL_PATH` constant → `supabase/seed/domain.sql`), plus `supabase/tests/107_domain_seed_shape.sql` (new).
- **Interplay with #65 (same owner, same branch):** #65's loader (`applyDomainData`) consumes this `domain.sql` — #19 must land it before #65's data step can run. Both currently live on `arunasharad-coder/issue-65-staging-deploy-verification`.
- **Branch decision (flag for human):** either (a) keep #19 on the #65 branch and ship both in one PR, or (b) split #19 onto its own branch off `main` so it merges first and #65 rebases onto merged #19. Recommend (b) for cleaner review, but it needs branch surgery (the #19 refine/architect/design commits are already on the #65 branch) — **confirm with the owner before `/build`.**

---

## Build tasks (TDD — tests first)

### Task 1 — `supabase/seed/domain.sql` (account-free shared dataset) + shape test
**Files:**
- Create: `supabase/seed/domain.sql`
- Create (test): `supabase/tests/107_domain_seed_shape.sql`
- Modify: `supabase/config.toml` (sql_paths), `scripts/seed-staging.mjs:~26` (`DOMAIN_SQL_PATH`)

**Interfaces:**
- Produces: a loaded dataset — 1 `centers` row `Frisco`; 1 `sessions` row `F3`; 6 `classes` rows under F3 with `grade_band` ∈ {`PreK`,`KG, 1, 2`,`3, 4`,`5, 6`,`7, 8, 9`,`10, 11, 12`}; `families`; `students` (with `grade_level` ∈ {`PreK`,`KG`,`1`..`9`}, `user_id` NULL); `enrollments`; catalog `sessions` for other centers (names only).

- [ ] **Step 1 — Write the failing shape test** `supabase/tests/107_domain_seed_shape.sql`. Assert against the seeded DB:
  ```sql
  begin; select plan(7);
  select is((select count(*) from centers where name='Frisco')::int, 1, 'Frisco center seeded');
  select is((select count(*) from classes c join sessions s on s.id=c.session_id where s.name='F3')::int, 6, 'F3 has 6 class rows');
  select is((select count(*) from classes c join sessions s on s.id=c.session_id
             where s.name='F3' and c.grade_band='10, 11, 12')::int, 1, 'the empty 10-12 class row exists');
  select is((select count(*) from enrollments e join classes c on c.id=e.class_id
             join sessions s on s.id=c.session_id where s.name='F3' and c.grade_band='10, 11, 12')::int,
            0, '10-12 class has zero enrollments');
  select ok((select count(*) from students st
             join enrollments e on e.student_id=st.id
             join classes c on c.id=e.class_id join sessions s on s.id=c.session_id
             where s.name='F3') between 28 and 40, 'F3 has ~33 enrolled students');
  select ok((select count(distinct grade_band) from classes c join sessions s on s.id=c.session_id
             where s.name='F3') = 6, 'six distinct F3 class labels');
  select is((select count(*) from students where grade_level='KG')::int > 0, true, 'KG grade is represented (old seed skipped it)');
  select * from finish(); rollback;
  ```
- [ ] **Step 2 — Run it, watch it FAIL** against the current seed (13 individual classes, no KG, no F3 grade_band='10, 11, 12'):
  `supabase test db` → expect `107` failing on the 6-class / empty-10-12 / KG assertions.
- [ ] **Step 3 — Author `domain.sql`** — the account-free rows only: `Frisco`; `F3` (ADR-0031 schedule); the 6 classes (names mirror the attendance sheet, `grade_band` the combined label); ~20 `families`; ~33 `students` (`grade_level` set per §A grade→class map, `user_id` NULL, none in 10–12); one active `enrollment` per student; the other centers/sessions as **names only**. **No `tests.*`, nothing referencing `auth.users`.** (Class inserts fire the ADR-0038 trigger → `class_meetings` auto-populate.)
- [ ] **Step 4 — Wire load order** — `config.toml` `sql_paths = ["./seed/00_test_fixtures.sql", "./seed/domain.sql", "./seed/seed.sql"]`; set `scripts/seed-staging.mjs` `DOMAIN_SQL_PATH = 'supabase/seed/domain.sql'`. **Temporarily** guard `seed.sql`'s now-duplicated domain block (comment it out) so `db reset` doesn't double-insert before Task 2 lands. *(This keeps the tree runnable between tasks.)*
- [ ] **Step 5 — Run it, watch `107` PASS** (`supabase test db`), and `supabase db reset` completes clean.
- [ ] **Step 6 — Commit** `feat(#19): domain.sql — account-free F3 dataset (6 rows, real shape) + shape test`.

### Task 2 — Refactor `supabase/seed/seed.sql` to build on `domain.sql`
**Files:**
- Modify: `supabase/seed/seed.sql`
- Create (test): `supabase/tests/108_seed_pilot_logins.sql`

**Interfaces:**
- Consumes: the `domain.sql` rows (queries F3 classes by `grade_band`, students by enrollment) to attach accounts/roles.
- Produces: accounts + `user_roles`, `family_members`, `students.user_id`, `attendance`, `class_updates`, `consents` on top of `domain.sql`.

- [ ] **Step 1 — Write the failing pilot-login test** `108_seed_pilot_logins.sql`:
  ```sql
  begin; select plan(2);
  -- every student in the F3 "7, 8, 9" class has a login + student role (the pilot exception)
  select is((select count(*) from students st
             join enrollments e on e.student_id=st.id
             join classes c on c.id=e.class_id join sessions s on s.id=c.session_id
             where s.name='F3' and c.grade_band='7, 8, 9' and st.user_id is null)::int,
            0, 'all 7-8-9 students have a login (pilot exception)');
  select ok((select count(*) from students st
             join user_roles ur on ur.user_id=st.user_id and ur.role='student'
             join enrollments e on e.student_id=st.id
             join classes c on c.id=e.class_id join sessions s on s.id=c.session_id
             where s.name='F3' and c.grade_band='7, 8, 9') >= 1, '7-8-9 students have a student role');
  select * from finish(); rollback;
  ```
- [ ] **Step 2 — Run it, watch it FAIL** (`108` fails: current seed has no F3 `7, 8, 9` class).
- [ ] **Step 3 — Refactor `seed.sql`** — **remove** the domain-data creation (now in `domain.sql`); keep/rework the **account layer**, querying `domain.sql`'s rows: teacher per F3 class; **student logins for all `7, 8, 9` students** (pilot exception) + general Gr9+ (moot — 10-12 empty), setting `students.user_id` + `user_roles(student, org, null)`; parents/guardians (`family_members` + `user_roles(parent, org, null)`, some multi-guardian); coordinator/bv_coordinator/admin + the multirole account; attendance + class_updates demo variety across the 5 populated classes (`marked_by`/`posted_by` = the class teacher); consents per student.
- [ ] **Step 4 — Run tests, watch `107` + `108` PASS**, and re-run the two seed-reading tests `106_seed_student_roles` + `090_multi_role_isolation` — both must stay green (count/existence-based; the multirole account is retained).
- [ ] **Step 5 — Commit** `feat(#19): refactor seed.sql onto domain.sql — accounts + F3 7-8-9 pilot logins`.

### Task 3 — Full-suite verification + ripple fixes
**Files:** (fixes only where a test genuinely broke)
- [ ] **Step 1 — `supabase test db`** (full pgTAP). Expect green. The only seed-readers are `090`/`106` (Task 2 confirmed); all other test files use their own fixtures, so they should be unaffected.
- [ ] **Step 2 — `npm test`** (vitest) + `npm run typecheck`. `childAttendanceStats.test.ts` uses mock data (not the seed) → unaffected; confirm.
- [ ] **Step 3 — Local smoke** — `supabase db reset` clean; sign in as a `7,8,9` student, a teacher, coordinator, and the multirole account (Mailpit) → each lands on the right home; the empty 10-12 class renders without error where classes list.
- [ ] **Step 4 — If anything broke**, fix the specific test/seed line (no blanket changes); re-run from Step 1.
- [ ] **Step 5 — Commit** `test(#19): full suite green on the reshaped seed`.

---

## Flagged (surfaced at `/plan` — needs a human call, not a `/build` blocker)
- **App grade-vocabulary is out of sync with reality.** `csv-parse.ts` `VALID_GRADE_BANDS` = `Shishu Vihaar` + `Gr1`–`Gr12` (no `KG`, no `PreK`, no combined labels); `HS_GRADE_BANDS` = `Gr9`–`Gr12`. The real structure (PreK, KG, combined classes) can't be represented or csv-imported today. #19's seed uses the **real** tokens directly (self-consistent, DB has no CHECK on `grade_level`/`grade_band`), but **reconciling the app vocabulary (add PreK/KG, support combined-class import/HS-gating) is out of scope** → **filed as #93** (grade vocabulary + combined-class CSV import; the hard part is `db-ops.ts` class resolution). Not a #19 blocker.
- **Branch decision** (see Shared seam) — confirm (a) one PR with #65 vs (b) split #19 to its own branch.

## Not in this plan
- Cloud account provisioning + the cloud activity subset — **#65**.
- Curriculum/syllabus, per-year re-combination, populating non-F3 sessions — out of scope (spec).
- Fixing the csv grade-vocabulary — the flagged follow-up above.

## Handoff
No `/migration` (no schema change). Pre-build: (1) **branch decision** — owner chose **split #19 to its own branch** off `main` (merges first; #65 rebases onto it later); (2) grade-vocabulary follow-up **filed as #93**. Then `/build` Tasks 1→3. `/test` records the gate marker after the suite is green.
