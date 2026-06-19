---
paths: ["supabase/**"]
---

# Supabase / SQL rules (3_ARCHITECTURE §5, §6)

- **Migrations are the source of truth.** Every schema/RLS/auth-hook change is a timestamped SQL file in `supabase/migrations/`. Never alter prod via Studio.
- **RLS on every table.** Policies key off the JWT claims set by the auth hook: `auth.jwt()->>'active_role'`, `'scope_type'`, `'scope_id'` (§5.2). Default-deny; grant the narrowest scope.
- **Scope model (§5.4):** Parent=own-children · Student=self · Teacher=class · Coordinator=session · BV Coordinator=org · Admin=org · System=engine.
- **Harden the auth hook (§5.5):** `grant execute on function <hook> to supabase_auth_admin;` and `revoke execute ... from anon, authenticated, public;`. The `user_roles` table needs an RLS policy permitting `supabase_auth_admin`.
- **Chat (§9):** use Realtime **Broadcast from the database** (`realtime.broadcast_changes()`), never Postgres Changes. Private channels + RLS on `realtime.messages`. Durable history in own `messages`/`conversations` tables.
- **Minors' data (§11):** minimal columns; `audit_log` on access; `consents` checked before exposure; retention fields populated.
- **Every migration ships with a matching pgTAP test** in `supabase/tests/` (role × scope). Follow Supabase's official AI prompts for RLS policies, migrations, declarative schema, and the Postgres SQL style guide.
