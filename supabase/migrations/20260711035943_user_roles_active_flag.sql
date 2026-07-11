alter table user_roles add column is_active boolean not null default false;

create unique index if not exists user_roles_one_active_per_user
  on user_roles (user_id)
  where is_active;

-- Backfill: only the unambiguous single-row case (Design decision #2). Multi-role
-- users with no active row are left for the hook's own ensure-then-read logic
-- (Task 2) to resolve on next token request, not duplicated here.
with single_role_users as (
  select user_id from user_roles group by user_id having count(*) = 1
)
update user_roles ur
set is_active = true
from single_role_users s
where ur.user_id = s.user_id;

-- The hook (Task 2) needs to flip is_active for auto-activation and for
-- switch_active_role's (Task 3) target row; narrowed to the one column it ever writes.
grant update (is_active) on user_roles to supabase_auth_admin;

create policy user_roles_auth_admin_activate on user_roles for update
to supabase_auth_admin
using (true)
with check (true);
