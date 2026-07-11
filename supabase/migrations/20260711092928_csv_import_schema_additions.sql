-- CSV enrollment import schema additions (System: csv-enrollment-import, ADR-0022).
--
-- 1. families.primary_guardian_email_hash — SHA-256 hex of toLowerCase(guardian_1_email).
--    Stable cross-import dedup key: allows the function to upsert a family by email hash
--    even before family_members rows exist (i.e. before auth provisioning completes).
--    Partial unique index so seed/manually-created families (hash = NULL) don't conflict.
--
-- 2. students(external_member_id) partial unique index — enables ON CONFLICT upsert for
--    re-imports when the member system's external ID is present.

alter table families
  add column primary_guardian_email_hash text;

create unique index families_primary_guardian_email_hash_idx
  on families (primary_guardian_email_hash)
  where primary_guardian_email_hash is not null;

create unique index students_external_member_id_idx
  on students (external_member_id)
  where external_member_id is not null;
