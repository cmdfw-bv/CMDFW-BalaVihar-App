# Plan — Teacher: class-update-and-home-feed

> Spec: [class-update-and-home-feed.md](class-update-and-home-feed.md) · ADR-0030, ADR-0031 (both Closed) · stage: `/plan` (this doc) → `/migration` ✓ (2026-07-24, Stage 1 only — see M1–M5 below) → `/build` ✓ (2026-07-24, Stages 2–5 — see W8 below) → next `/test`

## Plan-level decisions beyond the signed-off `/design`

The signed-off design's table catalog and RLS SQL are implemented **verbatim** below, with two narrow additions the design didn't specify because they're implementation-level, not access-control decisions — neither reopens ADR-0030 (they don't change *who* can read what, only *what a row records once you're already allowed to read it*):

1. **`comments.author_role text not null`** (`'student'|'parent'|'teacher'`), set at insert time and pinned to the inserting role by each insert policy's `with check`. The design's UI section renders `Comment`'s `author.role` badge for every comment, but no table column carries that role and none of the three role-scoped `SELECT` policies can derive it after the fact from `author_user_id` alone (a multi-role account could hold more than one role over time). Storing it is the same posture as everything else here — the value the DB already knows at write time, not re-derived.
2. **`public.resolve_parent_family_label(p_parent_user_id, p_class_id)`** — a `SECURITY DEFINER` RPC so a Teacher's stacked-private-thread UI (design decision #4) can label each thread card with the target Parent/family's name. The design explicitly says to reuse "`family_members`/`students`' existing display convention, not a new PII surface" — `resolve_my_scope_labels()` already established that convention (`string_agg(students.first_name)`) but is keyed to `auth.uid() = ur.user_id`, so it can only ever answer "what's *my own* label," never "what's *this other Parent's* label" — which is exactly what the Teacher's card needs. This function is the missing direction, gated identically to `is_parent_of_class`: only the class's current Teacher, its Coordinator, or org oversight can resolve a label, and only for a Parent who is actually enrolled-linked to that class. Unauthorized/no-match calls return `null`, not an error — no existence leak.

No author *name* resolution is added anywhere (not for `class_updates.posted_by`, not for `comments.author_user_id`) — confirmed by re-reading the design's own UI section, which renders `FeedCard`'s `author={{ role: "teacher", scope: <class label> }}` with no `name`, and by checking `students`' RLS (`students_parent_select`/`students_student_select` — no `teacher`/cross-family branch exists at all). A Teacher has no RLS path to any student's name today; inventing one to label a comment would be a real new PII surface, which the design explicitly ruled out for the private-thread case and never asked for elsewhere. `Comment`'s `author.name` prop is optional and degrades to a `"?"` avatar — this ships without it.

## Shared seam

**Stage 1 (migrations — `class_updates`/`comments` tables + RLS + `is_parent_of_class` + `resolve_parent_family_label`) is the serialized gate**, same classification as every prior System/Teacher item touching schema.

**Stage 2 (`netlify/functions/push-send.ts`'s `class_update_id` branch) has zero DB dependency** — its own test suite mocks the Supabase client (matching `push-send.test.ts`'s existing style), so it builds and is fully TDD-verified independent of Stage 1 landing.

**Stage 3 (client pure logic — `threadAssembly.ts`, `classUpdatePayload.ts`) also has zero DB dependency** — pure functions, vitest-unit-tested, buildable in any order relative to Stages 1–2.

**Stages 4–5 (client data layer + screens/routes) need Stage 1 live locally** to smoke-test against a real DB, and are **verified by hand at `/build`** (`npm run dev` + manual walkthrough per role), not by a component unit test — this repo has no RN component-test harness (`vitest.config.ts` only covers pure-logic globs), the same testability line `client-auth-session-and-nav`'s plan already drew and this one follows without re-litigating.

**Branch:** current branch `mehtamaulik-creator/issue-21-class-update-home`. Single cohesive Teacher-owned unit of work (§12.6) — no worktree needed.

**Verify-at-build flag:** `ClassUpdateDetailScreen.tsx`'s per-Parent private-thread composer wiring (design decision #4's stacked threads) and its `resolve_parent_family_label` card-label lookup are a considered first attempt at the shape decision #4 describes, not a locked contract — adjust the exact prop wiring at `/build` if Expo Router's `useLocalSearchParams` typing or the nested-composer callback shape needs a different split. The *behavior* (Student: one public thread; Parent: one merged thread; Teacher: one public + one per active private Parent thread, oldest-first) is the AC, not this exact file layout.

---

## Task list (ordered — TDD throughout)

### Stage 1 — Migrations (serialized)

