create table if not exists centers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists sessions (
  id uuid primary key default gen_random_uuid(),
  center_id uuid not null references centers(id) on delete restrict,
  name text not null,
  start_date date not null,
  end_date date not null,
  created_at timestamptz not null default now()
);

create table if not exists classes (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions(id) on delete restrict,
  name text not null,
  grade_band text not null,
  created_at timestamptz not null default now()
);

create table if not exists families (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  created_at timestamptz not null default now()
);

create table if not exists family_members (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  relationship text not null,
  created_at timestamptz not null default now(),
  unique (family_id, user_id)
);

create table if not exists students (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete restrict,
  first_name text not null,
  last_name text not null,
  grade_level text not null,
  external_member_id text,
  user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists enrollments (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students(id) on delete restrict,
  class_id uuid not null references classes(id) on delete restrict,
  session_id uuid not null references sessions(id) on delete restrict,
  status text not null default 'active' check (status in ('active','withdrawn')),
  enrolled_at timestamptz not null default now()
);

create unique index if not exists enrollments_one_active_per_session
  on enrollments (student_id, session_id)
  where status = 'active';

create table if not exists attendance (
  id uuid primary key default gen_random_uuid(),
  enrollment_id uuid not null references enrollments(id) on delete cascade,
  class_meeting_date date not null,
  status text not null check (status in ('present','absent')),
  marked_by uuid references auth.users(id) on delete set null,
  submitted_at timestamptz not null default now(),
  unique (enrollment_id, class_meeting_date)
);

alter table centers enable row level security;
alter table sessions enable row level security;
alter table classes enable row level security;
alter table families enable row level security;
alter table family_members enable row level security;
alter table students enable row level security;
alter table enrollments enable row level security;
alter table attendance enable row level security;

-- Baseline grants (this CLI does not auto-expose new tables). RLS (next task)
-- does the actual scoping; these grants only make each table reachable at all.
grant select on centers, sessions, classes to authenticated;
grant select on families, family_members to authenticated;
grant select on students to authenticated;
grant select on enrollments to authenticated;
grant select, insert, update on attendance to authenticated;
