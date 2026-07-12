-- user-role-sweep and user-role-grant Netlify Functions run under the service_role key
-- (§ csv_import_service_role_grants precedent — this project doesn't use
-- auto_expose_new_tables). user_roles previously only granted service_role SELECT
-- (csv_import_service_role_grants); this is the first item that writes user_roles, so it
-- needs its own INSERT/DELETE grant, plus EXECUTE on the atomic-insert RPC above.
-- SELECT on classes/students/family_members for the sweep and Coordinator session-containment
-- check is already granted by 20260711105647_csv_import_service_role_grants.sql — not repeated.
grant insert, delete on public.user_roles to service_role;
grant execute on function insert_user_role_grant(uuid, app_role, app_scope_type, uuid, boolean) to service_role;
