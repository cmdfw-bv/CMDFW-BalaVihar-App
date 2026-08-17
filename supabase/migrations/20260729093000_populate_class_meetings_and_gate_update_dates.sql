-- PR #50 review (2026-08-16), blocking items 1 and 2.
--
-- ============================================================================
-- 1. Populate class_meetings on migrate-only environments
-- ============================================================================
-- `generate_class_meetings_for_session` is called from exactly two places in the repo:
-- supabase/seed/seed.sql and the 180_/181_ pgTAP fixtures. `seed.sql` runs only on
-- `supabase db reset` — local dev and the db-and-rls CI job. Staging and prod apply migrations
-- only, and the seed provisions @bv-seed.test.local users, so it demonstrably never runs there.
-- Net effect before this migration: **class_meetings is empty on every migrate-only
-- environment.**
--
-- Two consequences, the second worse than the first:
--   (a) the Coordinator compliance dashboard ships inert — every class renders "—"/"—";
--   (b) ComposeClassUpdateScreen resolves zero meetings, so `meetingDate` stays '' ,
--       buildClassUpdatePayload returns null, and Post is permanently disabled. A Teacher can
--       never post a class update. That regresses issue #21, which is already merged to main and
--       marked complete.
--
-- Every environment reviewed so far was built with `db reset`, which is why three review passes
-- missed it.
--
-- Deliberately a direct `insert … select`, NOT a call to generate_class_meetings_for_session:
-- that function is SECURITY DEFINER and gated on `auth.jwt()->>'active_role'`, so during a
-- migration (no authenticated context, no JWT) it takes its own `not v_authorized` branch,
-- writes a `denied` audit_log row, and inserts nothing. seed.sql:46-53 documents this — it wraps
-- the call in `tests.authenticate_as(...)` precisely to work around it.
--
-- Backfills every session that already exists, and is idempotent via the (class_id, meeting_date)
-- unique constraint, so re-running against a seeded DB is a no-op.
insert into class_meetings (class_id, meeting_date)
select c.id, d::date
from sessions s
join classes c on c.session_id = s.id
cross join lateral generate_series(s.start_date, s.end_date, interval '1 day') as d
where extract(dow from d) = s.day_of_week
on conflict (class_id, meeting_date) do nothing;

-- ---------------------------------------------------------------------------
-- The backfill above is necessary but NOT sufficient, and that is worth stating plainly.
-- ---------------------------------------------------------------------------
-- Migrations run before any data exists. On a fresh environment the `sessions x classes` join is
-- empty at this point, so on exactly the fresh deploy this was meant to fix, the statement above
-- inserts ZERO rows. It earns its place only for an environment that already holds data when this
-- ships.
--
-- Where sessions and classes actually come from, stated precisely, because an earlier draft of
-- this comment claimed the CSV enrollment import creates them and it does not (PR #50 review,
-- @ssrinivas90). `netlify/functions/lib/db-ops.ts` (`resolveSessionsAndClasses`) only LOOKS UP
-- sessions and classes and errors with `session "…" not found` / `no class found for session …`
-- when they are absent — it never inserts. The only writer of either table in the whole repo is
-- `supabase/seed/seed.sql`. There is no session/class-creation UI yet (unrefined, unbuilt).
--
-- So: locally the seed creates them after migrations. On staging and prod a maintainer creates the
-- first session and its classes by hand (one-off SQL against the project) BEFORE the first CSV
-- import runs — the import will otherwise reject every row. That bootstrap step is a prerequisite
-- of /deploy-staging, not something this migration or the import performs. See ADR-0038 Context.
--
-- The durable half is the trigger below: any class, created by any path, gets its calendar. That
-- supersedes ADR-0035's "callable RPC invoked at session creation" (see the amendment recorded in
-- that ADR). The RPC is kept — it still serves re-generation after a session's dates change and
-- the CSV skip-dates seam — but the invariant no longer depends on every future call site
-- remembering to invoke it.
--
-- Enforcing the invariant in the database rather than at each caller is the same reasoning
-- 3_ARCHITECTURE §12.1 non-negotiable #1 applies to access control: a rule that can be skipped by
-- forgetting a call is not a rule.
create or replace function generate_class_meetings_for_new_class()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session sessions%rowtype;
begin
  select * into v_session from sessions where id = new.session_id;
  if v_session.id is null then
    return new;
  end if;

  insert into class_meetings (class_id, meeting_date)
  select new.id, d::date
  from generate_series(v_session.start_date, v_session.end_date, interval '1 day') as d
  where extract(dow from d) = v_session.day_of_week
  on conflict (class_id, meeting_date) do nothing;

  return new;
end;
$$;

-- SECURITY DEFINER so the calendar is written regardless of which role created the class — the
-- CSV import runs service-role, a future admin screen runs as an authenticated Admin, and neither
-- holds a write grant on class_meetings (deliberately: generation is not a client write path).
create trigger classes_generate_class_meetings
after insert on classes
for each row execute function generate_class_meetings_for_new_class();

-- ============================================================================
-- 2. A Teacher can no longer self-certify the metric that audits them
-- ============================================================================
-- ADR-0036's own Consequences named this as a hardening item for /build, and /build did not do
-- it: `class_updates.meeting_date` is client-supplied and unvalidated, so a Teacher can post an
-- update against any date at all and lift their own update_rate on the one dashboard that exists
-- to flag them. Provable from this repo's fixtures — 170_class_updates_and_comments_rls.sql's
-- `lives_ok` insert uses a meeting_date with no matching class_meetings row and succeeds.
--
-- Replaced rather than edited in place: 20260724120426 is merged, so it is immutable.
-- The added clause resolves under RLS as the calling role — class_meetings_teacher_select already
-- exposes exactly the rows a teacher may post against (`class_id = scope_id`), which the policy
-- independently requires. Cancelled meetings are excluded: an update about a class that did not
-- happen should not count toward compliance.
-- `if exists` to match the sibling replacement at 20260729092000:112 and keep this file replayable.
drop policy if exists class_updates_teacher_insert on class_updates;

create policy class_updates_teacher_insert on class_updates for insert
with check (
  auth.jwt()->>'active_role' = 'teacher'
  and class_updates.posted_by = auth.uid()
  and class_updates.class_id = (auth.jwt()->>'scope_id')::uuid
  and exists (
    select 1 from class_meetings cm
    where cm.class_id = class_updates.class_id
      and cm.meeting_date = class_updates.meeting_date
      and cm.status = 'scheduled'
  )
);
