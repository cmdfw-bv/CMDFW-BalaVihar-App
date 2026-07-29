# Teacher — Class update & home feed

> **owner:** Teacher · **consumers:** Student (own class, read + comment), Parent (each child's class, read + comment), Coordinator/BV Coordinator/Admin (oversight read of class updates + all comments, public and private, ADR-0032 extended during `/design`), System (`notifications-infra` — `push-send` second caller, ADR-0033) · **scope:** Teacher=class (post, own class only) · Student=self (read/comment, own class) · Parent=own-children (read/comment, each enrolled child's class) · Coordinator=session / BV Coordinator·Admin=org (oversight read — class updates + all comments, ADR-0032 extended) — §5.4 · **governing ADR:** ADR-0032 (comment privacy — column-flag RLS + scope-derived oversight), ADR-0033 (`push-send` discriminated event reference, ADR-0028 addendum) · **covers:** doc 2 Teacher POC-core "post class update (+ optional homework)"; doc 2 Student/Parent POC-core "home feed" + "two-way comments (public + private)"; doc 1 §5 thinnest-slice step 2–3 (Teacher posts, Student/Parent receive push + comment); doc 3 §6.2 (new table, flagged not yet in the canonical list); GitHub issue #21

**Stage:** Refined ✓ → `/architect` ✓ (ADR-0032, ADR-0033) → `/design` ✓ (signed off 2026-07-24 — see Sign-off below) → `/plan` ✓ (`class-update-and-home-feed.plan.md`) → `/migration` ✓ (2026-07-24 — Stage 1 landed: `class_updates`/`comments` tables, RLS, `is_parent_of_class`, `resolve_parent_family_label`; `supabase/tests/170_class_updates_and_comments_rls.sql` green, 25/25, full suite 194/194) → `/build` ✓ (2026-07-24 — Stages 2–5 landed: `push-send`'s `class_update_id` branch, pure logic, data layer, screens/routes; typecheck/lint/vitest/pgTAP all green — see the plan's W8 note for what still needs a real-browser pass) → `/test` ✓ (2026-07-25, two GREEN gate passes after an initial NOT-GREEN one — see the `UAT.md` sign-off log) → PR #48 opened → **code review 2026-07-29 (ssrinivas90): no Critical findings; 8 Important, fixes applied 2026-07-28** (see Review follow-ups below) → next: re-review, then `/deploy-staging`.

---

## Requirements (refined)

### User story
**As a** Teacher, **I want to** post an update to my class (with an optional homework note), **so that** the Students and Parents in that class see it in their home feed, get notified, and can discuss it — with Parents able to raise something with me privately instead of in front of the whole class.

