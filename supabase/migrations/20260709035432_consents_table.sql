create table if not exists consents (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students(id) on delete cascade,
  consent_type text not null check (consent_type in ('participation','media')),
  granted boolean not null,
  granted_by uuid references auth.users(id) on delete set null,
  granted_at timestamptz not null default now(),
  revoked_at timestamptz,
  unique (student_id, consent_type)
);

alter table consents enable row level security;

grant select, insert, update on consents to authenticated;