- [x] **M1 — pgTAP tests (RED)** `supabase/tests/160_class_updates_and_comments_rls.sql`
  ```sql
  begin;
  select plan(22);

  insert into centers (id, name) values ('cd888888-0000-0000-0000-000000000001', 'Plan Center');
  insert into sessions (id, center_id, name, start_date, end_date) values
    ('cd888888-0000-0000-0000-000000000011', 'cd888888-0000-0000-0000-000000000001', 'Session One', '2026-01-01', '2026-06-01'),
    ('cd888888-0000-0000-0000-000000000012', 'cd888888-0000-0000-0000-000000000001', 'Session Two', '2026-01-01', '2026-06-01');
  insert into classes (id, session_id, name, grade_band) values
    ('cd888888-0000-0000-0000-000000000021', 'cd888888-0000-0000-0000-000000000011', 'Class A', 'HS9-12'),
    ('cd888888-0000-0000-0000-000000000022', 'cd888888-0000-0000-0000-000000000012', 'Class B', 'HS9-12');

  insert into families (id, label) values
    ('cd888888-0000-0000-0000-000000000031', 'Family A1'),
    ('cd888888-0000-0000-0000-000000000032', 'Family A2');

  select tests.create_supabase_user('plan-teacher-a@test.local') as v_teacher_a \gset
  select tests.create_supabase_user('plan-teacher-b@test.local') as v_teacher_b \gset
  select tests.create_supabase_user('plan-student-a1@test.local') as v_student_a1 \gset
  select tests.create_supabase_user('plan-student-a2@test.local') as v_student_a2 \gset
  select tests.create_supabase_user('plan-parent-a1@test.local') as v_parent_a1 \gset
  select tests.create_supabase_user('plan-parent-a2@test.local') as v_parent_a2 \gset
  select tests.create_supabase_user('plan-coordinator-s1@test.local') as v_coordinator_s1 \gset
  select tests.create_supabase_user('plan-coordinator-s2@test.local') as v_coordinator_s2 \gset
  select tests.create_supabase_user('plan-admin@test.local') as v_admin \gset
  select tests.create_supabase_user('plan-outsider@test.local') as v_outsider \gset

  insert into family_members (family_id, user_id, relationship) values
    ('cd888888-0000-0000-0000-000000000031', :'v_parent_a1'::uuid, 'guardian'),
    ('cd888888-0000-0000-0000-000000000032', :'v_parent_a2'::uuid, 'guardian');

  insert into students (id, family_id, first_name, last_name, grade_level, user_id) values
    ('cd888888-0000-0000-0000-000000000041', 'cd888888-0000-0000-0000-000000000031', 'Ann', 'One', 'HS9', :'v_student_a1'::uuid),
    ('cd888888-0000-0000-0000-000000000042', 'cd888888-0000-0000-0000-000000000032', 'Bea', 'Two', 'HS9', :'v_student_a2'::uuid);

  -- Both students enrolled in Class A — gives parent_a1 and parent_a2 a shared class, needed
  -- to prove each parent sees only their own private thread on the same class_update (edge case).
  insert into enrollments (student_id, class_id, session_id, status) values
    ('cd888888-0000-0000-0000-000000000041', 'cd888888-0000-0000-0000-000000000021', 'cd888888-0000-0000-0000-000000000011', 'active'),
    ('cd888888-0000-0000-0000-000000000042', 'cd888888-0000-0000-0000-000000000021', 'cd888888-0000-0000-0000-000000000011', 'active');

  -- Fixture rows inserted directly (bypasses RLS at setup time — same convention as
  -- 060_chat_rls.sql's own fixtures) so the read-side policies below have real rows to check.
  insert into class_updates (id, class_id, posted_by, body, homework) values
    ('cd888888-0000-0000-0000-000000000051', 'cd888888-0000-0000-0000-000000000021', :'v_teacher_a'::uuid, 'Class A update', null),
    ('cd888888-0000-0000-0000-000000000052', 'cd888888-0000-0000-0000-000000000022', :'v_teacher_b'::uuid, 'Class B update', null);

  insert into comments (id, class_update_id, author_user_id, author_role, body, is_private, target_parent_id) values
    ('cd888888-0000-0000-0000-000000000061', 'cd888888-0000-0000-0000-000000000051', :'v_student_a1'::uuid, 'student', 'public comment on A', false, null),
    ('cd888888-0000-0000-0000-000000000062', 'cd888888-0000-0000-0000-000000000051', :'v_parent_a1'::uuid, 'parent', 'private note from parent A1', true, :'v_parent_a1'::uuid),
    ('cd888888-0000-0000-0000-000000000063', 'cd888888-0000-0000-0000-000000000052', :'v_parent_a2'::uuid, 'parent', 'fixture-only private note on B', true, :'v_parent_a2'::uuid);

  -- (1) Teacher A: exactly their own class's update.
  select tests.authenticate_as(:'v_teacher_a'::uuid, 'teacher', 'class', 'cd888888-0000-0000-0000-000000000021'::uuid);
  select is((select count(*) from class_updates)::int, 1, 'Teacher sees exactly their own active-role class''s update');

  -- (2) Teacher A can insert into their own class.
  select lives_ok(
    $$insert into class_updates (class_id, posted_by, body) values ('cd888888-0000-0000-0000-000000000021'::uuid, auth.uid(), 'another update')$$,
    'Teacher can insert a class_update into their own active-role class'
  );

  -- (3) Teacher A cannot insert into a different class.
  select throws_ok(
    $$insert into class_updates (class_id, posted_by, body) values ('cd888888-0000-0000-0000-000000000022'::uuid, auth.uid(), 'wrong class')$$,
    '42501', null, 'Teacher cannot insert a class_update into a class outside their active-role scope'
  );
  select tests.clear_authentication();

  -- (4) Parent A1: exactly their child's class's update.
  select tests.authenticate_as(:'v_parent_a1'::uuid, 'parent');
  select is((select count(*) from class_updates)::int, 1, 'Parent sees exactly their enrolled child''s class update');

  -- (7) Parent A1 sees the public comment plus their own private one (2), not Parent A2's.
  select is((select count(*) from comments)::int, 2, 'Parent sees the public comment and only their own private thread');
  select tests.clear_authentication();

  -- (5) Student A1: exactly their own class's update.
  select tests.authenticate_as(:'v_student_a1'::uuid, 'student');
  select is((select count(*) from class_updates)::int, 1, 'Student sees exactly their own class''s update');

  -- (6) Student A1 sees only the public comment — never any private row, ever.
  select is((select count(*) from comments)::int, 1, 'Student sees only the public comment, no private thread');

  -- Student cannot post a private comment.
  select throws_ok(
    format($$insert into comments (class_update_id, author_user_id, author_role, body, is_private, target_parent_id)
      values ('cd888888-0000-0000-0000-000000000051'::uuid, %L, 'student', 'trying private', true, %L)$$, :'v_student_a1'::uuid, :'v_parent_a1'::uuid),
    '42501', null, 'Student cannot post a private comment'
  );
  select tests.clear_authentication();

  -- (8) Parent A2 (sibling family, same class): sees the public comment, never Parent A1's private thread.
  select tests.authenticate_as(:'v_parent_a2'::uuid, 'parent');
  select is(
    (select count(*) from comments where class_update_id = 'cd888888-0000-0000-0000-000000000051'::uuid)::int, 1,
    'A different Parent on the same class_update never sees another family''s private thread'
  );

  -- Parent A2 cannot impersonate Parent A1 by targeting someone else's target_parent_id.
  select throws_ok(
    format($$insert into comments (class_update_id, author_user_id, author_role, body, is_private, target_parent_id)
      values ('cd888888-0000-0000-0000-000000000051'::uuid, %L, 'parent', 'spoofed target', true, %L)$$, :'v_parent_a2'::uuid, :'v_parent_a1'::uuid),
    '42501', null, 'A Parent cannot set target_parent_id to another Parent''s id (self-target only)'
  );
  select tests.clear_authentication();

  -- (9)/(10) Teacher's private-reply guard: rejects a non-Parent-of-class target, accepts a real one.
  select tests.authenticate_as(:'v_teacher_a'::uuid, 'teacher', 'class', 'cd888888-0000-0000-0000-000000000021'::uuid);
  select throws_ok(
    format($$insert into comments (class_update_id, author_user_id, author_role, body, is_private, target_parent_id)
      values ('cd888888-0000-0000-0000-000000000051'::uuid, %L, 'teacher', 'reply to nobody', true, %L)$$, :'v_teacher_a'::uuid, :'v_outsider'::uuid),
    '42501', null, 'is_parent_of_class rejects a Teacher''s private reply whose target isn''t actually a Parent of that class'
  );
  select lives_ok(
    format($$insert into comments (class_update_id, author_user_id, author_role, body, is_private, target_parent_id)
      values ('cd888888-0000-0000-0000-000000000051'::uuid, %L, 'teacher', 'reply to parent A1', true, %L)$$, :'v_teacher_a'::uuid, :'v_parent_a1'::uuid),
    'is_parent_of_class accepts a Teacher''s private reply targeting a real Parent of that class'
  );

  -- No update/delete grant exists on either table for any role, including Teacher on their own post.
  select throws_ok(
    $$update class_updates set body = 'edited' where id = 'cd888888-0000-0000-0000-000000000051'::uuid$$,
    '42501', null, 'no role — including the posting Teacher — can update a class_update (no moderation/edit in scope)'
  );
  select throws_ok(
    $$delete from comments where id = 'cd888888-0000-0000-0000-000000000061'::uuid$$,
    '42501', null, 'no role can delete a comment (moderation explicitly out of scope)'
  );

  -- (22) resolve_parent_family_label: Teacher A resolves Parent A1's label; Teacher B (wrong class) gets null.
  select is(
    (select public.resolve_parent_family_label(:'v_parent_a1'::uuid, 'cd888888-0000-0000-0000-000000000021'::uuid)),
    'Ann', 'Teacher of the class resolves the target Parent''s family label'
  );
  select tests.clear_authentication();
  select tests.authenticate_as(:'v_teacher_b'::uuid, 'teacher', 'class', 'cd888888-0000-0000-0000-000000000022'::uuid);
  select is(
    (select public.resolve_parent_family_label(:'v_parent_a1'::uuid, 'cd888888-0000-0000-0000-000000000021'::uuid)),
    null, 'A Teacher outside the class gets null, not another class''s family data'
  );
  select tests.clear_authentication();

  -- (13)/(14) Coordinator S1 (session one): sees Class A's update, not Class B's (sibling session).
  select tests.authenticate_as(:'v_coordinator_s1'::uuid, 'coordinator', 'session', 'cd888888-0000-0000-0000-000000000011'::uuid);
  select is((select count(*) from class_updates)::int, 1, 'Coordinator sees only their own session''s class_updates');
  select is(
    (select count(*) from class_updates where id = 'cd888888-0000-0000-0000-000000000052'::uuid)::int, 0,
    'Coordinator does not see a sibling session''s class_update, proving session-scoping (not center-wide)'
  );

  -- (15) Coordinator S1 oversight: full read (public + private) on their session's class_update.
  select is(
    (select count(*) from comments where class_update_id = 'cd888888-0000-0000-0000-000000000051'::uuid)::int, 2,
    'Coordinator oversight reads both the public comment and the private thread on their own session''s update'
  );
  select tests.clear_authentication();

  -- (16) Coordinator S2 (different session): zero rows into Class A's data.
  select tests.authenticate_as(:'v_coordinator_s2'::uuid, 'coordinator', 'session', 'cd888888-0000-0000-0000-000000000012'::uuid);
  select is(
    (select count(*) from class_updates where id = 'cd888888-0000-0000-0000-000000000051'::uuid)::int, 0,
    'A Coordinator from a different session sees zero rows of Class A''s update — no session-to-session leak'
  );
  select tests.clear_authentication();

  -- (17)/(18) Admin: org-wide, both class_updates and every comment (public + private, both classes).
  select tests.authenticate_as(:'v_admin'::uuid, 'admin', 'org', null);
  select is((select count(*) from class_updates)::int, 2, 'Admin sees every class_update, org-wide');
  select is((select count(*) from comments)::int, 3, 'Admin sees every comment (public and private) org-wide, both classes');
  select throws_ok(
    $$update class_updates set body = 'admin edit' where id = 'cd888888-0000-0000-0000-000000000051'::uuid$$,
    '42501', null, 'Admin oversight is read-only — no update grant exists even org-wide'
  );
  select tests.clear_authentication();

  -- (21) Role-switch atomicity: same account, Teacher scope sees 1 row, Parent scope (unrelated) sees 0 — no stale leak.
  select tests.authenticate_as(:'v_teacher_a'::uuid, 'teacher', 'class', 'cd888888-0000-0000-0000-000000000021'::uuid);
  select is((select count(*) from class_updates)::int, 1, 'pre-switch: Teacher A sees their class''s update');
  select tests.clear_authentication();
  select tests.authenticate_as(:'v_teacher_a'::uuid, 'parent');
  select is(
    (select count(*) from class_updates)::int, 0,
    'post-switch: same account as an unrelated Parent role sees zero rows immediately — no stale Teacher-scope leak'
  );
  select tests.clear_authentication();

  select * from finish();
  rollback;
  ```
  Run `npm run db:reset` first to confirm this fails (relations `class_updates`/`comments` don't exist yet) = RED ✓.

  **Landed with two `/migration`-stage fixes to this draft (2026-07-24), neither changing what's tested:** (1) `plan(22)` → `plan(25)` — the draft undercounted its own assertions (25 `is`/`lives_ok`/`throws_ok` calls run, not 22). (2) The two `lives_ok` positive-insert checks (Teacher inserting into their own class; Teacher's private reply to Parent A1) are each wrapped in `savepoint` / `rollback to savepoint` — as drafted, both inserts persisted for the rest of the single wrapping transaction and inflated every later `count(*)` assertion (Parent/Student/Coordinator/Admin counts all off by one). The savepoint still proves the insert succeeds (`lives_ok` passes) without leaking the row into later state.