### Decisions captured during refine
- **Comments are in scope for this item.** Posting + the home-feed read surface + two-way commenting (public + private) all ship as one vertical slice — this is what makes the slice meaningful (a class update nobody can respond to isn't the doc 2 "two-way comments" requirement). Uses the already-built `CommentThread` / `Comment` / `CommentComposer` kit components (`sankalp-component-kit`) as-is; this item owns the data wiring only.
- **Private comment audience = Teacher ↔ single Parent.** A private comment is a side thread between the posting Teacher and one Parent, scoped to that Parent's own family — invisible to the Student, to other Parents in the class, and to any other Teacher. Public comments are visible to everyone with class scope on that update (Teacher, all enrolled Students, all their Parents). This mirrors the Teacher↔Parent adult-channel pattern ADR-0015 already established for chat, applied here to comments instead of realtime messages.
- **Comment moderation is explicitly out of scope for this item.** Doc 2 lists "moderate comments" as a separate Teacher POC-core bullet from "post class update" and issue #21's own scope line doesn't mention it. This item ships post + read + comment (public/private); a Teacher's ability to hide/delete a comment is a future item's decision, not invented here.
- **View class roster is out of scope for this item** — doc 2 lists it as a separate Teacher bullet; no roster UI is built here (this item only needs to resolve "who is in my class" server-side for RLS/recipients, not surface a roster screen).
- **New tables required — naming/shape is a `/design`+`/migration` decision, not fixed here:** doc 3 §6.2's canonical table list has no `class_updates` or `comments` table yet (confirmed absent — `notifications-infra` explicitly named this item as the future owner of that gap). This item is the first to need both:
  - a **class-update** table (Teacher-authored, FK'd to a class, body text + optional homework text, posted-by, created-at)
  - a **comments** table generic enough to carry a public/private flag and a target parent (for the private case), FK'd to the class update
- **Feed scope for this slice is class-updates only.** The Sankalp `FeedCard` component already supports an "announcement" variant (org/center-scoped, from Coordinator/BV Coordinator/Admin), but no announcement table or posting flow exists yet — those are separate, not-yet-built Coordinator/BV Coordinator/Admin items (doc 2). This item's feed renders class-update cards only; the feed is built so an announcement card can slot in later without rework, but does not invent announcement posting now.
- **Push notification is in scope.** Per doc 1 §5's thinnest end-to-end slice ("Student & Parent receive a PWA push notification... open the app, see it, and comment"), posting a class update must trigger a push to the class's Students + Parents via the already-built generic `push-send` function (`notifications-infra`, System-owned) — this item is that function's first real caller and owns the trigger wiring (query the class's recipients, call `push-send`, PII-free payload per privacy rules).
- **Homework is a plain optional text field on the same post** — not a separate structured assignment/due-date/tracking system. That level of syllabus/assignment management is out of scope for the POC (doc 2 defers "calendar/syllabus" for Teacher).
- **Multi-class teachers hold one `user_roles` row per class** (scope_id = class), consistent with the existing per-scope-row pattern (e.g. Parent already holds one row per child). A Teacher who teaches more than one class posts to whichever class is their current active role; switching classes means switching active role, same mechanism as any other multi-role account (§5.3, `client-auth-session-and-nav`).
- **No consent/audit trigger on reading a class update.** §11.2's audit obligation is scoped to access to a *minor's own record* (e.g. attendance, roster); a class update is Teacher-authored class-wide content, not an individual student's PII, so it does not require an `audit_log` entry to read. (Posting/reading still stays inside RLS class-scope — this is about the audit-log trigger specifically, not access control.)

### Acceptance criteria
1. **Post class update** — a Teacher (active role = Teacher, scoped to a class) can submit an update: required body text + optional homework text. The post is stored against their own class only; a Teacher cannot post into a class outside their current active-role scope.
2. **Home feed read surface** — Student sees class updates for their own class; Parent sees class updates for each enrolled child's class (multiple children in different classes = updates from each, per §5.4 own-children scope). Rendered via `FeedCard`'s class-update variant (sans title, homework line shown only when homework is present).
3. **Feed ordering & states** — feed is newest-first; all four DoD states are drawn (loading · empty "No updates yet" · error-preserving with retry · content) per `.claude/rules/design-system.md`.
4. **Comment — public** — Student or Parent can post a public comment on a class update; visible to the Teacher, every Student in the class, and every Parent of that class. Teacher can also post public comments (e.g. replying).
5. **Comment — private** — a Parent can post a private comment on a class update; visible only to that Parent and the posting Teacher (not the Student, not other Parents). Teacher can reply privately within that same Parent's thread. Rendered with `Comment`'s locked/violet `isPrivate` styling.
6. **Comment count + entry point** — `FeedCard`'s footer comment-count reflects comments the viewer is allowed to see (their own private thread + all public), and tapping it opens `CommentThread`.
7. **Push on post** — submitting a class update triggers one `push-send` call reaching the class's Students + Parents (their held push subscriptions), payload PII-free (no student name/content beyond what's already policy-allowed for push bodies per `notifications-infra`).
8. **RLS enforced at the database, not the client** — a Student/Parent/Teacher outside a class's scope cannot read that class's updates or comments via direct API access, regardless of client UI (§12.1 non-negotiable #1); adversarial role × scope tests required before promotion (§11.3).
9. **No secrets/PII violation** — no service-role/VAPID key touches client code; push payload stays PII-free per privacy rules.

### Edge cases
- **No homework on a post** — homework field omitted entirely; `FeedCard` shows no homework line (not an empty placeholder line).
- **Class with zero current enrollments** — post still succeeds and stores; push has zero recipients (no-op, not an error).
- **Parent with children in multiple classes** — sees class updates from each child's class in one merged, newest-first feed (not one feed per child).
- **Long update/homework text** — truncates in the feed card per the kit's existing long-text-truncation pattern; full text on open.
- **Zero comments on a class update** — comment section shows an honest empty state, not an error.
- **A Parent's private thread vs. another Parent's private thread on the same class update** — each Parent sees only their own private thread with the Teacher, never another family's.
- **Teacher switches active role mid-session (e.g. also holds a Coordinator role)** — posting/reading always resolves against whatever class the *current* active role's scope names; no stale-class leakage across a role switch (same guarantee `client-auth-session-and-nav` already built for nav).
- **Push subscription missing/expired for a recipient** — feed post still succeeds; that recipient just doesn't get a push (they'll still see it next time they open the feed) — matches `notifications-infra`'s existing best-effort delivery posture.

