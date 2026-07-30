-- Retention placeholders for the two tables added by class-update-and-home-feed (issue #21).
-- Same shape and same inert posture as 20260709045311_retention_fields.sql, which established
-- the pattern for students/attendance/consents/messages: `comments` holds minor-authored and
-- minor-directed content (the closest analogue is `messages`, already covered there), and
-- `class_updates` is the parent row those comments cascade from. 3_ARCHITECTURE §11 / the
-- supabase-sql path rule require retention fields on minors'-data tables; this closes that gap
-- before /deploy-staging rather than shipping two such tables outside the retention model.
--
-- Inert: no job, trigger, or policy reads these columns yet (asserted by
-- supabase/tests/070_retention_columns.sql). Values await org + legal sign-off on the retention
-- policy itself, per §11 — the column existing is not a retention decision.
alter table class_updates add column if not exists retention_eligible_at timestamptz;
alter table comments add column if not exists retention_eligible_at timestamptz;

comment on column class_updates.retention_eligible_at is
  'Provisional POC placeholder (NOT legal sign-off): expected to follow the owning class''s session end date. Inert — no job reads this yet.';
comment on column comments.retention_eligible_at is
  'Provisional POC placeholder (NOT legal sign-off): minor-authored/minor-directed content, expected to track the parent class_update. Inert — no job reads this yet.';
