create type app_role as enum ('student','parent','teacher','coordinator','bv_coordinator','admin');
create type app_scope_type as enum ('org','center','session','class');

create table if not exists user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role app_role not null,
  scope_type app_scope_type not null,
  scope_id uuid,
  created_at timestamptz not null default now(),
  constraint user_roles_org_scope_null_id check (
    (scope_type = 'org' and scope_id is null) or (scope_type <> 'org' and scope_id is not null)
  )
);

alter table user_roles enable row level security;

-- Grant select to authenticated so it can check the table (via RLS, returns zero rows).
-- No INSERT/UPDATE/DELETE grants to anon/authenticated — not client-writable (AC #3).
grant select on user_roles to authenticated;
grant select on user_roles to supabase_auth_admin;

create policy user_roles_auth_admin_read on user_roles for select
to supabase_auth_admin
using (true);