- [x] **M2 — Migration: schema** `npx supabase migration new class_updates_and_comments_schema`
  ```sql
  create table if not exists class_updates (
    id uuid primary key default gen_random_uuid(),
    class_id uuid not null references classes(id) on delete restrict,
    posted_by uuid not null references auth.users(id) on delete set null,
    body text not null,
    homework text,
    created_at timestamptz not null default now()
  );

  -- author_role: a plan-level addition (see plan doc, "Plan-level decisions") — the UI's Comment
  -- badge needs the role the author posted as; no existing column or join can re-derive it after
  -- the fact for a multi-role account. Pinned to the inserting role by each insert policy below,
  -- not client-trusted.
  create table if not exists comments (
    id uuid primary key default gen_random_uuid(),
    class_update_id uuid not null references class_updates(id) on delete cascade,
    author_user_id uuid not null references auth.users(id) on delete set null,
    author_role text not null check (author_role in ('student', 'parent', 'teacher')),
    body text not null,
    is_private boolean not null default false,
    target_parent_id uuid references auth.users(id) on delete set null,
    created_at timestamptz not null default now(),
    constraint comments_private_target_shape check (
      (is_private = false and target_parent_id is null) or (is_private = true and target_parent_id is not null)
    )
  );

  alter table class_updates enable row level security;
  alter table comments enable row level security;
  ```

- [x] **M3 — Migration: RLS + grants** `npx supabase migration new class_updates_and_comments_rls`
  Verbatim from the signed-off `/design`'s RLS SQL, with `author_role` pinned in each `comments` insert policy (the one addition beyond the design text):
  ```sql
  grant select, insert on class_updates to authenticated;
  grant select, insert on comments to authenticated;

  create policy class_updates_teacher_select on class_updates for select
  using (
    auth.jwt()->>'active_role' = 'teacher'
    and class_updates.class_id = (auth.jwt()->>'scope_id')::uuid
  );
  create policy class_updates_student_select on class_updates for select
  using (
    auth.jwt()->>'active_role' = 'student'
    and exists (
      select 1 from enrollments e join students s on s.id = e.student_id
      where e.class_id = class_updates.class_id and s.user_id = auth.uid()
    )
  );
  create policy class_updates_parent_select on class_updates for select
  using (
    auth.jwt()->>'active_role' = 'parent'
    and exists (
      select 1 from enrollments e
      join students s on s.id = e.student_id
      join family_members fm on fm.family_id = s.family_id
      where e.class_id = class_updates.class_id and fm.user_id = auth.uid()
    )
  );
  create policy class_updates_teacher_insert on class_updates for insert
  with check (
    auth.jwt()->>'active_role' = 'teacher'
    and class_updates.posted_by = auth.uid()
    and class_updates.class_id = (auth.jwt()->>'scope_id')::uuid
  );

  create policy class_updates_coordinator_select on class_updates for select
  using (
    auth.jwt()->>'active_role' = 'coordinator'
    and exists (
      select 1 from classes c
      where c.id = class_updates.class_id and c.session_id = (auth.jwt()->>'scope_id')::uuid
    )
  );
  create policy class_updates_org_select on class_updates for select
  using (auth.jwt()->>'active_role' in ('bv_coordinator','admin'));

  create or replace function public.is_parent_of_class(p_user_id uuid, p_class_id uuid)
  returns boolean language sql stable security definer set search_path = public
  as $$
    select exists (
      select 1 from enrollments e
      join students s on s.id = e.student_id
      join family_members fm on fm.family_id = s.family_id
      where e.class_id = p_class_id and fm.user_id = p_user_id
    );
  $$;
  revoke execute on function public.is_parent_of_class(uuid, uuid) from public, anon;
  grant execute on function public.is_parent_of_class(uuid, uuid) to authenticated;

  create policy comments_teacher_public_select on comments for select
  using (
    auth.jwt()->>'active_role' = 'teacher'
    and comments.is_private = false
    and exists (
      select 1 from class_updates cu
      where cu.id = comments.class_update_id and cu.class_id = (auth.jwt()->>'scope_id')::uuid
    )
  );
  create policy comments_student_public_select on comments for select
  using (
    auth.jwt()->>'active_role' = 'student'
    and comments.is_private = false
    and exists (
      select 1 from class_updates cu
      join enrollments e on e.class_id = cu.class_id
      join students s on s.id = e.student_id
      where cu.id = comments.class_update_id and s.user_id = auth.uid()
    )
  );
  create policy comments_parent_public_select on comments for select
  using (
    auth.jwt()->>'active_role' = 'parent'
    and comments.is_private = false
    and exists (
      select 1 from class_updates cu
      join enrollments e on e.class_id = cu.class_id
      join students s on s.id = e.student_id
      join family_members fm on fm.family_id = s.family_id
      where cu.id = comments.class_update_id and fm.user_id = auth.uid()
    )
  );

  create policy comments_target_parent_select on comments for select
  using (
    auth.jwt()->>'active_role' = 'parent'
    and comments.is_private = true
    and comments.target_parent_id = auth.uid()
  );
  create policy comments_poster_teacher_private_select on comments for select
  using (
    auth.jwt()->>'active_role' = 'teacher'
    and comments.is_private = true
    and exists (
      select 1 from class_updates cu
      where cu.id = comments.class_update_id and cu.posted_by = auth.uid()
    )
  );

  create policy comments_coordinator_select on comments for select
  using (
    auth.jwt()->>'active_role' = 'coordinator'
    and exists (select 1 from class_updates cu where cu.id = comments.class_update_id)
  );
  create policy comments_org_select on comments for select
  using (auth.jwt()->>'active_role' in ('bv_coordinator','admin'));

  create policy comments_teacher_insert on comments for insert
  with check (
    auth.jwt()->>'active_role' = 'teacher'
    and comments.author_user_id = auth.uid()
    and comments.author_role = 'teacher'
    and exists (
      select 1 from class_updates cu
      where cu.id = comments.class_update_id and cu.class_id = (auth.jwt()->>'scope_id')::uuid
    )
    and (
      (comments.is_private = false and comments.target_parent_id is null)
      or (
        comments.is_private = true
        and comments.target_parent_id is not null
        and public.is_parent_of_class(comments.target_parent_id, (auth.jwt()->>'scope_id')::uuid)
      )
    )
  );
  create policy comments_student_insert on comments for insert
  with check (
    auth.jwt()->>'active_role' = 'student'
    and comments.author_user_id = auth.uid()
    and comments.author_role = 'student'
    and comments.is_private = false
    and comments.target_parent_id is null
    and exists (
      select 1 from class_updates cu
      join enrollments e on e.class_id = cu.class_id
      join students s on s.id = e.student_id
      where cu.id = comments.class_update_id and s.user_id = auth.uid()
    )
  );
  create policy comments_parent_insert on comments for insert
  with check (
    auth.jwt()->>'active_role' = 'parent'
    and comments.author_user_id = auth.uid()
    and comments.author_role = 'parent'
    and (
      (comments.is_private = false and comments.target_parent_id is null)
      or (comments.is_private = true and comments.target_parent_id = auth.uid())
    )
    and exists (
      select 1 from class_updates cu
      join enrollments e on e.class_id = cu.class_id
      join students s on s.id = e.student_id
      join family_members fm on fm.family_id = s.family_id
      where cu.id = comments.class_update_id and fm.user_id = auth.uid()
    )
  );
  ```

