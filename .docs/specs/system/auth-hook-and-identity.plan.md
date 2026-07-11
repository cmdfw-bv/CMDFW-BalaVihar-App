# Auth hook & identity — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** [auth-hook-and-identity.md](auth-hook-and-identity.md) (Design signed off 2026-07-10, ADR-0022). Implements ADR-0004's Custom Access Token Hook concept with a concrete `is_active` storage + switch mechanism, on top of `core-schema-and-rls`'s already-shipped `user_roles` catalog (Task 3, `20260709033959_user_roles_catalog.sql`).

**Goal:** Ship the Custom Access Token Hook, the `is_active` storage/switch mechanism it depends on, and local magic-link/hook wiring — as timestamped migrations proven by adversarial pgTAP tests that call the hook and RPC directly — so every existing RLS policy (built against **simulated** claims in `core-schema-and-rls`) now enforces against **real**, database-issued JWT claims, with no code changes to those policies.

**Architecture:** Pure data-layer item — no app code, no client screens (same classification as `core-schema-and-rls`). Three pieces, in dependency order: (1) `is_active boolean` + partial unique index on `user_roles`, writable only by `supabase_auth_admin`; (2) the hook function itself (invoker-rights, running as `supabase_auth_admin`, ensure-then-read: auto-activate on the no-active-row branch, then stamp `active_role`/`scope_type`/`scope_id`); (3) `switch_active_role(uuid)`, a `SECURITY DEFINER` RPC that's the only client-reachable write path to `is_active`. Local Auth-service wiring (`supabase/config.toml`) registers the hook so magic-link sign-in actually calls it. The live "real sign-in → real JWT" verification pass (AC#7) is deferred to `/test` per the design spec's own staging (see the appendix at the end of this document) — it's a manual walkthrough, not a `/build`-stage task, and doesn't run on every regression pass.

**Tech Stack:** Supabase CLI (Postgres 17 locally) · pgTAP (`extensions.pgtap`) · plain SQL/PL-pgSQL · `pg_prove` via `supabase test db`. No new npm dependency — `@supabase/supabase-js` (already in `package.json`) covers the `/test`-stage verification script.

## Global Constraints

