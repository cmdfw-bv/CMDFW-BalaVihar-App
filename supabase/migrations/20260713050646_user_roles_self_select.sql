-- Reverses core-schema-and-rls's deliberate zero-client-read posture on user_roles for one
-- narrow self-row case: the client shell's active-role switcher needs to list the caller's
-- own grant rows to render "role · Center · Session · Grade/Class" options (ADR-0014). The
-- JWT only ever carries the *active* role — this is what makes the switcher's role list
-- possible without a new RPC. Read-only; insert/update/delete on user_roles remain zero-grant
-- (switch_active_role stays the only writer). No audit_log entry: this is a user reading their
-- own identity/role metadata, the same self-access case ADR-0019 already exempts.
create policy user_roles_self_select on user_roles for select
to authenticated
using (user_id = auth.uid());