- [x] **M4 — Migration: `resolve_parent_family_label` RPC** `npx supabase migration new class_update_comment_recipient_label_rpc`
  ```sql
  -- Teacher's stacked private-thread UI (design decision #4) needs to label each thread card with
  -- the target Parent/family's name, reusing resolve_my_scope_labels()'s existing
  -- string_agg(students.first_name) display convention rather than inventing a new PII surface —
  -- but that function is keyed to auth.uid() = ur.user_id, so it can only ever answer "what's MY
  -- own label," never "what's THIS Parent's label." This adds the missing direction, gated exactly
  -- as narrowly as is_parent_of_class: only the class's Teacher or an oversight role may resolve a
  -- label, and only for a Parent genuinely enrolled-linked to that class. No match/no
  -- authorization -> null, not an error (no existence leak).
  create or replace function public.resolve_parent_family_label(p_parent_user_id uuid, p_class_id uuid)
  returns text
  language sql
  stable
  security definer
  set search_path = public
  as $$
    select string_agg(s.first_name, ', ' order by s.first_name)
    from family_members fm
    join students s on s.family_id = fm.family_id
    join enrollments e on e.student_id = s.id
    where fm.user_id = p_parent_user_id
      and e.class_id = p_class_id
      and e.status = 'active'
      and (
        (auth.jwt()->>'active_role' = 'teacher' and (auth.jwt()->>'scope_id')::uuid = p_class_id)
        or (auth.jwt()->>'active_role' = 'coordinator' and exists (
          select 1 from classes c where c.id = p_class_id and c.session_id = (auth.jwt()->>'scope_id')::uuid
        ))
        or auth.jwt()->>'active_role' in ('bv_coordinator', 'admin')
      );
  $$;

  revoke all on function public.resolve_parent_family_label(uuid, uuid) from public;
  grant execute on function public.resolve_parent_family_label(uuid, uuid) to authenticated;
  ```

- [x] **M5 — Green** `npm run db:reset` → confirm 160 suite passes (plan(25) after the M1 fix, 25/25); full existing suite (000–150, 999) stays green — 194/194 total, `Result: PASS`.

---

### Stage 2 — `push-send`'s `class_update_id` branch (ADR-0031; pure/mockable, TDD)

