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
