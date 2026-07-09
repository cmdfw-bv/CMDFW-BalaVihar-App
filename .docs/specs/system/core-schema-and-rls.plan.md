# Core schema & RLS foundation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** [core-schema-and-rls.md](core-schema-and-rls.md) (Design signed off 2026-07-08; ADR-0018, ADR-0019).

**Goal:** Ship the full §6.2 table set — operational core, `user_roles`, `consents`, `audit_log` + ADR-0019 staff RPCs, `push_subscriptions`, chat durability tables, retention fields — as timestamped migrations with RLS proven by an adversarial pgTAP suite using **simulated** JWT claims, plus a synthetic seed, so every later persona/System item has real, access-controlled tables to build against.

**Architecture:** Pure data-layer item — no app code, no auth hook. Every table ships RLS-**on** from the same migration that creates it (never a window where a table exists unprotected). Minors'-record reads (`students`/`attendance`/`consents`) are split per ADR-0019: Parent/Student get plain RLS `select`; Teacher/Coordinator/BV Coordinator/Admin get **zero rows** from direct `select` and must go through four `SECURITY DEFINER` RPCs that scope-check and audit atomically. Chat membership (`conversation_participants`) is **trigger-maintained only** — no client insert/update/delete path exists on `conversations` or `conversation_participants`, which is what makes "no open student-to-student DM" a structural guarantee rather than a policy someone could get wrong.

**Tech Stack:** Supabase CLI (Postgres 17 locally) · pgTAP (`extensions.pgtap`) · plain SQL/PL-pgSQL (no Deno, no app-layer logic) · `pg_prove` via `supabase test db`.

## Global Constraints

