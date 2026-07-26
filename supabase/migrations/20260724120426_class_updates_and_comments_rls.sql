-- Teacher: class-update-and-home-feed (issue #21) — RLS + grants for class_updates/comments.
-- Verbatim from the signed-off /design's RLS SQL (ADR-0032), with author_role pinned in each
-- comments insert policy (plan-level addition, not a design-stage decision).
--
-- Scope model (§5.4): Teacher=class, Student=self, Parent=own-children. Oversight (extended
-- during /design, decision #2 — superseding an earlier narrower draft): Coordinator (own
-- session) and BV Coordinator/Admin (org-wide) get a plain, scope-based read of BOTH tables —
-- same shape as classes_coordinator_select/classes_org_select elsewhere in this codebase, no
-- privacy branching. No update/delete policy on either table for any role — moderation and
-- edit/delete-a-post are both explicitly out of scope for this item.

grant select, insert on class_updates to authenticated;
grant select, insert on comments to authenticated;

-- class_updates SELECT: Teacher (own class), Student (self), Parent (own-children).
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

-- Oversight: plain scope-based reads (decision #2) — Coordinator sees their own session's class
-- updates, BV Coordinator/Admin see org-wide. No privacy branching here; class_updates never
-- carried a privacy flag in the first place.
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

-- Scope-check helper for the Teacher's private-reply insert check: is p_user_id actually a
-- Parent of an enrolled student in p_class_id? A Teacher has no personal SELECT rights into an
-- arbitrary family's family_members row, so a plain (non-bypassing) subquery would always read
-- as false here — this stops a Teacher's client from privately messaging an unrelated user_id.
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

-- comments SELECT — public branch, one policy per role (scope check mirrors that role's
-- class_updates policy above); oversight branches (full read, public + private) below.
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

-- private branch: the target Parent, and the posting Teacher (party to every private thread on
-- their own update), see it; nobody else does.
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

-- oversight (ADR-0032, extended during /design — decision #2): full read, public and private,
-- same plain scope-based pattern as class_updates' own oversight policies just above. Because
-- Coordinator/BV Coordinator/Admin now carry a genuine class_updates SELECT grant, this
-- subquery resolves correctly through their own class_updates policy — no bypass function
-- needed.
create policy comments_coordinator_select on comments for select
using (
  auth.jwt()->>'active_role' = 'coordinator'
  and exists (select 1 from class_updates cu where cu.id = comments.class_update_id)
);
create policy comments_org_select on comments for select
using (auth.jwt()->>'active_role' in ('bv_coordinator','admin'));

-- comments INSERT — author_user_id always self; author_role pinned to the inserting role
-- (plan-level addition); scope-checked per role; privacy shape enforced per the table's check
-- constraint from the prior migration.
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
