-- ADR-2026-09-15-consent-captured-at-registration (issue #92), Decision 4.
--
-- The organization captures the required waivers at registration, outside this app. The app
-- implements no consent capture and no separate consent check: registration is upstream of
-- enrollment, and RLS already scopes every minors'-data table by enrollment, so consent is
-- enforced transitively (ADR Decision 2).
--
-- This migration closes the write paths that remained open. Until now a parent could
-- INSERT/UPDATE rows in `consents` -- a table nothing reads, no feature writes, and no policy
-- meaningfully constrains: `consents_parent_insert`'s WITH CHECK verifies only that the student
-- is in the parent's family, and never binds `granted_by`, so a row could attribute a grant to
-- a different user id. Leaving a writable, ungoverned table holding minors'-adjacent records is
-- the thing this removes.
--
-- TRUNCATE is revoked alongside INSERT/UPDATE. It is not named in ADR Decision 4, which said
-- "revoke insert, update" -- but TRUNCATE bypasses RLS entirely, so without this the table
-- could still be emptied in one statement by any authenticated user or by `anon`, and the word
-- "inert" in Decision 4 would not be true. The repo-wide version of this defect -- every table
-- in `public` grants TRUNCATE to `anon` and `authenticated` via the default-privilege baseline,
-- with `consents` explicitly among the sampled tables -- remains issue #28's job; this migration
-- only closes it for the one table it is already making inert. A later repo-wide REVOKE is a
-- superset of this one and remains idempotent.
--
-- No real row has ever existed. The only writer is the synthetic seed (supabase/seed/seed.sql),
-- which runs as the table owner and is unaffected by a REVOKE against `authenticated`/`anon`.
--
-- Read paths are deliberately untouched (ADR Decision 4):
--   * consents_parent_select   -- parent reads own children's rows
--   * consents_student_select  -- student reads own rows
--   * get_consents_for_staff() -- SECURITY DEFINER, audit-logged, scope-checked
--
-- `consents_parent_insert` and `consents_parent_update` are intentionally NOT dropped. Without
-- the table-level grant they are unreachable, and keeping them preserves the record of the
-- shape consent had if a superseding ADR ever reopens this (see the ADR's four triggers). If
-- consent does return to scope, the three integrity defects recorded on issue #92 -- unbound
-- `granted_by`, `granted` vs `revoked_at` with no defined precedence, and no consent history --
-- must be fixed before any real row is written.

revoke insert, update on consents from authenticated;
revoke truncate on consents from anon, authenticated;

comment on table consents is
  'Inert for the POC (ADR-2026-09-15-consent-captured-at-registration). Consent is captured by '
  'the organization at registration, outside the app; enrollment is the consent signal and RLS '
  'enforces it transitively. No application path writes this table: INSERT, UPDATE and TRUNCATE '
  'are revoked from `authenticated` (and TRUNCATE from `anon`), and only the synthetic seed '
  '(running as owner) populates it. Read paths remain via consents_parent_select, '
  'consents_student_select, and get_consents_for_staff().';
