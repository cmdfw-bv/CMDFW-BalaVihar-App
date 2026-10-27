# Plan — Teacher: class-update-and-home-feed

> Spec: [class-update-and-home-feed.md](class-update-and-home-feed.md) · ADR-0032, ADR-0033 (both Closed) · stage: `/plan` (this doc) → `/migration` ✓ (2026-07-24, Stage 1 only — see M1–M5 below) → `/build` ✓ (2026-07-24, Stages 2–5 — see W8 below) → next `/test`

## Plan-level decisions beyond the signed-off `/design`

The signed-off design's table catalog and RLS SQL are implemented **verbatim** below, with two narrow additions the design didn't specify because they're implementation-level, not access-control decisions — neither reopens ADR-0032 (they don't change *who* can read what, only *what a row records once you're already allowed to read it*):

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

- [x] **M1 — pgTAP tests (RED)** `supabase/tests/170_class_updates_and_comments_rls.sql`
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

### Stage 2 — `push-send`'s `class_update_id` branch (ADR-0033; pure/mockable, TDD)

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

  describe('push-send handler — class_update_id branch (ADR-0033)', () => {
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

- [x] **P4 — implementation** `netlify/functions/push-send.ts` (full rewrite — refactors the existing `message_id`-only handler into two branch functions sharing one fan-out, per ADR-0033's discriminated body; behavior of the existing `message_id` branch is preserved exactly)
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
    // Same notification-spam guard as the message branch, applied to class_updates.posted_by (ADR-0033).
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
  **What was actually verified at this `/build` pass (2026-07-24) — no headless-browser tool was available in this environment, so the interactive per-role click-through above was not executed:** `npm run typecheck` clean; `npm run lint` clean; full `npx vitest run` — 61 files / 398 tests green (includes the new `class-update-dispatch.test.ts`, extended `push-send.test.ts`, `threadAssembly.test.ts`, `classUpdatePayload.test.ts`); `npx supabase test db` — 20 files / 194 pgTAP assertions green, `170_class_updates_and_comments_rls.sql` at 25/25 unchanged since `/migration`; `npm run web` boots Metro/Expo Router cleanly (1165 modules, zero bundle errors) and every new route (`/feed`, `/class-update/new`, `/class-update/[id]`) resolves 200 with the router registering both dynamic routes correctly. **Not verified: the actual multi-role interactive flow (Teacher post → Student/Parent feed → public/private comment round-trip → push dispatch) — needs a real browser pass before `/test`/`/deploy-staging`.**

  **Real-browser pass completed at `/test` (2026-07-24, see `UAT.md` UAT-10 through UAT-17 + the 2026-07-24 / 2026-07-24 (fix pass) sign-off rows for full detail).** The interactive flow this note flagged as unverified found three real bugs, all now fixed: `push-send`'s service-role client had no grant on `class_updates` (silent no-op on every dispatch, issue #47, fixed via `20260724130000_push_send_service_role_grants.sql`); `/class-update/new` and `/class-update/[id]` had no header/back-nav/width-cap (fixed via new `app/class-update/_layout.tsx`); the Teacher's private-thread label exposed the Student's name instead of a family label, conflicting with this doc's own UI section wording (fixed — `resolve_parent_family_label()` now selects `families.label`). Public/private comment round-trip, cross-family isolation, role-switch re-scoping, and the DoD states were all verified live and pass.

---

## Self-review (spec coverage)

- AC#1 (post, own-class-only) → M3 (`class_updates_teacher_insert`), W5. AC#2 (feed read per role) → M3 (three `class_updates_*_select`), W1/W4. AC#3 (ordering + 4 states) → W1 (`order by created_at desc`), W4. AC#4/#5 (public/private comments) → M3 (`comments_*_select`/`_insert`), W2/W6. AC#6 (live count + entry point) → W1's `fetchCommentCounts` (decision #3), W4. AC#7 (push on post) → Stage 2 (P1–P4), W5's `triggerClassUpdatePush`. AC#8 (RLS, not client) → all of Stage 1's M3 + the 160 pgTAP suite. AC#9 (no secrets/PII in client) → W3 uses only the caller's own `access_token`; no service-role/VAPID key anywhere in `features/`/`app/`.
- Edge cases: no-homework rendering → F4/W4/W6 (`homework: undefined` when omitted). Zero-enrollment push → P3's dedicated test. Multi-child Parent merged feed → W1's single unscoped query (RLS already unions across children). Zero-comment empty state → W6. Per-Parent private isolation → 160's assertions 7/8, F1's Parent test. Role-switch → 160's assertion 21. Missing/expired push subscription → unchanged, already covered by `push-delivery.test.ts`.
- Out-of-scope items (moderation, roster screen, announcements, structured homework, `push-send`'s shared phases) — none touched by any task above; no `update`/`delete` policy exists on either table (160's negative assertions confirm this directly).

## Sign-off
- [x] **Human sign-off on this plan** (2026-07-24, mehta.maulik@gmail.com) — approved, including all three plan-level items flagged above: `comments.author_role`, `resolve_parent_family_label`, and `features/teacher/class-update-and-home-feed/` as the first `features/` folder placement (precedent for later items).
- → ready for **`/migration`** (Stage 1) and `/build` (Stages 2–5, parallelizable per the Shared seam note).

---

## Design addendum plan — ADR-2026-09-19: withdrawal revokes conversational access (#96, 2026-10-03)

# Withdrawal Revokes Conversational Access — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When an enrollment moves `active → withdrawn`, that family and student immediately lose the class feed, its comments and their private thread for that class, the Teacher can no longer reply privately to that family, and the Teacher's thread card says why.

**Architecture:** One new migration redefines nine existing objects (seven policies, two `security definer` functions) to key on `enrollments.status = 'active'` — no schema change. pgTAP is written first and shown Red. The client change is confined to the Teacher's detail screen: it asks the same `is_parent_of_class` RPC the insert policy uses and swaps the private-thread composer for a muted note when the answer is `false`.

**Tech Stack:** Postgres RLS + pgTAP (`supabase/tests/`), Supabase CLI, Expo / React Native + react-native-unistyles, vitest (pure logic and the `api/` wrappers only — this repo has no RN component-test harness).

**Spec:** [class-update-and-home-feed.md → *Design addendum — ADR-2026-09-19*](class-update-and-home-feed.md) (signed off 2026-10-03). Governing ADR: `.docs/adr/2026-09-19-withdrawal-revokes-conversational-access.md`. Read the addendum before any task; this plan argues from it.

### Global Constraints

- **Exactly nine objects are redefined, no more:** `class_updates_student_select`, `class_updates_parent_select`, `comments_student_public_select`, `comments_parent_public_select`, `comments_target_parent_select`, `comments_parent_insert`, `comments_student_insert`, `is_parent_of_class`, `resolve_parent_family_label`.
- **`comments_teacher_insert` is never restated.** Its behavior changes through `is_parent_of_class`; redefining it risks dropping another migration's gate.
- **The eight staff policies are untouched:** `class_updates_teacher_select`, `class_updates_teacher_insert`, `class_updates_coordinator_select`, `class_updates_org_select`, `comments_teacher_public_select`, `comments_poster_teacher_private_select`, `comments_coordinator_select`, `comments_org_select`.
- **Bare `auth.jwt()->>'…'` form only.** Never `(select auth.jwt())` — that convention change belongs to #105 and `/architect`.
- **Policies:** `drop policy if exists … ;` + `create policy …`. **Functions:** `create or replace function`, restating the existing `revoke … from public, anon` / `grant execute … to authenticated`.
- **No schema change.** No column, table or new function. `enrollments.withdrawn_at` is #82's.
- **Never edit an existing migration.** One new file: `supabase/migrations/20261003120000_withdrawal_revokes_conversational_access.sql`.
- **Withdrawn fixtures are built by `update`, never by `insert … 'withdrawn'`** — with the class update inserted first, while the enrollment is active.
- **User-visible copy, verbatim:** `This family has withdrawn — replies are closed.` Fallback if it wraps badly at 360px: `Withdrawn — replies closed`.
- **Note style:** `theme.fonts.body`, `theme.type.scale.sm`, `theme.colors.ink3`, centered. Tokens only, no hex. Not `styles.threadLabel`.
- **No parent-side client change.** No worded empty state. `HomeFeedScreen` is not edited.
- **Client uses the anon-key `supabase` client only**; no new grant, no service-role path.
- **Local Supabase is shared across worktrees.** Never `supabase db reset` on the shared stack for this work; use `npx supabase migration up`. If a reset is unavoidable, use the isolated-stack recipe (throwaway worktree, distinct `project_id`, `553xx` ports).
- **Not promotable on local pgTAP alone** — Task 5's cloud check is a gate.

### Shared seam

- **Tasks 1–2 (pgTAP + migration) are the serialized seam** (§12.6). Checked 2026-10-03: no open PR touches `supabase/migrations/` (#108 touches `supabase/seed/seed.sql` and `tests/108_`; #110 is client-only). If another migration lands on `main` first with a later timestamp than `20261003120000`, rename this file to sort after it before pushing.
- **Tasks 3–4 (client) have no dependency on the migration to be written or unit-tested** — `is_parent_of_class` already exists and is already granted. They parallelize with Tasks 1–2. Only Task 4's hand walkthrough needs Task 2 applied locally.
- **Branch:** continue on `design/issue-96-withdrawal-conversational-access` (docs-only so far, no PR open). One cohesive unit; no worktree needed.
- **No `netlify/functions/` work.** `push-send.ts:119` already filters `status = 'active'`.

### Plan-level decisions beyond the signed-off `/design`

Four implementation-level choices the addendum does not make. None changes who can read or write what; all need sign-off below.

1. **All new pgTAP goes in `171_` as one self-contained group (Group 9); `170_` is not edited.** The addendum says "extends `170_`/`171_`". The transition assertions need one fixture story (active → post → withdraw → re-enrol), and splitting it across two files would duplicate the fixtures. `170_` must still pass unchanged at `plan(34)` — that is its role here: proof the migration breaks nothing for active families.
2. **While the Teacher's `is_parent_of_class` lookup is pending, the private group renders neither composer nor note.** Showing the composer and then swapping it for the note would let a Teacher start typing into a box that disappears.
3. **If the lookup fails or returns a non-boolean, the composer is shown.** The note states a fact about a family; a network error must not assert it. The insert policy still refuses a real withdrawn target, and the composer's existing error path keeps the typed text.
4. **A failed private send re-checks that one thread.** If a family withdraws while the Teacher has the screen open, the send is refused, the text is preserved, and the note replaces the composer only if the re-check returns `false`.

Oversight roles (Coordinator / BV Coordinator / Admin) see neither composer nor note: the note renders *in place of* a composer they never had, and no lookup runs for them.

### Architecturally significant — none new

Nothing here bounces to `/architect`. Two items remain owned elsewhere and are deliberately not solved: the `(select auth.jwt())` wrapping (#105) and year-end rollover (#82, ADR Decision 8). The migration carries a comment saying rollover is undecided.

### Review Focus

1. **Lookup still pending** — a Teacher opening a thread must not see a composer flash and vanish. → Task 3, `threadFooter` test "renders nothing while pending".
2. **Lookup RPC errors or returns a non-boolean** — the Teacher must keep a working composer and never see a false "withdrawn" note. → Task 3 (`resolveReplyOpenForKeys` rejects → `null`; `threadFooter` `null` → composer; `isParentOfClass` throws on non-boolean).
3. **Family withdraws while the Teacher has the thread open** — the refused send must keep the typed text and then explain itself. → Task 4, Step 3 code + walkthrough step 6.
4. **A withdrawn fixture that was never active** — every "revoked" assertion would pass vacuously. → Task 1, the two `CONTROL 9-pre` assertions that prove access existed before the `update`.
5. **The same parent in two classes** — withdrawn in one, active in another; the gate for one class must not leak into the other. → Task 3, `gateKey` test.

---

### Task 1: pgTAP — Group 9 and the ATTACK 4f inversion (RED)

**Files:**
- Modify: `supabase/tests/171_class_updates_and_comments_rls_adversarial.sql` — `:8` (plan count), `:53-54` (fixture comment), `:260-261` (Group 4 header), `:307-324` (4f block and Admin control), before `:479` (`finish()`)
- Unchanged, must stay green: `supabase/tests/170_class_updates_and_comments_rls.sql`

**Interfaces:**
- Consumes: `tests.create_supabase_user(text) returns uuid`, `tests.authenticate_as(uuid, text, text default null, uuid default null)`, `tests.clear_authentication()` (resets role to `postgres`, so fixture `insert`/`update` between blocks bypass RLS).
- Produces: 30 assertions that Task 2's migration must turn green; nothing else depends on this task.

- [ ] **Step 1: Bump the plan count**

`:8` — `select plan(52);` becomes:

```sql
select plan(81);
```

(52 existing, 4f inverted in place, +29 in Group 9.)

- [ ] **Step 2: Correct the fixture comment at `:53-54`**

Replace the two comment lines above Ivy's withdrawn Class D enrollment with:

```sql
  -- Ivy's withdrawn enrollment in Class D. Until ADR-2026-09-19 this proved the recipient-label
  -- RPC's e.status = 'active' filter; that filter is gone (Decision 4), so it now proves the
  -- opposite: Class D's own Teacher DOES resolve a withdrawn family's label (CONTROL 4f below).
  -- Built by direct insert, which is fine for a label lookup and useless for any transition
  -- assertion -- those live in Group 9, which withdraws by UPDATE.
```

- [ ] **Step 3: Reword the Group 4 header at `:260-261`**

```sql
-- ATTACK GROUP 4: resolve_parent_family_label RPC -- authorization boundary + no
-- existence-leak via error. (Enrollment status no longer gates it: ADR-2026-09-19 Decision 4.)
```

- [ ] **Step 4: Invert ATTACK 4f — delete it from `:307-315` and re-add it after the Admin CONTROL**

Delete the whole block from the `-- Enrollment-status awareness:` comment through its `select tests.clear_authentication();`. Then, immediately after the Admin `CONTROL` block's `select tests.clear_authentication();` (currently `:324`), insert:

```sql
-- CONTROL 4f (was "ATTACK 4f DENY" until ADR-2026-09-19). Inverted, not deleted (Decision 7).
-- Teacher D is the real Teacher of Class D, and Ivy's family genuinely was enrolled there, so
-- this caller always sat inside the authorization perimeter -- the old assertion tested the
-- e.status = 'active' filter, an implementation detail, not a boundary. Decision 4 removes that
-- filter so a withdrawn family's thread keeps its real label instead of the anonymous
-- "Private thread" fallback. Nothing widens: the RPC returns families.label (never a student
-- value) and enrollments_*_select already shows this Teacher the withdrawn row. The perimeter
-- is still proven by ATTACK 4c (unrelated family) and 4e (cross-session) above.
select tests.authenticate_as(:'v_teacher_d'::uuid, 'teacher', 'class', 'ce777777-0000-0000-0000-000000000023'::uuid);
select is(
  (select public.resolve_parent_family_label(:'v_parent_1'::uuid, 'ce777777-0000-0000-0000-000000000023'::uuid)),
  'Adv Family A', 'CONTROL 4f ALLOW (ADR-2026-09-19): Teacher D resolves Parent 1''s family label via Class D even though the only enrollment link is withdrawn'
);
select tests.clear_authentication();
```

Leave ATTACK 4c untouched — it is the perimeter check and must keep passing.

- [ ] **Step 5: Add Group 9 immediately before `select * from finish();`**

```sql
-- =====================================================================================
-- GROUP 9 (issue #96, ADR-2026-09-19): withdrawal revokes conversational access outright.
-- The withdrawn state is built by UPDATE, after the class update and comments exist and
-- after two controls prove the family could read them -- so "cannot read an update posted
-- before withdrawal" cannot pass vacuously against a family that was never enrolled.
-- Fixtures live here, not at the top of the file, so no earlier count assertion moves.
-- Count assertions below target fixture ids, so they stay exact even on a RED run where an
-- insert that should have been refused leaked a row.
-- =====================================================================================

insert into classes (id, session_id, name, grade_band) values
  ('ce777777-0000-0000-0000-000000000024', 'ce777777-0000-0000-0000-000000000011', 'Adv Class W (withdrawal transitions)', 'HS9-12');

insert into families (id, label) values
  ('ce777777-0000-0000-0000-000000000033', 'Adv Family W1'),
  ('ce777777-0000-0000-0000-000000000034', 'Adv Family W2');

select tests.create_supabase_user('adv-teacher-w@test.local') as v_teacher_w \gset
select tests.create_supabase_user('adv-parent-w1@test.local') as v_parent_w1 \gset
select tests.create_supabase_user('adv-parent-w2@test.local') as v_parent_w2 \gset
select tests.create_supabase_user('adv-student-w1@test.local') as v_student_w1 \gset
select tests.create_supabase_user('adv-student-w2@test.local') as v_student_w2 \gset

insert into family_members (family_id, user_id, relationship) values
  ('ce777777-0000-0000-0000-000000000033', :'v_parent_w1'::uuid, 'guardian'),
  ('ce777777-0000-0000-0000-000000000034', :'v_parent_w2'::uuid, 'guardian');

-- Family W1 has one child (Wes) -> withdrawing him withdraws the family from Class W.
-- Family W2 has two (Xan, Yul) in the same class -> withdrawing Xan leaves Yul as the
-- still-enrolled sibling, which must keep the family's access with no special guard.
insert into students (id, family_id, first_name, last_name, grade_level, user_id) values
  ('ce777777-0000-0000-0000-000000000043', 'ce777777-0000-0000-0000-000000000033', 'Wes', 'Wone', 'HS9', :'v_student_w1'::uuid),
  ('ce777777-0000-0000-0000-000000000044', 'ce777777-0000-0000-0000-000000000034', 'Xan', 'Wtwo', 'HS9', :'v_student_w2'::uuid),
  ('ce777777-0000-0000-0000-000000000045', 'ce777777-0000-0000-0000-000000000034', 'Yul', 'Wtwo', 'HS9', null);

insert into enrollments (student_id, class_id, session_id, status) values
  ('ce777777-0000-0000-0000-000000000043', 'ce777777-0000-0000-0000-000000000024', 'ce777777-0000-0000-0000-000000000011', 'active'),
  ('ce777777-0000-0000-0000-000000000044', 'ce777777-0000-0000-0000-000000000024', 'ce777777-0000-0000-0000-000000000011', 'active'),
  ('ce777777-0000-0000-0000-000000000045', 'ce777777-0000-0000-0000-000000000024', 'ce777777-0000-0000-0000-000000000011', 'active');

-- Posted while every enrollment above is active.
insert into class_updates (id, class_id, posted_by, body, homework, meeting_date) values
  ('ce777777-0000-0000-0000-000000000054', 'ce777777-0000-0000-0000-000000000024', :'v_teacher_w'::uuid, 'Adv Class W update, posted before any withdrawal', null, '2026-01-11');

insert into comments (id, class_update_id, author_user_id, author_role, body, is_private, target_parent_id) values
  ('ce777777-0000-0000-0000-000000000066', 'ce777777-0000-0000-0000-000000000054', :'v_student_w1'::uuid, 'student', 'public comment on Adv W', false, null),
  ('ce777777-0000-0000-0000-000000000067', 'ce777777-0000-0000-0000-000000000054', :'v_parent_w1'::uuid, 'parent', 'private note from parent W1', true, :'v_parent_w1'::uuid),
  ('ce777777-0000-0000-0000-000000000068', 'ce777777-0000-0000-0000-000000000054', :'v_teacher_w'::uuid, 'teacher', 'teacher private reply to parent W1', true, :'v_parent_w1'::uuid),
  ('ce777777-0000-0000-0000-000000000069', 'ce777777-0000-0000-0000-000000000054', :'v_parent_w2'::uuid, 'parent', 'private note from parent W2', true, :'v_parent_w2'::uuid);

-- Non-vacuity controls: while enrolled, Parent W1 reads the update and their whole thread.
select tests.authenticate_as(:'v_parent_w1'::uuid, 'parent');
select is(
  (select count(*) from class_updates where id = 'ce777777-0000-0000-0000-000000000054'::uuid)::int, 1,
  'CONTROL 9-pre: while enrolled, Parent W1 reads Class W''s update (so the denials below are a real transition)'
);
select is(
  (select count(*) from comments where id in ('ce777777-0000-0000-0000-000000000067'::uuid, 'ce777777-0000-0000-0000-000000000068'::uuid))::int, 2,
  'CONTROL 9-pre: while enrolled, Parent W1 reads both sides of their own private thread'
);
select tests.clear_authentication();

-- THE TRANSITION: active -> withdrawn by UPDATE. Wes (all of Family W1) and Xan (one of two
-- Family W2 children).
update enrollments set status = 'withdrawn'
where class_id = 'ce777777-0000-0000-0000-000000000024'
  and student_id in ('ce777777-0000-0000-0000-000000000043', 'ce777777-0000-0000-0000-000000000044');

-- A second update, posted after the withdrawal.
insert into class_updates (id, class_id, posted_by, body, homework, meeting_date) values
  ('ce777777-0000-0000-0000-000000000055', 'ce777777-0000-0000-0000-000000000024', :'v_teacher_w'::uuid, 'Adv Class W update, posted after the withdrawal', null, '2026-01-18');

-- Withdrawn Parent.
select tests.authenticate_as(:'v_parent_w1'::uuid, 'parent');
select is(
  (select count(*) from class_updates where id = 'ce777777-0000-0000-0000-000000000054'::uuid)::int, 0,
  'ATTACK 9a DENY: withdrawn Parent cannot read a class update posted BEFORE withdrawal (no time bound -- the ADR-2026-09-19 vs ADR-0037 difference)'
);
select is(
  (select count(*) from class_updates where id = 'ce777777-0000-0000-0000-000000000055'::uuid)::int, 0,
  'ATTACK 9b DENY: withdrawn Parent cannot read a class update posted after withdrawal'
);
select is(
  (select count(*) from comments where id = 'ce777777-0000-0000-0000-000000000066'::uuid)::int, 0,
  'ATTACK 9c DENY: withdrawn Parent cannot read the class''s public comments'
);
select is(
  (select count(*) from comments where id in ('ce777777-0000-0000-0000-000000000067'::uuid, 'ce777777-0000-0000-0000-000000000068'::uuid))::int, 0,
  'ATTACK 9d DENY: withdrawn Parent cannot read their OWN private thread (Decision 1b -- comments_target_parent_select is identity-derived and had no enrollments join to filter)'
);
select throws_ok(
  format($$insert into comments (class_update_id, author_user_id, author_role, body, is_private, target_parent_id)
    values ('ce777777-0000-0000-0000-000000000054'::uuid, %L, 'parent', 'withdrawn parent public comment', false, null)$$, :'v_parent_w1'::uuid),
  '42501', null, 'ATTACK 9e DENY: withdrawn Parent cannot insert a public comment'
);
select throws_ok(
  format($$insert into comments (class_update_id, author_user_id, author_role, body, is_private, target_parent_id)
    values ('ce777777-0000-0000-0000-000000000054'::uuid, %L, 'parent', 'withdrawn parent private note', true, %L)$$, :'v_parent_w1'::uuid, :'v_parent_w1'::uuid),
  '42501', null, 'ATTACK 9f DENY: withdrawn Parent cannot insert into their own private thread'
);
select tests.clear_authentication();

-- Withdrawn Student.
select tests.authenticate_as(:'v_student_w1'::uuid, 'student');
select is(
  (select count(*) from class_updates where class_id = 'ce777777-0000-0000-0000-000000000024'::uuid)::int, 0,
  'ATTACK 9g DENY: withdrawn Student cannot read any of the class''s updates'
);
select is(
  (select count(*) from comments where id = 'ce777777-0000-0000-0000-000000000066'::uuid)::int, 0,
  'ATTACK 9h DENY: withdrawn Student cannot read the class''s public comments -- including their own'
);
select throws_ok(
  format($$insert into comments (class_update_id, author_user_id, author_role, body, is_private, target_parent_id)
    values ('ce777777-0000-0000-0000-000000000054'::uuid, %L, 'student', 'withdrawn student comment', false, null)$$, :'v_student_w1'::uuid),
  '42501', null, 'ATTACK 9i DENY: withdrawn Student cannot insert a comment'
);
select tests.clear_authentication();

-- The class's Teacher: write to the withdrawn family is revoked, read is not.
select tests.authenticate_as(:'v_teacher_w'::uuid, 'teacher', 'class', 'ce777777-0000-0000-0000-000000000024'::uuid);
select is(
  is_parent_of_class(:'v_parent_w1'::uuid, 'ce777777-0000-0000-0000-000000000024'::uuid),
  false,
  'ATTACK 9j DENY: is_parent_of_class is false for a Parent whose only enrollment in the class is withdrawn'
);
select throws_ok(
  format($$insert into comments (class_update_id, author_user_id, author_role, body, is_private, target_parent_id)
    values ('ce777777-0000-0000-0000-000000000055'::uuid, %L, 'teacher', 'opening a new thread with a withdrawn parent', true, %L)$$, :'v_teacher_w'::uuid, :'v_parent_w1'::uuid),
  '42501', null, 'ATTACK 9k DENY: Teacher cannot open a NEW private thread with a withdrawn Parent'
);
select throws_ok(
  format($$insert into comments (class_update_id, author_user_id, author_role, body, is_private, target_parent_id)
    values ('ce777777-0000-0000-0000-000000000054'::uuid, %L, 'teacher', 'replying into an existing thread with a withdrawn parent', true, %L)$$, :'v_teacher_w'::uuid, :'v_parent_w1'::uuid),
  '42501', null, 'ATTACK 9l DENY: Teacher cannot reply into an EXISTING private thread with a withdrawn Parent (is_parent_of_class runs on every private insert, not once per thread)'
);
select is(
  (select count(*) from comments where id in ('ce777777-0000-0000-0000-000000000067'::uuid, 'ce777777-0000-0000-0000-000000000068'::uuid))::int, 2,
  'CONTROL 9: Teacher still READS the withdrawn family''s private thread (authorship-derived, never joined enrollments)'
);
savepoint before_w_teacher_public_comment;
select lives_ok(
  format($$insert into comments (class_update_id, author_user_id, author_role, body, is_private, target_parent_id)
    values ('ce777777-0000-0000-0000-000000000054'::uuid, %L, 'teacher', 'teacher public comment', false, null)$$, :'v_teacher_w'::uuid),
  'CONTROL 9: Teacher still posts PUBLIC comments on that update (the public branch never calls is_parent_of_class)'
);
rollback to savepoint before_w_teacher_public_comment;
select is(
  (select public.resolve_parent_family_label(:'v_parent_w1'::uuid, 'ce777777-0000-0000-0000-000000000024'::uuid)),
  'Adv Family W1', 'CONTROL 9: Teacher resolves the withdrawn family''s real label (no "Private thread" fallback, Decision 4)'
);
-- Sibling still enrolled (Yul): Family W2 keeps its write path, with no special guard.
select is(
  is_parent_of_class(:'v_parent_w2'::uuid, 'ce777777-0000-0000-0000-000000000024'::uuid),
  true,
  'CONTROL 9: is_parent_of_class stays true for a Parent with one child withdrawn and a sibling still enrolled in the same class'
);
savepoint before_w_teacher_reply_to_sibling_family;
select lives_ok(
  format($$insert into comments (class_update_id, author_user_id, author_role, body, is_private, target_parent_id)
    values ('ce777777-0000-0000-0000-000000000054'::uuid, %L, 'teacher', 'reply to parent W2', true, %L)$$, :'v_teacher_w'::uuid, :'v_parent_w2'::uuid),
  'CONTROL 9: Teacher can still reply privately to the family with a sibling still enrolled'
);
rollback to savepoint before_w_teacher_reply_to_sibling_family;
select tests.clear_authentication();

select tests.authenticate_as(:'v_parent_w2'::uuid, 'parent');
select is(
  (select count(*) from class_updates where id = 'ce777777-0000-0000-0000-000000000054'::uuid)::int, 1,
  'CONTROL 9: Parent with a sibling still enrolled keeps reading the class''s updates'
);
select is(
  (select count(*) from comments where id = 'ce777777-0000-0000-0000-000000000069'::uuid)::int, 1,
  'CONTROL 9: Parent with a sibling still enrolled keeps reading their own private thread'
);
savepoint before_w_sibling_parent_comment;
select lives_ok(
  format($$insert into comments (class_update_id, author_user_id, author_role, body, is_private, target_parent_id)
    values ('ce777777-0000-0000-0000-000000000054'::uuid, %L, 'parent', 'sibling-family public comment', false, null)$$, :'v_parent_w2'::uuid),
  'CONTROL 9: Parent with a sibling still enrolled can still comment'
);
rollback to savepoint before_w_sibling_parent_comment;
select tests.clear_authentication();

-- ...but the withdrawn sibling himself is out: student access is per-student.
select tests.authenticate_as(:'v_student_w2'::uuid, 'student');
select is(
  (select count(*) from class_updates where class_id = 'ce777777-0000-0000-0000-000000000024'::uuid)::int, 0,
  'ATTACK 9m DENY: the withdrawn sibling (Student) loses the feed even though his family keeps it through the enrolled sibling'
);
select tests.clear_authentication();

-- Oversight is scope-derived and untouched.
select tests.authenticate_as(:'v_coordinator_1'::uuid, 'coordinator', 'session', 'ce777777-0000-0000-0000-000000000011'::uuid);
select is(
  (select count(*) from comments where id in (
    'ce777777-0000-0000-0000-000000000066'::uuid, 'ce777777-0000-0000-0000-000000000067'::uuid,
    'ce777777-0000-0000-0000-000000000068'::uuid, 'ce777777-0000-0000-0000-000000000069'::uuid))::int, 4,
  'CONTROL 9: Coordinator oversight still reads every comment, public and private, after the withdrawal'
);
select tests.clear_authentication();

-- RE-ENROLMENT: withdrawn -> active restores everything, including what was posted meanwhile.
update enrollments set status = 'active'
where class_id = 'ce777777-0000-0000-0000-000000000024'
  and student_id = 'ce777777-0000-0000-0000-000000000043';

select tests.authenticate_as(:'v_parent_w1'::uuid, 'parent');
select is(
  (select count(*) from class_updates where id = 'ce777777-0000-0000-0000-000000000054'::uuid)::int, 1,
  'CONTROL 9: re-enrolment restores the Parent''s read of the earlier update'
);
select is(
  (select count(*) from class_updates where class_id = 'ce777777-0000-0000-0000-000000000024'::uuid)::int, 2,
  'CONTROL 9: re-enrolment also reveals the update posted while they were withdrawn (nothing was stamped, so nothing to un-stamp)'
);
select is(
  (select count(*) from comments where id in ('ce777777-0000-0000-0000-000000000067'::uuid, 'ce777777-0000-0000-0000-000000000068'::uuid))::int, 2,
  'CONTROL 9: re-enrolment restores the Parent''s private thread'
);
savepoint before_w_reenrolled_parent_note;
select lives_ok(
  format($$insert into comments (class_update_id, author_user_id, author_role, body, is_private, target_parent_id)
    values ('ce777777-0000-0000-0000-000000000054'::uuid, %L, 'parent', 're-enrolled parent private note', true, %L)$$, :'v_parent_w1'::uuid, :'v_parent_w1'::uuid),
  'CONTROL 9: re-enrolment restores the Parent''s write'
);
rollback to savepoint before_w_reenrolled_parent_note;
select tests.clear_authentication();

select tests.authenticate_as(:'v_teacher_w'::uuid, 'teacher', 'class', 'ce777777-0000-0000-0000-000000000024'::uuid);
select is(
  is_parent_of_class(:'v_parent_w1'::uuid, 'ce777777-0000-0000-0000-000000000024'::uuid),
  true,
  'CONTROL 9: re-enrolment restores is_parent_of_class, so the Teacher can reply again'
);
select tests.clear_authentication();
```

- [ ] **Step 6: Run it and confirm RED — exactly 15 failures**

Docker must be running and the local stack up to date with `main`'s migrations (`npx supabase migration list --local`).

Run: `npx supabase test db supabase/tests/171_class_updates_and_comments_rls_adversarial.sql`

Expected: FAIL, 15 of 81 — and exactly these:
- `CONTROL 4f ALLOW` (returns `null` today)
- `ATTACK 9a`, `9b`, `9c`, `9d` (count is non-zero today)
- `ATTACK 9e`, `9f`, `9i`, `9k`, `9l` (`throws_ok` caught no exception — the insert succeeded)
- `ATTACK 9g`, `9h`, `9m` (count is non-zero today)
- `ATTACK 9j` (returns `true` today)
- `CONTROL 9: Teacher resolves the withdrawn family's real label` (returns `null` today)

Every other assertion, including both `CONTROL 9-pre` lines and `ATTACK 4c`, must pass. If any of the 15 passes now, stop: that assertion is vacuous and the fixture is wrong. If the count says "planned 81 but ran N", recount Step 1 before going further.

- [ ] **Step 7: Confirm `170_` is still green and untouched**

Run: `npx supabase test db supabase/tests/170_class_updates_and_comments_rls.sql`
Expected: PASS, 34 of 34.

- [ ] **Step 8: Commit**

```bash
git add supabase/tests/171_class_updates_and_comments_rls_adversarial.sql
git commit -m "test(#96): pgTAP for withdrawal revoking conversational access (RED)"
```

---

### Task 2: Migration — redefine the nine objects (GREEN)

**Files:**
- Create: `supabase/migrations/20261003120000_withdrawal_revokes_conversational_access.sql`
- Test: `supabase/tests/171_class_updates_and_comments_rls_adversarial.sql`, `supabase/tests/170_class_updates_and_comments_rls.sql`

**Interfaces:**
- Consumes: Task 1's assertions.
- Produces: `public.is_parent_of_class(p_user_id uuid, p_class_id uuid) returns boolean` — signature unchanged, now `false` when the parent's only enrollment in the class is withdrawn. `public.resolve_parent_family_label(p_parent_user_id uuid, p_class_id uuid) returns text` — signature unchanged, now resolves for a withdrawn family. Task 3's client wrapper calls the first.

- [ ] **Step 1: Write the migration**

Every body below is the current definition from `20260724120426` / `20260724120526` with only the stated change. Do not add `comments_teacher_insert`.

```sql
-- ADR-2026-09-19 (issue #96): a mid-year withdrawal revokes conversational access outright.
-- Supersedes ADR-0037's time-bounded read. No schema change -- nine existing objects are
-- redefined so each keys on enrollments.status = 'active'.
--
-- ROLLOVER IS NOT DECIDED HERE. Year-end rollover is also an active -> not-active transition,
-- so read literally these predicates would drop every family's prior-year threads at rollover.
-- ADR-2026-09-19 Decision 8 scopes this to mid-year withdrawal only and hands rollover to #82,
-- unarchitected. Do not read the behavior below as a rollover decision.
--
-- auth.jwt() stays in its bare form: wrapping it as (select auth.jwt()) is a codebase-wide
-- convention change that belongs to #105 and /architect, not to nine policies here.
--
-- comments_teacher_insert is deliberately NOT restated. Its private branch calls
-- is_parent_of_class, so the new predicate reaches it through the helper.

-- 1a: four enrollment-derived read policies gain the status filter.

drop policy if exists class_updates_student_select on class_updates;
create policy class_updates_student_select on class_updates for select
using (
  auth.jwt()->>'active_role' = 'student'
  and exists (
    select 1 from enrollments e join students s on s.id = e.student_id
    where e.class_id = class_updates.class_id and s.user_id = auth.uid()
      and e.status = 'active'
  )
);

drop policy if exists class_updates_parent_select on class_updates;
create policy class_updates_parent_select on class_updates for select
using (
  auth.jwt()->>'active_role' = 'parent'
  and exists (
    select 1 from enrollments e
    join students s on s.id = e.student_id
    join family_members fm on fm.family_id = s.family_id
    where e.class_id = class_updates.class_id and fm.user_id = auth.uid()
      and e.status = 'active'
  )
);

drop policy if exists comments_student_public_select on comments;
create policy comments_student_public_select on comments for select
using (
  auth.jwt()->>'active_role' = 'student'
  and comments.is_private = false
  and exists (
    select 1 from class_updates cu
    join enrollments e on e.class_id = cu.class_id
    join students s on s.id = e.student_id
    where cu.id = comments.class_update_id and s.user_id = auth.uid()
      and e.status = 'active'
  )
);

drop policy if exists comments_parent_public_select on comments;
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
      and e.status = 'active'
  )
);

-- 1b: the private-thread policy is identity-derived (target_parent_id = auth.uid()) and had no
-- enrollments join to filter, so it is rewritten to gain one. Without this a withdrawn family
-- would keep a private thread hanging off a class update they can no longer see.
drop policy if exists comments_target_parent_select on comments;
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

-- 2: the two family-side insert policies and the Teacher's private-reply helper.

drop policy if exists comments_student_insert on comments;
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
      and e.status = 'active'
  )
);

drop policy if exists comments_parent_insert on comments;
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
      and e.status = 'active'
  )
);

-- The status filter is added ALONGSIDE the auth.jwt() role/scope gate from issue #52, not in
-- place of it. Called by comments_teacher_insert on every private insert, so this blocks a
-- reply into an existing thread as well as a new one.
create or replace function public.is_parent_of_class(p_user_id uuid, p_class_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from enrollments e
    join students s on s.id = e.student_id
    join family_members fm on fm.family_id = s.family_id
    where e.class_id = p_class_id and fm.user_id = p_user_id
      and e.status = 'active'
  )
  and (
    (auth.jwt()->>'active_role' = 'teacher' and (auth.jwt()->>'scope_id')::uuid = p_class_id)
    or (auth.jwt()->>'active_role' = 'coordinator' and exists (
      select 1 from classes c where c.id = p_class_id and c.session_id = (auth.jwt()->>'scope_id')::uuid
    ))
    or auth.jwt()->>'active_role' in ('bv_coordinator', 'admin')
  );
$$;
revoke execute on function public.is_parent_of_class(uuid, uuid) from public, anon;
grant execute on function public.is_parent_of_class(uuid, uuid) to authenticated;

-- 4: the one relaxation. `and e.status = 'active'` is REMOVED, so a withdrawn family's thread
-- keeps its real label on the Teacher's card. Returns families.label only, never a
-- student-derived value, and the caller gate is unchanged -- "currently enrolled parent of my
-- class" widens to "ever enrolled parent of my class", which enrollments_*_select already shows.
create or replace function public.resolve_parent_family_label(p_parent_user_id uuid, p_class_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select f.label
  from family_members fm
  join families f on f.id = fm.family_id
  join students s on s.family_id = fm.family_id
  join enrollments e on e.student_id = s.id
  where fm.user_id = p_parent_user_id
    and e.class_id = p_class_id
    and (
      (auth.jwt()->>'active_role' = 'teacher' and (auth.jwt()->>'scope_id')::uuid = p_class_id)
      or (auth.jwt()->>'active_role' = 'coordinator' and exists (
        select 1 from classes c where c.id = p_class_id and c.session_id = (auth.jwt()->>'scope_id')::uuid
      ))
      or auth.jwt()->>'active_role' in ('bv_coordinator', 'admin')
    )
  limit 1;
$$;
revoke all on function public.resolve_parent_family_label(uuid, uuid) from public, anon;
grant execute on function public.resolve_parent_family_label(uuid, uuid) to authenticated;
```

- [ ] **Step 2: Apply it locally without a reset**

Run: `npx supabase migration up`
Expected: `Applying migration 20261003120000_withdrawal_revokes_conversational_access.sql...` and no error.

- [ ] **Step 3: Run `171_` and confirm GREEN**

Run: `npx supabase test db supabase/tests/171_class_updates_and_comments_rls_adversarial.sql`
Expected: PASS, 81 of 81. All 15 from Task 1 Step 6 now pass; `ATTACK 4c`, `8a`–`8c` still pass.

- [ ] **Step 4: Run the whole pgTAP suite**

Run: `npx supabase test db`
Expected: every file PASS, `170_` at 34 of 34. A failure in another file means an object outside the nine was touched — diff the migration against the Global Constraints list.

- [ ] **Step 5: Confirm the function grants did not widen**

Run:

```bash
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -At -c "select p.proname, has_function_privilege('anon', p.oid, 'execute') as anon, has_function_privilege('authenticated', p.oid, 'execute') as authed from pg_proc p where p.proname in ('is_parent_of_class','resolve_parent_family_label') order by 1"
```

Expected:

```
is_parent_of_class|f|t
resolve_parent_family_label|f|t
```

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20261003120000_withdrawal_revokes_conversational_access.sql
git commit -m "feat(#96): revoke conversational access on enrollment withdrawal (ADR-2026-09-19)"
```

---

### Task 3: Client logic — the private-reply gate and its RPC wrapper

**Files:**
- Create: `features/teacher/class-update-and-home-feed/logic/privateReplyGate.ts`
- Create: `features/teacher/class-update-and-home-feed/logic/__tests__/privateReplyGate.test.ts`
- Modify: `features/teacher/class-update-and-home-feed/api/comments.ts` (append after `resolveParentFamilyLabel`, `:61`)
- Create: `features/teacher/class-update-and-home-feed/api/__tests__/comments.test.ts`

**Interfaces:**
- Consumes: the existing RPC `is_parent_of_class(p_user_id uuid, p_class_id uuid) returns boolean`.
- Produces (Task 4 imports all of these):
  - `type ReplyOpen = boolean | null` — `true` open, `false` withdrawn, `null` lookup failed
  - `type ThreadFooter = 'composer' | 'withdrawn-note' | 'none'`
  - `const WITHDRAWN_NOTE: string`
  - `gateKey(classId: string, parentUserId: string): string`
  - `resolveReplyOpenForKeys(keys: string[], check: (key: string) => Promise<boolean>): Promise<Array<readonly [string, ReplyOpen]>>`
  - `threadFooter(input: { canComment: boolean; role: 'student' | 'parent' | 'teacher'; isPrivate: boolean; replyOpen: ReplyOpen | undefined }): ThreadFooter`
  - `isParentOfClass(supabase: SupabaseClient, parentUserId: string, classId: string): Promise<boolean>`

- [ ] **Step 1: Write the failing logic tests**

`features/teacher/class-update-and-home-feed/logic/__tests__/privateReplyGate.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { WITHDRAWN_NOTE, gateKey, resolveReplyOpenForKeys, threadFooter } from '../privateReplyGate';

describe('WITHDRAWN_NOTE', () => {
  it('is the signed-off copy, verbatim', () => {
    expect(WITHDRAWN_NOTE).toBe('This family has withdrawn — replies are closed.');
  });
});

describe('gateKey', () => {
  it('keeps the same parent distinct across classes', () => {
    expect(gateKey('class-a', 'parent-1')).not.toBe(gateKey('class-b', 'parent-1'));
  });

  it('is stable for the same class and parent', () => {
    expect(gateKey('class-a', 'parent-1')).toBe(gateKey('class-a', 'parent-1'));
  });
});

describe('resolveReplyOpenForKeys', () => {
  it('returns one entry per key, in key order', async () => {
    const entries = await resolveReplyOpenForKeys(['p1', 'p2'], async (k) => k === 'p1');
    expect(entries).toEqual([
      ['p1', true],
      ['p2', false],
    ]);
  });

  it('maps a rejected lookup to null, never to false, without rejecting the batch', async () => {
    const entries = await resolveReplyOpenForKeys(['ok', 'boom'], async (k) => {
      if (k === 'boom') throw new Error('rpc failed');
      return true;
    });
    expect(entries).toEqual([
      ['ok', true],
      ['boom', null],
    ]);
  });

  it('returns an empty list for no keys without calling the check', async () => {
    let calls = 0;
    const entries = await resolveReplyOpenForKeys([], async () => {
      calls += 1;
      return true;
    });
    expect(entries).toEqual([]);
    expect(calls).toBe(0);
  });
});

describe('threadFooter', () => {
  const teacherPrivate = { canComment: true, role: 'teacher' as const, isPrivate: true };

  it('shows the note for a Teacher private thread whose family has withdrawn', () => {
    expect(threadFooter({ ...teacherPrivate, replyOpen: false })).toBe('withdrawn-note');
  });

  it('shows the composer for a Teacher private thread whose family is enrolled', () => {
    expect(threadFooter({ ...teacherPrivate, replyOpen: true })).toBe('composer');
  });

  it('renders nothing while pending, so no composer flashes and vanishes', () => {
    expect(threadFooter({ ...teacherPrivate, replyOpen: undefined })).toBe('none');
  });

  it('keeps the composer when the lookup failed — an error must not claim a withdrawal', () => {
    expect(threadFooter({ ...teacherPrivate, replyOpen: null })).toBe('composer');
  });

  it('never gates the Teacher public thread, whatever the lookup says', () => {
    for (const replyOpen of [true, false, null, undefined]) {
      expect(threadFooter({ canComment: true, role: 'teacher', isPrivate: false, replyOpen })).toBe('composer');
    }
  });

  it('never gates a Parent or Student composer', () => {
    expect(threadFooter({ canComment: true, role: 'parent', isPrivate: true, replyOpen: false })).toBe('composer');
    expect(threadFooter({ canComment: true, role: 'student', isPrivate: false, replyOpen: undefined })).toBe('composer');
  });

  it('renders nothing for oversight roles — no composer, so no note in its place', () => {
    expect(threadFooter({ canComment: false, role: 'student', isPrivate: true, replyOpen: false })).toBe('none');
    expect(threadFooter({ canComment: false, role: 'student', isPrivate: false, replyOpen: undefined })).toBe('none');
  });
});
```

(`role: 'student'` with `canComment: false` is how `ClassUpdateDetailScreen` already represents an oversight viewer — see its `:36`.)

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run features/teacher/class-update-and-home-feed/logic/__tests__/privateReplyGate.test.ts`
Expected: FAIL — cannot resolve `../privateReplyGate`.

- [ ] **Step 3: Implement the logic**

`features/teacher/class-update-and-home-feed/logic/privateReplyGate.ts`:

```typescript
// Decides what sits in a thread card's composer slot (ADR-2026-09-19, issue #96).
//
// A Teacher keeps READING a withdrawn family's private thread but can no longer reply into it:
// comments_teacher_insert's private branch calls is_parent_of_class, which now requires an
// active enrollment. This gate asks that same RPC, so the control and the policy cannot drift.

// true = replies open · false = the family has withdrawn · null = the lookup failed (unknown).
export type ReplyOpen = boolean | null;

export type ThreadFooter = 'composer' | 'withdrawn-note' | 'none';

export const WITHDRAWN_NOTE = 'This family has withdrawn — replies are closed.';

// A parent can be withdrawn from one class and enrolled in another, so the answer is per
// (class, parent), never per parent.
export function gateKey(classId: string, parentUserId: string): string {
  return `${classId}:${parentUserId}`;
}

// A failed lookup becomes null rather than false: the note states a fact about a family, and a
// network error must not assert it. Never rejects, so one bad RPC cannot blank the thread UI.
export async function resolveReplyOpenForKeys(
  keys: string[],
  check: (key: string) => Promise<boolean>
): Promise<Array<readonly [string, ReplyOpen]>> {
  return Promise.all(
    keys.map(async (key) => {
      try {
        return [key, await check(key)] as const;
      } catch {
        return [key, null] as const;
      }
    })
  );
}

export function threadFooter(input: {
  canComment: boolean;
  role: 'student' | 'parent' | 'teacher';
  isPrivate: boolean;
  // undefined = not looked up yet.
  replyOpen: ReplyOpen | undefined;
}): ThreadFooter {
  if (!input.canComment) return 'none';
  if (input.role !== 'teacher' || !input.isPrivate) return 'composer';
  if (input.replyOpen === undefined) return 'none';
  if (input.replyOpen === false) return 'withdrawn-note';
  return 'composer';
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run features/teacher/class-update-and-home-feed/logic/__tests__/privateReplyGate.test.ts`
Expected: PASS, 13 tests.

- [ ] **Step 5: Write the failing API test**

`features/teacher/class-update-and-home-feed/api/__tests__/comments.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { isParentOfClass } from '../comments';

function mockClient(result: { data: unknown; error: unknown }) {
  const rpc = vi.fn(async () => result);
  return { client: { rpc } as any, rpc };
}

describe('isParentOfClass', () => {
  it('calls the is_parent_of_class RPC with the policy\'s own argument names', async () => {
    const { client, rpc } = mockClient({ data: true, error: null });

    await isParentOfClass(client, 'parent-1', 'class-1');

    expect(rpc).toHaveBeenCalledWith('is_parent_of_class', { p_user_id: 'parent-1', p_class_id: 'class-1' });
  });

  it('returns the RPC boolean as-is', async () => {
    expect(await isParentOfClass(mockClient({ data: true, error: null }).client, 'p', 'c')).toBe(true);
    expect(await isParentOfClass(mockClient({ data: false, error: null }).client, 'p', 'c')).toBe(false);
  });

  it('throws the RPC error rather than reporting a withdrawal', async () => {
    const error = { code: '57014', message: 'canceling statement due to statement timeout' };
    await expect(isParentOfClass(mockClient({ data: null, error }).client, 'p', 'c')).rejects.toBe(error);
  });

  it('throws on a non-boolean result rather than coercing null to "withdrawn"', async () => {
    await expect(isParentOfClass(mockClient({ data: null, error: null }).client, 'p', 'c')).rejects.toThrow(
      'is_parent_of_class returned a non-boolean'
    );
  });
});
```

- [ ] **Step 6: Run to verify it fails**

Run: `npx vitest run features/teacher/class-update-and-home-feed/api/__tests__/comments.test.ts`
Expected: FAIL — `isParentOfClass` is not exported from `../comments`.

- [ ] **Step 7: Implement the wrapper**

Append to `features/teacher/class-update-and-home-feed/api/comments.ts`:

```typescript

// Whether a Teacher may still reply privately to this Parent: the same is_parent_of_class RPC
// comments_teacher_insert's WITH CHECK calls, so the composer and the policy cannot disagree
// (ADR-2026-09-19). false = the family holds no active enrollment in the class. Throws on an
// error or a non-boolean result — callers must treat that as "unknown", never as "withdrawn".
export async function isParentOfClass(
  supabase: SupabaseClient,
  parentUserId: string,
  classId: string
): Promise<boolean> {
  const { data, error } = await supabase.rpc('is_parent_of_class', {
    p_user_id: parentUserId,
    p_class_id: classId,
  });
  if (error) throw error;
  if (typeof data !== 'boolean') throw new Error('is_parent_of_class returned a non-boolean');
  return data;
}
```

- [ ] **Step 8: Run to verify it passes, then the whole unit suite and typecheck**

Run: `npx vitest run features/teacher/class-update-and-home-feed/api/__tests__/comments.test.ts`
Expected: PASS, 4 tests.

Run: `npm test && npm run typecheck`
Expected: all PASS, no type errors. (If typecheck fails on routes that exist, `rm -rf .expo/types` and rerun — a stale gitignored cache, not this change.)

- [ ] **Step 9: Commit**

```bash
git add features/teacher/class-update-and-home-feed/logic/privateReplyGate.ts \
  features/teacher/class-update-and-home-feed/logic/__tests__/privateReplyGate.test.ts \
  features/teacher/class-update-and-home-feed/api/comments.ts \
  features/teacher/class-update-and-home-feed/api/__tests__/comments.test.ts
git commit -m "feat(#96): private-reply gate logic and is_parent_of_class wrapper"
```

---

### Task 4: Teacher detail screen — hide the composer, show the note

**Files:**
- Modify: `features/teacher/class-update-and-home-feed/components/ClassUpdateDetailScreen.tsx` — imports (`:13-16`), state (`:33`), new effect after `:85`, `send` (`:87-102`), composer slot (`:139-146`), styles (after `emptyComments`, `:170`)

No unit test: this repo has no RN component-test harness (`vitest.config.ts` covers pure logic and `api/` only). The branching is already pinned by Task 3; this task is wiring, verified by hand below and by the playwright-cli design review at `/test`.

**Interfaces:**
- Consumes: everything Task 3 produces, with those exact names and signatures.
- Produces: nothing other tasks rely on.

- [ ] **Step 1: Imports and state**

Replace the `../api/comments` import at `:13` and add the logic import after `:15`:

```tsx
import { fetchComments, insertComment, isParentOfClass, resolveParentFamilyLabel, type CommentRow } from "../api/comments";
```

```tsx
import { WITHDRAWN_NOTE, gateKey, resolveReplyOpenForKeys, threadFooter, type ReplyOpen } from "../logic/privateReplyGate";
```

Add after the `parentLabels` state at `:33`:

```tsx
  const [replyOpen, setReplyOpen] = useState<Map<string, ReplyOpen>>(new Map());
```

- [ ] **Step 2: Resolve the gate per private group**

Add directly after the label-resolving `useEffect` (ends `:85`):

```tsx
  // Whether the Teacher may still reply into each private thread (ADR-2026-09-19): a family that
  // has withdrawn keeps a readable thread the Teacher can no longer answer. Same shape as the
  // label lookup above, and the same RPC comments_teacher_insert checks. `role` is only
  // "teacher" when the viewer can comment, so oversight roles never run this.
  useEffect(() => {
    if (role !== "teacher" || !update) return;
    const classId = update.class_id;
    const missing = groups
      .filter((g) => g.isPrivate)
      .map((g) => g.key)
      .filter((k) => !replyOpen.has(gateKey(classId, k)));
    if (missing.length === 0) return;
    (async () => {
      const entries = await resolveReplyOpenForKeys(missing, (parentUserId) =>
        isParentOfClass(supabase, parentUserId, classId)
      );
      setReplyOpen((prev) => {
        const next = new Map(prev);
        for (const [k, open] of entries) next.set(gateKey(classId, k), open);
        return next;
      });
    })();
  }, [role, update, groups, replyOpen]);
```

- [ ] **Step 3: Re-check the one thread when a private send is refused**

Replace the `await insertComment(...)` call inside `send` (`:93-100`) — keep the `if (!session) throw` guard above it and `await load();` below it:

```tsx
    try {
      await insertComment(supabase, {
        classUpdateId: id,
        authorUserId: session.user.id,
        authorRole: role,
        body,
        isPrivate,
        targetParentId: isPrivate ? (targetParentId ?? session.user.id) : null,
      });
    } catch (e) {
      // The family may have withdrawn while this screen was open. Re-ask about this one thread
      // and close it only on a definite `false`; a failed re-check leaves the composer (and the
      // typed text) alone. Rethrow either way so the composer's error path keeps the text.
      if (role === "teacher" && isPrivate && targetParentId && update) {
        const classId = update.class_id;
        const [[, open]] = await resolveReplyOpenForKeys([targetParentId], (parentUserId) =>
          isParentOfClass(supabase, parentUserId, classId)
        );
        if (open === false) {
          setReplyOpen((prev) => new Map(prev).set(gateKey(classId, targetParentId), false));
        }
      }
      throw e;
    }
```

- [ ] **Step 4: Swap the composer slot**

Add this just above the `return (` at `:110`, after `allEmpty`:

```tsx
  const footerFor = (g: { key: string; isPrivate: boolean }) =>
    threadFooter({
      canComment,
      role,
      isPrivate: g.isPrivate,
      replyOpen: replyOpen.get(gateKey(update.class_id, g.key)),
    });
```

Replace the `{canComment ? ( <CommentComposer … /> ) : null}` block (`:139-146`) with:

```tsx
            {footerFor(g) === "composer" ? (
              <CommentComposer
                canPrivate={role === "parent"}
                onSend={({ body, isPrivate }) =>
                  send(role === "teacher" && g.isPrivate ? g.key : null, role === "teacher" ? g.isPrivate : isPrivate, body)
                }
              />
            ) : footerFor(g) === "withdrawn-note" ? (
              <Text style={styles.withdrawnNote}>{WITHDRAWN_NOTE}</Text>
            ) : null}
```

- [ ] **Step 5: Add the note style**

In `StyleSheet.create`, after `emptyComments`:

```tsx
  // Same muted-note treatment as emptyComments — deliberately not threadLabel, whose bold
  // uppercase eyebrow would shout a sentence.
  withdrawnNote: {
    fontFamily: theme.fonts.body,
    fontSize: theme.type.scale.sm,
    color: theme.colors.ink3,
    textAlign: "center" as const,
    paddingVertical: theme.space["2"],
  },
```

- [ ] **Step 6: Static checks**

Run: `npm run typecheck && npm run lint && npm test`
Expected: all clean. No hex color and no literal font size appear in the diff (`git diff -- features/ | grep -nE '#[0-9a-fA-F]{3,8}\b'` prints nothing).

- [ ] **Step 7: Hand walkthrough (needs Task 2 applied locally)**

Nothing in the app can withdraw an enrollment, so the state is set in SQL. Run `npm run dev`, then:

1. Sign in as a seeded **Parent** (logins in `UAT.md`), open a class update, send a **private** note. Sign out.
2. Sign in as that class's **Teacher**, open the same update. Expected: a private thread card labeled with the family's name, **with** a composer. Leave this tab open.
3. Withdraw that family locally:

   ```bash
   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c "update enrollments e set status = 'withdrawn' from students s join family_members fm on fm.family_id = s.family_id where e.student_id = s.id and fm.user_id = (select target_parent_id from comments where is_private order by created_at desc limit 1) returning e.id, e.class_id"
   ```

4. In a **second** tab as the Teacher, open the update fresh. Expected: the private card still shows the family's real label (not "Private thread") and the full thread; the composer is gone; in its place, muted and centered: `This family has withdrawn — replies are closed.` The **Public** card still has its composer, and a public comment still sends.
5. Sign in as the Parent. Expected: the home feed shows the existing empty state — no error, no spinner that never ends.
6. Back in the **first** Teacher tab (still showing a composer from step 2), type a reply and send. Expected: the send fails, the typed text is still in the box for a moment, then the composer is replaced by the note. No uncaught error in the console.
7. Restore:

   ```bash
   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c "update enrollments e set status = 'active' from students s join family_members fm on fm.family_id = s.family_id where e.student_id = s.id and fm.user_id = (select target_parent_id from comments where is_private order by created_at desc limit 1) returning e.id, e.class_id"
   ```

   Reload as the Teacher. Expected: the composer is back and a private reply sends.

If any expectation fails, fix before committing — do not carry it to `/test`.

- [ ] **Step 8: Commit**

```bash
git add features/teacher/class-update-and-home-feed/components/ClassUpdateDetailScreen.tsx
git commit -m "feat(#96): close the Teacher's private-thread composer for a withdrawn family"
```

---

### Task 5: `/test` and `/deploy-staging` obligations (gates, not code)

These are the spec's verification duties. They run inside the user-invoked `/test` and `/deploy-staging` stages; this task exists so none is dropped.

- [ ] **Step 1: Full local suite** — `npm test`, `npm run typecheck`, `npm run lint`, `npx supabase test db`. Record the output; `171_` at 81 of 81, `170_` at 34 of 34.
- [ ] **Step 2: `/rls-audit`** (the `rls-adversarial-tester` subagent) — role × scope, including after an active-role switch. This is an access-control change, so it is mandatory before promotion.
- [ ] **Step 3: Design parity** — playwright-cli review of the Teacher detail screen with a withdrawn thread at **360 / 768 / 1024 / 1440**. If the note wraps badly at 360, change `WITHDRAWN_NOTE` to `Withdrawn — replies closed` and update Task 3's copy test to match; do not truncate.
- [ ] **Step 4: Walk `UAT.md`** for the class-update flows; record Pass/Fail.
- [ ] **Step 5: Cloud check on staging — required, local pgTAP cannot see #105's failure mode.** Signed in as a seeded **Parent** and a seeded **Student**:
  - the home feed loads with no `57014` for a family with an **active** enrollment;
  - the same read returns **empty rather than hanging** for a withdrawn one (set by SQL on staging, then restored);
  - `EXPLAIN (ANALYZE, BUFFERS)` on the parent feed read **before and after** the migration, numbers recorded on #96.

  If the parent/student feed regresses the way the teacher feed already has, #105's fix must land first — this migration is **not** reverted. Record the result either way. Staging may be behind `main`; confirm with `npx supabase migration list` before reading anything into a result.
- [ ] **Step 6: Bookkeeping** — tick this plan's checkboxes, update the Teacher `_index.md` row's stage note, and correct #96's body on the two points the spec records (step 3 blocks every private reply, not only new threads; ATTACK 4f is at `171_…:313`).

---

### Self-review (spec coverage)

- **Behavior table** → Parent/Student revoked: 9a–9i, 9m. Teacher read unchanged, write revoked for that parent: 9j–9l + the two Teacher controls. Oversight unchanged: Coordinator control.
- **Data & RLS 1a / 1b / 2 / 4** → Task 2, one block each; 1b pinned by 9d, 4 by the label control and CONTROL 4f.
- **`comments_teacher_insert` not redefined; eight staff policies untouched** → Global Constraints + Task 2 Step 4.
- **Grants not widened** → Task 2 Step 5 (plus existing ATTACK 5d).
- **Bare `auth.jwt()`; rollover comment** → Task 2 Step 1 header.
- **All ten pgTAP bullets** → before-withdrawal 9a · after 9b · public comments 9c/9h · own private thread 9d · inserts 9e/9f/9i · new thread 9k · existing thread 9l · sibling (five controls + 9m) · re-enrolment (five controls) · label resolution.
- **Fixture warning** → Group 9 withdraws by `update`; `CONTROL 9-pre` proves prior access.
- **ATTACK 4f's three conditions** → Task 1 Step 4 (inverted, relabeled and relocated beside the Admin control, 4c left in place and required green).
- **UI: Parent no change** → no task touches `HomeFeedScreen`; walkthrough step 5. **Teacher composer + note, private groups only, tokens only** → Tasks 3–4. **Label fallback disappears** → walkthrough step 4.
- **Edge cases** → sibling, different-class (`gateKey` test + per-enrollment predicates), re-enrolment, rollover (migration comment), push (no task — already compliant), nothing-can-withdraw-today (walkthrough uses SQL).
- **Cloud check** → Task 5 Step 5.
- **Out of scope** — `withdrawn_at`, the withdrawal path, rollover, chat, worded parent empty state, export: no task touches any of them.

### Sign-off

- [x] **Human sign-off on this addendum plan** (2026-10-03, mehta.maulik@gmail.com) — including the four plan-level decisions above (all pgTAP in `171_` Group 9; nothing rendered while the lookup is pending; composer kept when the lookup fails; re-check on a refused private send). **Execution method: native** (`superpowers:executing-plans`, one whole-branch review at the end).
- → then **`/migration`** (Tasks 1–2) and **`/build`** (Tasks 3–4, parallelizable); **`/test`** carries Task 5.