- **Migrations are the only path** (constitution #3, doc 3 §6.1): every table/policy/function below lands as a `supabase migration new <name>` file in `supabase/migrations/`. Nothing hand-applied via Studio. The CLI stamps each file with the real timestamp at creation time — this plan refers to files by their descriptive suffix (e.g. `core_operational_schema.sql`); the actual filename is `<YYYYMMDDHHMMSS>_core_operational_schema.sql`.
- **RLS-on-every-table, no exceptions** (constitution #1, doc 3 §11.1): every `create table` step in this plan is immediately followed, in the same migration, by `alter table ... enable row level security;` — never a separate later migration.
- **This project's Supabase CLI does NOT auto-expose new tables** (`api.auto_expose_new_tables` is unset in `supabase/config.toml`, matching the new default). This means a bare `create table` + RLS is invisible to `authenticated`/`anon` until you **explicitly `grant`** the relevant privilege — RLS then narrows what a granted role can see/touch. Every task below grants exactly the privilege each role needs and nothing more (e.g. `students`/`attendance`/`consents` grant `select` to `authenticated` broadly, then RLS narrows staff roles to zero rows since no staff policy exists — that's the ADR-0019 mechanism, not an oversight).
- **Simulated claims, not the real hook** (per spec decision + rls-patterns skill): every RLS policy reads `auth.jwt()->>'active_role'`, `'scope_type'`, `'scope_id'` exactly as the future auth hook will stamp them (§5.2). Tests simulate these via a `tests.authenticate_as(...)` helper (Task 1) that sets the `request.jwt.claims` GUC directly — no real token issuance. **No policy should need to change** when the real hook lands later; only the claims source changes.
- **Parent/Student scope is NOT `scope_id`-based.** `user_roles.scope_type` is only `{org,center,session,class}` — Parent's "own-children" and Student's "self" scopes resolve via `family_members`/`students.user_id` joins, not via a JWT `scope_id`. Every Parent/Student policy below still gates on `active_role` (so multi-role users are correctly isolated per simulated role — pgTAP test plan #5), but the actual scope predicate is a join, not a `scope_id` comparison.
- **TDD, adapted for schema (constitution #4):** for every RLS-bearing table, the migration that creates the table enables RLS **with zero policies** first (default-deny for everyone but the table owner). The pgTAP test for that table is then run and **must show the positive-access cases failing (RED)** before the policy migration is written — this is the literal "write the test, watch it fail" step, made possible because default-deny RLS is a real, verifiable failure state, not a stand-in for one.
- **No table-level grant ever substitutes for an RLS policy.** Every `grant select on X to authenticated` in this plan is paired with row-scoping policies in the same or the very next step — a bare grant with no policy would mean "authenticated sees zero rows" (safe but not the AC), never "sees everything" (never acceptable here).
- **Minors'-record RPCs (ADR-0019) are the only staff read path** for `students`/`attendance`/`consents`. Direct `select` for Teacher/Coordinator/BV Coordinator/Admin on those three tables must return **zero rows, not an error** — enforced by the *absence* of a matching policy, never by an explicit deny/raise.
- **Synthetic data only, everywhere** (constitution #6, AC #10): `supabase/seed/seed.sql` and every pgTAP fixture generate fictional people (`*.test.local` emails, invented names). No real program-member data in any migration, seed, or test file, ever.
- **Branch/worktree (§12.6):** this item is **100% migrations** — it *is* the serialized seam, not a parallel feature unit. Do it directly on `shree/greenfield-dev` (current), the same way `repository-bootstrap` was done, and merge to `main` before persona feature UoWs start branching off `supabase/migrations/`.
- **Out of scope here** (carried from the spec, unchanged): the Postgres Custom Access Token Hook / magic-link wiring / active-role switch; CSV import mechanism; push-send delivery + SES; Realtime broadcast wiring; the retention **job**; the `user_roles` approval workflow (privileged Netlify function). This item only ships the schema/RLS/RPCs those later items sit on.

**Resolved deferred mechanics (this pass's judgment calls — spec left them for `/plan`/`/migration`):**
1. **`families`/`family_members` direct-read scope.** The spec's RLS matrix doesn't list these two tables explicitly. Resolved: Parent reads their own family + its members; Student reads their own family + its members (read-only); BV Coordinator/Admin read org-wide (household administration); Teacher/Coordinator get **no direct read** on `families`/`family_members` — their teaching/session duties don't need guardian PII, and `get_student_for_staff` already surfaces what a staff role needs about a student without exposing the whole household.
2. **Chat auto-population trigger behavior** (spec flags this as "in scope here (data integrity)" but doesn't fully spec the trigger). Resolved: a `classes` insert auto-creates its `'class'` conversation; a `sessions` insert auto-creates its `'session_staff'` conversation; a single `'leadership'` (org-scope) conversation is created once by migration. An `enrollments` insert/status-change trigger adds/removes the enrolled student (**only if** `students.user_id` is set — KG–Gr8 students have no login and can't be chat participants) and all of that student's family's guardians (`participant_role='parent'`) as participants of the class conversation, removing a guardian only when they have no *other* active enrollment in the same class. A `user_roles` insert/delete trigger adds/removes Teacher→class conversation, Coordinator→session_staff conversation, BV Coordinator/Admin→leadership conversation.
3. **`audit_log` SELECT policy** (doc 3 §11.2 says "admin/coordinator read-scoped" but doesn't give the predicate). Resolved: BV Coordinator/Admin read all rows (org). Coordinator reads rows where either `target_student_id`'s current enrollment session matches their scope, or (for `'denied'` rows with no student target) `target_table='classes'` and the class belongs to their session. Teacher gets no `audit_log` read access (not a documented Teacher capability in doc 2).

---

### Task 1: pgTAP harness — extension, simulated-claims helper, test-user helper

**Files:**
- Create: `supabase/migrations/<ts>_enable_pgtap_and_test_helpers.sql`
- Create: `supabase/tests/000_pgtap_smoke.sql`

**Interfaces:**
- Produces: `tests.authenticate_as(p_user_id uuid, p_role text, p_scope_type text default null, p_scope_id uuid default null)`, `tests.clear_authentication()`, `tests.create_supabase_user(p_email text) returns uuid` — every later test file in this plan calls these three functions and nothing else to simulate a role.

- [ ] **Step 1: Create the migration file**
```bash
cd /Users/shree/Documents/claude-code/CMDFW-BalaVihar---Pilot-App
npx supabase migration new enable_pgtap_and_test_helpers
```
Expected: a new `supabase/migrations/<ts>_enable_pgtap_and_test_helpers.sql` (empty).

- [ ] **Step 2: Write the migration**
```sql
-- pgTAP for adversarial RLS testing (§11.3)
create extension if not exists pgtap with schema extensions;

-- Test-only schema. Not in supabase/config.toml's api.schemas, so never exposed
-- via the Data API. Execute is additionally revoked from anon/authenticated below
-- as defense-in-depth (these functions can fabricate JWT claims / auth.users rows).
create schema if not exists tests;

create or replace function tests.authenticate_as(
  p_user_id uuid,
  p_role text,
  p_scope_type text default null,
  p_scope_id uuid default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform set_config('request.jwt.claims', json_build_object(
    'sub', p_user_id::text,
    'role', 'authenticated',
    'active_role', p_role,
    'scope_type', p_scope_type,
    'scope_id', p_scope_id::text
  )::text, true);
  perform set_config('role', 'authenticated', true);
end;
$$;

create or replace function tests.clear_authentication() returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform set_config('request.jwt.claims', '', true);
  execute 'reset role';
end;
$$;

create or replace function tests.create_supabase_user(p_email text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid := gen_random_uuid();
begin
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at, confirmation_token, email_change,
    email_change_token_new, recovery_token
  ) values (
    '00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated',
    p_email, '$2a$10$test.fixture.password.hash.only',
    now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
    now(), now(), '', '', '', ''
  );
  return v_id;
end;
$$;

revoke execute on function tests.authenticate_as(uuid, text, text, uuid) from public, anon, authenticated;
revoke execute on function tests.clear_authentication() from public, anon, authenticated;
revoke execute on function tests.create_supabase_user(text) from public, anon, authenticated;
```

- [ ] **Step 3: Apply locally**
```bash
npx supabase db reset
```
Expected: migration applies cleanly (no other migrations yet).

- [ ] **Step 4: Write the smoke test** `supabase/tests/000_pgtap_smoke.sql`
```sql
begin;
select plan(3);

select tests.create_supabase_user('smoke1@test.local') as v_user \gset

select tests.authenticate_as(:'v_user'::uuid, 'teacher', 'class', gen_random_uuid());

select is(auth.jwt()->>'active_role', 'teacher', 'authenticate_as sets active_role');
select is(auth.jwt()->>'sub', :'v_user', 'authenticate_as sets sub to the given user id');
select is(current_setting('role'), 'authenticated', 'authenticate_as switches to the authenticated role');

select tests.clear_authentication();

select * from finish();
rollback;
```

- [ ] **Step 5: Run it**
```bash
npx supabase test db
```
Expected: `000_pgtap_smoke.sql` — 3/3 passing.

- [ ] **Step 6: Commit**
```bash
git add supabase/migrations supabase/tests/000_pgtap_smoke.sql
git commit -m "feat: pgTAP harness + simulated-claims test helpers"
```

---

### Task 2: Operational core schema — DDL, default-deny RLS, RED test

**Files:**
- Create: `supabase/migrations/<ts>_core_operational_schema.sql`
- Create: `supabase/tests/010_operational_core_rls.sql`

**Interfaces:**
- Produces: `centers(id,name,created_at)`, `sessions(id,center_id,name,start_date,end_date,created_at)`, `classes(id,session_id,name,grade_band,created_at)`, `families(id,label,created_at)`, `family_members(id,family_id,user_id,relationship,created_at)`, `students(id,family_id,first_name,last_name,grade_level,external_member_id,user_id,created_at)`, `enrollments(id,student_id,class_id,session_id,status,enrolled_at)`, `attendance(id,enrollment_id,class_meeting_date,status,marked_by,submitted_at)`.

- [ ] **Step 1: Create the migration file**
```bash
npx supabase migration new core_operational_schema
```

- [ ] **Step 2: Write the DDL + grants + RLS-enable (no policies yet)**
```sql
create table if not exists centers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists sessions (
  id uuid primary key default gen_random_uuid(),
  center_id uuid not null references centers(id) on delete restrict,
  name text not null,
  start_date date not null,
  end_date date not null,
  created_at timestamptz not null default now()
);

create table if not exists classes (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions(id) on delete restrict,
  name text not null,
  grade_band text not null,
  created_at timestamptz not null default now()
);

create table if not exists families (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  created_at timestamptz not null default now()
);

create table if not exists family_members (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  relationship text not null,
  created_at timestamptz not null default now(),
  unique (family_id, user_id)
);

create table if not exists students (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete restrict,
  first_name text not null,
  last_name text not null,
  grade_level text not null,
  external_member_id text,
  user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists enrollments (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students(id) on delete restrict,
  class_id uuid not null references classes(id) on delete restrict,
  session_id uuid not null references sessions(id) on delete restrict,
  status text not null default 'active' check (status in ('active','withdrawn')),
  enrolled_at timestamptz not null default now()
);

create unique index if not exists enrollments_one_active_per_session
  on enrollments (student_id, session_id)
  where status = 'active';

create table if not exists attendance (
  id uuid primary key default gen_random_uuid(),
  enrollment_id uuid not null references enrollments(id) on delete cascade,
  class_meeting_date date not null,
  status text not null check (status in ('present','absent')),
  marked_by uuid references auth.users(id) on delete set null,
  submitted_at timestamptz not null default now(),
  unique (enrollment_id, class_meeting_date)
);

alter table centers enable row level security;
alter table sessions enable row level security;
alter table classes enable row level security;
alter table families enable row level security;
alter table family_members enable row level security;
alter table students enable row level security;
alter table enrollments enable row level security;
alter table attendance enable row level security;

-- Baseline grants (this CLI does not auto-expose new tables). RLS (next task)
-- does the actual scoping; these grants only make each table reachable at all.
grant select on centers, sessions, classes to authenticated;
grant select on families, family_members to authenticated;
grant select on students to authenticated;
grant select on enrollments to authenticated;
grant select, insert, update on attendance to authenticated;
```

- [ ] **Step 3: Apply locally**
```bash
npx supabase db reset
```
Expected: all 8 tables created; `\d+ students` (via `npx supabase db psql` or Studio) shows `rowsecurity = t` and zero policies.

- [ ] **Step 4: Write the adversarial pgTAP test (positive + negative + join-path + uniqueness)**

`supabase/tests/010_operational_core_rls.sql`:
```sql
begin;
select plan(14);

-- Fixture: 2 centers so cross-scope leakage has somewhere real to leak from.
insert into centers (id, name) values
  ('11111111-1111-1111-1111-111111111111', 'Center A'),
  ('22222222-2222-2222-2222-222222222222', 'Center B');

insert into sessions (id, center_id, name, start_date, end_date) values
  ('a1111111-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'A-Session-1', '2026-01-01', '2026-06-01'),
  ('a1111111-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'A-Session-2', '2026-01-01', '2026-06-01'),
  ('b2222222-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'B-Session-1', '2026-01-01', '2026-06-01');

insert into classes (id, session_id, name, grade_band) values
  ('c1111111-0000-0000-0000-000000000001', 'a1111111-0000-0000-0000-000000000001', 'A1 Grade3', 'Grade3'),
  ('c1111111-0000-0000-0000-000000000002', 'a1111111-0000-0000-0000-000000000002', 'A2 Grade5', 'Grade5'),
  ('c2222222-0000-0000-0000-000000000001', 'b2222222-0000-0000-0000-000000000001', 'B1 Grade3', 'Grade3');

insert into families (id, label) values
  ('fa111111-0000-0000-0000-000000000001', 'Family Alpha'),
  ('fa222222-0000-0000-0000-000000000002', 'Family Beta');

select tests.create_supabase_user('parent-alpha@test.local') as v_parent_alpha \gset
select tests.create_supabase_user('parent-beta@test.local') as v_parent_beta \gset
select tests.create_supabase_user('student-alpha@test.local') as v_student_alpha \gset
select tests.create_supabase_user('teacher-a1@test.local') as v_teacher_a1 \gset
select tests.create_supabase_user('coordinator-a@test.local') as v_coordinator_a \gset
select tests.create_supabase_user('admin-1@test.local') as v_admin \gset

insert into family_members (family_id, user_id, relationship) values
  ('fa111111-0000-0000-0000-000000000001', :'v_parent_alpha'::uuid, 'guardian'),
  ('fa222222-0000-0000-0000-000000000002', :'v_parent_beta'::uuid, 'guardian');

insert into students (id, family_id, first_name, last_name, grade_level, user_id) values
  ('5d111111-0000-0000-0000-000000000001', 'fa111111-0000-0000-0000-000000000001', 'Alpha', 'One', 'Grade3', :'v_student_alpha'::uuid),
  ('5d222222-0000-0000-0000-000000000002', 'fa222222-0000-0000-0000-000000000002', 'Beta', 'Two', 'Grade3', null);

insert into enrollments (id, student_id, class_id, session_id, status) values
  ('e0111111-0000-0000-0000-000000000001', '5d111111-0000-0000-0000-000000000001', 'c1111111-0000-0000-0000-000000000001', 'a1111111-0000-0000-0000-000000000001', 'active'),
  ('e0222222-0000-0000-0000-000000000002', '5d222222-0000-0000-0000-000000000002', 'c2222222-0000-0000-0000-000000000001', 'b2222222-0000-0000-0000-000000000001', 'active');

-- Positive: Parent sees own child's class/session/center; not the sibling center's.
select tests.authenticate_as(:'v_parent_alpha'::uuid, 'parent');
select results_eq(
  $$select id from classes order by id$$,
  $$values ('c1111111-0000-0000-0000-000000000001'::uuid)$$,
  'parent sees only their own child''s class'
);
select is(
  (select count(*) from centers)::int, 1,
  'parent sees exactly one center (their own child''s), not the sibling center'
);
select is(
  (select count(*) from families)::int, 1,
  'parent sees exactly their own family (resolved deferred mechanic #1)'
);
select is(
  (select count(*) from family_members)::int, 1,
  'parent sees exactly their own family_members row'
);

-- Positive: Student sees own class only.
select tests.authenticate_as(:'v_student_alpha'::uuid, 'student');
select is(
  (select count(*) from classes)::int, 1,
  'student sees exactly their own class'
);

-- Positive: Teacher (class scope) sees own class, not the sibling class in the same session.
select tests.authenticate_as(:'v_teacher_a1'::uuid, 'teacher', 'class', 'c1111111-0000-0000-0000-000000000001'::uuid);
select is(
  (select count(*) from classes)::int, 1,
  'teacher sees exactly their own class'
);
select is(
  (select count(*) from enrollments)::int, 1,
  'teacher sees only enrollments in their own class (join-path check)'
);

-- Positive: Coordinator (session scope) sees both classes in their session, not the sibling session's.
select tests.authenticate_as(:'v_coordinator_a'::uuid, 'coordinator', 'session', 'a1111111-0000-0000-0000-000000000001'::uuid);
select is(
  (select count(*) from classes)::int, 1,
  'coordinator sees only classes in their own session (A-Session-1 has 1 class)'
);
select ok(
  not exists (select 1 from sessions where id = 'a1111111-0000-0000-0000-000000000002'::uuid),
  'coordinator does not see a sibling session in the same center'
);

-- Positive: BV Coordinator/Admin see org-wide.
select tests.authenticate_as(:'v_admin'::uuid, 'admin', 'org', null);
select is(
  (select count(*) from centers)::int, 2,
  'admin sees all centers (org scope)'
);
select is(
  (select count(*) from classes)::int, 3,
  'admin sees all classes (org scope)'
);

-- Negative: cross-family parent leakage, including via the enrollment/student join path.
select tests.authenticate_as(:'v_parent_alpha'::uuid, 'parent');
select is(
  (select count(*) from students)::int, 1,
  'parent cannot see the other family''s student, even via the students table directly'
);

-- Negative: Teacher cannot see the sibling center's class via any join.
select tests.authenticate_as(:'v_teacher_a1'::uuid, 'teacher', 'class', 'c1111111-0000-0000-0000-000000000001'::uuid);
select ok(
  not exists (select 1 from classes where id = 'c2222222-0000-0000-0000-000000000001'::uuid),
  'teacher cannot see Center B''s class'
);

-- Enrollment uniqueness: a second ACTIVE enrollment for the same student+session fails.
select tests.clear_authentication();
select throws_ok(
  $$insert into enrollments (student_id, class_id, session_id, status)
    values ('5d111111-0000-0000-0000-000000000001', 'c1111111-0000-0000-0000-000000000002', 'a1111111-0000-0000-0000-000000000001', 'active')$$,
  '23505',
  null,
  'a second active enrollment for the same student in the same session is rejected'
);

select tests.clear_authentication();
select * from finish();
rollback;
```

- [ ] **Step 5: Run it — expect RED on the scope-positive cases**
```bash
npx supabase test db
```
Expected: the enrollment-uniqueness test (partial unique index already exists) passes; every scope-positive test (parent/student/teacher/coordinator/admin "sees own X") **fails** — RLS is enabled with zero policies, so every role sees 0 rows everywhere. This is the RED state.

- [ ] **Step 6: Write the RLS-policy migration**
```bash
npx supabase migration new core_operational_rls_policies
```
```sql
-- centers
create policy centers_parent_select on centers for select
using (
  auth.jwt()->>'active_role' = 'parent'
  and exists (
    select 1 from sessions se
    join classes c on c.session_id = se.id
    join enrollments e on e.class_id = c.id
    join students s on s.id = e.student_id
    join family_members fm on fm.family_id = s.family_id
    where se.center_id = centers.id and fm.user_id = auth.uid()
  )
);
create policy centers_student_select on centers for select
using (
  auth.jwt()->>'active_role' = 'student'
  and exists (
    select 1 from sessions se
    join classes c on c.session_id = se.id
    join enrollments e on e.class_id = c.id
    join students s on s.id = e.student_id
    where se.center_id = centers.id and s.user_id = auth.uid()
  )
);
create policy centers_teacher_select on centers for select
using (
  auth.jwt()->>'active_role' = 'teacher'
  and exists (
    select 1 from sessions se join classes c on c.session_id = se.id
    where se.center_id = centers.id and c.id = (auth.jwt()->>'scope_id')::uuid
  )
);
create policy centers_coordinator_select on centers for select
using (
  auth.jwt()->>'active_role' = 'coordinator'
  and exists (
    select 1 from sessions se where se.center_id = centers.id and se.id = (auth.jwt()->>'scope_id')::uuid
  )
);
create policy centers_org_select on centers for select
using (auth.jwt()->>'active_role' in ('bv_coordinator','admin'));

-- sessions
create policy sessions_parent_select on sessions for select
using (
  auth.jwt()->>'active_role' = 'parent'
  and exists (
    select 1 from classes c
    join enrollments e on e.class_id = c.id
    join students s on s.id = e.student_id
    join family_members fm on fm.family_id = s.family_id
    where c.session_id = sessions.id and fm.user_id = auth.uid()
  )
);
create policy sessions_student_select on sessions for select
using (
  auth.jwt()->>'active_role' = 'student'
  and exists (
    select 1 from classes c
    join enrollments e on e.class_id = c.id
    join students s on s.id = e.student_id
    where c.session_id = sessions.id and s.user_id = auth.uid()
  )
);
create policy sessions_teacher_select on sessions for select
using (
  auth.jwt()->>'active_role' = 'teacher'
  and exists (select 1 from classes c where c.session_id = sessions.id and c.id = (auth.jwt()->>'scope_id')::uuid)
);
create policy sessions_coordinator_select on sessions for select
using (
  auth.jwt()->>'active_role' = 'coordinator'
  and sessions.id = (auth.jwt()->>'scope_id')::uuid
);
create policy sessions_org_select on sessions for select
using (auth.jwt()->>'active_role' in ('bv_coordinator','admin'));

-- classes
create policy classes_parent_select on classes for select
using (
  auth.jwt()->>'active_role' = 'parent'
  and exists (
    select 1 from enrollments e
    join students s on s.id = e.student_id
    join family_members fm on fm.family_id = s.family_id
    where e.class_id = classes.id and fm.user_id = auth.uid()
  )
);
create policy classes_student_select on classes for select
using (
  auth.jwt()->>'active_role' = 'student'
  and exists (
    select 1 from enrollments e
    join students s on s.id = e.student_id
    where e.class_id = classes.id and s.user_id = auth.uid()
  )
);
create policy classes_teacher_select on classes for select
using (
  auth.jwt()->>'active_role' = 'teacher'
  and classes.id = (auth.jwt()->>'scope_id')::uuid
);
create policy classes_coordinator_select on classes for select
using (
  auth.jwt()->>'active_role' = 'coordinator'
  and classes.session_id = (auth.jwt()->>'scope_id')::uuid
);
create policy classes_org_select on classes for select
using (auth.jwt()->>'active_role' in ('bv_coordinator','admin'));

-- families / family_members (resolved deferred mechanic #1)
create policy families_own_select on families for select
using (
  auth.jwt()->>'active_role' in ('parent','student')
  and exists (select 1 from family_members fm where fm.family_id = families.id and fm.user_id = auth.uid())
);
create policy families_org_select on families for select
using (auth.jwt()->>'active_role' in ('bv_coordinator','admin'));

create policy family_members_own_select on family_members for select
using (
  auth.jwt()->>'active_role' in ('parent','student')
  and exists (
    select 1 from family_members fm2
    where fm2.family_id = family_members.family_id and fm2.user_id = auth.uid()
  )
);
create policy family_members_org_select on family_members for select
using (auth.jwt()->>'active_role' in ('bv_coordinator','admin'));

-- students (Parent/Student direct only — Teacher/Coordinator/BV/Admin get zero rows here by design, ADR-0019)
create policy students_parent_select on students for select
using (
  auth.jwt()->>'active_role' = 'parent'
  and exists (select 1 from family_members fm where fm.family_id = students.family_id and fm.user_id = auth.uid())
);
create policy students_student_select on students for select
using (
  auth.jwt()->>'active_role' = 'student'
  and students.user_id = auth.uid()
);

-- enrollments
create policy enrollments_parent_select on enrollments for select
using (
  auth.jwt()->>'active_role' = 'parent'
  and exists (
    select 1 from students s join family_members fm on fm.family_id = s.family_id
    where s.id = enrollments.student_id and fm.user_id = auth.uid()
  )
);
create policy enrollments_student_select on enrollments for select
using (
  auth.jwt()->>'active_role' = 'student'
  and exists (select 1 from students s where s.id = enrollments.student_id and s.user_id = auth.uid())
);
create policy enrollments_teacher_select on enrollments for select
using (
  auth.jwt()->>'active_role' = 'teacher'
  and enrollments.class_id = (auth.jwt()->>'scope_id')::uuid
);
create policy enrollments_coordinator_select on enrollments for select
using (
  auth.jwt()->>'active_role' = 'coordinator'
  and enrollments.session_id = (auth.jwt()->>'scope_id')::uuid
);
create policy enrollments_org_select on enrollments for select
using (auth.jwt()->>'active_role' in ('bv_coordinator','admin'));

-- attendance: Parent/Student read direct; Teacher writes (own class); no staff SELECT (RPC only, Task 5)
create policy attendance_parent_select on attendance for select
using (
  auth.jwt()->>'active_role' = 'parent'
  and exists (
    select 1 from enrollments e join students s on s.id = e.student_id
    join family_members fm on fm.family_id = s.family_id
    where e.id = attendance.enrollment_id and fm.user_id = auth.uid()
  )
);
create policy attendance_student_select on attendance for select
using (
  auth.jwt()->>'active_role' = 'student'
  and exists (
    select 1 from enrollments e join students s on s.id = e.student_id
    where e.id = attendance.enrollment_id and s.user_id = auth.uid()
  )
);
create policy attendance_teacher_insert on attendance for insert
with check (
  auth.jwt()->>'active_role' = 'teacher'
  and exists (select 1 from enrollments e where e.id = attendance.enrollment_id and e.class_id = (auth.jwt()->>'scope_id')::uuid)
);
create policy attendance_teacher_update on attendance for update
using (
  auth.jwt()->>'active_role' = 'teacher'
  and exists (select 1 from enrollments e where e.id = attendance.enrollment_id and e.class_id = (auth.jwt()->>'scope_id')::uuid)
)
with check (
  auth.jwt()->>'active_role' = 'teacher'
  and exists (select 1 from enrollments e where e.id = attendance.enrollment_id and e.class_id = (auth.jwt()->>'scope_id')::uuid)
);
```

- [ ] **Step 7: Apply locally**
```bash
npx supabase db reset
```

- [ ] **Step 8: Run the test again — expect GREEN**
```bash
npx supabase test db
```
Expected: `010_operational_core_rls.sql` — 14/14 passing.

- [ ] **Step 9: Commit**
```bash
git add supabase/migrations supabase/tests/010_operational_core_rls.sql
git commit -m "feat: operational core schema (centers..families) + role x scope RLS"
```

---

### Task 3: `user_roles` catalog — locked down, auth-hook-only read

**Files:**
- Create: `supabase/migrations/<ts>_user_roles_catalog.sql`
- Create: `supabase/tests/020_user_roles_lockdown.sql`

**Interfaces:**
- Produces: `user_roles(id,user_id,role,scope_type,scope_id,created_at)` — every later task's RLS policies read `auth.jwt()` claims that this table is the intended (future) source of, but this item never reads `user_roles` itself from a policy; only the hook will.

- [ ] **Step 1: Create the migration**
```bash
npx supabase migration new user_roles_catalog
```

- [ ] **Step 2: Write it**
```sql
create type app_role as enum ('student','parent','teacher','coordinator','bv_coordinator','admin');
create type app_scope_type as enum ('org','center','session','class');

create table if not exists user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role app_role not null,
  scope_type app_scope_type not null,
  scope_id uuid,
  created_at timestamptz not null default now(),
  constraint user_roles_org_scope_null_id check (
    (scope_type = 'org' and scope_id is null) or (scope_type <> 'org' and scope_id is not null)
  )
);

alter table user_roles enable row level security;

-- No grants to anon/authenticated at all — not client-writable, not client-readable (AC #3).
grant select on user_roles to supabase_auth_admin;

create policy user_roles_auth_admin_read on user_roles for select
to supabase_auth_admin
using (true);
```

- [ ] **Step 3: Apply locally**
```bash
npx supabase db reset
```

- [ ] **Step 4: Write the pgTAP test**

`supabase/tests/020_user_roles_lockdown.sql`:
```sql
begin;
select plan(4);

select tests.create_supabase_user('multirole-fixture@test.local') as v_user \gset

insert into user_roles (user_id, role, scope_type, scope_id) values
  (:'v_user'::uuid, 'teacher', 'class', gen_random_uuid());

-- Negative: authenticated (any simulated role) gets zero rows, never an error.
select tests.authenticate_as(:'v_user'::uuid, 'teacher', 'class', gen_random_uuid());
select is((select count(*) from user_roles)::int, 0, 'teacher gets zero rows from user_roles directly');

select tests.authenticate_as(:'v_user'::uuid, 'admin', 'org', null);
select is((select count(*) from user_roles)::int, 0, 'admin gets zero rows from user_roles directly (no client policy at all, per §5.5)');

-- Negative: no client role can write it.
select throws_ok(
  $$insert into user_roles (user_id, role, scope_type, scope_id) values (gen_random_uuid(), 'admin', 'org', null)$$,
  '42501',
  null,
  'authenticated cannot insert into user_roles'
);

-- Positive: supabase_auth_admin (the real auth-hook's context) can read.
select tests.clear_authentication();
set role supabase_auth_admin;
select is((select count(*) from user_roles)::int, 1, 'supabase_auth_admin can read user_roles (future auth-hook context)');
reset role;

select * from finish();
rollback;
```

- [ ] **Step 5: Run — expect the auth_admin case to pass and the lockdown cases to already pass (default-deny is correct from the start here; there's no positive client-facing policy to be RED about)**
```bash
npx supabase test db
```
Expected: `020_user_roles_lockdown.sql` — 4/4 passing (this table's correct end-state *is* default-deny plus one auth_admin policy, so there's no RED step distinct from Task 2's pattern — the "test first" discipline here is satisfied by having written the assertions before confirming, in Step 4→5, that the lockdown is real and not just assumed).

- [ ] **Step 6: Commit**
```bash
git add supabase/migrations supabase/tests/020_user_roles_lockdown.sql
git commit -m "feat: user_roles catalog, locked to supabase_auth_admin only"
```

---

### Task 4: `consents` table — per-student, Parent/Student direct only

**Files:**
- Create: `supabase/migrations/<ts>_consents_table.sql`
- Create: `supabase/tests/030_consents_rls.sql`

**Interfaces:**
- Produces: `consents(id,student_id,consent_type,granted,granted_by,granted_at,revoked_at)`.

- [ ] **Step 1: Create the migration**
```bash
npx supabase migration new consents_table
```

- [ ] **Step 2: Write the DDL with RLS enabled, no policies (RED setup)**
```sql
create table if not exists consents (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students(id) on delete cascade,
  consent_type text not null check (consent_type in ('participation','media')),
  granted boolean not null,
  granted_by uuid references auth.users(id) on delete set null,
  granted_at timestamptz not null default now(),
  revoked_at timestamptz,
  unique (student_id, consent_type)
);

alter table consents enable row level security;

grant select, insert, update on consents to authenticated;
```

- [ ] **Step 3: Apply locally**
```bash
npx supabase db reset
```

- [ ] **Step 4: Write the pgTAP test**

`supabase/tests/030_consents_rls.sql`:
```sql
begin;
select plan(6);

insert into families (id, label) values
  ('fc111111-0000-0000-0000-000000000001', 'Consent Family A'),
  ('fc222222-0000-0000-0000-000000000002', 'Consent Family B');

select tests.create_supabase_user('consent-parent-a@test.local') as v_parent_a \gset
select tests.create_supabase_user('consent-teacher@test.local') as v_teacher \gset

insert into family_members (family_id, user_id, relationship) values
  ('fc111111-0000-0000-0000-000000000001', :'v_parent_a'::uuid, 'guardian');

insert into students (id, family_id, first_name, last_name, grade_level) values
  ('5c111111-0000-0000-0000-000000000001', 'fc111111-0000-0000-0000-000000000001', 'Con', 'A', 'Grade4'),
  ('5c222222-0000-0000-0000-000000000002', 'fc222222-0000-0000-0000-000000000002', 'Con', 'B', 'Grade4');

insert into consents (student_id, consent_type, granted, granted_by) values
  ('5c111111-0000-0000-0000-000000000001', 'participation', true, :'v_parent_a'::uuid),
  ('5c222222-0000-0000-0000-000000000002', 'media', false, null);

-- Positive: parent sees + can insert/update their own child's consent.
select tests.authenticate_as(:'v_parent_a'::uuid, 'parent');
select is((select count(*) from consents)::int, 1, 'parent sees exactly their own child''s consent row');

select lives_ok(
  $$insert into consents (student_id, consent_type, granted, granted_by)
    values ('5c111111-0000-0000-0000-000000000001', 'media', true, auth.uid())$$,
  'parent can grant a new consent type for their own child'
);

select lives_ok(
  $$update consents set revoked_at = now() where student_id = '5c111111-0000-0000-0000-000000000001' and consent_type = 'participation'$$,
  'parent can revoke (set revoked_at) their own child''s consent'
);

-- Negative: parent cannot see or touch the other family's consent.
select is(
  (select count(*) from consents where student_id = '5c222222-0000-0000-0000-000000000002')::int, 0,
  'parent cannot see the other family''s consent row'
);
select throws_ok(
  $$update consents set granted = true where student_id = '5c222222-0000-0000-0000-000000000002'$$,
  '42501',
  null,
  'parent cannot update the other family''s consent'
);

-- Negative: Teacher gets zero rows directly (RPC-only per ADR-0019, proven again in Task 5).
select tests.authenticate_as(:'v_teacher'::uuid, 'teacher', 'class', gen_random_uuid());
select is((select count(*) from consents)::int, 0, 'teacher direct select on consents returns zero rows');

select tests.clear_authentication();
select * from finish();
rollback;
```

- [ ] **Step 5: Run — expect RED** (no policies exist yet, so even the parent's own-child cases fail)
```bash
npx supabase test db
```
Expected: parent positive cases fail; teacher zero-rows case trivially passes (already default-deny).

- [ ] **Step 6: Write the RLS-policy migration**
```bash
npx supabase migration new consents_rls_policies
```
```sql
create policy consents_parent_select on consents for select
using (
  auth.jwt()->>'active_role' = 'parent'
  and exists (
    select 1 from students s join family_members fm on fm.family_id = s.family_id
    where s.id = consents.student_id and fm.user_id = auth.uid()
  )
);
create policy consents_student_select on consents for select
using (
  auth.jwt()->>'active_role' = 'student'
  and exists (select 1 from students s where s.id = consents.student_id and s.user_id = auth.uid())
);
create policy consents_parent_insert on consents for insert
with check (
  auth.jwt()->>'active_role' = 'parent'
  and exists (
    select 1 from students s join family_members fm on fm.family_id = s.family_id
    where s.id = consents.student_id and fm.user_id = auth.uid()
  )
);
create policy consents_parent_update on consents for update
using (
  auth.jwt()->>'active_role' = 'parent'
  and exists (
    select 1 from students s join family_members fm on fm.family_id = s.family_id
    where s.id = consents.student_id and fm.user_id = auth.uid()
  )
)
with check (
  auth.jwt()->>'active_role' = 'parent'
  and exists (
    select 1 from students s join family_members fm on fm.family_id = s.family_id
    where s.id = consents.student_id and fm.user_id = auth.uid()
  )
);
```

- [ ] **Step 7: Apply locally + run — expect GREEN**
```bash
npx supabase db reset
npx supabase test db
```
Expected: `030_consents_rls.sql` — 6/6 passing.

- [ ] **Step 8: Commit**
```bash
git add supabase/migrations supabase/tests/030_consents_rls.sql
git commit -m "feat: consents table, per-student, Parent/Student-direct RLS"
```

---

### Task 5: `audit_log` + ADR-0019 staff RPCs

**Files:**
- Create: `supabase/migrations/<ts>_audit_log_and_staff_rpcs.sql`
- Create: `supabase/tests/040_audit_rpc_and_denied_logging.sql`

**Interfaces:**
- Consumes: `students`, `attendance`, `consents`, `enrollments`, `classes` (Tasks 2, 4).
- Produces: `audit_log(id,actor_user_id,actor_role,action,target_table,target_id,target_student_id,accessed_at)`; `get_student_for_staff(p_student_id uuid) returns setof students`; `get_class_roster_for_staff(p_class_id uuid) returns setof students`; `get_class_attendance_for_staff(p_class_id uuid, p_date_from date, p_date_to date) returns setof attendance`; `get_consents_for_staff(p_student_id uuid) returns setof consents`.

- [ ] **Step 1: Create the migration**
```bash
npx supabase migration new audit_log_and_staff_rpcs
```

- [ ] **Step 2: Write `audit_log` + lockdown**
```sql
create table if not exists audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references auth.users(id) on delete set null,
  actor_role text not null,
  action text not null check (action in ('read','denied')),
  target_table text not null,
  target_id uuid,
  target_student_id uuid references students(id) on delete set null,
  accessed_at timestamptz not null default now()
);

alter table audit_log enable row level security;

-- Only SELECT is ever granted to authenticated; writes happen exclusively via the
-- SECURITY DEFINER RPCs below, which run as the table owner and bypass both this
-- grant and RLS. This is the "direct insert cannot forge an entry" guarantee (ADR-0019).
grant select on audit_log to authenticated;
revoke insert, update, delete on audit_log from authenticated, anon;

create policy audit_log_org_read on audit_log for select
using (auth.jwt()->>'active_role' in ('bv_coordinator','admin'));

create policy audit_log_coordinator_read on audit_log for select
using (
  auth.jwt()->>'active_role' = 'coordinator'
  and (
    (
      audit_log.target_student_id is not null
      and exists (
        select 1 from enrollments e
        where e.student_id = audit_log.target_student_id
          and e.session_id = (auth.jwt()->>'scope_id')::uuid
      )
    )
    or (
      audit_log.target_table = 'classes'
      and exists (
        select 1 from classes c
        where c.id = audit_log.target_id
          and c.session_id = (auth.jwt()->>'scope_id')::uuid
      )
    )
  )
);
```

- [ ] **Step 3: Write the four RPCs**
```sql
create or replace function get_student_for_staff(p_student_id uuid)
returns setof students
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text := auth.jwt()->>'active_role';
  v_scope_id uuid := nullif(auth.jwt()->>'scope_id','')::uuid;
  v_authorized boolean := false;
begin
  if v_role in ('bv_coordinator','admin') then
    v_authorized := true;
  elsif v_role = 'coordinator' then
    v_authorized := exists (select 1 from enrollments e where e.student_id = p_student_id and e.session_id = v_scope_id);
  elsif v_role = 'teacher' then
    v_authorized := exists (select 1 from enrollments e where e.student_id = p_student_id and e.class_id = v_scope_id);
  end if;

  if v_authorized then
    insert into audit_log (actor_user_id, actor_role, action, target_table, target_id, target_student_id)
    values (auth.uid(), v_role, 'read', 'students', p_student_id, p_student_id);
    return query select * from students s where s.id = p_student_id;
  else
    insert into audit_log (actor_user_id, actor_role, action, target_table, target_id, target_student_id)
    values (auth.uid(), v_role, 'denied', 'students', p_student_id, p_student_id);
    return;
  end if;
end;
$$;

create or replace function get_class_roster_for_staff(p_class_id uuid)
returns setof students
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text := auth.jwt()->>'active_role';
  v_scope_id uuid := nullif(auth.jwt()->>'scope_id','')::uuid;
  v_authorized boolean := false;
  r students%rowtype;
begin
  if v_role in ('bv_coordinator','admin') then
    v_authorized := true;
  elsif v_role = 'coordinator' then
    v_authorized := exists (select 1 from classes c where c.id = p_class_id and c.session_id = v_scope_id);
  elsif v_role = 'teacher' then
    v_authorized := (p_class_id = v_scope_id);
  end if;

  if not v_authorized then
    insert into audit_log (actor_user_id, actor_role, action, target_table, target_id, target_student_id)
    values (auth.uid(), v_role, 'denied', 'classes', p_class_id, null);
    return;
  end if;

  for r in
    select s.* from students s
    join enrollments e on e.student_id = s.id
    where e.class_id = p_class_id and e.status = 'active'
  loop
    insert into audit_log (actor_user_id, actor_role, action, target_table, target_id, target_student_id)
    values (auth.uid(), v_role, 'read', 'students', r.id, r.id);
    return next r;
  end loop;
  return;
end;
$$;

create or replace function get_class_attendance_for_staff(p_class_id uuid, p_date_from date, p_date_to date)
returns setof attendance
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text := auth.jwt()->>'active_role';
  v_scope_id uuid := nullif(auth.jwt()->>'scope_id','')::uuid;
  v_authorized boolean := false;
  r attendance%rowtype;
  v_student_id uuid;
  v_seen_students uuid[] := array[]::uuid[];
begin
  if v_role in ('bv_coordinator','admin') then
    v_authorized := true;
  elsif v_role = 'coordinator' then
    v_authorized := exists (select 1 from classes c where c.id = p_class_id and c.session_id = v_scope_id);
  elsif v_role = 'teacher' then
    v_authorized := (p_class_id = v_scope_id);
  end if;

  if not v_authorized then
    insert into audit_log (actor_user_id, actor_role, action, target_table, target_id, target_student_id)
    values (auth.uid(), v_role, 'denied', 'classes', p_class_id, null);
    return;
  end if;

  for r in
    select a.* from attendance a
    join enrollments e on e.id = a.enrollment_id
    where e.class_id = p_class_id and a.class_meeting_date between p_date_from and p_date_to
  loop
    select e2.student_id into v_student_id from enrollments e2 where e2.id = r.enrollment_id;
    if not (v_student_id = any(v_seen_students)) then
      insert into audit_log (actor_user_id, actor_role, action, target_table, target_id, target_student_id)
      values (auth.uid(), v_role, 'read', 'attendance', r.id, v_student_id);
      v_seen_students := array_append(v_seen_students, v_student_id);
    end if;
    return next r;
  end loop;
  return;
end;
$$;

create or replace function get_consents_for_staff(p_student_id uuid)
returns setof consents
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text := auth.jwt()->>'active_role';
  v_scope_id uuid := nullif(auth.jwt()->>'scope_id','')::uuid;
  v_authorized boolean := false;
  r consents%rowtype;
begin
  if v_role in ('bv_coordinator','admin') then
    v_authorized := true;
  elsif v_role = 'coordinator' then
    v_authorized := exists (select 1 from enrollments e where e.student_id = p_student_id and e.session_id = v_scope_id);
  end if;
  -- Teacher is never authorized here (consent status isn't a teaching-day need, per spec).

  if not v_authorized then
    insert into audit_log (actor_user_id, actor_role, action, target_table, target_id, target_student_id)
    values (auth.uid(), v_role, 'denied', 'consents', p_student_id, p_student_id);
    return;
  end if;

  for r in select c.* from consents c where c.student_id = p_student_id
  loop
    insert into audit_log (actor_user_id, actor_role, action, target_table, target_id, target_student_id)
    values (auth.uid(), v_role, 'read', 'consents', r.id, p_student_id);
    return next r;
  end loop;
  return;
end;
$$;

revoke all on function get_student_for_staff(uuid) from public;
revoke all on function get_class_roster_for_staff(uuid) from public;
revoke all on function get_class_attendance_for_staff(uuid, date, date) from public;
revoke all on function get_consents_for_staff(uuid) from public;
grant execute on function get_student_for_staff(uuid) to authenticated;
grant execute on function get_class_roster_for_staff(uuid) to authenticated;
grant execute on function get_class_attendance_for_staff(uuid, date, date) to authenticated;
grant execute on function get_consents_for_staff(uuid) to authenticated;
```

- [ ] **Step 4: Apply locally**
```bash
npx supabase db reset
```

- [ ] **Step 5: Write the pgTAP test (RPC-bypass, denied-logging, audit integrity — test plan #3/#3a/#4)**

`supabase/tests/040_audit_rpc_and_denied_logging.sql`:
```sql
begin;
select plan(9);

insert into families (id, label) values ('fd111111-0000-0000-0000-000000000001', 'Audit Family');
select tests.create_supabase_user('audit-teacher-in@test.local') as v_teacher_in \gset
select tests.create_supabase_user('audit-teacher-out@test.local') as v_teacher_out \gset

insert into students (id, family_id, first_name, last_name, grade_level) values
  ('5e111111-0000-0000-0000-000000000001', 'fd111111-0000-0000-0000-000000000001', 'Aud', 'Ent', 'Grade6');

insert into centers (id, name) values ('c9999999-0000-0000-0000-000000000001', 'Audit Fixture Center');
insert into sessions (id, center_id, name, start_date, end_date)
  values ('a3111111-0000-0000-0000-000000000001', 'c9999999-0000-0000-0000-000000000001', 'Audit-Session', '2026-01-01', '2026-06-01');
insert into classes (id, session_id, name, grade_band)
  values ('c3111111-0000-0000-0000-000000000001', 'a3111111-0000-0000-0000-000000000001', 'Audit Class In', 'Grade6');

insert into enrollments (id, student_id, class_id, session_id, status)
values ('e3111111-0000-0000-0000-000000000001', '5e111111-0000-0000-0000-000000000001', 'c3111111-0000-0000-0000-000000000001', 'a3111111-0000-0000-0000-000000000001', 'active');

-- Inserted now (while still unauthenticated/superuser) so it exists before any role switch below —
-- the attendance write policy only allows the in-scope teacher, which isn't simulated yet.
insert into attendance (enrollment_id, class_meeting_date, status)
values ('e3111111-0000-0000-0000-000000000001', '2026-02-01', 'present');

-- RPC-bypass check: Teacher's plain select returns zero rows; the RPC returns the row + logs 'read'.
select tests.authenticate_as(:'v_teacher_in'::uuid, 'teacher', 'class', 'c3111111-0000-0000-0000-000000000001'::uuid);
select is((select count(*) from students where id = '5e111111-0000-0000-0000-000000000001')::int, 0,
  'teacher direct select on students (in-class student) returns zero rows');

select is((select count(*) from get_student_for_staff('5e111111-0000-0000-0000-000000000001'::uuid))::int, 1,
  'get_student_for_staff returns the row for an in-class student');

select is(
  (select count(*) from audit_log where target_student_id = '5e111111-0000-0000-0000-000000000001' and action = 'read')::int, 1,
  'exactly one audit_log read row was created by the successful RPC call'
);

-- Denied-attempt logging: Teacher outside the class gets no row + a 'denied' audit_log row.
select tests.authenticate_as(:'v_teacher_out'::uuid, 'teacher', 'class', gen_random_uuid());
select is((select count(*) from get_student_for_staff('5e111111-0000-0000-0000-000000000001'::uuid))::int, 0,
  'get_student_for_staff returns nothing for an out-of-class teacher');

select is(
  (select count(*) from audit_log where target_student_id = '5e111111-0000-0000-0000-000000000001' and action = 'denied')::int, 1,
  'exactly one audit_log denied row was created by the out-of-scope RPC call'
);

-- Roster + attendance RPCs also audit (spot check) — the attendance fixture row was inserted above.
select tests.authenticate_as(:'v_teacher_in'::uuid, 'teacher', 'class', 'c3111111-0000-0000-0000-000000000001'::uuid);
select is((select count(*) from get_class_roster_for_staff('c3111111-0000-0000-0000-000000000001'::uuid))::int, 1,
  'get_class_roster_for_staff returns the one enrolled student');
select is((select count(*) from get_class_attendance_for_staff('c3111111-0000-0000-0000-000000000001'::uuid, '2026-01-01'::date, '2026-03-01'::date))::int, 1,
  'get_class_attendance_for_staff returns the attendance row');

-- Consents RPC: Teacher is never authorized (not just out-of-scope).
select is((select count(*) from get_consents_for_staff('5e111111-0000-0000-0000-000000000001'::uuid))::int, 0,
  'teacher (any scope) is never authorized to call get_consents_for_staff');

-- Audit-log integrity: direct insert from authenticated fails.
select throws_ok(
  $$insert into audit_log (actor_role, action, target_table, target_id) values ('admin', 'read', 'students', gen_random_uuid())$$,
  '42501',
  null,
  'authenticated cannot insert into audit_log directly — only the RPCs (owned by the migration role) can'
);

select tests.clear_authentication();
select * from finish();
rollback;
```

- [ ] **Step 6: Run — expect GREEN** (this task ships schema, RPCs, and policy together since the RPCs *are* the deliverable — there's no meaningful RED state for a function that doesn't exist yet)
```bash
npx supabase test db
```
Expected: `040_audit_rpc_and_denied_logging.sql` — 9/9 passing.

- [ ] **Step 7: Commit**
```bash
git add supabase/migrations supabase/tests/040_audit_rpc_and_denied_logging.sql
git commit -m "feat: audit_log + ADR-0019 staff RPCs (get_student/roster/attendance/consents_for_staff)"
```

---

### Task 6: `push_subscriptions` — owner-only RLS

**Files:**
- Create: `supabase/migrations/<ts>_push_subscriptions.sql`
- Create: `supabase/tests/050_push_subscriptions_rls.sql`

**Interfaces:**
- Produces: `push_subscriptions(id,user_id,endpoint,p256dh_key,auth_key,created_at)`.

- [ ] **Step 1: Create the migration**
```bash
npx supabase migration new push_subscriptions
```

- [ ] **Step 2: Write it (DDL + RLS + policy together — this table's rule is a single `auth.uid()` predicate, not role/scope-based, so there's no useful RED/GREEN split)**
```sql
create table if not exists push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh_key text not null,
  auth_key text not null,
  created_at timestamptz not null default now()
);

alter table push_subscriptions enable row level security;

grant select, insert, update, delete on push_subscriptions to authenticated;

create policy push_subscriptions_owner_all on push_subscriptions for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
```

- [ ] **Step 3: Apply locally**
```bash
npx supabase db reset
```

- [ ] **Step 4: Write the pgTAP test**

`supabase/tests/050_push_subscriptions_rls.sql`:
```sql
begin;
select plan(4);

select tests.create_supabase_user('push-owner@test.local') as v_owner \gset
select tests.create_supabase_user('push-other@test.local') as v_other \gset

select tests.authenticate_as(:'v_owner'::uuid, 'parent');
select lives_ok(
  $$insert into push_subscriptions (user_id, endpoint, p256dh_key, auth_key)
    values (auth.uid(), 'https://fcm.example/abc', 'p256dh-fixture', 'auth-fixture')$$,
  'owner can insert their own push subscription'
);
select is((select count(*) from push_subscriptions)::int, 1, 'owner sees exactly their own subscription');

select tests.authenticate_as(:'v_other'::uuid, 'parent');
select is((select count(*) from push_subscriptions)::int, 0, 'a different user sees zero subscriptions');
select throws_ok(
  $$update push_subscriptions set endpoint = 'https://fcm.example/hijacked' where endpoint = 'https://fcm.example/abc'$$,
  '42501',
  null,
  'a different user cannot update someone else''s subscription'
);

select tests.clear_authentication();
select * from finish();
rollback;
```

- [ ] **Step 5: Run — expect GREEN**
```bash
npx supabase test db
```
Expected: `050_push_subscriptions_rls.sql` — 4/4 passing.

- [ ] **Step 6: Commit**
```bash
git add supabase/migrations supabase/tests/050_push_subscriptions_rls.sql
git commit -m "feat: push_subscriptions, owner-only RLS"
```

---

### Task 7: Chat durability tables + auto-population triggers

**Files:**
- Create: `supabase/migrations/<ts>_chat_durability_tables.sql`
- Create: `supabase/migrations/<ts>_chat_sync_triggers.sql`
- Create: `supabase/tests/060_chat_rls.sql`

**Interfaces:**
- Consumes: `classes`, `sessions`, `enrollments`, `students`, `family_members`, `user_roles` (Tasks 2, 3).
- Produces: `conversations(id,kind,scope_type,scope_id,created_at)`, `conversation_participants(id,conversation_id,user_id,participant_role,notify_level,notification_default,created_at)`, `messages(id,conversation_id,sender_user_id,body,mention_targets,created_at)`; triggers `sync_class_conversation`, `sync_session_conversation`, `sync_class_participants`, `sync_staff_participants`.

- [ ] **Step 1: Create the tables migration**
```bash
npx supabase migration new chat_durability_tables
```

- [ ] **Step 2: Write the DDL + RLS (member-only, no client write on conversations/participants)**
```sql
create table if not exists conversations (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('class','session_staff','leadership')),
  scope_type text not null check (scope_type in ('class','session','org')),
  scope_id uuid,
  created_at timestamptz not null default now(),
  constraint conversations_org_scope_null_id check (
    (scope_type = 'org' and scope_id is null) or (scope_type <> 'org' and scope_id is not null)
  ),
  unique (kind, scope_type, scope_id)
);
create unique index if not exists conversations_org_singleton on conversations (kind) where scope_type = 'org';

create table if not exists conversation_participants (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  participant_role text not null check (participant_role in ('student','parent','teacher','coordinator','bv_coordinator','admin')),
  notify_level text not null default 'all' check (notify_level in ('all','mentions','muted')),
  notification_default text not null default 'all' check (notification_default in ('all','mentions','muted')),
  created_at timestamptz not null default now(),
  unique (conversation_id, user_id)
);

create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  sender_user_id uuid not null references auth.users(id) on delete set null,
  body text not null,
  mention_targets text[] not null default array[]::text[],
  created_at timestamptz not null default now()
);

alter table conversations enable row level security;
alter table conversation_participants enable row level security;
alter table messages enable row level security;

grant select on conversations to authenticated;
grant select on conversation_participants to authenticated;
grant select, insert on messages to authenticated;

create policy conversations_member_select on conversations for select
using (exists (
  select 1 from conversation_participants cp
  where cp.conversation_id = conversations.id and cp.user_id = auth.uid()
));

create policy conversation_participants_member_select on conversation_participants for select
using (exists (
  select 1 from conversation_participants cp2
  where cp2.conversation_id = conversation_participants.conversation_id and cp2.user_id = auth.uid()
));

create policy messages_member_select on messages for select
using (exists (
  select 1 from conversation_participants cp
  where cp.conversation_id = messages.conversation_id and cp.user_id = auth.uid()
));

create policy messages_member_insert on messages for insert
with check (
  sender_user_id = auth.uid()
  and exists (
    select 1 from conversation_participants cp
    where cp.conversation_id = messages.conversation_id and cp.user_id = auth.uid()
  )
);
-- Deliberately no insert/update/delete policy on conversations or conversation_participants
-- for any client role: membership is trigger-maintained only (next migration), which is what
-- makes "no open student-to-student DM" structural rather than policy-dependent.
```

- [ ] **Step 3: Apply locally**
```bash
npx supabase db reset
```

- [ ] **Step 4: Create the triggers migration**
```bash
npx supabase migration new chat_sync_triggers
```

- [ ] **Step 5: Write the trigger functions (resolved deferred mechanic #2)**
```sql
create or replace function sync_class_conversation() returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into conversations (kind, scope_type, scope_id)
  values ('class', 'class', new.id)
  on conflict (kind, scope_type, scope_id) do nothing;
  return new;
end;
$$;

create trigger classes_after_insert_conversation
after insert on classes
for each row execute function sync_class_conversation();

create or replace function sync_session_conversation() returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into conversations (kind, scope_type, scope_id)
  values ('session_staff', 'session', new.id)
  on conflict (kind, scope_type, scope_id) do nothing;
  return new;
end;
$$;

create trigger sessions_after_insert_conversation
after insert on sessions
for each row execute function sync_session_conversation();

-- One org-wide leadership conversation, created once.
insert into conversations (kind, scope_type, scope_id)
values ('leadership', 'org', null)
on conflict (kind) where scope_type = 'org' do nothing;

create or replace function sync_class_participants() returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_class_id uuid;
  v_conversation_id uuid;
  v_student_user_id uuid;
  v_family_id uuid;
begin
  v_class_id := coalesce(new.class_id, old.class_id);

  select id into v_conversation_id from conversations
  where kind = 'class' and scope_type = 'class' and scope_id = v_class_id;

  if v_conversation_id is null then
    return coalesce(new, old);
  end if;

  if tg_op in ('INSERT','UPDATE') and new.status = 'active' then
    select user_id, family_id into v_student_user_id, v_family_id from students where id = new.student_id;

    if v_student_user_id is not null then
      insert into conversation_participants (conversation_id, user_id, participant_role)
      values (v_conversation_id, v_student_user_id, 'student')
      on conflict (conversation_id, user_id) do nothing;
    end if;

    insert into conversation_participants (conversation_id, user_id, participant_role)
    select v_conversation_id, fm.user_id, 'parent'
    from family_members fm
    where fm.family_id = v_family_id
    on conflict (conversation_id, user_id) do nothing;
  end if;

  if tg_op = 'UPDATE' and old.status = 'active' and new.status = 'withdrawn' then
    select user_id, family_id into v_student_user_id, v_family_id from students where id = old.student_id;

    if v_student_user_id is not null then
      delete from conversation_participants
      where conversation_id = v_conversation_id and user_id = v_student_user_id;
    end if;

    delete from conversation_participants cp
    using family_members fm
    where cp.conversation_id = v_conversation_id
      and cp.user_id = fm.user_id
      and fm.family_id = v_family_id
      and not exists (
        select 1 from enrollments e2
        join students s2 on s2.id = e2.student_id
        where e2.class_id = v_class_id and e2.status = 'active' and s2.family_id = v_family_id
      );
  end if;

  return coalesce(new, old);
end;
$$;

create trigger enrollments_sync_participants
after insert or update on enrollments
for each row execute function sync_class_participants();

create or replace function sync_staff_participants() returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_conversation_id uuid;
begin
  if tg_op = 'DELETE' then
    if old.scope_type = 'class' and old.role = 'teacher' then
      select id into v_conversation_id from conversations where kind='class' and scope_type='class' and scope_id = old.scope_id;
    elsif old.scope_type = 'session' and old.role = 'coordinator' then
      select id into v_conversation_id from conversations where kind='session_staff' and scope_type='session' and scope_id = old.scope_id;
    elsif old.scope_type = 'org' and old.role in ('bv_coordinator','admin') then
      select id into v_conversation_id from conversations where kind='leadership' and scope_type='org';
    end if;

    if v_conversation_id is not null then
      delete from conversation_participants where conversation_id = v_conversation_id and user_id = old.user_id;
    end if;
    return old;
  end if;

  if new.scope_type = 'class' and new.role = 'teacher' then
    select id into v_conversation_id from conversations where kind='class' and scope_type='class' and scope_id = new.scope_id;
    if v_conversation_id is not null then
      insert into conversation_participants (conversation_id, user_id, participant_role)
      values (v_conversation_id, new.user_id, 'teacher')
      on conflict (conversation_id, user_id) do nothing;
    end if;
  elsif new.scope_type = 'session' and new.role = 'coordinator' then
    select id into v_conversation_id from conversations where kind='session_staff' and scope_type='session' and scope_id = new.scope_id;
    if v_conversation_id is not null then
      insert into conversation_participants (conversation_id, user_id, participant_role)
      values (v_conversation_id, new.user_id, 'coordinator')
      on conflict (conversation_id, user_id) do nothing;
    end if;
  elsif new.scope_type = 'org' and new.role in ('bv_coordinator','admin') then
    select id into v_conversation_id from conversations where kind='leadership' and scope_type='org';
    if v_conversation_id is not null then
      insert into conversation_participants (conversation_id, user_id, participant_role)
      values (v_conversation_id, new.user_id, new.role)
      on conflict (conversation_id, user_id) do nothing;
    end if;
  end if;
  return new;
end;
$$;

create trigger user_roles_sync_participants
after insert or delete on user_roles
for each row execute function sync_staff_participants();
```

- [ ] **Step 6: Apply locally**
```bash
npx supabase db reset
```

- [ ] **Step 7: Write the pgTAP test (membership scoping + no-P2P-DM — test plan #6)**

`supabase/tests/060_chat_rls.sql`:
```sql
begin;
select plan(6);

insert into centers (id, name) values ('c7777777-0000-0000-0000-000000000001', 'Chat Center');
insert into sessions (id, center_id, name, start_date, end_date)
  values ('a7777777-0000-0000-0000-000000000001', 'c7777777-0000-0000-0000-000000000001', 'Chat Session', '2026-01-01', '2026-06-01');
insert into classes (id, session_id, name, grade_band)
  values ('c7777777-0000-0000-0000-000000000002', 'a7777777-0000-0000-0000-000000000001', 'Chat Class HS9', 'HS9-12');

insert into families (id, label) values ('f7777777-0000-0000-0000-000000000001', 'Chat Family');
select tests.create_supabase_user('chat-parent@test.local') as v_parent \gset
select tests.create_supabase_user('chat-student-1@test.local') as v_student_1 \gset
select tests.create_supabase_user('chat-student-2@test.local') as v_student_2 \gset

insert into family_members (family_id, user_id, relationship) values
  ('f7777777-0000-0000-0000-000000000001', :'v_parent'::uuid, 'guardian');

-- Both HS students have logins (per the students.user_id note); student_2 is unrelated (own family).
insert into families (id, label) values ('f7777777-0000-0000-0000-000000000002', 'Chat Family Two');
insert into students (id, family_id, first_name, last_name, grade_level, user_id) values
  ('5f111111-0000-0000-0000-000000000001', 'f7777777-0000-0000-0000-000000000001', 'Chat', 'One', 'HS9', :'v_student_1'::uuid),
  ('5f222222-0000-0000-0000-000000000002', 'f7777777-0000-0000-0000-000000000002', 'Chat', 'Two', 'HS9', :'v_student_2'::uuid);

insert into enrollments (id, student_id, class_id, session_id, status)
  values ('e7777777-0000-0000-0000-000000000001', '5f111111-0000-0000-0000-000000000001', 'c7777777-0000-0000-0000-000000000002', 'a7777777-0000-0000-0000-000000000001', 'active');
-- student_2 is deliberately NOT enrolled in this class — proves membership isn't automatic org-wide.

-- The class-conversation + student + parent participant rows should now exist via triggers.
select is(
  (select count(*) from conversations where kind = 'class' and scope_id = 'c7777777-0000-0000-0000-000000000002'::uuid)::int,
  1, 'the class conversation was auto-created by the classes-insert trigger'
);

select tests.authenticate_as(:'v_student_1'::uuid, 'student');
select is((select count(*) from conversations)::int, 1, 'the enrolled HS student sees exactly their class conversation');

select lives_ok(
  $$insert into messages (conversation_id, sender_user_id, body, mention_targets)
    select id, auth.uid(), 'hello class', array[]::text[] from conversations where kind = 'class' limit 1$$,
  'the enrolled student can post in their own class conversation'
);

select tests.authenticate_as(:'v_parent'::uuid, 'parent');
select is((select count(*) from conversation_participants where user_id = :'v_parent'::uuid)::int, 1,
  'the guardian of the enrolled student was auto-added as a participant');

-- Negative: student_2 (unrelated, not enrolled in this class) has no path to this conversation at all.
select tests.authenticate_as(:'v_student_2'::uuid, 'student');
select is((select count(*) from conversations)::int, 0, 'an unenrolled student sees zero conversations — no P2P DM path exists');

select throws_ok(
  $$insert into conversations (kind, scope_type, scope_id) values ('class', 'class', gen_random_uuid())$$,
  '42501',
  null,
  'no client role — including student — can create a conversation directly (membership is trigger-only)'
);

select tests.clear_authentication();
select * from finish();
rollback;
```

- [ ] **Step 8: Run — expect GREEN**
```bash
npx supabase test db
```
Expected: `060_chat_rls.sql` — 6/6 passing.

- [ ] **Step 9: Commit**
```bash
git add supabase/migrations supabase/tests/060_chat_rls.sql
git commit -m "feat: chat durability tables + trigger-maintained membership (no P2P DM path)"
```

---

### Task 8: Retention fields (inert placeholder columns)

**Files:**
- Create: `supabase/migrations/<ts>_retention_fields.sql`
- Create: `supabase/tests/070_retention_columns.sql`

**Interfaces:**
- Modifies: `students`, `attendance`, `consents`, `messages` — adds nullable `retention_eligible_at timestamptz`.

- [ ] **Step 1: Create the migration**
```bash
npx supabase migration new retention_fields
```

- [ ] **Step 2: Write it**
```sql
alter table students add column if not exists retention_eligible_at timestamptz;
alter table attendance add column if not exists retention_eligible_at timestamptz;
alter table consents add column if not exists retention_eligible_at timestamptz;
alter table messages add column if not exists retention_eligible_at timestamptz;

comment on column students.retention_eligible_at is
  'Provisional POC placeholder (NOT legal sign-off): withdrawn/inactive students = last enrollment end date + 90 days. Inert — no job reads this yet (core-schema-and-rls.md, Retention section).';
comment on column attendance.retention_eligible_at is
  'Inert placeholder; a future retention job keys off this per the owning enrollment''s student. No job reads it yet.';
comment on column consents.retention_eligible_at is
  'Provisional: retained as long as the associated student record exists. Inert until a future retention job.';
comment on column messages.retention_eligible_at is
  'Provisional: purged at pilot close per ADR-0017, not by this column value. Inert until a future retention job.';
```

- [ ] **Step 3: Apply locally**
```bash
npx supabase db reset
```

- [ ] **Step 4: Write the pgTAP test** (structural only: columns exist, nullable, no deletion trigger reads them)

`supabase/tests/070_retention_columns.sql`:
```sql
begin;
select plan(5);

select has_column('public', 'students', 'retention_eligible_at', 'students has retention_eligible_at');
select has_column('public', 'attendance', 'retention_eligible_at', 'attendance has retention_eligible_at');
select has_column('public', 'consents', 'retention_eligible_at', 'consents has retention_eligible_at');
select has_column('public', 'messages', 'retention_eligible_at', 'messages has retention_eligible_at');

select is(
  (select count(*) from information_schema.triggers
   where event_object_table in ('students','attendance','consents','messages')
     and (trigger_name ilike '%retention%' or trigger_name ilike '%delet%')
  )::int,
  0,
  'no deletion/retention job trigger exists yet — the columns are inert, as designed'
);

select * from finish();
rollback;
```

- [ ] **Step 5: Run — expect GREEN**
```bash
npx supabase test db
```
Expected: `070_retention_columns.sql` — 5/5 passing.

- [ ] **Step 6: Commit**
```bash
git add supabase/migrations supabase/tests/070_retention_columns.sql
git commit -m "feat: retention_eligible_at placeholder columns (inert, provisional POC value documented)"
```

---

### Task 9: Synthetic seed data

**Files:**
- Create: `supabase/seed/seed.sql`

**Interfaces:**
- Consumes: every table + trigger from Tasks 2–8.
- Produces: a full synthetic POC dataset loaded automatically on `supabase db reset` (per `config.toml`'s `db.seed.sql_paths = ["./seed.sql"]`).

- [ ] **Step 1: Write `supabase/seed/seed.sql`**
```sql
-- Entirely synthetic POC seed data (doc 2 §6 item 2). No real program-member data, ever.
do $$
declare
  v_center_id uuid := gen_random_uuid();
  v_session_1 uuid := gen_random_uuid();
  v_session_2 uuid := gen_random_uuid();
  v_class_ids uuid[] := array[]::uuid[];
  v_class_id uuid;
  v_family_id uuid;
  v_student_id uuid;
  v_parent_user_id uuid;
  v_teacher_user_id uuid;
  v_coordinator_user_id uuid;
  v_bv_admin_user_id uuid;
  v_multirole_user_id uuid;
  grade_bands text[] := array['KG','Grade3','Grade5','Grade7','HS9-12'];
  i int;
  j int;
  d date;
begin
  insert into centers (id, name) values (v_center_id, 'DFW Metroplex Center');
  insert into sessions (id, center_id, name, start_date, end_date) values
    (v_session_1, v_center_id, '2026-Spring', '2026-01-11', '2026-05-24'),
    (v_session_2, v_center_id, '2026-Fall', '2026-08-16', '2026-12-13');

  -- 5 classes spanning KG..HS across the two sessions.
  for i in 1..5 loop
    v_class_id := gen_random_uuid();
    v_class_ids := array_append(v_class_ids, v_class_id);
    insert into classes (id, session_id, name, grade_band)
    values (v_class_id, case when i <= 3 then v_session_1 else v_session_2 end,
            grade_bands[i] || ' Class', grade_bands[i]);

    v_teacher_user_id := tests.create_supabase_user('teacher' || i || '@bv-seed.test.local');
    insert into user_roles (user_id, role, scope_type, scope_id)
      values (v_teacher_user_id, 'teacher', 'class', v_class_id);
  end loop;

  -- ~20 families, some multi-guardian / multi-child (ADR-0018), ~35 students across the 5 classes.
  for i in 1..20 loop
    v_family_id := gen_random_uuid();
    insert into families (id, label) values (v_family_id, 'Seed Family ' || i);

    v_parent_user_id := tests.create_supabase_user('parent' || i || 'a@bv-seed.test.local');
    insert into family_members (family_id, user_id, relationship) values (v_family_id, v_parent_user_id, 'guardian');

    if i <= 6 then
      -- multi-guardian household
      insert into family_members (family_id, user_id, relationship)
      values (v_family_id, tests.create_supabase_user('parent' || i || 'b@bv-seed.test.local'), 'guardian');
    end if;

    -- 1 or 2 students per family (multi-child for the first 10 families).
    for j in 1..(case when i <= 10 then 2 else 1 end) loop
      v_class_id := v_class_ids[1 + ((i + j) % 5)];
      v_student_id := gen_random_uuid();
      insert into students (id, family_id, first_name, last_name, grade_level, user_id)
      values (
        v_student_id, v_family_id, 'Student' || i || '_' || j, 'Seed',
        (select grade_band from classes where id = v_class_id),
        case when (select grade_band from classes where id = v_class_id) = 'HS9-12'
          then tests.create_supabase_user('student' || i || '_' || j || '@bv-seed.test.local')
          else null
        end
      );

      insert into enrollments (student_id, class_id, session_id, status)
      values (v_student_id, v_class_id, (select session_id from classes where id = v_class_id), 'active');

      -- 4 weeks of Tuesday attendance, mixed present/absent.
      for d in select generate_series('2026-01-13'::date, '2026-02-03'::date, '7 days')::date loop
        insert into attendance (enrollment_id, class_meeting_date, status, marked_by)
        select e.id, d, case when (i + j) % 5 = 0 then 'absent' else 'present' end,
               (select user_id from user_roles where scope_type = 'class' and scope_id = v_class_id and role = 'teacher' limit 1)
        from enrollments e where e.student_id = v_student_id and e.class_id = v_class_id;
      end loop;

      insert into consents (student_id, consent_type, granted, granted_by) values
        (v_student_id, 'participation', true, v_parent_user_id),
        (v_student_id, 'media', (i % 4 <> 0), v_parent_user_id);
    end loop;
  end loop;

  -- Session-scoped Coordinator + org-scoped BV Coordinator/Admin.
  v_coordinator_user_id := tests.create_supabase_user('coordinator1@bv-seed.test.local');
  insert into user_roles (user_id, role, scope_type, scope_id) values (v_coordinator_user_id, 'coordinator', 'session', v_session_1);

  v_bv_admin_user_id := tests.create_supabase_user('bvcoordinator1@bv-seed.test.local');
  insert into user_roles (user_id, role, scope_type, scope_id) values (v_bv_admin_user_id, 'bv_coordinator', 'org', null);

  insert into user_roles (user_id, role, scope_type, scope_id)
    values (tests.create_supabase_user('admin1@bv-seed.test.local'), 'admin', 'org', null);

  -- Thinnest-slice multi-role coverage: one real account holding Parent+Teacher+Coordinator+BV Coordinator (doc 2 §5).
  v_multirole_user_id := tests.create_supabase_user('multirole@bv-seed.test.local');
  insert into family_members (family_id, user_id, relationship)
    values ((select id from families order by id limit 1), v_multirole_user_id, 'guardian');
  insert into user_roles (user_id, role, scope_type, scope_id) values
    (v_multirole_user_id, 'parent', 'org', null) -- parent has no scope_id concept; stored as org/null, resolved via family_members at read time
    on conflict do nothing;
  insert into user_roles (user_id, role, scope_type, scope_id) values
    (v_multirole_user_id, 'teacher', 'class', v_class_ids[1]),
    (v_multirole_user_id, 'coordinator', 'session', v_session_1),
    (v_multirole_user_id, 'bv_coordinator', 'org', null);
end $$;
```

- [ ] **Step 2: Apply + verify it re-applies cleanly (AC #10)**
```bash
npx supabase db reset
```
Expected: migrations apply, then `seed.sql` runs without error. Spot-check:
```bash
npx supabase db psql -c "select count(*) from students;"   # expect ~35-40
npx supabase db psql -c "select count(*) from families;"   # expect 20
npx supabase db psql -c "select count(*) from conversation_participants;"  # expect > 0 (trigger-populated)
```

- [ ] **Step 3: Run the full pgTAP suite against the seeded DB** (confirms fixture-based tests still pass with real seed data present — each test file wraps in `begin;...rollback;` so seed data isn't disturbed)
```bash
npx supabase test db
```
Expected: all prior test files still pass.

- [ ] **Step 4: Commit**
```bash
git add supabase/seed/seed.sql
git commit -m "feat: synthetic POC seed data (20 families, ~35 students, multi-role account)"
```

---

### Task 10: Multi-role isolation test + full-suite verification + spec close-out

**Files:**
- Create: `supabase/tests/090_multi_role_isolation.sql`
- Modify: `.docs/specs/system/_index.md`

**Interfaces:** none new — this task proves the whole suite together and closes out the spec.

- [ ] **Step 1: Write the multi-role isolation test (test plan #5)** — uses the seeded `multirole@bv-seed.test.local` account from Task 9, proving each simulated role yields only that role's scope with zero cross-contamination.

`supabase/tests/090_multi_role_isolation.sql`:
```sql
begin;
select plan(4);

select id into temp table _multirole_user from auth.users where email = 'multirole@bv-seed.test.local';
select count(*) as v_total_centers from centers \gset

select tests.authenticate_as((select id from _multirole_user), 'parent');
select ok(
  (select count(*) from students) > 0
  and (select count(*) from students) = (
    select count(*) from students s
    join family_members fm on fm.family_id = s.family_id
    where fm.user_id = (select id from _multirole_user)
  ),
  'simulating parent on the multi-role account yields only that guardian''s own children'
);

select tests.authenticate_as(
  (select id from _multirole_user), 'teacher', 'class',
  (select scope_id from user_roles where user_id = (select id from _multirole_user) and role = 'teacher')
);
select ok(
  (select count(*) from classes) = 1,
  'simulating teacher on the same account yields exactly their one assigned class, not their parent-scope children''s classes too'
);

select tests.authenticate_as(
  (select id from _multirole_user), 'coordinator', 'session',
  (select scope_id from user_roles where user_id = (select id from _multirole_user) and role = 'coordinator')
);
select ok(
  (select count(*) from classes) >= 1
  and not exists (
    select 1 from classes c where c.session_id <> (
      select scope_id from user_roles where user_id = (select id from _multirole_user) and role = 'coordinator'
    )
  ),
  'simulating coordinator on the same account yields only their session''s classes'
);

select tests.authenticate_as((select id from _multirole_user), 'bv_coordinator', 'org', null);
select is(
  (select count(*) from centers)::int, :v_total_centers::int,
  'simulating bv_coordinator on the same account yields every center (org scope), not just their parent/teacher/coordinator subset'
);

select tests.clear_authentication();
select * from finish();
rollback;
```

- [ ] **Step 2: Run the new test**
```bash
npx supabase test db
```
Expected: `090_multi_role_isolation.sql` — 4/4 passing.

- [ ] **Step 3: Full clean-reset + full-suite run (final gate, mirrors the §6.3 workflow diagram)**
```bash
npx supabase db reset
npx supabase test db
```
Expected: every test file (`000` through `090`) passes — this is the "merge gate" the constitution requires before this migration set can be considered prod-eligible (the actual prod gate is the migration-guard hook at promotion time, outside this plan's scope).

- [ ] **Step 4: Self-review against the spec's acceptance criteria** (run through AC #1–#11 from `core-schema-and-rls.md` and confirm each has a task+test; no code changes, verification only).

- [ ] **Step 5: Mark the spec Built** — in `.docs/specs/system/_index.md`, change the `core-schema-and-rls` row's status cell from `Design signed off (ADR-0018, ADR-0019) — ready for /plan` to `Built — pending /test ([plan](core-schema-and-rls.plan.md))`.

- [ ] **Step 6: Commit**
```bash
git add supabase/tests/090_multi_role_isolation.sql .docs/specs/system/_index.md
git commit -m "test: multi-role isolation coverage + full-suite green; core-schema-and-rls built"
```

---

## Self-Review (against the spec)

**Acceptance criteria coverage:**
- AC #1 (operational core + RLS) → Task 2 ✓
- AC #2 (`families` household unit) → Task 2 (DDL) + Task 2 policies ✓ (ADR-0018)
- AC #3 (`user_roles` catalog, locked down) → Task 3 ✓
- AC #4 (`consents`) → Task 4 ✓
- AC #5 (`audit_log`) → Task 5 ✓
- AC #6 (`push_subscriptions`) → Task 6 ✓
- AC #7 (chat durability + no P2P DM) → Task 7 ✓
- AC #8 (retention fields, inert) → Task 8 ✓
- AC #9 (adversarial pgTAP suite, no cross-scope leakage) → Tasks 2,3,4,5,6,7,10 (multi-role) ✓
- AC #10 (synthetic seed, clean `db reset`) → Task 9 ✓
- AC #11 (migrations-only) → every task uses `supabase migration new` ✓

**Edge cases covered:** cross-scope join leakage (Task 2 test, teacher/coordinator join-path assertions) · multi-role isolation (Task 10) · Coordinator vs BV Coordinator boundary (Task 2 test, sibling-session assertion) · chat governance under simulated Student claim (Task 7 test) · audit-log completeness via RPC (Task 5) · retention job not accidentally deleting anything (Task 8, structural no-trigger check) · CSV-import-shaped schema (enrollments/students/families shape from Task 2, import mechanism itself correctly excluded) · enrollment mid-session class change (partial-unique index only constrains active rows, Task 2) · HS-student-without-login gap (`students.user_id` nullable throughout, exercised in Task 7's seed/test).

**Placeholder scan:** no TBD/TODO markers; every step carries complete SQL or an exact command with expected output.

**Type consistency check:** `students`, `attendance`, `consents`, `enrollments`, `classes`, `conversations`, `conversation_participants`, `user_roles` column names/types are identical everywhere they're referenced across Tasks 2–10 (verified by re-reading each cross-task join against Task 2/3/4/7's DDL while drafting).

**Nothing architecturally significant surfaced beyond the resolved deferred mechanics documented in Global Constraints** (families/family_members scope, chat trigger behavior, audit_log SELECT predicate) — these are schema/policy-shape judgment calls within the already-approved design, not new architectural decisions, so no bounce to `/architect`.

---

## Sign-off
- [ ] **Human sign-off on this plan** → `/migration` (already embedded — every task *is* a migration) → ready for `/build`.
