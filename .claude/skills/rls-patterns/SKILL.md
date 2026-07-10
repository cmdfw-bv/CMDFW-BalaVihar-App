---
name: rls-patterns
description: Use when writing RLS policies, the auth hook, or any migration touching access control — the database-enforced multi-role/scope model for the CMDFW Bala Vihar app.
---

# RLS & auth-hook patterns

Authoritative detail: `.docs/3_ARCHITECTURE.md` §5. Follow Supabase's official "Create RLS policies" and "Create migration" AI prompts.

## The claims chain
1. `user_roles(user_id, role, scope_type ∈ {org,center,session,class}, scope_id)` — many roles per user.
2. **Custom Access Token Hook** (Postgres function, SQL) stamps `active_role`, `scope_type`, `scope_id` into the JWT on issue/refresh.
3. RLS policies read those via `auth.jwt()`.

## Policy pattern
- Default-deny; add the narrowest policy per role × scope. Example shape:
  ```sql
  create policy teacher_reads_own_class on attendance for select
  using (
    auth.jwt()->>'active_role' = 'teacher'
    and class_id = (auth.jwt()->>'scope_id')::uuid
  );
  ```
- Scope matrix (§5.4): Parent=own-children · Student=self · Teacher=class · Coordinator=session · BV Coordinator=org · Admin=org · System=engine.

## Hardening the hook (§5.5) — required
```sql
grant execute on function public.custom_access_token_hook to supabase_auth_admin;
revoke execute on function public.custom_access_token_hook from anon, authenticated, public;
-- user_roles needs a policy allowing supabase_auth_admin to read it
```

## Active-role switch (§5.3)
Write the chosen role to the user's own row → `refreshSession()` → new JWT carries new scope. Never branch access on client state.

## Always
Pair every access-control migration with adversarial pgTAP tests (role × scope) in `supabase/tests/` — the `/rls-audit` subagent + migration-guard hook gate prod on these (§11.3, §12.4).