### Priority
**POC-core** (confirmed by issue #21 and doc 2's Teacher POC-core list). Both blockers have lifted: `client-auth-session-and-nav` (#17) merged; `sankalp-component-kit` (#18) closed/merged. Startable now.

### Consumers (cross-persona)
- **Student** — reads own class's updates in the home feed; comments (public only — a Student has no private-comment capability, private is Teacher↔Parent).
- **Parent** — reads each enrolled child's class updates in the home feed; comments (public or private).
- **System (`notifications-infra`)** — this item is the first caller of the generic `push-send` function built there; no rework needed on that side per its own spec.

### Access scope (§5.4)
- **Teacher = class scope**: insert class updates only into their own current active-role class; read/reply to comments (public + any private thread addressed to them) on their own class's updates.
- **Student = self scope**: read-only on their own class's updates; public-comment only.
- **Parent = own-children scope**: read-only on each enrolled child's class's updates; public comments, plus private comments restricted to their own Teacher↔Parent thread.
- Enforced by RLS on the new tables (§12.1 non-negotiable #1) — the client never gates this on its own.

### Explicitly out of scope (so a later item picks it up)
- **Comment moderation** (hide/delete/report) — separate future Teacher item. (Oversight *read* access into private threads is in scope — ADR-0032; acting on a comment is not.)
- **Class roster screen** — separate future Teacher item ("view class roster," doc 2).
- **Announcements** (org/center-scoped, Coordinator/BV Coordinator/Admin-authored) — separate future items; this item's feed doesn't render them because they don't exist yet, but the feed shape doesn't preclude adding them later.
- **Structured homework/assignment tracking, syllabus, due dates** — deferred (doc 2: "calendar/syllabus").
- **`push-send` function itself** — built by `notifications-infra` (System); this item is its second caller via the `class_update_id` branch (ADR-0033), not a rebuild.

---

## Architect review — sign-off (2026-07-24)

**Outcome: signed off, 2 ADRs recorded.** The brief is sound against the architecture — scope model (§5.4), US residency, and minors'-data minimization all check out unchanged. The "no `audit_log` on reading a class update" call is a correct application of §11.2 (that obligation covers access to an individual minor's *record* — `students`/`attendance`/`consents` per ADR-0019 — not class-wide teacher content or conversational threads; the same reasoning chat messages already rely on). The "no RPC needed for Teacher insert/read on `class_updates`" implication is confirmed correct: unlike `attendance` (ADR-0021), these tables aren't gated by ADR-0019's audit-read requirement, so plain RLS insert + matching SELECT policy is sufficient — no repeat of the ADR-0020/0021 zero-row-`UPDATE`/`RETURNING` failure mode.

Two genuinely new decisions were surfaced (not left implicit) and recorded:

1. **ADR-0032 — comment privacy is column-flag RLS (`is_private`/`target_parent_id`), not a participant table.** The refine brief flagged this as a candidate extension of ADR-0015's Teacher↔Parent chat precedent. Reviewed against ADR-0015's actual rationale (a participant table exists there for grade-band membership derivation + `@mention` resolution + realtime presence — none of which apply to a fixed two/four-party comment thread) and against the already-built `Comment`/`CommentComposer` kit components (which already model privacy as a flat `isPrivate` prop). Decision: column-flag, with oversight eligibility (see next point) computed directly from JWT role+scope, no new table.
2. **Oversight read access, decided during this review (human confirmed):** Coordinator (own session) and BV Coordinator/Admin (org-wide) can **read** private Teacher↔Parent comment threads in their scope — mirroring ADR-0015's chat oversight posture, scope-derived rather than curated. This is new: the refine brief's own Access scope section didn't mention Coordinator/Admin at all. Moderation (acting on a comment) stays out of scope, unaffected by this.
3. **ADR-0033 — `push-send`'s contract extended to a discriminated `{message_id}`/`{class_update_id}` body**, closing a real gap between `notifications-infra`'s AC#3 (promises a generic function) and its actual signed-off `/design` (hardcoded to `messages` only). `notifications-infra.md` has been amended accordingly (its `/plan` will need a re-sync pass before `/build`, noted on that spec). This item's own `/design` owns only the `class_update_id` branch's exact recipient query and payload string, per ADR-0033's shape — not a fresh invocation-mechanism decision.

**Confirmed:** owner (Teacher), consumers (Student/Parent +, newly, Coordinator/BV Coordinator/Admin as oversight readers + System as `push-send`'s second caller), and scope are sound per §12.12, updated in the header above.

**Hand-off → `/design`:** produce the `class_updates`/`comments` table shapes (columns per the refine brief + ADR-0032's `is_private`/`target_parent_id`), the exact RLS policy SQL (including the scope-derived oversight OR-conditions), confirm plain-RLS insert/read for Teacher (no RPC), and the `class_update_id`-branch payload copy string + recipient query for `push-send` per ADR-0033.

---

## Design (2026-07-24)

> **Stage:** 1 — Design (this section). `/refine` ✓ → `/architect` ✓ (ADR-0032, ADR-0033) → `/design` ✓ → next `/plan`.

### Design decisions captured this pass
1. **Table shapes** — `class_updates` + `comments`, column-flag privacy per ADR-0032. No participant table, no RPC (architect already confirmed plain RLS insert/select is sufficient — these aren't ADR-0019 "minor's record" tables).
2. **Oversight is a full, plain scope-based read of `class_updates` and every `comments` row (public and private) — Coordinator (own session), BV Coordinator/Admin (org-wide).** *(Revised during this `/design` pass, human-directed — supersedes an earlier, narrower draft of this decision.)* The first draft of this design granted oversight into private comment threads only (via a `SECURITY DEFINER` lookup function, avoiding a standing `class_updates` grant), reasoned as the minimal read ADR-0032's own wording literally described. On review, that was an unnecessary asymmetry: every other operational table (`centers`/`sessions`/`classes`/`enrollments`) already gives Coordinator/BV Coordinator/Admin a plain scope-based read with no privacy branching, and class-update/public-comment content is *less* sensitive than the private threads ADR-0032 already opened up to these roles — restricting the less-sensitive content while granting the more-sensitive content was the actual inconsistency. Implemented as two ordinary scope-based `SELECT` policies per table (same shape as `classes_coordinator_select`/`classes_org_select`), which let the earlier `class_update_ref` bypass function be removed entirely — the `comments` oversight policies now resolve through the querying role's own genuine `class_updates` visibility. No new access-control mechanism, so this doesn't reopen ADR-0032 or need a new ADR — it's the existing §5.4 scope model applied uniformly to two tables this pass had under-scoped.
3. **Comment count is a live, RLS-filtered `count(*)` query, not a denormalized counter column.** Requirement #6 needs the count to differ per viewer (a Parent's own private thread counts for them, not for another Parent) — RLS already produces exactly that when the count query runs as the viewer, so no per-viewer counter bookkeeping is needed or built.
4. **Teacher's comment surface is stacked per-thread** (human-confirmed during this `/design`): one public `CommentThread` (all public comments + a public-only `CommentComposer`), plus one additional `CommentThread`+`CommentComposer` pair *per Parent who has an active private thread* on that update — each pre-scoped to that Parent, reusing the kit components verbatim, not a new component. A private thread only appears once that Parent has posted its first private comment; a Teacher cannot originate one (matches AC#5's "Teacher can reply privately *within that same Parent's thread*"). Student/Parent viewers need no such structure: a Student sees one thread (public only, `canPrivate=false`); a Parent sees one merged thread (their own private comments + all public comments, ordered together, `canPrivate=true` — sending with the toggle on implicitly targets `target_parent_id = auth.uid()`, no picker needed).
5. **Within a thread, comments render oldest-first** (conversational order) — distinct from the feed itself, which is newest-first per AC#3. Not asked of the human — low-stakes UX default, consistent with every chat-style thread convention already in this design system (`Comment`/`CommentThread` have no built-in ordering opinion; ordering is a query-time `order by created_at asc` on the client side).
6. **No new indexes added.** Matches this codebase's existing convention (no migration to date adds a plain performance index — only uniqueness constraints get one); `class_updates(class_id)`/`comments(class_update_id)` scans are POC-scale. Revisit only if a future perf pass finds a real cost.

### Table catalog (conceptual DDL — exact SQL syntax is `/migration`'s job)

| Table | Key columns | Notes |
|---|---|---|
| `class_updates` | `id, class_id→classes (not null), posted_by→auth.users (not null), body text (not null), homework text (nullable), created_at` | Teacher-authored post against their own current active-role class. `homework` is a plain optional text field (refine decision) — omitted, not empty-string, when there's no homework. |
| `comments` | `id, class_update_id→class_updates (not null), author_user_id→auth.users (not null), body text (not null), is_private boolean (not null, default false), target_parent_id→auth.users (nullable — set iff `is_private`), created_at`, check: `(is_private = false and target_parent_id is null) or (is_private = true and target_parent_id is not null)` | Column-flag privacy model (ADR-0032) — no participant table. `target_parent_id` is always the Parent (never the Teacher), on both the Parent's own comment and the Teacher's replies within that thread. |

`class_id` FK: `on delete restrict` (matches `enrollments.class_id`'s convention — a class-with-updates shouldn't silently vanish). `posted_by`/`author_user_id`: `not null … on delete set null`, mirroring `messages.sender_user_id`'s existing convention in this codebase exactly (not re-litigated here). `class_update_id`/`target_parent_id`: `on delete cascade` / `on delete set null` respectively — a deleted update takes its comments with it (matches `messages` belonging to `conversations`); a deleted Parent account nulls the target rather than orphaning the FK.

### RLS policy SQL

```sql
alter table class_updates enable row level security;
alter table comments enable row level security;

grant select, insert on class_updates to authenticated;
grant select, insert on comments to authenticated;

-- class_updates: Teacher (own class, read+insert), Student (self), Parent (own-children),
-- Coordinator/BV Coordinator/Admin (oversight, plain scope-based — added below, see decision #2).
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

-- Oversight (extended during /design, superseding decision #2 below): plain
-- scope-based reads, the same pattern classes_coordinator_select/classes_org_select
-- already use elsewhere in this codebase — Coordinator sees their own session's
-- class updates, BV Coordinator/Admin see org-wide. No privacy branching here;
-- class_updates never carried a privacy flag in the first place.
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

-- Scope-check helper for the Teacher's private-reply insert check: is p_user_id
-- actually a Parent of an enrolled student in p_class_id? A Teacher has no
-- personal SELECT rights into an arbitrary family's family_members row, so a
-- plain (non-bypassing) subquery would always read as false here — this stops
-- a Teacher's client from privately messaging an unrelated user_id.
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

-- comments SELECT — public branch, one policy per role (scope check mirrors
-- that role's class_updates policy above); oversight branches (full read,
-- public + private, per ADR-0032 as extended by decision #2) below.
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

-- private branch: the target Parent, and the posting Teacher (party to every
-- private thread on their own update), see it; nobody else does.
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

-- oversight (ADR-0032, extended during /design — decision #2 below): full read,
-- public and private, same plain scope-based pattern as class_updates' own
-- oversight policies just above. Because Coordinator/BV Coordinator/Admin now
-- carry a genuine class_updates SELECT grant, this subquery resolves correctly
-- through their own class_updates policy — no bypass function needed (the
-- earlier class_update_ref helper is gone; nothing else used it).
create policy comments_coordinator_select on comments for select
using (
  auth.jwt()->>'active_role' = 'coordinator'
  and exists (select 1 from class_updates cu where cu.id = comments.class_update_id)
);
create policy comments_org_select on comments for select
using (auth.jwt()->>'active_role' in ('bv_coordinator','admin'));

-- comments INSERT — author_user_id always self; scope-checked per role;
-- privacy shape enforced per the table's check constraint above.
create policy comments_teacher_insert on comments for insert
with check (
  auth.jwt()->>'active_role' = 'teacher'
  and comments.author_user_id = auth.uid()
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

No moderation policies (`update`/`delete`) on `comments`, and no `update`/`delete` on `class_updates` — both explicitly out of scope for this item (edit/delete-a-post isn't in the acceptance criteria either; a Teacher who mis-posts corrects via a new comment, same posture as chat).

### `push-send` — `class_update_id` branch (ADR-0033 hand-off)

**Recipient query** (service-role, run inside `push-send.ts` phase 4 for this branch; `$1 = class_updates.class_id`, `$2 = posted_by`, excluded per ADR-0033's self-notification rule):

```sql
select s.user_id
from enrollments e
join students s on s.id = e.student_id
where e.class_id = $1 and e.status = 'active' and s.user_id is not null and s.user_id <> $2
union
select fm.user_id
from enrollments e
join students s on s.id = e.student_id
join family_members fm on fm.family_id = s.family_id
where e.class_id = $1 and e.status = 'active' and fm.user_id <> $2
```

`status = 'active'` matches ADR-0033's "currently enrolled" wording (same status value `enrollments_one_active_per_session` already keys off). `s.user_id is not null` excludes KG–Gr8 students with no login (`core-schema-and-rls` convention) — they have no `push_subscriptions` row to target anyway, but the filter keeps the query's intent explicit rather than relying on the later `push_subscriptions` join to silently drop them.

**Payload copy** (PII-free, fixed string — no interpolation, matches the sibling `message_id` branch's per-kind pattern): **"New update posted in your class"** — the string ADR-0033/`notifications-infra`'s Design section already proposed; adopted as-is, no divergence.

**Trigger wiring** (this item's responsibility): after the Teacher's `class_updates` insert commits (RLS: `class_updates_teacher_insert`), the client calls `POST /.netlify/functions/push-send` with `{ class_update_id: <new row id> }` (Bearer JWT), fire-and-forget — same UX posture as chat send (`notifications-infra`'s Behavior section): the post's own success/failure is never blocked or held on the push call.

### UI

Design references (local mirror confirmed current against the components' own `.d.ts`/`.prompt.md`, no `DesignSync` refresh needed — no drift found):
- **`components/feed/FeedCard.jsx`** — `kind="update" scope="class"`, `author={{ role: "teacher", scope: <class label> }}`, `tag="Homework"` **and** `homework={...}` only when the post has homework (both omitted together for edge case #1 — no placeholder line), `body` = update text, `time`, `comments` = live RLS-filtered count (decision #3), `onOpen` → class-update detail screen. No `title` (per AC#2, "sans a title").
- **`components/comments/CommentThread.jsx`** + **`Comment.jsx`** + **`CommentComposer.jsx`** — reused verbatim, stacked per decision #4:
  - **Student**: one `CommentThread` (public comments only, oldest-first), one `CommentComposer` with `canPrivate={false}`.
  - **Parent**: one `CommentThread` merging public comments + their own private thread (oldest-first, `Comment`'s `isPrivate` flag drives the locked/violet treatment inline), one `CommentComposer` with `canPrivate={true}` — `onSend`'s `isPrivate: true` implies `target_parent_id = auth.uid()`, no picker.
  - **Teacher**: one public `CommentThread` (`canPrivate={false}` composer — a Teacher's *public* reply is never private) + one additional `CommentThread`/`CommentComposer` pair per Parent with an active private thread (each thread's composer is implicitly `is_private: true, target_parent_id: <that Parent's id>` — a fixed context, not a user-facing toggle, since `CommentComposer`'s own public/private toggle doesn't apply once you're already inside one Parent's private thread card). Each private thread card is labeled with that Parent/family's identifying label (not the Student's name — data minimization; use `family_members`/`students`' existing display convention, not a new PII surface).
- Four DoD states (AC#3, `.claude/rules/design-system.md`): **loading** (skeleton `FeedCard`s), **empty** ("No updates yet" — Parent/Student home feed with zero visible `class_updates` rows), **error-preserving** (retry, feed content already rendered stays visible per the kit's existing pattern), **content**. Same four states apply independently to the comment section within a class-update detail screen (its own empty state: "No comments yet", not an error).
- Role badge + scope: `FeedCard`'s `RoleBadge` already carries this (`author.role="teacher"`, `author.scope=<class label>`) — no separate chip needed on this screen.
- Tabular numerics: comment/reach counts use `fontVariant: ['tabular-nums']` per DoD.

### Data & RLS impact

- Two new tables (`class_updates`, `comments`), both RLS-on, no service-role/RPC path for read or insert (architect-confirmed — not ADR-0019 "minor's record" tables). One new `SECURITY DEFINER` helper (`is_parent_of_class`, used only by the Teacher's private-reply insert check), following this codebase's existing `is_family_member`/`is_conversation_participant` precedent for "a policy needs a fact the querying role can't see directly." No bypass function is needed for oversight — Coordinator/BV Coordinator/Admin now hold genuine scope-based `SELECT` grants on both tables (decision #2), so their `comments` policies resolve through ordinary RLS-filtered subqueries.
- No `audit_log` entries on reading or posting a class update or comment (architect-confirmed, ADR-0032) — conversational/class-wide content, not an individual minor's record under ADR-0019.
- Oversight (Coordinator/BV Coordinator/Admin) is read-only into **`class_updates` and every `comments` row, public and private** (ADR-0032, extended per decision #2 this pass) — Coordinator scoped to their own session, BV Coordinator/Admin org-wide; not able to write/moderate anything (unchanged, still out of scope).
- `push-send`'s service-role recipient derivation (above) is the only place `class_id` → recipient `user_id`s crosses the RLS boundary for the push path — matches ADR-0028/0031's "never trust the caller for who gets notified."

### pgTAP adversarial test plan (the merge gate — §11.3/§12.4, `/test`-stage obligation)

1. **Positive/negative per role** on both tables: Teacher sees/inserts only their own active-role class's rows; Student/Parent see only their own-scope class's rows; a Teacher scoped to a *different* class gets zero rows on either table for the class under test (including via the `comments`→`class_updates` join path).
2. **Private-thread isolation**: a Parent never sees another Parent's private thread on the same `class_update` (different `target_parent_id`); a Student never sees any `is_private = true` row, ever.
3. **Teacher private-reply guard**: `comments_teacher_insert`'s `is_parent_of_class` check rejects a Teacher's insert whose `target_parent_id` is not actually a Parent of that class (e.g. a Parent from a different class, or a non-Parent `user_id`) — insert fails, no row created.
4. **Oversight scope**: Coordinator sees `class_updates` and `comments` (public and private) only for classes within their own session (not a sibling session in the same center, proven via a join-path negative test too); BV Coordinator/Admin see both, org-wide; both are still confirmed read-only — no update/delete grant exists on either table for any role.
5. **Role-switch atomicity**: a multi-role account (e.g. Teacher+Coordinator) sees a different row set immediately after switching active role, no stale scope leaking across the switch (mirrors the existing obligation from `client-auth-session-and-nav`).
6. **`push-send` `class_update_id` branch** (extends `notifications-infra`'s existing suite): `posted_by !== caller_user_id` → `403`, no dispatch; recipient set is exactly the class's active enrollments' Students-with-a-login + Parents, poster excluded; a class with zero current enrollments dispatches to zero recipients without error (edge case).

### Edge cases (carried + confirmed, plus one added during design)
- All edge cases from the refine brief (no-homework rendering, zero-enrollment class, multi-child Parent merged feed, long-text truncation, zero-comment empty state, per-Parent private-thread isolation, active-role-switch scoping, missing/expired push subscription) — unchanged, confirmed by this pass's RLS design.
- **Added:** a Teacher's private-thread card only renders once a Parent has posted the first private comment (decision #4) — there is no "start a private thread with this Parent" affordance for the Teacher; if a Teacher wants to reach out first, that's a chat message (`class-chat-ui`, separate item), not a class-update comment. Worth stating explicitly since it's a real UX constraint, not an oversight.
- **Added (code review, PR #48):** the "Teacher cannot originate a private thread" rule above is UI-only, not RLS-enforced — `comments_teacher_insert`'s `with check` only requires `is_parent_of_class(target_parent_id, scope_id)`, with no requirement that the target Parent has posted first. Not a security gap (a Teacher is already authorized to reach any real Parent of their own class), just worth noting so the DB layer isn't mistaken for enforcing a constraint it doesn't.

### Out of scope (unchanged from refine, confirmed still correct)
Comment moderation, class roster screen, announcements, structured homework/assignment tracking, and the `push-send` function's shared phases (owned by `notifications-infra`) — all as stated in the refine brief above. A dedicated Coordinator/BV Coordinator/Admin oversight *browsing* screen (its own nav entry, filters, etc.) is still a future item's decision — out of this item's scope. **Amended (code review, PR #48):** oversight roles already land on `class-update-and-home-feed`'s own `/feed` → detail route today (`ROLE_TABS` grants them `feed`), so `ClassUpdateDetailScreen` reuses the Teacher-shaped read-only thread breakdown for them (their `comments_coordinator_select`/`comments_org_select` policies grant the same public+private read as Teacher) with no `CommentComposer` rendered, rather than leaving the existing unchecked-role-cast bug that gave them a broken, silently-failing composer.

---

## Review follow-ups (PR #48 code review, 2026-07-29)

Reviewer: ssrinivas90, at `635d76f`. **No Critical findings** — the RLS policy set, the
`is_parent_of_class` helper, and `resolve_parent_family_label`'s minors'-data posture were all
reviewed adversarially and found sound, with no cross-scope or cross-family leakage.

Eight Important items were raised; seven were fixed on 2026-07-28 (see `UAT.md`'s sign-off row for
the verification detail). The eighth is deferred by human decision (below).

**Also closed here: the reviewer's Minor #2** — `is_parent_of_class` was `SECURITY DEFINER`, granted
to `authenticated`, with no internal authorization gate, making it a directly-callable cross-scope
oracle for `(user_id, class_id)` pairs. The same weakness was independently found by an
RLS-adversarial audit on the (now-abandoned) `integrate-four-issues-e2e` branch and filed as
**issue #52**; that fix was cherry-picked here (`7712727`) rather than re-derived. The function now
carries the same `auth.jwt()` gate as `resolve_parent_family_label` (teacher own-class, coordinator
own-session, bv_coordinator/admin org-wide), proven by `171`'s new Attack Group 8 — 5 direct-RPC
assertions whose three DENY cases were confirmed failing against the un-gated function before the
fix was accepted.

### Open question → `/architect`: does withdrawal revoke access to conversational content?

**Deferred deliberately (human decision, 2026-07-28) — not an oversight, and not fixed in PR #48.**
Tracked as **[issue #58](https://github.com/cmdfw-bv/CMDFW-BalaVihar-App/issues/58)**.

This item's RLS policies and `is_parent_of_class` join `enrollments` **without** filtering
`status`, so a withdrawn student's family keeps read + comment access to that class's feed and
their private thread. Two things in this same feature disagree with that: `resolve_parent_family_label`
(`20260724120526_…sql:23`) and `push-send`'s `dispatchClassUpdate` (`push-send.ts`) both filter
`status = 'active'` — so a withdrawn family can still read and post, but the Teacher's thread card
can no longer resolve their label and falls back to the generic "Private thread".

The repo has **two competing precedents**, and picking between them is an org-wide convention call,
not a #21 call:

- **Reference/operational tables** — `classes_parent_select`/`classes_student_select`
  (`20260709032818_…sql`) join `enrollments` unfiltered. A withdrawn family can still see *that the
  class exists*. This item currently matches this precedent.
- **Conversational content** — chat actively **revokes** on withdrawal:
  `20260709043451_chat_sync_triggers.sql:76` deletes the student and their parents from
  `conversation_participants` the moment an enrollment flips to `withdrawn` (ADR-0015).

`class_updates`/`comments` are conversational content, which argues for the chat precedent — but
changing it would also touch the org-wide `classes_*_select` convention, and the tradeoff is real in
both directions (filtering costs a withdrawn parent access to the private-thread history they
themselves wrote; not filtering leaves a minors'-data retention exposure under §12.1 #6).

**`/architect` owns the decision** and, if it changes the convention, the resulting ADR + migration.
Until then this feature's unfiltered behavior stands as-is and is documented here rather than
silently inconsistent.

---

## Sign-off
- [x] **Human sign-off on this design** (2026-07-24, mehta.maulik@gmail.com) — approved, including both decisions surfaced during this pass:
  1. **Decision #2** (oversight roles get a full, plain scope-based DB read of `class_updates` and all `comments`, public and private) — human-directed during this `/design` pass, superseding an earlier draft that scoped oversight to private comments only.
  2. **Decision #4** (Teacher's stacked-thread UI) — confirmed interactively during this `/design` pass (stacked threads, one per Parent).
- → ready for **`/plan`**.