- **Migrations are the only path** (constitution #3, doc 3 §6.1): every DDL/function below lands as a `supabase migration new <name>` file in `supabase/migrations/`. The CLI stamps each file with the real timestamp at creation time; this plan refers to files by descriptive suffix.
- **No RLS/RPC policy rewrites anywhere else** (spec AC#8): every existing policy already reads `auth.jwt()->>'active_role'`/`'scope_type'`/`'scope_id'`; this item only changes where those claims come from. The full existing 73-test pgTAP suite must keep passing unmodified.
- **The hook is invoker-rights, not `security definer`** (Design decision #1): it runs *as* `supabase_auth_admin` (the role GoTrue connects as), relying on grants/policies scoped to that one trusted role. `core-schema-and-rls` already built the `select` grant + `user_roles_auth_admin_read` policy; this item adds one column-scoped `update (is_active)` grant + matching policy for the same role.
- **`switch_active_role` is the only write path to `is_active`, and it *is* `SECURITY DEFINER`** (ADR-0022 Decision #2) — no client grant is ever added to `user_roles` itself; mirrors the `mark_attendance_for_staff` precedent (ADR-0021).
- **Auto-activation logic lives in exactly one place: the hook function** (ADR-0022 Decision #3, "one choke point, not two" — the same lesson ADR-0021 already taught once, Task 11 of `core-schema-and-rls`). No trigger is built. The migration's backfill covers only the unambiguous single-row case (Design decision #2); multi-role users with no active row are left for the hook's own ensure-then-read logic.
- **`scope_id` is omitted from claims, not stamped `null`, when the active grant is org-scoped** (Design decision #3) — matches the existing `nullif(auth.jwt()->>'scope_id','')::uuid` cast pattern already used throughout `core-schema-and-rls`.
- **Hook hardening (§5.5, constitution #1):** `grant execute` on the hook function to `supabase_auth_admin` only; `revoke` from `anon`, `authenticated`, `public`.
- **Synthetic data only** (constitution #6): every pgTAP fixture in this plan uses fictional people (`*.test.local` emails via `tests.create_supabase_user`), matching every prior test file's convention.
- **Branch/worktree (§12.6):** this item is **100% migrations**, same shared-seam classification as `core-schema-and-rls`. Current branch `shree/auth-hook-and-identity` was cut from `origin/main` (0 commits ahead as of this plan) — do the work directly on it, no worktree needed.
- **Out of scope here** (carried from spec, unchanged): role-switcher visual UI (ADR-0014); `user_roles` row provisioning/approval workflow (`user-role-approval`, separate item); CSV enrollment import; retention/deletion job, notifications, chat delivery; staging/prod hook registration (Dashboard step, deferred to `/deploy-staging` once `cloud-environment-provisioning` exists).

---

### Task 1: `is_active` column + partial unique index on `user_roles`

**Files:**
- Create: `supabase/migrations/<ts>_user_roles_active_flag.sql`
- Create: `supabase/tests/105_user_roles_active_flag.sql`

**Interfaces:**
- Consumes: `user_roles(id,user_id,role,scope_type,scope_id,created_at)` (`core-schema-and-rls`, `20260709033959_user_roles_catalog.sql`).
- Produces: `user_roles.is_active boolean not null default false`; unique index `user_roles_one_active_per_user` (`user_id) where is_active`; `grant update (is_active) on user_roles to supabase_auth_admin`; policy `user_roles_auth_admin_activate`. Task 2's hook and Task 3's RPC both write this column and rely on the unique index being present.

- [ ] **Step 1: Create the migration file**
```bash
cd /Users/shree/Documents/claude-code/CMDFW-BalaVihar---Pilot-App
npx supabase migration new user_roles_active_flag
```

- [ ] **Step 2: Write the migration**
```sql
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
```

- [ ] **Step 3: Apply locally**
```bash
npx supabase db reset
```
Expected: migration applies cleanly on top of the existing 11 migrations.

- [ ] **Step 4: Write the pgTAP test**

`supabase/tests/105_user_roles_active_flag.sql`:
```sql
begin;
select plan(5);

select tests.create_supabase_user('active-flag-fixture@test.local') as v_user \gset

insert into user_roles (id, user_id, role, scope_type, scope_id, created_at) values
  ('af111111-0000-0000-0000-000000000001', :'v_user'::uuid, 'teacher', 'class', gen_random_uuid(), now()),
  ('af222222-0000-0000-0000-000000000002', :'v_user'::uuid, 'coordinator', 'session', gen_random_uuid(), now());

-- Positive: supabase_auth_admin can flip is_active (the hook's own grant).
set role supabase_auth_admin;
update user_roles set is_active = true where id = 'af111111-0000-0000-0000-000000000001';
reset role;
select is(
  (select is_active from user_roles where id = 'af111111-0000-0000-0000-000000000001'),
  true,
  'supabase_auth_admin can set is_active true (AC#3 grant)'
);

-- Negative: not even the row's own owner, simulated as plain authenticated, can write is_active directly.
select tests.authenticate_as(:'v_user'::uuid, 'teacher', 'class', gen_random_uuid());
select throws_ok(
  $$update user_roles set is_active = true where id = 'af222222-0000-0000-0000-000000000002'$$,
  '42501',
  null,
  'authenticated cannot update is_active directly (only supabase_auth_admin / switch_active_role can)'
);
select tests.clear_authentication();

-- Partial unique index: a second active row for the same user is rejected.
set role supabase_auth_admin;
select throws_ok(
  $$update user_roles set is_active = true where id = 'af222222-0000-0000-0000-000000000002'$$,
  '23505',
  null,
  'a second active row for the same user violates the partial unique index'
);
reset role;

-- Sanity: exactly one active row for this user after the rejected attempt above.
select is(
  (select count(*) from user_roles where user_id = :'v_user'::uuid and is_active)::int, 1,
  'exactly one active row remains for the user'
);

-- Sanity: a different user's active row is independent (index is per-user, not global).
select tests.create_supabase_user('active-flag-fixture-2@test.local') as v_user2 \gset
insert into user_roles (user_id, role, scope_type, scope_id) values (:'v_user2'::uuid, 'parent', 'org', null);
set role supabase_auth_admin;
update user_roles set is_active = true where user_id = :'v_user2'::uuid;
reset role;
select is(
  (select count(*) from user_roles where is_active)::int, 2,
  'two different users can each have their own active row at the same time'
);

select tests.clear_authentication();
select * from finish();
rollback;
```

- [ ] **Step 5: Run it**
```bash
npx supabase test db
```
Expected: `105_user_roles_active_flag.sql` — 5/5 passing. (No separate RED step — the grant/policy this task adds is a single-shot addition to an already-locked-down table, same reasoning as `core-schema-and-rls` Task 3's `user_roles_auth_admin_read`: the test-first discipline is satisfied by writing the assertions before confirming the grant boundary is real, not just assumed.)

- [ ] **Step 6: Run the full existing suite to confirm no regression**
```bash
npx supabase test db
```
Expected: all prior test files (000–100) still pass unmodified — this column addition doesn't touch any existing policy.

- [ ] **Step 7: Commit**
```bash
git add supabase/migrations supabase/tests/105_user_roles_active_flag.sql
git commit -m "feat: is_active flag + partial unique index on user_roles (ADR-0022)"
```

---

### Task 2: Custom Access Token Hook — ensure-then-read

**Files:**
- Create: `supabase/migrations/<ts>_custom_access_token_hook.sql`
- Create: `supabase/tests/110_auth_hook_claims.sql`

**Interfaces:**
- Consumes: `user_roles.is_active` (Task 1).
- Produces: `custom_access_token_hook(event jsonb) returns jsonb`, granted to `supabase_auth_admin` only. Task 4's `config.toml` wiring points at this exact function name/schema.

- [ ] **Step 1: Create the migration file**
```bash
npx supabase migration new custom_access_token_hook
```

- [ ] **Step 2: Write the migration**
```sql
create or replace function custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_user_id uuid := (event->>'user_id')::uuid;
  v_active user_roles%rowtype;
  claims jsonb := event->'claims';
begin
  -- Ensure: if the caller holds >=1 grant and none is active, auto-activate
  -- one deterministically (narrowest scope first: class > session > center >
  -- org; center has no role mapped today per ADR-0022 but is included so the
  -- CASE never falls through unhandled; tie-broken by created_at ascending).
  if not exists (select 1 from user_roles where user_id = v_user_id and is_active) then
    update user_roles
    set is_active = true
    where id = (
      select id from user_roles
      where user_id = v_user_id
      order by
        case scope_type
          when 'class' then 1
          when 'session' then 2
          when 'center' then 3
          when 'org' then 4
        end,
        created_at asc
      limit 1
    );
  end if;

  -- Read: at most one active row is now guaranteed (partial unique index),
  -- or zero if the caller holds no user_roles grant at all.
  select * into v_active from user_roles where user_id = v_user_id and is_active;

  if not found then
    -- Zero-role user: claims pass through unmodified, no active_role key.
    -- Every existing RLS policy already default-denies on a missing claim.
    return jsonb_set(event, '{claims}', claims);
  end if;

  claims := jsonb_set(claims, '{active_role}', to_jsonb(v_active.role::text));
  claims := jsonb_set(claims, '{scope_type}', to_jsonb(v_active.scope_type::text));
  claims := case
    when v_active.scope_id is not null then jsonb_set(claims, '{scope_id}', to_jsonb(v_active.scope_id::text))
    else claims - 'scope_id'
  end;

  return jsonb_set(event, '{claims}', claims);
end;
$$;

revoke all on function custom_access_token_hook(jsonb) from public;
grant execute on function custom_access_token_hook(jsonb) to supabase_auth_admin;
```

- [ ] **Step 3: Apply locally**
```bash
npx supabase db reset
```

- [ ] **Step 4: Write the pgTAP test**

`supabase/tests/110_auth_hook_claims.sql` — the test-runner connects as `postgres` (superuser), which bypasses the `supabase_auth_admin`-only grant the same way it bypasses RLS everywhere else in this suite, so every case below except Case 10 calls the hook directly with no role simulation:
```sql
begin;
select plan(15);

-- Case 1: single-role user, no active row yet -> hook auto-activates the sole row.
select tests.create_supabase_user('hook-single@test.local') as v_single \gset
insert into user_roles (id, user_id, role, scope_type, scope_id, created_at) values
  ('10000001-0000-0000-0000-000000000001', :'v_single'::uuid, 'teacher', 'class',
   '10000001-c000-0000-0000-000000000001'::uuid, now());

select is(
  custom_access_token_hook(jsonb_build_object(
    'user_id', :'v_single',
    'claims', jsonb_build_object('sub', :'v_single')
  ))->'claims'->>'active_role',
  'teacher',
  'case 1: single-role user auto-activates their sole row'
);

-- Case 2: multi-role user, none active -> narrowest scope (class) wins over session/org.
select tests.create_supabase_user('hook-multi@test.local') as v_multi \gset
insert into user_roles (id, user_id, role, scope_type, scope_id, created_at) values
  ('20000002-0000-0000-0000-000000000001', :'v_multi'::uuid, 'teacher', 'class',
   '20000002-c000-0000-0000-000000000001'::uuid, now()),
  ('20000002-0000-0000-0000-000000000002', :'v_multi'::uuid, 'coordinator', 'session',
   '20000002-c000-0000-0000-000000000002'::uuid, now()),
  ('20000002-0000-0000-0000-000000000003', :'v_multi'::uuid, 'bv_coordinator', 'org', null, now());

select is(
  custom_access_token_hook(jsonb_build_object(
    'user_id', :'v_multi',
    'claims', jsonb_build_object('sub', :'v_multi')
  ))->'claims'->>'active_role',
  'teacher',
  'case 2: multi-role user activates the class-scoped (narrowest) grant'
);
select is(
  custom_access_token_hook(jsonb_build_object(
    'user_id', :'v_multi',
    'claims', jsonb_build_object('sub', :'v_multi')
  ))->'claims'->>'scope_id',
  '20000002-c000-0000-0000-000000000001',
  'case 2: activated row is specifically the class-scoped one'
);

-- Case 3: two rows at the same scope_type, none active -> earlier created_at wins.
select tests.create_supabase_user('hook-tie@test.local') as v_tie \gset
insert into user_roles (id, user_id, role, scope_type, scope_id, created_at) values
  ('30000003-0000-0000-0000-000000000001', :'v_tie'::uuid, 'coordinator', 'session',
   '30000003-c000-0000-0000-000000000001'::uuid, '2026-01-01T00:00:00Z'),
  ('30000003-0000-0000-0000-000000000002', :'v_tie'::uuid, 'coordinator', 'session',
   '30000003-c000-0000-0000-000000000002'::uuid, '2026-02-01T00:00:00Z');

select is(
  custom_access_token_hook(jsonb_build_object(
    'user_id', :'v_tie',
    'claims', jsonb_build_object('sub', :'v_tie')
  ))->'claims'->>'scope_id',
  '30000003-c000-0000-0000-000000000001',
  'case 3: tie-break activates the earlier-created_at row'
);

-- Case 4: a row already active -> ensure step is a no-op; claims match the pre-existing active row.
select tests.create_supabase_user('hook-already-active@test.local') as v_active \gset
insert into user_roles (id, user_id, role, scope_type, scope_id, created_at, is_active) values
  ('40000004-0000-0000-0000-000000000001', :'v_active'::uuid, 'parent', 'org', null, now(), true),
  ('40000004-0000-0000-0000-000000000002', :'v_active'::uuid, 'teacher', 'class',
   '40000004-c000-0000-0000-000000000002'::uuid, now(), false);

select is(
  custom_access_token_hook(jsonb_build_object(
    'user_id', :'v_active',
    'claims', jsonb_build_object('sub', :'v_active')
  ))->'claims'->>'active_role',
  'parent',
  'case 4: pre-existing active row wins, not reassigned to another grant'
);
select is(
  (select count(*) from user_roles where user_id = :'v_active'::uuid and is_active)::int,
  1,
  'case 4: ensure step did not touch is_active when one row was already active'
);

-- Case 5: zero-role user -> no active_role key; other claim keys pass through unchanged.
select tests.create_supabase_user('hook-zero@test.local') as v_zero \gset

select ok(
  not (
    (custom_access_token_hook(jsonb_build_object(
      'user_id', :'v_zero',
      'claims', jsonb_build_object('sub', :'v_zero')
    ))->'claims') ? 'active_role'
  ),
  'case 5: zero-role user gets no active_role claim key'
);
select is(
  custom_access_token_hook(jsonb_build_object(
    'user_id', :'v_zero',
    'claims', jsonb_build_object('sub', :'v_zero')
  ))->'claims'->>'sub',
  :'v_zero',
  'case 5: other claim keys (sub) pass through unmodified'
);

-- Case 6: active row is org-scoped -> claims carry no scope_id key at all (not JSON null).
select tests.create_supabase_user('hook-org@test.local') as v_org \gset
insert into user_roles (user_id, role, scope_type, scope_id, is_active) values
  (:'v_org'::uuid, 'bv_coordinator', 'org', null, true);

select ok(
  not (
    (custom_access_token_hook(jsonb_build_object(
      'user_id', :'v_org',
      'claims', jsonb_build_object('sub', :'v_org')
    ))->'claims') ? 'scope_id'
  ),
  'case 6: org-scoped active role omits the scope_id key entirely'
);

-- Case 7: active row is non-org-scoped -> scope_id present, equals the row's scope_id.
select tests.create_supabase_user('hook-nonorg@test.local') as v_nonorg \gset
insert into user_roles (user_id, role, scope_type, scope_id, is_active) values
  (:'v_nonorg'::uuid, 'teacher', 'class', '70000007-c000-0000-0000-000000000001'::uuid, true);

select is(
  custom_access_token_hook(jsonb_build_object(
    'user_id', :'v_nonorg',
    'claims', jsonb_build_object('sub', :'v_nonorg')
  ))->'claims'->>'scope_id',
  '70000007-c000-0000-0000-000000000001',
  'case 7: non-org active role carries its real scope_id'
);

-- Case 8a: role revoked while active -> next hook call re-heals to the next-narrowest remaining grant.
select tests.create_supabase_user('hook-revoked@test.local') as v_revoked \gset
insert into user_roles (id, user_id, role, scope_type, scope_id, is_active) values
  ('80000008-0000-0000-0000-000000000001', :'v_revoked'::uuid, 'teacher', 'class',
   '80000008-c000-0000-0000-000000000001'::uuid, true),
  ('80000008-0000-0000-0000-000000000002', :'v_revoked'::uuid, 'coordinator', 'session',
   '80000008-c000-0000-0000-000000000002'::uuid, false),
  ('80000008-0000-0000-0000-000000000003', :'v_revoked'::uuid, 'bv_coordinator', 'org', null, false);

delete from user_roles where id = '80000008-0000-0000-0000-000000000001';

select is(
  custom_access_token_hook(jsonb_build_object(
    'user_id', :'v_revoked',
    'claims', jsonb_build_object('sub', :'v_revoked')
  ))->'claims'->>'active_role',
  'coordinator',
  'case 8a: revoking the active row re-heals to the next-narrowest remaining grant'
);

-- Case 8b: revoking a user's only row leaves zero grants -> zero-claim result, not an error.
select tests.create_supabase_user('hook-revoked-to-none@test.local') as v_revoked_none \gset
insert into user_roles (id, user_id, role, scope_type, scope_id, is_active) values
  ('80000009-0000-0000-0000-000000000001', :'v_revoked_none'::uuid, 'parent', 'org', null, true);
delete from user_roles where id = '80000009-0000-0000-0000-000000000001';

select ok(
  not (
    (custom_access_token_hook(jsonb_build_object(
      'user_id', :'v_revoked_none',
      'claims', jsonb_build_object('sub', :'v_revoked_none')
    ))->'claims') ? 'active_role'
  ),
  'case 8b: revoking a user''s sole grant leaves no active_role claim, not an error'
);

-- Case 9: forgery resistance -> a fabricated active_role already in the incoming event is discarded.
select tests.create_supabase_user('hook-forge@test.local') as v_forge \gset
insert into user_roles (user_id, role, scope_type, scope_id, is_active) values
  (:'v_forge'::uuid, 'parent', 'org', null, true);

select is(
  custom_access_token_hook(jsonb_build_object(
    'user_id', :'v_forge',
    'claims', jsonb_build_object('sub', :'v_forge', 'active_role', 'admin')
  ))->'claims'->>'active_role',
  'parent',
  'case 9: hook discards a forged active_role already present on the incoming event'
);

-- Case 10: privilege check -> authenticated cannot call the hook; supabase_auth_admin can.
set role authenticated;
select throws_ok(
  $$select custom_access_token_hook(jsonb_build_object('user_id', gen_random_uuid()::text, 'claims', '{}'::jsonb))$$,
  '42501',
  null,
  'case 10: authenticated cannot call custom_access_token_hook directly'
);
reset role;

set role supabase_auth_admin;
select lives_ok(
  $$select custom_access_token_hook(jsonb_build_object('user_id', gen_random_uuid()::text, 'claims', '{}'::jsonb))$$,
  'case 10: supabase_auth_admin can call custom_access_token_hook'
);
reset role;

select * from finish();
rollback;
```

- [ ] **Step 5: Run it**
```bash
npx supabase test db
```
Expected: `110_auth_hook_claims.sql` — 15/15 passing.

- [ ] **Step 6: Run the full existing suite to confirm no regression**
```bash
npx supabase test db
```
Expected: all prior test files (000–105) still pass unmodified.

- [ ] **Step 7: Commit**
```bash
git add supabase/migrations supabase/tests/110_auth_hook_claims.sql
git commit -m "feat: custom_access_token_hook, ensure-then-read auto-activation (ADR-0022)"
```

---

### Task 3: `switch_active_role` RPC

**Files:**
- Create: `supabase/migrations/<ts>_switch_active_role_rpc.sql`
- Create: `supabase/tests/120_switch_active_role_rpc.sql`

**Interfaces:**
- Consumes: `user_roles.is_active` (Task 1), `custom_access_token_hook` (Task 2, for the integration assertion).
- Produces: `switch_active_role(p_user_roles_id uuid) returns void`, granted to `authenticated`. This is the function the future role-switcher UI (ADR-0014, out of scope here) will call, followed by the client's own `refreshSession()`.

- [ ] **Step 1: Create the migration file**
```bash
npx supabase migration new switch_active_role_rpc
```

- [ ] **Step 2: Write the migration**
```sql
create or replace function switch_active_role(p_user_roles_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
begin
  select user_id into v_owner from user_roles where id = p_user_roles_id;

  if v_owner is null or v_owner <> auth.uid() then
    return; -- no-op: no error, no existence leak, per ADR-0022
  end if;

  update user_roles set is_active = false where user_id = auth.uid() and is_active;
  update user_roles set is_active = true where id = p_user_roles_id;
end;
$$;

revoke all on function switch_active_role(uuid) from public;
grant execute on function switch_active_role(uuid) to authenticated;
```

- [ ] **Step 3: Apply locally**
```bash
npx supabase db reset
```

- [ ] **Step 4: Write the pgTAP test**

`supabase/tests/120_switch_active_role_rpc.sql`:
```sql
begin;
select plan(8);

-- Fixture: user X holds role A (active) + role B (inactive).
select tests.create_supabase_user('switch-x@test.local') as v_x \gset
insert into user_roles (id, user_id, role, scope_type, scope_id, is_active) values
  ('90000001-0000-0000-0000-00000000000a', :'v_x'::uuid, 'teacher', 'class',
   '90000001-c000-0000-0000-00000000000a'::uuid, true),
  ('90000001-0000-0000-0000-00000000000b', :'v_x'::uuid, 'coordinator', 'session',
   '90000001-c000-0000-0000-00000000000b'::uuid, false);

-- Case 1: owner switch flips active from A to B.
select tests.authenticate_as(:'v_x'::uuid, 'teacher', 'class', '90000001-c000-0000-0000-00000000000a'::uuid);
select switch_active_role('90000001-0000-0000-0000-00000000000b'::uuid);
select tests.clear_authentication();

select is(
  (select is_active from user_roles where id = '90000001-0000-0000-0000-00000000000a'), false,
  'case 1: previously active row A is cleared after switching to B'
);
select is(
  (select is_active from user_roles where id = '90000001-0000-0000-0000-00000000000b'), true,
  'case 1: target row B is now active'
);

-- Fixture: user Y, unrelated to X.
select tests.create_supabase_user('switch-y@test.local') as v_y \gset
insert into user_roles (id, user_id, role, scope_type, scope_id, is_active) values
  ('90000002-0000-0000-0000-000000000001', :'v_y'::uuid, 'parent', 'org', null, true);

-- Case 2: Y tries to switch X's row B -> no-op, no error, no state change for either user.
select tests.authenticate_as(:'v_y'::uuid, 'parent', 'org', null);
select lives_ok(
  $$select switch_active_role('90000001-0000-0000-0000-00000000000b'::uuid)$$,
  'case 2: calling switch_active_role on another user''s row does not raise an error'
);
select tests.clear_authentication();

select is(
  (select is_active from user_roles where id = '90000001-0000-0000-0000-00000000000b'), true,
  'case 2: non-owner call left X''s active row (B) unchanged'
);
select is(
  (select is_active from user_roles where id = '90000002-0000-0000-0000-000000000001'), true,
  'case 2: non-owner call did not touch the caller''s (Y''s) own active row either'
);

-- Case 3: exactly one active row remains for X after the switches above (partial unique index sanity).
select is(
  (select count(*) from user_roles where user_id = :'v_x'::uuid and is_active)::int, 1,
  'case 3: exactly one active row for X'
);

-- Case 4: switching to the already-active row is an idempotent no-op (stays active, not toggled off).
select tests.authenticate_as(:'v_x'::uuid, 'coordinator', 'session', '90000001-c000-0000-0000-00000000000b'::uuid);
select switch_active_role('90000001-0000-0000-0000-00000000000b'::uuid);
select tests.clear_authentication();

select is(
  (select is_active from user_roles where id = '90000001-0000-0000-0000-00000000000b'), true,
  'case 4: switching to the already-active row leaves it active (idempotent)'
);

-- Case 5: hook/RPC integration - an immediate hook call reflects the newly-active role, no lag.
select is(
  custom_access_token_hook(jsonb_build_object(
    'user_id', :'v_x',
    'claims', jsonb_build_object('sub', :'v_x')
  ))->'claims'->>'active_role',
  'coordinator',
  'case 5: hook and switch_active_role share one source of truth (is_active)'
);

select * from finish();
rollback;
```

- [ ] **Step 5: Run it**
```bash
npx supabase test db
```
Expected: `120_switch_active_role_rpc.sql` — 8/8 passing.

- [ ] **Step 6: Run the full existing suite to confirm no regression (AC#8 — full check)**
```bash
npx supabase test db
```
Expected: every test file 000–120 passes. This is the concrete proof of AC#8 — the entire pre-existing suite still passes unmodified now that `user_roles` has grown a column and two new functions exist.

- [ ] **Step 7: Commit**
```bash
git add supabase/migrations supabase/tests/120_switch_active_role_rpc.sql
git commit -m "feat: switch_active_role RPC, the only client write path to is_active (ADR-0022)"
```

---

### Task 4: Local Supabase Auth wiring — magic-link + hook registration

**Files:**
- Modify: `supabase/config.toml:283-286`

**Interfaces:**
- Consumes: `custom_access_token_hook` (Task 2) by exact schema-qualified name.
- Produces: local Auth service configuration only — no SQL, no test file (config isn't pgTAP-testable; correctness is proven by the `/test`-stage live pass in the appendix below).

- [ ] **Step 1: Edit `supabase/config.toml`**

Replace the commented-out block at lines 283–286:
```toml
# This hook runs before a token is issued and allows you to add additional claims based on the authentication method used.
# [auth.hook.custom_access_token]
# enabled = true
# uri = "pg-functions://<database>/<schema>/<hook_name>"
```
with:
```toml
# This hook runs before a token is issued and allows you to add additional claims based on the authentication method used.
[auth.hook.custom_access_token]
enabled = true
uri = "pg-functions://postgres/public/custom_access_token_hook"
```
Magic-link itself needs no additional toggle — `[auth.email]` (`config.toml:219`) already has `enable_signup = true` and confirmations disabled locally; `supabase.auth.signInWithOtp({ email })` is the existing Supabase Auth flow, and Inbucket (already configured at `config.toml:105`, port 54324) captures the email locally.

- [ ] **Step 2: Restart the local stack so the Auth service picks up the hook registration**
```bash
npx supabase stop
npx supabase start
npx supabase db reset
```
Config-file changes require a restart, not just `db reset` — `db reset` alone reapplies migrations/seed but doesn't reread `config.toml`.

- [ ] **Step 3: Confirm the Auth service is healthy with the hook registered**
```bash
npx supabase status
```
Expected: all services report running, no error referencing `custom_access_token_hook` or the hook URI. (This confirms GoTrue accepted the config; it does not yet prove the hook *fires correctly* against a real sign-in — that's the `/test`-stage pass below.)

- [ ] **Step 4: Run the full pgTAP suite once more (restart doesn't change SQL, but confirms the reset stack is still green)**
```bash
npx supabase test db
```
Expected: all test files 000–120 pass.

- [ ] **Step 5: Commit**
```bash
git add supabase/config.toml
git commit -m "feat: register custom_access_token_hook with local Supabase Auth"
```

---

## Sign-off checklist before handing to `/test`

- [x] All 4 tasks above complete, all commits made.
- [x] `npx supabase test db` shows the full suite (000–120) green — this is the AC#8 regression gate and stays the gate going forward.
- [x] **Live end-to-end verification (AC#7) — run 2026-07-11.** Ran the appendix script below against local dev (adjusted twice from its first draft: Inbucket's actual REST API in this bundled version is `/api/v1/messages?mailbox=<name>` + `/api/v1/message/<id>` returning newest-first, not `/api/v1/mailbox/<name>` returning oldest-first; and the delivered email carries a `token_hash` for `verifyOtp({ token_hash, type: 'magiclink' })`, not a 6-digit OTP code, despite `otp_length=6` in config — that setting doesn't apply to the magic-link template used here). Results, real signed-in sessions:
  - `teacher1@bv-seed.test.local` (single role) → `{active_role: 'teacher', scope_type: 'class', scope_id: 'e88cb6c6-6112-4170-8322-85acf9822d5a'}` — matches their seeded row exactly.
  - `multirole@bv-seed.test.local` (4 grants, none pre-active) → hook auto-activated `{active_role: 'teacher', scope_type: 'class', scope_id: 'e88cb6c6-...'}` — narrowest-scope-first tie-break confirmed against real data.
  - After `switch_active_role(<coordinator row>)` + `refreshSession()` → `{active_role: 'coordinator', scope_type: 'session', scope_id: 'f97fde6b-6e58-4e80-8736-05aa6919d4ab'}` — matches the switch target exactly.
  - This positively proves the `supabase_auth_admin` grant/policy path (Task 1) that pgTAP structurally couldn't exercise — the blocking gate from the final whole-branch review is closed. **`/promote` is now unblocked.**

---

## Appendix — Live end-to-end verification (AC#7, for `/test`, not `/build`)

Per the design spec: *"Documented as a `/test`-stage manual pass, not pgTAP — this is exactly the 'real hook, real sign-in' case pgTAP's simulated claims can't cover... it is not a substitute for the pgTAP suite above and doesn't run on every `/test` pass going forward."* Included here in full so `/test` has exact, runnable steps rather than a vague pointer back to this plan.

**Step A — get the local anon key:**
```bash
npx supabase status
```
Copy the `anon key` value from the output.

**Step B — find a real target row id for the switch test (local dev only; direct DB access, not a client credential).** This repo's local dev machines may not have a `psql` client installed — the Postgres container always does, so `docker exec` into it rather than assuming a host `psql`:
```bash
docker exec -i supabase_db_CMDFW-BalaVihar---Pilot-App psql -U postgres -d postgres -c "
  select ur.id, ur.role, ur.scope_type, ur.scope_id, ur.is_active
  from user_roles ur join auth.users u on u.id = ur.user_id
  where u.email = 'multirole@bv-seed.test.local'
  order by ur.role;
"
```
(Container name follows the pattern `supabase_db_<project-dir-name>` — confirm with `docker ps --format '{{.Names}}' | grep supabase_db` if it differs.) Note the `id` of a row whose `role` differs from whichever comes back active in Step D below (e.g. note the `coordinator` row's id if `teacher` activates first, per the hook's narrowest-scope-first rule from `seed.sql`'s fixture — `teacher`@class, `coordinator`@session, `bv_coordinator`@org, `parent`@org).

**Step C — write the verification script.** Node's ESM resolver walks up from the script's own location to find `node_modules`, so write it inside the project tree (e.g. its root) rather than `/tmp` — `@supabase/supabase-js` won't resolve otherwise. It's still a one-time manual-check script, not a regression-suite script: don't `git add` it, and delete it in Step F.

`verify-auth-hook.local.mjs` (project root):
```js
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'http://127.0.0.1:54321';
const INBUCKET_URL = 'http://127.0.0.1:54324';
const ANON_KEY = process.argv[2];
const SWITCH_TARGET_ID = process.argv[3];

if (!ANON_KEY || !SWITCH_TARGET_ID) {
  console.error('usage: node verify-auth-hook.mjs <anon-key> <switch-target-user-roles-id>');
  process.exit(1);
}

function decodeJwt(token) {
  const payload = token.split('.')[1];
  return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
}

async function fetchTokenHash(email) {
  // This bundled Inbucket version's REST API is /api/v1/messages?mailbox=<name>
  // (returns newest-first) + /api/v1/message/<id> for the full body -- NOT
  // /api/v1/mailbox/<name> (that 404s on this version). Confirmed against the
  // running container's own /dist/app.js, not assumed from upstream docs.
  const mailbox = email.split('@')[0];
  const listRes = await fetch(`${INBUCKET_URL}/api/v1/messages?mailbox=${mailbox}`);
  const list = await listRes.json();
  const latest = list.messages[0]; // newest-first; index 0, not length-1
  const msgRes = await fetch(`${INBUCKET_URL}/api/v1/message/${latest.ID}`);
  const msg = await msgRes.json();
  // The magic-link email carries a token_hash in the verify URL, not a 6-digit
  // OTP code, regardless of config.toml's otp_length -- that setting doesn't
  // apply to this template. verifyOtp({ token_hash, type: 'magiclink' })
  // redeems it directly, independent of PKCE/implicit flow state.
  const match = msg.Text.match(/token=([a-f0-9]+)&type=magiclink/);
  if (!match) throw new Error(`no magiclink token_hash found in email to ${email}`);
  return match[1];
}

async function signInAndDecode(email) {
  const supabase = createClient(SUPABASE_URL, ANON_KEY);
  const { error: otpError } = await supabase.auth.signInWithOtp({ email });
  if (otpError) throw otpError;

  const token_hash = await fetchTokenHash(email);
  const { data, error } = await supabase.auth.verifyOtp({ token_hash, type: 'magiclink' });
  if (error) throw error;

  const claims = decodeJwt(data.session.access_token);
  console.log(`--- ${email} ---`);
  console.log({ active_role: claims.active_role, scope_type: claims.scope_type, scope_id: claims.scope_id });
  return { supabase, session: data.session, claims };
}

// AC#7 part 1: single-role seeded user's real JWT carries the seeded row's claims.
await signInAndDecode('teacher1@bv-seed.test.local');

// AC#7 part 2: multi-role seeded user, then switch_active_role + refreshSession moves the claim.
const { supabase } = await signInAndDecode('multirole@bv-seed.test.local');

const { error: switchError } = await supabase.rpc('switch_active_role', { p_user_roles_id: SWITCH_TARGET_ID });
if (switchError) throw switchError;

const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession();
if (refreshError) throw refreshError;

const newClaims = decodeJwt(refreshed.session.access_token);
console.log('--- multirole@bv-seed.test.local (after switch_active_role + refreshSession) ---');
console.log({ active_role: newClaims.active_role, scope_type: newClaims.scope_type, scope_id: newClaims.scope_id });
```

**Step D — run it (from the project root, per Step C's node_modules note):**
```bash
node verify-auth-hook.local.mjs '<anon-key-from-Step-A>' '<row-id-from-Step-B>'
```

**Step E — confirm by inspection:**
1. The first printed block (`teacher1@bv-seed.test.local`) shows `active_role: "teacher"`, `scope_type: "class"`, and a `scope_id` matching that seeded teacher's class — proving a **real, signed-in session** carries hook-stamped claims, not simulated ones.
2. The second printed block (`multirole@bv-seed.test.local`, before switch) shows whichever role the hook auto-activated first (narrowest-scope-first — expect `teacher`/`class` per `seed.sql`'s fixture).
3. The third printed block (after `switch_active_role` + `refreshSession()`) shows `active_role` now matching the role of the row id passed in Step B — proving the switch mechanism and the hook share one live source of truth against a real session, not just in the pgTAP simulation from Task 3's Case 5.

**Step F — clean up:**
```bash
rm verify-auth-hook.local.mjs
```
This script is not committed — it's a one-time proof, not part of the regression suite (design spec, explicit).

**Verified 2026-07-11** — see the checked box in the sign-off checklist above for actual output. The three fixes folded into this appendix (Inbucket's real REST paths/ordering, the `token_hash`/`magiclink` redemption method, running from the project root) were all discovered live during that run, not theoretical — this version of the script is the one that actually worked, not the first draft.
