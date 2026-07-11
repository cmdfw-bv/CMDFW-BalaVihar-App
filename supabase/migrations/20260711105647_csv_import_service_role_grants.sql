-- csv-import Netlify Function runs under the service_role key (bypasses RLS for
-- privileged writes). The service_role needs explicit table-level GRANTs because
-- this project does not use auto_expose_new_tables.

-- Read-only lookups
grant select on public.user_roles  to service_role;
grant select on public.sessions    to service_role;
grant select on public.classes     to service_role;

-- Upsert operations (families, students, enrollments, family_members)
grant select, insert, update on public.families       to service_role;
grant select, insert, update on public.students       to service_role;
grant select, insert, update on public.enrollments    to service_role;
grant select, insert         on public.family_members to service_role;
