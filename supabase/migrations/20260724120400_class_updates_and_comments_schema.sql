-- Teacher: class-update-and-home-feed (issue #21). New tables — Teacher-authored class updates
-- and public/private comments on them (ADR-0030's column-flag privacy model, not a participant
-- table). class_id FK is `on delete restrict` (matches enrollments.class_id's convention — a
-- class-with-updates shouldn't silently vanish); posted_by/author_user_id are `on delete set
-- null`, mirroring messages.sender_user_id's existing convention exactly.
create table if not exists class_updates (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references classes(id) on delete restrict,
  posted_by uuid not null references auth.users(id) on delete set null,
  body text not null,
  homework text,
  created_at timestamptz not null default now()
);

-- author_role: a plan-level addition (class-update-and-home-feed.plan.md, "Plan-level
-- decisions") — the UI's Comment badge needs the role the author posted as; no existing column
-- or join can re-derive it after the fact for a multi-role account. Pinned to the inserting
-- role by each insert policy in the next migration, not client-trusted.
create table if not exists comments (
  id uuid primary key default gen_random_uuid(),
  class_update_id uuid not null references class_updates(id) on delete cascade,
  author_user_id uuid not null references auth.users(id) on delete set null,
  author_role text not null check (author_role in ('student', 'parent', 'teacher')),
  body text not null,
  is_private boolean not null default false,
  target_parent_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint comments_private_target_shape check (
    (is_private = false and target_parent_id is null) or (is_private = true and target_parent_id is not null)
  )
);

alter table class_updates enable row level security;
alter table comments enable row level security;