- [x] **P1 — tests (RED)** `netlify/functions/__tests__/class-update-dispatch.test.ts`
  ```typescript
  import { describe, it, expect } from 'vitest';
  import { mergeClassUpdateRecipients, CLASS_UPDATE_PUSH_TITLE } from '../lib/class-update-dispatch';

  describe('mergeClassUpdateRecipients', () => {
    it('drops the posting teacher even if present in the input (self-notification exclusion)', () => {
      expect(mergeClassUpdateRecipients(['a', 'teacher-1', 'b'], 'teacher-1')).toEqual(['a', 'b']);
    });
    it('de-dupes ids appearing in both the student and parent sets', () => {
      expect(mergeClassUpdateRecipients(['a', 'a', 'b'], 'poster')).toEqual(['a', 'b']);
    });
    it('drops null ids (students with no login, core-schema-and-rls convention)', () => {
      expect(mergeClassUpdateRecipients(['a', null, 'b'], 'poster')).toEqual(['a', 'b']);
    });
    it('returns [] for empty input (zero-enrollment class, edge case)', () => {
      expect(mergeClassUpdateRecipients([], 'poster')).toEqual([]);
    });
  });

  describe('CLASS_UPDATE_PUSH_TITLE', () => {
    it('is the exact, PII-free copy string from /design', () => {
      expect(CLASS_UPDATE_PUSH_TITLE).toBe('New update posted in your class');
    });
  });
  ```
  Run: `npx vitest run netlify/functions/__tests__/class-update-dispatch.test.ts` → FAIL (module doesn't exist) = RED ✓.

- [x] **P2 — implementation** `netlify/functions/lib/class-update-dispatch.ts`
  ```typescript
  export const CLASS_UPDATE_PUSH_TITLE = 'New update posted in your class';

  // Recipient ids arrive from two separate queries (students-with-login, then their
  // parents/guardians via family_members) — the one shared, pure step: de-dupe across both sets
  // and drop the posting Teacher (mirrors isRecipient's sender check in push-dispatch.ts).
  export function mergeClassUpdateRecipients(userIds: (string | null)[], posterUserId: string): string[] {
    const unique = new Set<string>();
    for (const id of userIds) {
      if (id && id !== posterUserId) unique.add(id);
    }
    return Array.from(unique);
  }
  ```
  Run P1 → GREEN ✓.

- [x] **P3 — tests (RED)** extend `netlify/functions/__tests__/push-send.test.ts` — add `class_updates`/`enrollments`/`students`/`family_members` to the mock and a discriminated-body test block. Insert into the existing `tables` type/`mockFrom`/`beforeEach`:
  ```typescript
  // In the `tables` type, add:
  //   class_updates: Record<string, unknown> | null;
  //   enrollments: Array<Record<string, unknown>>;
  //   students: Array<Record<string, unknown>>;
  //   family_members: Array<Record<string, unknown>>;

  // In mockFrom, add branches:
  if (table === 'class_updates') {
    return { select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: tables.class_updates, error: null }) }) }) };
  }
  if (table === 'enrollments') {
    return { select: () => ({ eq: () => ({ eq: () => Promise.resolve({ data: tables.enrollments, error: null }) }) }) };
  }
  if (table === 'students') {
    return { select: () => ({ in: () => Promise.resolve({ data: tables.students, error: null }) }) };
  }
  if (table === 'family_members') {
    return { select: () => ({ in: () => Promise.resolve({ data: tables.family_members, error: null }) }) };
  }

  // In beforeEach's `tables = {...}`, add:
  //   class_updates: { id: CLASS_UPDATE_ID, class_id: CLASS_ID, posted_by: SENDER_ID },
  //   enrollments: [{ student_id: 'student-row-1' }],
  //   students: [{ user_id: 'student-user-1', family_id: 'family-1' }],
  //   family_members: [{ user_id: 'parent-user-1' }],

  // New top-level const (alongside MESSAGE_ID/CONVERSATION_ID):
  //   const CLASS_UPDATE_ID = '33333333-3333-3333-3333-333333333333';
  //   const CLASS_ID = '44444444-4444-4444-4444-444444444444';

  describe('push-send handler — class_update_id branch (ADR-0031)', () => {
    it('422s when both message_id and class_update_id are present', async () => {
      const res = (await handler(makeEvent({ body: body({ message_id: MESSAGE_ID, class_update_id: CLASS_UPDATE_ID }) }), {} as never)) as HandlerResponse;
      expect(res.statusCode).toBe(422);
    });

    it('422s when neither message_id nor class_update_id is present', async () => {
      const res = (await handler(makeEvent({ body: body({}) }), {} as never)) as HandlerResponse;
      expect(res.statusCode).toBe(422);
    });

    it('200 noop when the class_update does not exist', async () => {
      tables.class_updates = null;
      const res = (await handler(makeEvent({ body: body({ class_update_id: CLASS_UPDATE_ID }) }), {} as never)) as HandlerResponse;
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body as string)).toMatchObject({ status: 'noop' });
    });

    it("403s when the caller is not the class update's poster", async () => {
      mockGetUser.mockResolvedValue({ data: { user: { id: 'someone-else' } }, error: null });
      const res = (await handler(makeEvent({ body: body({ class_update_id: CLASS_UPDATE_ID }) }), {} as never)) as HandlerResponse;
      expect(res.statusCode).toBe(403);
    });

    it('dispatches to the enrolled student (with login) and their parent, excluding the poster', async () => {
      const res = (await handler(makeEvent({ body: body({ class_update_id: CLASS_UPDATE_ID }) }), {} as never)) as HandlerResponse;
      expect(JSON.parse(res.body as string)).toEqual({ status: 'dispatched', recipients: 2, sent: 2, cleaned_up: 0 });
    });

    it('zero current enrollments dispatches to zero recipients, not an error (edge case)', async () => {
      tables.enrollments = [];
      const res = (await handler(makeEvent({ body: body({ class_update_id: CLASS_UPDATE_ID }) }), {} as never)) as HandlerResponse;
      expect(JSON.parse(res.body as string)).toEqual({ status: 'dispatched', recipients: 0, sent: 0, cleaned_up: 0 });
    });

    it('payload carries the exact, generic, PII-free class-update title', async () => {
      await handler(makeEvent({ body: body({ class_update_id: CLASS_UPDATE_ID }) }), {} as never);
      expect(pushDelivery.sendPush).toHaveBeenCalledWith(expect.anything(), { title: 'New update posted in your class' });
    });
  });
  ```
  Run → FAIL (`push-send.ts` doesn't understand `class_update_id` yet, and `unexpected table` throws for the new mocks) = RED ✓.

- [x] **P4 — implementation** `netlify/functions/push-send.ts` (full rewrite — refactors the existing `message_id`-only handler into two branch functions sharing one fan-out, per ADR-0031's discriminated body; behavior of the existing `message_id` branch is preserved exactly)
  ```typescript
  import type { Handler, HandlerEvent, HandlerContext } from '@netlify/functions';
  import { createClient, type SupabaseClient } from '@supabase/supabase-js';
  import { isRecipient, payloadTitleForKind, type ConversationParticipant, type ConversationKind } from './lib/push-dispatch';
  import { mergeClassUpdateRecipients, CLASS_UPDATE_PUSH_TITLE } from './lib/class-update-dispatch';
  import { configureVapid, sendPush, type PushSubscriptionRow } from './lib/push-delivery';

  function json(statusCode: number, body: unknown) {
    return { statusCode, body: JSON.stringify(body) };
  }

  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  interface PushSendRequestBody {
    message_id?: string;
    class_update_id?: string;
  }

  async function fanOut(client: SupabaseClient, recipientIds: string[], payload: { title: string }) {
    const { data: subscriptions } = await client
      .from('push_subscriptions')
      .select('id, endpoint, p256dh_key, auth_key')
      .in('user_id', recipientIds);

    configureVapid(
      process.env['VAPID_SUBJECT'] ?? '',
      process.env['EXPO_PUBLIC_VAPID_PUBLIC_KEY'] ?? '',
      process.env['VAPID_PRIVATE_KEY'] ?? ''
    );

    let sent = 0;
    let cleanedUp = 0;
    for (const sub of (subscriptions ?? []) as PushSubscriptionRow[]) {
      const outcome = await sendPush(sub, payload);
      if (outcome.status === 'sent') {
        sent += 1;
      } else if (outcome.status === 'gone') {
        await client.from('push_subscriptions').delete().eq('id', sub.id);
        cleanedUp += 1;
      }
    }
    return { sent, cleanedUp };
  }

  async function dispatchMessage(client: SupabaseClient, messageId: string, callerUserId: string) {
    const { data: message } = await client
      .from('messages')
      .select('id, conversation_id, sender_user_id, mention_targets')
      .eq('id', messageId)
      .maybeSingle();
    if (!message) return json(200, { status: 'noop', recipients: 0, sent: 0, cleaned_up: 0 });

    // push-send runs service-role and bypasses RLS entirely — nothing else stops an
    // authenticated-but-unrelated caller from repeatedly triggering dispatch about a message
    // they didn't send. Design sign-off, 2026-07-21: required, not optional hardening.
    if (message['sender_user_id'] !== callerUserId) return json(403, { reason: 'caller is not the message sender' });

    const { data: conversation } = await client
      .from('conversations')
      .select('kind')
      .eq('id', message['conversation_id'])
      .maybeSingle();
    if (!conversation) return json(200, { status: 'noop', recipients: 0, sent: 0, cleaned_up: 0 });

    const { data: participants } = await client
      .from('conversation_participants')
      .select('user_id, participant_role, notify_level')
      .eq('conversation_id', message['conversation_id']);

    const senderUserId = message['sender_user_id'] as string;
    const mentionTargets = (message['mention_targets'] ?? []) as string[];
    const recipientIds = ((participants ?? []) as ConversationParticipant[])
      .filter((cp) => isRecipient(cp, senderUserId, mentionTargets))
      .map((cp) => cp.user_id);

    if (recipientIds.length === 0) return json(200, { status: 'dispatched', recipients: 0, sent: 0, cleaned_up: 0 });

    const payload = { title: payloadTitleForKind(conversation['kind'] as ConversationKind) };
    const { sent, cleanedUp } = await fanOut(client, recipientIds, payload);

    console.log(JSON.stringify({ event: 'push_dispatched', message_id: messageId, recipients: recipientIds.length, sent, cleaned_up: cleanedUp }));
    return json(200, { status: 'dispatched', recipients: recipientIds.length, sent, cleaned_up: cleanedUp });
  }

  async function dispatchClassUpdate(client: SupabaseClient, classUpdateId: string, callerUserId: string) {
    const { data: classUpdate } = await client
      .from('class_updates')
      .select('id, class_id, posted_by')
      .eq('id', classUpdateId)
      .maybeSingle();
    if (!classUpdate) return json(200, { status: 'noop', recipients: 0, sent: 0, cleaned_up: 0 });

    const posterUserId = classUpdate['posted_by'] as string;
    // Same notification-spam guard as the message branch, applied to class_updates.posted_by (ADR-0031).
    if (posterUserId !== callerUserId) return json(403, { reason: "caller is not the class update's poster" });

    const classId = classUpdate['class_id'] as string;
    const { data: enrollments } = await client
      .from('enrollments')
      .select('student_id')
      .eq('class_id', classId)
      .eq('status', 'active');
    const studentIds = ((enrollments ?? []) as Array<{ student_id: string }>).map((e) => e.student_id);

    if (studentIds.length === 0) return json(200, { status: 'dispatched', recipients: 0, sent: 0, cleaned_up: 0 });

    const { data: students } = await client.from('students').select('user_id, family_id').in('id', studentIds);
    const studentRows = (students ?? []) as Array<{ user_id: string | null; family_id: string }>;
    const familyIds = Array.from(new Set(studentRows.map((s) => s.family_id)));

    const { data: familyMembers } = await client.from('family_members').select('user_id').in('family_id', familyIds);
    const parentUserIds = ((familyMembers ?? []) as Array<{ user_id: string }>).map((fm) => fm.user_id);

    const recipientIds = mergeClassUpdateRecipients([...studentRows.map((s) => s.user_id), ...parentUserIds], posterUserId);
    if (recipientIds.length === 0) return json(200, { status: 'dispatched', recipients: 0, sent: 0, cleaned_up: 0 });

    const { sent, cleanedUp } = await fanOut(client, recipientIds, { title: CLASS_UPDATE_PUSH_TITLE });

    console.log(JSON.stringify({ event: 'push_dispatched', class_update_id: classUpdateId, recipients: recipientIds.length, sent, cleaned_up: cleanedUp }));
    return json(200, { status: 'dispatched', recipients: recipientIds.length, sent, cleaned_up: cleanedUp });
  }

  export const handler: Handler = async (event: HandlerEvent, _ctx: HandlerContext) => {
    const supabaseUrl = process.env['EXPO_PUBLIC_SUPABASE_URL'] ?? '';
    const serviceRoleKey = process.env['SUPABASE_SERVICE_ROLE_KEY'] ?? '';
    const client = createClient(supabaseUrl, serviceRoleKey);

    const authHeader = event.headers['authorization'] ?? event.headers['Authorization'] ?? '';
    if (!authHeader.startsWith('Bearer ')) return json(401, { reason: 'missing Authorization header' });
    const token = authHeader.slice(7);
    const { data: authData, error: authError } = await client.auth.getUser(token);
    if (authError || !authData?.user) return json(401, { reason: 'invalid or expired token' });
    const callerUserId = authData.user.id;

    let body: PushSendRequestBody;
    try {
      body = JSON.parse(event.body ?? '{}') as PushSendRequestBody;
    } catch {
      return json(422, { reason: 'malformed JSON body' });
    }
    const { message_id, class_update_id } = body;
    const hasMessage = message_id != null;
    const hasClassUpdate = class_update_id != null;
    if (hasMessage === hasClassUpdate) {
      return json(422, { reason: 'exactly one of message_id or class_update_id is required' });
    }
    if (hasMessage && !UUID_RE.test(message_id!)) return json(422, { reason: 'message_id must be a valid UUID' });
    if (hasClassUpdate && !UUID_RE.test(class_update_id!)) return json(422, { reason: 'class_update_id must be a valid UUID' });

    return hasMessage
      ? dispatchMessage(client, message_id!, callerUserId)
      : dispatchClassUpdate(client, class_update_id!, callerUserId);
  };
  ```
  Run P3 → GREEN ✓. Re-run the full `push-send.test.ts` suite (pre-existing `message_id` cases included) → confirm no regression, all pass.

---

### Stage 3 — Client pure logic (`features/teacher/class-update-and-home-feed/logic/`, TDD)

- [x] **F0 — extend `vitest.config.ts`** to cover the new feature folder's tests (mirrors the existing `components/**`/`lib/**` globs):
  ```typescript
  include: [
    'netlify/functions/__tests__/**/*.test.ts',
    '.claude/hooks/__tests__/**/*.test.ts',
    'scripts/__tests__/**/*.test.ts',
    'lib/**/__tests__/**/*.test.ts',
    'components/**/__tests__/**/*.test.ts',
    'features/**/__tests__/**/*.test.ts',
  ],
  ```

- [x] **F1 — tests (RED)** `features/teacher/class-update-and-home-feed/logic/__tests__/threadAssembly.test.ts`
  ```typescript
  import { describe, it, expect } from 'vitest';
  import { groupCommentsForViewer, type CommentRow } from '../threadAssembly';

  function comment(overrides: Partial<CommentRow>): CommentRow {
    return {
      id: 'c1', author_user_id: 'u1', author_role: 'student', body: 'hi',
      is_private: false, target_parent_id: null, created_at: '2026-01-01T00:00:00Z',
      ...overrides,
    };
  }

  describe('groupCommentsForViewer', () => {
    it('Student: one public thread, oldest-first, never a private row', () => {
      const rows = [
        comment({ id: 'a', created_at: '2026-01-02T00:00:00Z' }),
        comment({ id: 'b', created_at: '2026-01-01T00:00:00Z' }),
        comment({ id: 'p', is_private: true, target_parent_id: 'parent-1', created_at: '2026-01-01T12:00:00Z' }),
      ];
      const groups = groupCommentsForViewer(rows, 'student', 'student-1');
      expect(groups).toHaveLength(1);
      expect(groups[0].comments.map((c) => c.id)).toEqual(['b', 'a']);
    });

    it("Parent: one merged thread with their own private comments, not another parent's", () => {
      const rows = [
        comment({ id: 'pub', created_at: '2026-01-01T00:00:00Z' }),
        comment({ id: 'mine', is_private: true, target_parent_id: 'parent-1', created_at: '2026-01-02T00:00:00Z' }),
        comment({ id: 'other', is_private: true, target_parent_id: 'parent-2', created_at: '2026-01-03T00:00:00Z' }),
      ];
      const groups = groupCommentsForViewer(rows, 'parent', 'parent-1');
      expect(groups).toHaveLength(1);
      expect(groups[0].comments.map((c) => c.id)).toEqual(['pub', 'mine']);
    });

    it('Teacher: one public thread plus one thread per Parent with an active private thread', () => {
      const rows = [
        comment({ id: 'pub', created_at: '2026-01-01T00:00:00Z' }),
        comment({ id: 'p1a', is_private: true, target_parent_id: 'parent-1', created_at: '2026-01-02T00:00:00Z' }),
        comment({ id: 'p1b', is_private: true, target_parent_id: 'parent-1', created_at: '2026-01-03T00:00:00Z' }),
        comment({ id: 'p2a', is_private: true, target_parent_id: 'parent-2', created_at: '2026-01-04T00:00:00Z' }),
      ];
      const groups = groupCommentsForViewer(rows, 'teacher', 'teacher-1');
      expect(groups).toHaveLength(3);
      expect(groups[0]).toMatchObject({ key: 'public', isPrivate: false });
      expect(groups[0].comments.map((c) => c.id)).toEqual(['pub']);
      const p1 = groups.find((g) => g.key === 'parent-1')!;
      expect(p1.comments.map((c) => c.id)).toEqual(['p1a', 'p1b']);
      const p2 = groups.find((g) => g.key === 'parent-2')!;
      expect(p2.comments.map((c) => c.id)).toEqual(['p2a']);
    });

    it('zero comments -> a single empty group, not an error (empty-state edge case)', () => {
      expect(groupCommentsForViewer([], 'student', 'student-1')).toEqual([{ key: 'public', isPrivate: false, comments: [] }]);
    });
  });
  ```
  Run: `npx vitest run features/teacher/class-update-and-home-feed/logic/__tests__/threadAssembly.test.ts` → FAIL (module doesn't exist) = RED ✓.

- [x] **F2 — implementation** `features/teacher/class-update-and-home-feed/logic/threadAssembly.ts`
  ```typescript
  export interface CommentRow {
    id: string;
    author_user_id: string;
    author_role: 'student' | 'parent' | 'teacher';
    body: string;
    is_private: boolean;
    target_parent_id: string | null;
    created_at: string;
  }

  export interface ThreadGroup {
    key: string; // 'public', or the target Parent's user_id for a private thread
    isPrivate: boolean;
    comments: CommentRow[];
  }

  // Design decision #4 — per-viewer thread stacking. Ordering within a thread is oldest-first
  // (decision #5), distinct from the feed's own newest-first ordering.
  export function groupCommentsForViewer(
    comments: CommentRow[],
    viewerRole: 'student' | 'parent' | 'teacher',
    viewerUserId: string
  ): ThreadGroup[] {
    const sorted = [...comments].sort((a, b) => a.created_at.localeCompare(b.created_at));

    if (viewerRole === 'student') {
      return [{ key: 'public', isPrivate: false, comments: sorted.filter((c) => !c.is_private) }];
    }

    if (viewerRole === 'parent') {
      return [{
        key: 'merged',
        isPrivate: false,
        comments: sorted.filter((c) => !c.is_private || c.target_parent_id === viewerUserId),
      }];
    }

    const publicGroup: ThreadGroup = { key: 'public', isPrivate: false, comments: sorted.filter((c) => !c.is_private) };
    const parentIds = Array.from(
      new Set(sorted.filter((c) => c.is_private && c.target_parent_id).map((c) => c.target_parent_id as string))
    );
    const privateGroups: ThreadGroup[] = parentIds.map((parentId) => ({
      key: parentId,
      isPrivate: true,
      comments: sorted.filter((c) => c.is_private && c.target_parent_id === parentId),
    }));
    return [publicGroup, ...privateGroups];
  }
  ```
  Run F1 → GREEN ✓.

- [x] **F3 — tests (RED)** `features/teacher/class-update-and-home-feed/logic/__tests__/classUpdatePayload.test.ts`
  ```typescript
  import { describe, it, expect } from 'vitest';
  import { buildClassUpdatePayload } from '../classUpdatePayload';

  describe('buildClassUpdatePayload', () => {
    it('returns null when body is blank (whitespace-only)', () => {
      expect(buildClassUpdatePayload('   ', 'do the reading')).toBeNull();
    });
    it('omits homework entirely when blank — not an empty string (edge case #1)', () => {
      expect(buildClassUpdatePayload('Great class today', '   ')).toEqual({ body: 'Great class today' });
    });
    it('trims both fields and includes homework when present', () => {
      expect(buildClassUpdatePayload('  Great class  ', '  read ch. 3  ')).toEqual({ body: 'Great class', homework: 'read ch. 3' });
    });
  });
  ```
  Run → FAIL (module doesn't exist) = RED ✓.

- [x] **F4 — implementation** `features/teacher/class-update-and-home-feed/logic/classUpdatePayload.ts`
  ```typescript
  export interface ClassUpdatePayload {
    body: string;
    homework?: string;
  }

  // Mirrors CommentComposer.logic.ts's buildCommentPayload trim/reject-empty convention.
  // homework is omitted entirely (not an empty string) when blank — edge case #1's "no
  // placeholder homework line" requirement starts here, at the payload the composer builds.
  export function buildClassUpdatePayload(body: string, homework: string): ClassUpdatePayload | null {
    const trimmedBody = body.trim();
    if (!trimmedBody) return null;
    const trimmedHomework = homework.trim();
    return trimmedHomework ? { body: trimmedBody, homework: trimmedHomework } : { body: trimmedBody };
  }
  ```
  Run F3 → GREEN ✓.

---

### Stage 4 — Client data layer (`features/teacher/class-update-and-home-feed/api/`, wiring — verified at `/build`)

- [x] **W1 — `api/classUpdates.ts`**
  ```typescript
  import type { SupabaseClient } from '@supabase/supabase-js';

  export interface ClassUpdateRow {
    id: string;
    class_id: string;
    posted_by: string;
    body: string;
    homework: string | null;
    created_at: string;
    classLabel: string;
  }

  interface RawClassUpdateRow {
    id: string;
    class_id: string;
    posted_by: string;
    body: string;
    homework: string | null;
    created_at: string;
    classes: { name: string; sessions: { name: string; centers: { name: string } } } | null;
  }

  // RLS already scopes which rows come back per viewer (Student/Parent/Teacher/oversight) — this
  // query is identical for every role (§12.1 non-negotiable #1: access is DB-enforced, not
  // client-branched). The classes/sessions/centers nested select is readable per-viewer because
  // it's the same class_id they already have class_updates visibility into (classes_*_select
  // policies mirror the same scoping — core-schema-and-rls).
  export async function fetchClassUpdatesFeed(supabase: SupabaseClient): Promise<ClassUpdateRow[]> {
    const { data, error } = await supabase
      .from('class_updates')
      .select('id, class_id, posted_by, body, homework, created_at, classes(name, sessions(name, centers(name)))')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return ((data ?? []) as unknown as RawClassUpdateRow[]).map((row) => ({
      id: row.id,
      class_id: row.class_id,
      posted_by: row.posted_by,
      body: row.body,
      homework: row.homework,
      created_at: row.created_at,
      classLabel: row.classes ? `${row.classes.sessions.centers.name} · ${row.classes.sessions.name} · ${row.classes.name}` : '',
    }));
  }

  export async function insertClassUpdate(
    supabase: SupabaseClient,
    params: { classId: string; postedBy: string; body: string; homework?: string }
  ): Promise<{ id: string }> {
    const { data, error } = await supabase
      .from('class_updates')
      .insert({ class_id: params.classId, posted_by: params.postedBy, body: params.body, homework: params.homework ?? null })
      .select('id')
      .single();
    if (error) throw error;
    return data as { id: string };
  }

  // Design decision #3: a live, RLS-filtered count — not a denormalized counter. Counting the
  // filtered rows client-side after one query (rather than one count(*) call per feed card)
  // keeps this a single round trip; RLS has already dropped anything this viewer can't see.
  export async function fetchCommentCounts(supabase: SupabaseClient, classUpdateIds: string[]): Promise<Map<string, number>> {
    if (classUpdateIds.length === 0) return new Map();
    const { data, error } = await supabase.from('comments').select('class_update_id').in('class_update_id', classUpdateIds);
    if (error) throw error;
    const counts = new Map<string, number>();
    for (const row of (data ?? []) as Array<{ class_update_id: string }>) {
      counts.set(row.class_update_id, (counts.get(row.class_update_id) ?? 0) + 1);
    }
    return counts;
  }
  ```

- [x] **W2 — `api/comments.ts`**
  ```typescript
  import type { SupabaseClient } from '@supabase/supabase-js';

  export interface CommentRow {
    id: string;
    class_update_id: string;
    author_user_id: string;
    author_role: 'student' | 'parent' | 'teacher';
    body: string;
    is_private: boolean;
    target_parent_id: string | null;
    created_at: string;
  }

  export async function fetchComments(supabase: SupabaseClient, classUpdateId: string): Promise<CommentRow[]> {
    const { data, error } = await supabase
      .from('comments')
      .select('id, class_update_id, author_user_id, author_role, body, is_private, target_parent_id, created_at')
      .eq('class_update_id', classUpdateId)
      .order('created_at', { ascending: true });
    if (error) throw error;
    return (data ?? []) as CommentRow[];
  }

  export async function insertComment(
    supabase: SupabaseClient,
    params: {
      classUpdateId: string;
      authorUserId: string;
      authorRole: 'student' | 'parent' | 'teacher';
      body: string;
      isPrivate: boolean;
      targetParentId: string | null;
    }
  ): Promise<void> {
    const { error } = await supabase.from('comments').insert({
      class_update_id: params.classUpdateId,
      author_user_id: params.authorUserId,
      author_role: params.authorRole,
      body: params.body,
      is_private: params.isPrivate,
      target_parent_id: params.targetParentId,
    });
    if (error) throw error;
  }
  ```

- [x] **W3 — `api/pushTrigger.ts`**
  ```typescript
  // Fire-and-forget, same UX posture as chat send (notifications-infra's Behavior section) — the
  // class_updates insert's own success/failure is never blocked or held on this call.
  export async function triggerClassUpdatePush(accessToken: string, classUpdateId: string): Promise<void> {
    try {
      await fetch('/.netlify/functions/push-send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ class_update_id: classUpdateId }),
      });
    } catch {
      // Best-effort delivery (ADR-0028's accepted gap) — a failed/slow push-send call is never
      // surfaced to the Teacher who just posted; their update already committed successfully.
    }
  }
  ```

---

### Stage 5 — Screens + routes (wiring — verified at `/build`)

- [x] **W4 — `components/HomeFeedScreen.tsx`** (AC#2/#3/#6, four DoD states)
  ```typescript
  import { useCallback, useEffect, useState } from "react";
  import { View, Text, ScrollView, Pressable } from "react-native";
  import { router } from "expo-router";
  import { supabase } from "../../../../lib/supabase";
  import { useSession } from "../../../../lib/auth/SessionProvider";
  import FeedCard from "../../../../components/feed/FeedCard";
  import { fetchClassUpdatesFeed, fetchCommentCounts, type ClassUpdateRow } from "../api/classUpdates";

  type ScreenState = "loading" | "empty" | "error" | "content";

  export default function HomeFeedScreen() {
    const { activeRole } = useSession();
    const [state, setState] = useState<ScreenState>("loading");
    const [updates, setUpdates] = useState<ClassUpdateRow[]>([]);
    const [counts, setCounts] = useState<Map<string, number>>(new Map());

    const load = useCallback(async () => {
      setState((prev) => (prev === "content" ? prev : "loading"));
      try {
        const feed = await fetchClassUpdatesFeed(supabase);
        const commentCounts = await fetchCommentCounts(supabase, feed.map((u) => u.id));
        setUpdates(feed);
        setCounts(commentCounts);
        setState(feed.length === 0 ? "empty" : "content");
      } catch {
        // error-preserving (design-system.md DoD): if a previous successful load already
        // populated `updates`, they stay rendered below; only the state flag flips.
        setState("error");
      }
    }, []);

    useEffect(() => {
      load();
    }, [load]);

    return (
      <View style={{ flex: 1 }}>
        {activeRole === "teacher" ? (
          <Pressable onPress={() => router.push("/class-update/new")} accessibilityRole="button">
            <Text>Post class update</Text>
          </Pressable>
        ) : null}

        {state === "loading" ? <Text>Loading…</Text> : null}
        {state === "empty" ? <Text>No updates yet</Text> : null}
        {state === "error" ? (
          <View>
            <Text>Couldn't load the feed.</Text>
            <Pressable onPress={load} accessibilityRole="button"><Text>Retry</Text></Pressable>
          </View>
        ) : null}

        {(state === "content" || (state === "error" && updates.length > 0)) ? (
          <ScrollView>
            {updates.map((u) => (
              <FeedCard
                key={u.id}
                author={{ role: "teacher", scope: u.classLabel }}
                kind="update"
                scope="class"
                body={u.body}
                homework={u.homework ?? undefined}
                tag={u.homework ? "Homework" : undefined}
                time={new Date(u.created_at).toLocaleDateString()}
                comments={counts.get(u.id) ?? 0}
                onOpen={() => router.push(`/class-update/${u.id}`)}
              />
            ))}
          </ScrollView>
        ) : null}
      </View>
    );
  }
  ```

- [x] **W5 — `components/ComposeClassUpdateScreen.tsx`** (AC#1, Teacher-only)
  ```typescript
  import { useState } from "react";
  import { View, Text, TextInput, Pressable } from "react-native";
  import { router } from "expo-router";
  import { supabase } from "../../../../lib/supabase";
  import { useSession } from "../../../../lib/auth/SessionProvider";
  import { insertClassUpdate } from "../api/classUpdates";
  import { triggerClassUpdatePush } from "../api/pushTrigger";
  import { buildClassUpdatePayload } from "../logic/classUpdatePayload";

  type ScreenState = "form" | "submitting" | "error";

  export default function ComposeClassUpdateScreen() {
    const { session, scopeId } = useSession();
    const [body, setBody] = useState("");
    const [homework, setHomework] = useState("");
    const [state, setState] = useState<ScreenState>("form");
    const [errorMessage, setErrorMessage] = useState("");

    async function submit() {
      const payload = buildClassUpdatePayload(body, homework);
      if (!payload || !scopeId || !session) return;
      setState("submitting");
      try {
        const { id } = await insertClassUpdate(supabase, {
          classId: scopeId,
          postedBy: session.user.id,
          body: payload.body,
          homework: payload.homework,
        });
        void triggerClassUpdatePush(session.access_token, id);
        router.back();
      } catch (err) {
        // error-preserving: body/homework stay filled in, retry re-submits the same call.
        setErrorMessage(err instanceof Error ? err.message : "Couldn't post the update.");
        setState("error");
      }
    }

    return (
      <View>
        <TextInput value={body} onChangeText={setBody} placeholder="What's happening in class?" multiline />
        <TextInput value={homework} onChangeText={setHomework} placeholder="Homework (optional)" multiline />
        {state === "error" ? <Text>{errorMessage}</Text> : null}
        <Pressable onPress={submit} disabled={state === "submitting"} accessibilityRole="button">
          <Text>{state === "submitting" ? "Posting…" : "Post"}</Text>
        </Pressable>
      </View>
    );
  }
  ```

- [x] **W6 — `components/ClassUpdateDetailScreen.tsx`** (AC#4/#5/#6, decision #4 stacking — see "Verify-at-build flag")
  ```typescript
  import { useCallback, useEffect, useState } from "react";
  import { View, Text, ScrollView } from "react-native";
  import { useLocalSearchParams } from "expo-router";
  import { supabase } from "../../../../lib/supabase";
  import { useSession } from "../../../../lib/auth/SessionProvider";
  import FeedCard from "../../../../components/feed/FeedCard";
  import CommentThread from "../../../../components/comments/CommentThread";
  import CommentComposer from "../../../../components/comments/CommentComposer";
  import { fetchClassUpdatesFeed, type ClassUpdateRow } from "../api/classUpdates";
  import { fetchComments, insertComment, type CommentRow } from "../api/comments";
  import { groupCommentsForViewer } from "../logic/threadAssembly";

  type ScreenState = "loading" | "error" | "content";

  export default function ClassUpdateDetailScreen() {
    const { id } = useLocalSearchParams<{ id: string }>();
    const { session, activeRole } = useSession();
    const [state, setState] = useState<ScreenState>("loading");
    const [update, setUpdate] = useState<ClassUpdateRow | null>(null);
    const [comments, setComments] = useState<CommentRow[]>([]);

    const load = useCallback(async () => {
      setState("loading");
      try {
        const feed = await fetchClassUpdatesFeed(supabase);
        const found = feed.find((u) => u.id === id) ?? null;
        const rows = await fetchComments(supabase, id);
        setUpdate(found);
        setComments(rows);
        setState("content");
      } catch {
        setState("error");
      }
    }, [id]);

    useEffect(() => {
      load();
    }, [load]);

    if (state === "loading") return <Text>Loading…</Text>;
    if (state === "error") return <Text>Couldn't load this update.</Text>;
    if (!update || !session) return <Text>Not found.</Text>;

    const role = (activeRole as "student" | "parent" | "teacher") ?? "student";
    const groups = groupCommentsForViewer(comments, role, session.user.id);

    async function send(targetParentId: string | null, isPrivate: boolean, body: string) {
      await insertComment(supabase, {
        classUpdateId: id,
        authorUserId: session!.user.id,
        authorRole: role,
        body,
        isPrivate,
        targetParentId: isPrivate ? (targetParentId ?? session!.user.id) : null,
      });
      await load();
    }

    return (
      <ScrollView>
        <FeedCard
          author={{ role: "teacher", scope: update.classLabel }}
          kind="update"
          scope="class"
          body={update.body}
          homework={update.homework ?? undefined}
          tag={update.homework ? "Homework" : undefined}
          time={new Date(update.created_at).toLocaleDateString()}
        />

        {groups.every((g) => g.comments.length === 0) ? <Text>No comments yet</Text> : null}

        {groups.map((g) => (
          <View key={g.key}>
            <CommentThread
              comments={g.comments.map((c) => ({
                author: { role: c.author_role },
                body: c.body,
                isPrivate: c.is_private,
                time: new Date(c.created_at).toLocaleDateString(),
              }))}
            >
              <CommentComposer
                canPrivate={role === "parent"}
                onSend={({ body, isPrivate }) =>
                  send(role === "teacher" && g.isPrivate ? g.key : null, role === "teacher" ? g.isPrivate : isPrivate, body)
                }
              />
            </CommentThread>
          </View>
        ))}
      </ScrollView>
    );
  }
  ```
  Note: a Teacher's private-thread card label (`resolve_parent_family_label`, M4) and the "no start-a-thread affordance for Teacher" constraint (design's added edge case) are a `/build`-time refinement of this screen — the RPC call to label each `g.key` (`supabase.rpc('resolve_parent_family_label', { p_parent_user_id: g.key, p_class_id: update.class_id })`) slots into the `groups.map` loop above once the label is fetched.

- [x] **W7 — routes**
  `app/(tabs)/feed.tsx` (replaces the placeholder):
  ```typescript
  import { useRoleGuard } from "../../lib/auth/useRoleGuard";
  import HomeFeedScreen from "../../features/teacher/class-update-and-home-feed/components/HomeFeedScreen";

  export default function FeedScreen() {
    useRoleGuard("feed");
    return <HomeFeedScreen />;
  }
  ```
  `app/class-update/[id].tsx` (new):
  ```typescript
  import ClassUpdateDetailScreen from "../../features/teacher/class-update-and-home-feed/components/ClassUpdateDetailScreen";

  export default function ClassUpdateDetailRoute() {
    return <ClassUpdateDetailScreen />;
  }
  ```
  `app/class-update/new.tsx` (new):
  ```typescript
  import ComposeClassUpdateScreen from "../../features/teacher/class-update-and-home-feed/components/ComposeClassUpdateScreen";

  export default function ComposeClassUpdateRoute() {
    return <ComposeClassUpdateScreen />;
  }
  ```

- [x] **W8 — manual walkthrough at `/build`** (`npm run dev`): Teacher posts (body-only, then body+homework) → confirm push-send call fires and Student/Parent home feeds show the new card within the four DoD states; Student posts a public comment; Parent posts a public comment, then a private comment; Teacher replies privately within that Parent's thread card; confirm a second Parent's private thread never appears on the first Parent's screen; confirm role-switch (a multi-role test account, if seeded) re-scopes the feed immediately; confirm zero-enrollment class and zero-comment class_update both render their honest empty states, not errors.
  **What was actually verified at this `/build` pass (2026-07-24) — no headless-browser tool was available in this environment, so the interactive per-role click-through above was not executed:** `npm run typecheck` clean; `npm run lint` clean; full `npx vitest run` — 61 files / 398 tests green (includes the new `class-update-dispatch.test.ts`, extended `push-send.test.ts`, `threadAssembly.test.ts`, `classUpdatePayload.test.ts`); `npx supabase test db` — 20 files / 194 pgTAP assertions green, `160_class_updates_and_comments_rls.sql` at 25/25 unchanged since `/migration`; `npm run web` boots Metro/Expo Router cleanly (1165 modules, zero bundle errors) and every new route (`/feed`, `/class-update/new`, `/class-update/[id]`) resolves 200 with the router registering both dynamic routes correctly. **Not verified: the actual multi-role interactive flow (Teacher post → Student/Parent feed → public/private comment round-trip → push dispatch) — needs a real browser pass before `/test`/`/deploy-staging`.**

  **Real-browser pass completed at `/test` (2026-07-24, see `UAT.md` UAT-10 through UAT-17 + the 2026-07-24 / 2026-07-24 (fix pass) sign-off rows for full detail).** The interactive flow this note flagged as unverified found three real bugs, all now fixed: `push-send`'s service-role client had no grant on `class_updates` (silent no-op on every dispatch, issue #47, fixed via `20260724130000_push_send_service_role_grants.sql`); `/class-update/new` and `/class-update/[id]` had no header/back-nav/width-cap (fixed via new `app/class-update/_layout.tsx`); the Teacher's private-thread label exposed the Student's name instead of a family label, conflicting with this doc's own UI section wording (fixed — `resolve_parent_family_label()` now selects `families.label`). Public/private comment round-trip, cross-family isolation, role-switch re-scoping, and the DoD states were all verified live and pass.

---

## Self-review (spec coverage)

- AC#1 (post, own-class-only) → M3 (`class_updates_teacher_insert`), W5. AC#2 (feed read per role) → M3 (three `class_updates_*_select`), W1/W4. AC#3 (ordering + 4 states) → W1 (`order by created_at desc`), W4. AC#4/#5 (public/private comments) → M3 (`comments_*_select`/`_insert`), W2/W6. AC#6 (live count + entry point) → W1's `fetchCommentCounts` (decision #3), W4. AC#7 (push on post) → Stage 2 (P1–P4), W5's `triggerClassUpdatePush`. AC#8 (RLS, not client) → all of Stage 1's M3 + the 160 pgTAP suite. AC#9 (no secrets/PII in client) → W3 uses only the caller's own `access_token`; no service-role/VAPID key anywhere in `features/`/`app/`.
- Edge cases: no-homework rendering → F4/W4/W6 (`homework: undefined` when omitted). Zero-enrollment push → P3's dedicated test. Multi-child Parent merged feed → W1's single unscoped query (RLS already unions across children). Zero-comment empty state → W6. Per-Parent private isolation → 160's assertions 7/8, F1's Parent test. Role-switch → 160's assertion 21. Missing/expired push subscription → unchanged, already covered by `push-delivery.test.ts`.
- Out-of-scope items (moderation, roster screen, announcements, structured homework, `push-send`'s shared phases) — none touched by any task above; no `update`/`delete` policy exists on either table (160's negative assertions confirm this directly).

## Sign-off
- [x] **Human sign-off on this plan** (2026-07-24, mehta.maulik@gmail.com) — approved, including all three plan-level items flagged above: `comments.author_role`, `resolve_parent_family_label`, and `features/teacher/class-update-and-home-feed/` as the first `features/` folder placement (precedent for later items).
- → ready for **`/migration`** (Stage 1) and `/build` (Stages 2–5, parallelizable per the Shared seam note).
