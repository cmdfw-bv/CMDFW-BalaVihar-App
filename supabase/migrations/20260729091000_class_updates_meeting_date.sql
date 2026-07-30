-- ADR-0036 §2: `class_updates` gains `meeting_date`.
--
-- The canonical table (20260724120400, issue #21) records *when a post was written*
-- (`created_at`) but not *which class meeting it is about*. Coordinator's compliance dashboard
-- needs the latter: its second metric asks, per expected meeting date in the trailing window,
-- "did the teacher post an update for this meeting?"
--
-- Deriving that from `created_at` was considered and rejected (ADR-0036, Options Considered).
-- `created_at` is `timestamptz`: a teacher posting 9:30pm Central on the meeting Sunday stores
-- 02:30Z the next day, so `created_at::date` reads as Monday under a UTC server TimeZone and the
-- class is flagged non-compliant despite the teacher having posted on time — the same
-- UTC-vs-Central boundary defect the PR #50 review already caught twice elsewhere in this
-- feature. A teacher who posts the morning after a meeting would have no way to make that
-- meeting show as covered.
--
-- Add -> backfill -> not-null, the same shape ADR-0031 used for sessions.day_of_week. No rows
-- exist pre-pilot, so the backfill is a no-op today; it exists so the sequence stays safe to
-- replay against any environment that does have rows by the time this runs.
alter table class_updates add column if not exists meeting_date date;

update class_updates set meeting_date = created_at::date where meeting_date is null;

alter table class_updates alter column meeting_date set not null;

comment on column class_updates.meeting_date is
  'Which class meeting this update is about (ADR-0036) — distinct from created_at, which is when it was written. Set by the composer from class_meetings; a post written the morning after still belongs to the previous meeting.';

-- Deliberately NO unique (class_id, meeting_date): the superseded shape in
-- 20260729090000 carried one, but the canonical table permits several updates per class and
-- get_session_compliance_for_staff only asks `exists`, so uniqueness would constrain the
-- product for no metric benefit (ADR-0036 §2).
--
-- No RLS or grant change: this is a plain additional column on a table whose policies already
-- scope by class_id/enrollment, exactly as ADR-0031's sessions columns were. Coverage for that
-- is asserted in supabase/tests/180_class_meetings_schema.sql.
