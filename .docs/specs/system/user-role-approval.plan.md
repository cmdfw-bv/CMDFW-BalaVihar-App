# Plan — System: user-role-approval

> Spec: [user-role-approval.md](user-role-approval.md) · ADR-0024 · stage: `/plan` ✓ → `/migration` ✓ → `/build` ✓ → next `/test`

## Shared seam

Stage 1 (the migration: unique index + `insert_user_role_grant` RPC + service-role write grants) is the **serialized gate** — every lib/handler file in Stages 2–6 is built and unit-tested against a **mocked** Supabase client (no real DB in any `.test.ts`), so those stages can be written in parallel without waiting on the migration landing. Only the pgTAP suite (Stage 1) and the local smoke test (Stage 7) touch a real database.

**Branch:** current branch `ssrinivas90/issue-7-user-role-approval`, cut from `origin/main` — single cohesive backend item (not parallel persona work), no additional worktree needed.

## Self-target rule (resolved before this plan was written)

Design decision #1's code (`isGrantAllowed`) and its prose disagreed on one edge case: a caller self-targeting a role *below* their own tier but above tier 0 (e.g. Admin revoking their own leftover `coordinator` row, tier 1 < 3). Confirmed with the project owner: **the literal formula governs** — `targetTier < callerTier` for every self-target, no per-role carve-out. Self-target is blocked only when the target role is at-or-above the caller's own tier (same-tier self-target is always blocked since `X < X` is false); a caller may shed their own strictly-lower-tier legacy row. This is captured in Stage 2's test matrix below.

---

## Task list (ordered — TDD throughout)

### Stage 1 — Migration (serialized)

- [x] **M1 — pgTAP tests (RED)** `supabase/tests/130_user_role_write_path.sql`
  ```sql
  begin;
  select plan(4);

  select tests.create_supabase_user('grant-idx@test.local') as v_user \gset

  -- Case 1: RPC inserts a new grant and returns its id.
  select ok(
    (select insert_user_role_grant(:'v_user'::uuid, 'parent', 'org', null, true)) is not null,
    'insert_user_role_grant returns a new id on first insert'
  );

  -- Case 2: identical grant tuple is an idempotent no-op (NULL, no error).
  select is(
    (select insert_user_role_grant(:'v_user'::uuid, 'parent', 'org', null, false)),
    null,
    'insert_user_role_grant returns null on duplicate grant tuple (idempotent no-op)'
  );

  -- Case 3: exactly one row exists for that tuple (no duplicate row was created).
  select is(
    (select count(*) from user_roles where user_id = :'v_user'::uuid and role = 'parent' and scope_type = 'org')::int, 1,
    'case 2 did not create a duplicate row'
  );

  -- Case 4: a different scope_id for a non-org role is a distinct grant, not deduped.
  select tests.create_supabase_user('grant-idx2@test.local') as v_user2 \gset
  select ok(
    (select insert_user_role_grant(:'v_user2'::uuid, 'teacher', 'class', gen_random_uuid(), true)) is not null,
    'insert_user_role_grant allows a class-scoped grant for a different scope_id'
  );

  select * from finish();
  rollback;
  ```
  Run `npm run db:reset` first to confirm this fails (`insert_user_role_grant` does not exist yet) = RED ✓.

- [x] **M2 — Migration 1: grant-identity uniqueness + `insert_user_role_grant` RPC**
  ```bash
  npx supabase migration new user_roles_grant_identity_idx
  ```
  Write into the generated file:
  ```sql
  -- Grant-identity uniqueness (design decision #4) — enables idempotent-no-op duplicate
  -- grants (AC#4) via an atomic insert rather than a race-prone app-level check-then-insert.
  -- coalesce(...) is required (not a plain scope_id column) because org-scoped rows always
  -- have scope_id = NULL (user_roles_org_scope_null_id check constraint), and plain UNIQUE
  -- treats every NULL as distinct.
  create unique index if not exists user_roles_grant_identity_idx
    on user_roles (user_id, role, scope_type, coalesce(scope_id, '00000000-0000-0000-0000-000000000000'::uuid));

  -- PostgREST's client-library upsert(onConflict:) only accepts a literal column list — it
  -- cannot target the coalesce(...) expression index above. This RPC is the mechanical
  -- translation of the design spec's literal `insert ... on conflict (...) do nothing
  -- returning id` (Phase 4) into something callable via supabase-js's .rpc(), since that SQL
  -- can't be expressed through .upsert(). Called only by the manual grant path (user-role-grant.ts);
  -- the sweep (role-sweep.ts) does its own select-then-insert, matching db-ops.ts's existing
  -- pattern for the other partial-unique-index tables (families, students).
  create or replace function insert_user_role_grant(
    p_user_id uuid,
    p_role app_role,
    p_scope_type app_scope_type,
    p_scope_id uuid,
    p_is_active boolean
  )
  returns uuid
  language plpgsql
  as $$
  declare
    v_id uuid;
  begin
    insert into user_roles (user_id, role, scope_type, scope_id, is_active)
    values (p_user_id, p_role, p_scope_type, p_scope_id, p_is_active)
    on conflict (user_id, role, scope_type, coalesce(scope_id, '00000000-0000-0000-0000-000000000000'::uuid))
    do nothing
    returning id into v_id;

    return v_id;
  end;
  $$;

  revoke all on function insert_user_role_grant(uuid, app_role, app_scope_type, uuid, boolean) from public;
  ```

- [x] **M3 — Migration 2: service-role write grants**
  ```bash
  npx supabase migration new user_role_write_service_role_grants
  ```
  ```sql
  -- user-role-sweep and user-role-grant Netlify Functions run under the service_role key
  -- (§ csv_import_service_role_grants precedent — this project doesn't use
  -- auto_expose_new_tables). user_roles previously only granted service_role SELECT
  -- (csv_import_service_role_grants); this is the first item that writes user_roles, so it
  -- needs its own INSERT/DELETE grant, plus EXECUTE on the atomic-insert RPC above.
  -- SELECT on classes/students/family_members for the sweep and Coordinator session-containment
  -- check is already granted by 20260711105647_csv_import_service_role_grants.sql — not repeated.
  grant insert, delete on public.user_roles to service_role;
  grant execute on function insert_user_role_grant(uuid, app_role, app_scope_type, uuid, boolean) to service_role;
  ```

- [x] **M4 — Green** `npm run db:reset` → confirm 130 suite passes; full suite (000–120) stays green.

---

### Stage 2 — `role-tiering` lib (pure, TDD)

- [x] **F1 — tests (RED)** `netlify/functions/__tests__/role-tiering.test.ts`
  ```typescript
  import { describe, it, expect } from 'vitest';
  import { TIER, ROLE_SCOPE_TYPE, tierOf, isGrantAllowed, type AppRole } from '../lib/role-tiering';

  describe('TIER / tierOf', () => {
    it('coordinator=1, bv_coordinator=2, admin=3', () => {
      expect(TIER.coordinator).toBe(1);
      expect(TIER.bv_coordinator).toBe(2);
      expect(TIER.admin).toBe(3);
    });
    it('tierOf returns 0 for student/parent/teacher (unlisted in TIER)', () => {
      expect(tierOf('student')).toBe(0);
      expect(tierOf('parent')).toBe(0);
      expect(tierOf('teacher')).toBe(0);
    });
  });

  describe('ROLE_SCOPE_TYPE (design decision #6)', () => {
    it('maps every role to its fixed scope_type', () => {
      expect(ROLE_SCOPE_TYPE.student).toBe('org');
      expect(ROLE_SCOPE_TYPE.parent).toBe('org');
      expect(ROLE_SCOPE_TYPE.teacher).toBe('class');
      expect(ROLE_SCOPE_TYPE.coordinator).toBe('session');
      expect(ROLE_SCOPE_TYPE.bv_coordinator).toBe('org');
      expect(ROLE_SCOPE_TYPE.admin).toBe('org');
    });
  });

  const CALLER_U = 'caller-uuid';
  const TARGET_U = 'target-uuid';

  describe('isGrantAllowed — non-self targets (grant tiering table)', () => {
    const cases: Array<[AppRole, number, AppRole, boolean]> = [
      ['coordinator', 1, 'student', true],
      ['coordinator', 1, 'parent', true],
      ['coordinator', 1, 'teacher', true],
      ['coordinator', 1, 'coordinator', false],
      ['coordinator', 1, 'bv_coordinator', false],
      ['coordinator', 1, 'admin', false],
      ['bv_coordinator', 2, 'student', true],
      ['bv_coordinator', 2, 'teacher', true],
      ['bv_coordinator', 2, 'coordinator', true],
      ['bv_coordinator', 2, 'bv_coordinator', false],
      ['bv_coordinator', 2, 'admin', false],
      ['admin', 3, 'student', true],
      ['admin', 3, 'teacher', true],
      ['admin', 3, 'coordinator', true],
      ['admin', 3, 'bv_coordinator', true],
      ['admin', 3, 'admin', true],
    ];
    it.each(cases)('%s (tier %i) -> %s for another user: allowed=%s', (callerRole, callerTier, targetRole, expected) => {
      expect(isGrantAllowed(callerRole, callerTier, null, targetRole, TARGET_U, CALLER_U)).toBe(expected);
    });
  });

  describe('isGrantAllowed — self targets (AC#6, decision #1: literal targetTier < callerTier, no admin carve-out)', () => {
    const cases: Array<[AppRole, number, AppRole, boolean]> = [
      ['coordinator', 1, 'student', true],
      ['coordinator', 1, 'coordinator', false],
      ['bv_coordinator', 2, 'student', true],
      ['bv_coordinator', 2, 'coordinator', true],  // below caller's own tier — allowed
      ['bv_coordinator', 2, 'bv_coordinator', false],
      ['admin', 3, 'student', true],
      ['admin', 3, 'coordinator', true],           // below caller's own tier — allowed
      ['admin', 3, 'bv_coordinator', true],         // below caller's own tier — allowed
      ['admin', 3, 'admin', false],                 // same tier as caller — blocked, no exception
    ];
    it.each(cases)('%s (tier %i) targeting own %s row: allowed=%s', (callerRole, callerTier, targetRole, expected) => {
      expect(isGrantAllowed(callerRole, callerTier, null, targetRole, CALLER_U, CALLER_U)).toBe(expected);
    });
  });
  ```

- [x] **F2 — implementation** `netlify/functions/lib/role-tiering.ts`
  ```typescript
  export type AppRole = 'student' | 'parent' | 'teacher' | 'coordinator' | 'bv_coordinator' | 'admin';
  export type AppScopeType = 'org' | 'center' | 'session' | 'class';

  export const TIER: Partial<Record<AppRole, number>> = {
    coordinator: 1,
    bv_coordinator: 2,
    admin: 3,
  };

  export const ROLE_SCOPE_TYPE: Record<AppRole, AppScopeType> = {
    student: 'org',
    parent: 'org',
    teacher: 'class',
    coordinator: 'session',
    bv_coordinator: 'org',
    admin: 'org',
  };

  export function tierOf(role: AppRole): number {
    return TIER[role] ?? 0;
  }

  export function isGrantAllowed(
    callerRole: AppRole,
    callerTier: number,
    _callerScopeId: string | null,
    targetRole: AppRole,
    targetUserId: string,
    callerUserId: string
  ): boolean {
    const targetTier = tierOf(targetRole);
    if (targetUserId === callerUserId) return targetTier < callerTier; // decision #1, literal formula
    if (callerRole === 'admin') return true; // admin: any role, for others
    return targetTier < callerTier; // bv_coordinator/coordinator: strict
  }
  ```
  Run F1 → GREEN ✓. `_callerScopeId` stays unused inside `isGrantAllowed` (matches the spec's literal 6-arg signature; the Coordinator session-containment check is a separate check in the handler, done with the caller's own scope_id read directly from Phase 0, not through this function) — underscore-prefixed per this repo's existing unused-param convention (`csv-import.ts`'s `_ctx`).

---

### Stage 3 — `auth-provisioning` lib (extract from csv-import.ts + extend, TDD)

- [x] **F3 — tests (RED)** `netlify/functions/__tests__/auth-provisioning.test.ts`
  - `getOrCreateAuthUser(url, key, email, firstName, lastName)`: POSTs to `${url}/auth/v1/admin/generate_link` with `type: 'magiclink'`; on `resp.ok` + `body.id` present, resolves to `body.id`; on `!resp.ok` or missing `id`, throws with `body.msg ?? body.message ?? 'generateLink failed'` (mirror the 3 existing behaviors from `csv-import.ts`'s current inline function, moved verbatim — this is a pure extraction, not a behavior change).
  - `getUserByEmail(url, key, email)`: GETs `${url}/auth/v1/admin/users?email=<encoded>`; on `resp.ok`, returns the matching user's `id` (case-insensitive email match against `body.users[]`) or `null` if no match; on `!resp.ok`, throws.
  - Both use `vi.stubGlobal('fetch', ...)` per-test, matching `csv-import.test.ts`'s existing fetch-stubbing style.
  - **Verify before relying on this in `/build`:** confirm the local GoTrue admin API actually supports the `?email=` filter on `GET /admin/users` and returns the exact `{ users: [...] }` shape assumed above — hit it directly against the local stack (`npm run db:start`, then a manual `curl`-equivalent via the sandbox or a scratch script) before writing F3's assertions as fact, per the known local-Supabase-API-shape gotcha (Inbucket's REST API previously didn't match upstream docs either).

- [x] **F4 — implementation + `csv-import.ts` refactor**
  Create `netlify/functions/lib/auth-provisioning.ts`:
  ```typescript
  export async function getOrCreateAuthUser(
    supabaseUrl: string,
    serviceRoleKey: string,
    email: string,
    firstName: string,
    lastName: string
  ): Promise<string> {
    // Use raw fetch — the Supabase JS admin client has auth-state bugs after getUser(token).
    // The generated link is never sent; this is silent provisioning only.
    const resp = await fetch(`${supabaseUrl}/auth/v1/admin/generate_link`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${serviceRoleKey}`,
        apikey: serviceRoleKey,
      },
      body: JSON.stringify({
        type: 'magiclink',
        email,
        options: { data: { first_name: firstName, last_name: lastName } },
      }),
    });
    const body = (await resp.json()) as { id?: string; msg?: string; message?: string };
    if (!resp.ok || !body.id) throw new Error(body.msg ?? body.message ?? 'generateLink failed');
    return body.id;
  }

  export async function getUserByEmail(
    supabaseUrl: string,
    serviceRoleKey: string,
    email: string
  ): Promise<string | null> {
    const resp = await fetch(`${supabaseUrl}/auth/v1/admin/users?email=${encodeURIComponent(email)}`, {
      headers: {
        Authorization: `Bearer ${serviceRoleKey}`,
        apikey: serviceRoleKey,
      },
    });
    if (!resp.ok) throw new Error(`getUserByEmail: admin users lookup failed (${resp.status})`);
    const body = (await resp.json()) as { users?: Array<{ id: string; email?: string }> };
    const match = (body.users ?? []).find(u => u.email?.toLowerCase() === email.toLowerCase());
    return match?.id ?? null;
  }
  ```
  Modify `netlify/functions/csv-import.ts`:
  - Add `import { getOrCreateAuthUser } from './lib/auth-provisioning';` to the import block.
  - Delete the inline `getOrCreateAuthUser` function (current lines 251–276) — its call sites (`getOrCreateAuthUser(supabaseUrl, serviceRoleKey, g.email, g.firstName, g.lastName)` and the student-email equivalent) are unchanged since the extracted signature is identical.
  - Run the **existing** `netlify/functions/__tests__/csv-import.test.ts` unmodified → must stay GREEN (pure refactor, no behavior change; those tests already stub `global.fetch`, not the function directly, so extraction is invisible to them).
  Run F3 → GREEN ✓.

---

### Stage 4 — `role-sweep` lib (TDD)

- [x] **F5 — tests (RED)** `netlify/functions/__tests__/role-sweep.test.ts`
  - Grants a `parent`/`org` row for every `family_members.user_id` (deduped) lacking one; grants a `student`/`org` row for every `students.user_id` (HS) lacking one.
  - Skips a `family_members`/`students` row whose `user_id` is `null` (not yet auth-provisioned — edge case from spec, `auth_pending` accounts picked up on next sweep).
  - Idempotent: a user who already has the specific `(role, scope_type='org')` row is excluded from the insert batch even if the source table still lists them (re-run after partial import).
  - `is_active = true` only when the target user has **zero** existing `user_roles` rows before this sweep call (decision #9); `false` when they already hold any other role.
  - Within one sweep call, if the same `user_id` were newly granted by the parent batch, the student batch's `is_active` computation reflects that (sequencing test — construct a client stub where the same id appears in both `family_members` and `students` fixtures).
  - Returns `{ granted_parent: number, granted_student: number }` counting only newly-inserted rows (not skipped/idempotent ones).
  - Emits exactly one `console.log(JSON.stringify({ event: 'role_swept', user_roles_id, role, scope_type }))` per granted row (spy on `console.log`) — assert the logged object has **no** `email`/`name`/PII key (AC#8).
  - Throws (propagates) when the `family_members`/`students`/`user_roles` select or the `user_roles` insert returns a Supabase `error` — mirror `db-ops.ts`'s `throw new Error(...)` pattern.
  - Uses the same `makeClient`/chained-`vi.fn()` mocking style as `db-ops.test.ts`.

- [x] **F6 — implementation** `netlify/functions/lib/role-sweep.ts`
  ```typescript
  import type { SupabaseClient } from '@supabase/supabase-js';

  export interface SweepResult {
    granted_parent: number;
    granted_student: number;
  }

  interface ExistingRoleRow {
    user_id: string;
    role: string;
    scope_type: string;
  }

  export async function runAutoActivationSweep(client: SupabaseClient): Promise<SweepResult> {
    const { data: familyMembers } = await client
      .from('family_members')
      .select('user_id')
      .not('user_id', 'is', null);

    const { data: hsStudents } = await client
      .from('students')
      .select('user_id')
      .not('user_id', 'is', null);

    const parentSourceIds = [...new Set((familyMembers ?? []).map(r => r.user_id as string))];
    const studentSourceIds = [...new Set((hsStudents ?? []).map(r => r.user_id as string))];
    const candidateUserIds = [...new Set([...parentSourceIds, ...studentSourceIds])];

    let existingRoles: ExistingRoleRow[] = [];
    if (candidateUserIds.length > 0) {
      const { data, error } = await client
        .from('user_roles')
        .select('user_id, role, scope_type')
        .in('user_id', candidateUserIds);
      if (error) throw new Error(`runAutoActivationSweep: existing-roles lookup failed: ${error.message}`);
      existingRoles = (data ?? []) as ExistingRoleRow[];
    }

    const hasAnyRole = new Set(existingRoles.map(r => r.user_id));
    const hasParentOrg = new Set(
      existingRoles.filter(r => r.role === 'parent' && r.scope_type === 'org').map(r => r.user_id)
    );
    const hasStudentOrg = new Set(
      existingRoles.filter(r => r.role === 'student' && r.scope_type === 'org').map(r => r.user_id)
    );

    const parentGrants = parentSourceIds.filter(id => !hasParentOrg.has(id));
    const studentGrants = studentSourceIds.filter(id => !hasStudentOrg.has(id));

    const granted_parent = await insertSweepRole(client, parentGrants, 'parent', hasAnyRole);
    const granted_student = await insertSweepRole(client, studentGrants, 'student', hasAnyRole);

    return { granted_parent, granted_student };
  }

  async function insertSweepRole(
    client: SupabaseClient,
    userIds: string[],
    role: 'parent' | 'student',
    hasAnyRole: Set<string>
  ): Promise<number> {
    if (userIds.length === 0) return 0;

    const rows = userIds.map(user_id => ({
      user_id,
      role,
      scope_type: 'org' as const,
      scope_id: null,
      is_active: !hasAnyRole.has(user_id), // decision #9: active only if this is the user's first-ever row
    }));
    for (const row of rows) hasAnyRole.add(row.user_id); // matches the design SQL's per-statement snapshot sequencing

    const { data, error } = await client
      .from('user_roles')
      .insert(rows)
      .select('id, user_id, role, scope_type');
    if (error) throw new Error(`runAutoActivationSweep: ${role} insert failed: ${error.message}`);

    for (const r of data ?? []) {
      console.log(JSON.stringify({ event: 'role_swept', user_roles_id: r.id, role: r.role, scope_type: r.scope_type }));
    }
    return data?.length ?? 0;
  }
  ```
  Run F5 → GREEN ✓.

---

### Stage 5 — `user-role-sweep.ts` handler + `csv-import.ts` wiring (TDD)

- [x] **F7 — handler tests (RED)** `netlify/functions/__tests__/user-role-sweep.test.ts`
  - `Authorization` header absent → `401`.
  - `supabase.auth.getUser` returns error → `401`.
  - `checkAdminRole` (mocked) returns `false` → `403`.
  - `checkAdminRole` `true` → calls `runAutoActivationSweep` (mocked) and returns its result as `200`.
  - Mock `../lib/db-ops` (`checkAdminRole`) and `../lib/role-sweep` (`runAutoActivationSweep`), same style as `csv-import.test.ts`.

- [x] **F8 — handler implementation** `netlify/functions/user-role-sweep.ts`
  ```typescript
  import type { Handler, HandlerEvent, HandlerContext } from '@netlify/functions';
  import { createClient } from '@supabase/supabase-js';
  import { checkAdminRole } from './lib/db-ops';
  import { runAutoActivationSweep } from './lib/role-sweep';

  function json(statusCode: number, body: unknown) {
    return { statusCode, body: JSON.stringify(body) };
  }

  export const handler: Handler = async (event: HandlerEvent, _ctx: HandlerContext) => {
    const supabaseUrl = process.env['EXPO_PUBLIC_SUPABASE_URL'] ?? '';
    const serviceRoleKey = process.env['SUPABASE_SERVICE_ROLE_KEY'] ?? '';
    const client = createClient(supabaseUrl, serviceRoleKey);

    const authHeader = event.headers['authorization'] ?? event.headers['Authorization'] ?? '';
    if (!authHeader.startsWith('Bearer ')) return json(401, { reason: 'missing Authorization header' });

    const token = authHeader.slice(7);
    const { data: authData, error: authError } = await client.auth.getUser(token);
    if (authError || !authData?.user) return json(401, { reason: 'invalid or expired token' });

    const isAdmin = await checkAdminRole(client, authData.user.id);
    if (!isAdmin) return json(403, { reason: 'caller does not hold admin role' });

    const result = await runAutoActivationSweep(client);
    return json(200, result);
  };
  ```
  Run F7 → GREEN ✓.

- [x] **F9 — wire sweep into `csv-import.ts` (regression test + implementation)**
  - Add one new test case to `netlify/functions/__tests__/csv-import.test.ts`: mock `../lib/role-sweep` (`vi.mock('../lib/role-sweep', () => ({ runAutoActivationSweep: vi.fn() }))`), assert it's called exactly once after a successful (`200`/`207`) import, and that the `ImportResponse` body shape is byte-for-byte unchanged (design spec: "response shape is unchanged; the sweep runs but its counts aren't surfaced"). Run → RED (not called yet).
  - Modify `netlify/functions/csv-import.ts`: add `import { runAutoActivationSweep } from './lib/role-sweep';`; add `await runAutoActivationSweep(client);` immediately after the closing brace of the `for (const [familyRef, groupRows] of familyGroups)` loop in Phase 3 (i.e. right before the `const status = auth_pending.length === 0 ...` line), discarding its return value.
  - Run full `csv-import.test.ts` suite → GREEN ✓ (including all pre-existing cases, still passing unmodified).

---

### Stage 6 — `user-role-grant.ts` handler (TDD)

- [x] **F10 — handler tests (RED)** `netlify/functions/__tests__/user-role-grant.test.ts`
  - `Authorization` header absent → `401`.
  - `supabase.auth.getUser` errors → `401`.
  - Caller has no active `user_roles` row (`maybeSingle` returns `null`) → `403` "caller holds no active role".
  - Caller's active role is `student`/`parent`/`teacher` (tier 0) → `403` "caller's active role cannot grant/revoke".
  - `action` missing/invalid (not `'grant'`/`'revoke'`) → `422`.
  - `role` missing/invalid → `422`.
  - `scope_type` missing/invalid → `422`.
  - `scope_type` doesn't match `ROLE_SCOPE_TYPE[role]` (e.g. `role:'teacher', scope_type:'org'`) → `422`.
  - `scope_type:'org'` with a non-null `scope_id` present → `422`.
  - `scope_type:'class'` with `scope_id` missing or not a UUID → `422`.
  - Grant: both `target_email` and `target_user_id` given → `422`; neither given → `422`.
  - Revoke: `user_roles_id` and a tuple (`target_email`) both given → `422`; neither given → `422`.
  - Revoke by `user_roles_id` that doesn't exist (`maybeSingle` → `null`) → `200 { status: 'noop' }`, and `isGrantAllowed`/tiering is asserted **not called** (no existence leak, per spec Phase 2).
  - Revoke by tuple where `getUserByEmail` (mocked) resolves `null` → `200 { status: 'noop' }`.
  - Revoke by tuple where the user exists but the exact `(role, scope_type, scope_id)` row doesn't → `200 { status: 'noop' }`.
  - Tiering violation (e.g. caller `coordinator` tier 1 granting `role:'coordinator'`) → `403`.
  - Self-escalation (caller `admin`, `target_user_id === caller.user_id`, `role:'admin'`) → `403`.
  - Self-target of a strictly-lower-tier role succeeds (caller `bv_coordinator`, self-target `role:'coordinator'`) → `200 { status: 'granted' }` (confirms the resolved literal-formula interpretation end-to-end, not just at the `role-tiering` unit level).
  - Coordinator grants `role:'teacher'` for a class whose `session_id` (mocked `classes` lookup) does not equal the caller's own active `scope_id` → `403`.
  - Coordinator grants `role:'teacher'` for a class inside their own session → `200 { status: 'granted' }`.
  - Coordinator grants `role:'student'` (no session dimension) → session-containment check is skipped entirely (assert the `classes` table is never queried).
  - Grant with `target_email` for a brand-new email → `getOrCreateAuthUser` (mocked) is called, its resolved id is passed to `insert_user_role_grant` (assert `client.rpc` call args).
  - Grant with `target_user_id` → `getOrCreateAuthUser` is **not** called.
  - `insert_user_role_grant` RPC (mocked `client.rpc`) returns a new uuid → `200 { status: 'granted', user_roles_id }`, `console.log` called once with `{ event: 'role_granted', ... }` and no PII.
  - `insert_user_role_grant` RPC returns `null` (duplicate) → `200 { status: 'noop' }`, no `console.log` call.
  - `is_active` computed correctly: mock the pre-insert count query to return `0` → RPC called with `p_is_active: true`; count `>0` → `p_is_active: false` (covers the "target email belongs to an existing account with a different existing role" edge case — the new row is added, `is_active` stays `false` since the user already has ≥1 row).
  - Revoke by `user_roles_id` that resolves → `.delete().eq('id', ...)` (mocked) returns a row → `200 { status: 'revoked', user_roles_id }`, one `console.log` with `{ event: 'role_revoked', ... }`.
  - No test scenario's `console.log` mock call ever contains the literal test email string (PII-free assertion, AC#8).

- [x] **F11 — handler implementation** `netlify/functions/user-role-grant.ts`
  ```typescript
  import type { Handler, HandlerEvent, HandlerContext } from '@netlify/functions';
  import { createClient } from '@supabase/supabase-js';
  import { getOrCreateAuthUser, getUserByEmail } from './lib/auth-provisioning';
  import { ROLE_SCOPE_TYPE, tierOf, isGrantAllowed, type AppRole, type AppScopeType } from './lib/role-tiering';

  function json(statusCode: number, body: unknown) {
    return { statusCode, body: JSON.stringify(body) };
  }

  const VALID_ROLES = new Set<AppRole>(['student', 'parent', 'teacher', 'coordinator', 'bv_coordinator', 'admin']);
  const VALID_SCOPE_TYPES = new Set<AppScopeType>(['org', 'center', 'session', 'class']);
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  interface GrantRequestBody {
    action?: string;
    role?: string;
    scope_type?: string;
    scope_id?: string | null;
    target_email?: string;
    target_user_id?: string;
    user_roles_id?: string;
  }

  export const handler: Handler = async (event: HandlerEvent, _ctx: HandlerContext) => {
    const supabaseUrl = process.env['EXPO_PUBLIC_SUPABASE_URL'] ?? '';
    const serviceRoleKey = process.env['SUPABASE_SERVICE_ROLE_KEY'] ?? '';
    const client = createClient(supabaseUrl, serviceRoleKey);

    // ── Phase 0: Auth + tiering lookup ──────────────────────────────────────────
    const authHeader = event.headers['authorization'] ?? event.headers['Authorization'] ?? '';
    if (!authHeader.startsWith('Bearer ')) return json(401, { reason: 'missing Authorization header' });

    const token = authHeader.slice(7);
    const { data: authData, error: authError } = await client.auth.getUser(token);
    if (authError || !authData?.user) return json(401, { reason: 'invalid or expired token' });
    const callerUserId = authData.user.id;

    const { data: callerRoleRow, error: callerRoleError } = await client
      .from('user_roles')
      .select('role, scope_type, scope_id')
      .eq('user_id', callerUserId)
      .eq('is_active', true)
      .maybeSingle();
    if (callerRoleError || !callerRoleRow) return json(403, { reason: 'caller holds no active role' });

    const callerRole = callerRoleRow.role as AppRole;
    const callerScopeId = callerRoleRow.scope_id as string | null;
    const callerTier = tierOf(callerRole);
    if (callerTier === 0) return json(403, { reason: "caller's active role cannot grant/revoke" });

    // ── Phase 1: Parse + validate request (no writes) ────────────────────────────
    let body: GrantRequestBody;
    try {
      body = JSON.parse(event.body ?? '{}') as GrantRequestBody;
    } catch {
      return json(422, { reason: 'malformed JSON body' });
    }
    const { action, role, scope_type, scope_id, target_email, target_user_id, user_roles_id } = body;

    if (action !== 'grant' && action !== 'revoke') return json(422, { reason: "action must be 'grant' or 'revoke'" });
    if (!role || !VALID_ROLES.has(role as AppRole)) return json(422, { reason: 'invalid or missing role' });
    if (!scope_type || !VALID_SCOPE_TYPES.has(scope_type as AppScopeType)) return json(422, { reason: 'invalid or missing scope_type' });

    const targetRole = role as AppRole;
    const targetScopeType = scope_type as AppScopeType;

    if (targetScopeType !== ROLE_SCOPE_TYPE[targetRole]) {
      return json(422, { reason: `role "${targetRole}" requires scope_type "${ROLE_SCOPE_TYPE[targetRole]}"` });
    }
    if (targetScopeType === 'org') {
      if (scope_id != null) return json(422, { reason: 'scope_id must be absent/null when scope_type is "org"' });
    } else if (!scope_id || !UUID_RE.test(scope_id)) {
      return json(422, { reason: 'scope_id must be a valid UUID when scope_type is not "org"' });
    }

    if (action === 'grant') {
      if (!!target_email === !!target_user_id) return json(422, { reason: 'grant requires exactly one of target_email or target_user_id' });
    } else {
      const hasRowId = !!user_roles_id;
      const hasTuple = !!(target_email || target_user_id);
      if (hasRowId === hasTuple) return json(422, { reason: 'revoke requires exactly one of user_roles_id, or a target (email/user_id)' });
      if (hasTuple && !!target_email === !!target_user_id) return json(422, { reason: 'revoke by tuple requires exactly one of target_email or target_user_id' });
    }

    // ── Phase 2: Resolve target user + target row (no writes yet) ────────────────
    let targetUserId: string;
    let resolvedRowId: string | null = null;

    if (action === 'grant') {
      targetUserId = target_user_id
        ? target_user_id
        : await getOrCreateAuthUser(supabaseUrl, serviceRoleKey, target_email!, '', '');
    } else if (user_roles_id) {
      const { data: row } = await client
        .from('user_roles')
        .select('id, user_id, role, scope_type, scope_id')
        .eq('id', user_roles_id)
        .maybeSingle();
      if (!row) return json(200, { status: 'noop' });
      resolvedRowId = row.id as string;
      targetUserId = row.user_id as string;
    } else {
      const lookedUpId = target_user_id ?? (await getUserByEmail(supabaseUrl, serviceRoleKey, target_email!));
      if (!lookedUpId) return json(200, { status: 'noop' });
      targetUserId = lookedUpId;

      let query = client
        .from('user_roles')
        .select('id')
        .eq('user_id', targetUserId)
        .eq('role', targetRole)
        .eq('scope_type', targetScopeType);
      query = targetScopeType === 'org' ? query.is('scope_id', null) : query.eq('scope_id', scope_id!);
      const { data: row } = await query.maybeSingle();
      if (!row) return json(200, { status: 'noop' });
      resolvedRowId = row.id as string;
    }

    // ── Phase 3: Tiering + scope containment ──────────────────────────────────────
    if (!isGrantAllowed(callerRole, callerTier, callerScopeId, targetRole, targetUserId, callerUserId)) {
      return json(403, { reason: 'tiering violation' });
    }
    if (callerRole === 'coordinator' && targetRole === 'teacher') {
      const { data: classRow } = await client.from('classes').select('session_id').eq('id', scope_id!).maybeSingle();
      if (!classRow || classRow.session_id !== callerScopeId) {
        return json(403, { reason: "target class is outside the coordinator's own active session" });
      }
    }

    // ── Phase 4: Execute ───────────────────────────────────────────────────────────
    if (action === 'grant') {
      const { count } = await client
        .from('user_roles')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', targetUserId);
      const isFirstRoleEver = (count ?? 0) === 0;

      const { data: newId, error } = await client.rpc('insert_user_role_grant', {
        p_user_id: targetUserId,
        p_role: targetRole,
        p_scope_type: targetScopeType,
        p_scope_id: targetScopeType === 'org' ? null : scope_id,
        p_is_active: isFirstRoleEver,
      });
      if (error) return json(500, { reason: 'grant failed' });
      if (!newId) return json(200, { status: 'noop' });

      console.log(JSON.stringify({ event: 'role_granted', user_roles_id: newId, role: targetRole, scope_type: targetScopeType, actor_role: callerRole }));
      return json(200, { status: 'granted', user_roles_id: newId });
    }

    const { data: deleted, error: deleteError } = await client
      .from('user_roles')
      .delete()
      .eq('id', resolvedRowId!)
      .select('id');
    if (deleteError) return json(500, { reason: 'revoke failed' });
    if (!deleted || deleted.length === 0) return json(200, { status: 'noop' });

    console.log(JSON.stringify({ event: 'role_revoked', user_roles_id: resolvedRowId, role: targetRole, scope_type: targetScopeType, actor_role: callerRole }));
    return json(200, { status: 'revoked', user_roles_id: resolvedRowId });
  };
  ```
  Note: `getOrCreateAuthUser` is called with `firstName: ''`, `lastName: ''` — unlike `csv-import.ts`'s call site, the grant request body carries no name fields (API contract has only `target_email`/`target_user_id`), so there's no name data available to pass here; this is intentional, not an oversight.
  Run F10 → GREEN ✓.

---

### Stage 7 — Wiring + typecheck + local smoke

- [x] **F12 — `netlify.toml` annotation**
  ```toml
  [functions.user-role-sweep]
    # US-East region (compliance perimeter §3/§7.2) — same as health/csv-import.
    # Holds the service-role key; never add EXPO_PUBLIC_* secrets here.

  [functions.user-role-grant]
    # US-East region (compliance perimeter §3/§7.2) — same as health/csv-import.
    # Holds the service-role key; never add EXPO_PUBLIC_* secrets here.
  ```
  Insert after the existing `[functions.csv-import]` block.

- [x] **F13 — Typecheck** `npm run typecheck` → zero errors.

- [x] **F14 — Local smoke** (prerequisite: Docker + `npm run dev` running; requires an Admin session token and a Coordinator session token, obtainable via the local Inbucket magic-link flow already used for `csv-import`'s smoke test)
  - POST `{action:'grant', role:'teacher', scope_type:'class', scope_id:<a real class id>, target_email:'smoke-teacher@example.test'}` to `http://localhost:8888/api/user-role-grant` with an Admin token → expect `200 { status: 'granted', user_roles_id }`.
  - Re-POST the identical body → expect `200 { status: 'noop' }` (idempotent duplicate).
  - POST the same body with a Coordinator token whose active `scope_id` is a *different* session's coordinator → expect `403`.
  - POST `http://localhost:8888/api/user-role-sweep` with an Admin token after importing a CSV with at least one guardian → expect `200 { granted_parent: >0, granted_student: >=0 }`; re-POST → expect `200 { granted_parent: 0, granted_student: 0 }`.

---

## Files created / modified

| File | Action |
|---|---|
| `supabase/tests/130_user_role_write_path.sql` | **new** — pgTAP: unique index + RPC idempotency |
| `supabase/migrations/<ts>_user_roles_grant_identity_idx.sql` | **new** — unique index + `insert_user_role_grant` RPC |
| `supabase/migrations/<ts>_user_role_write_service_role_grants.sql` | **new** — `service_role` INSERT/DELETE on `user_roles`, EXECUTE on the RPC |
| `netlify/functions/lib/role-tiering.ts` | **new** — `TIER`, `ROLE_SCOPE_TYPE`, `tierOf`, `isGrantAllowed` |
| `netlify/functions/lib/auth-provisioning.ts` | **new** — `getOrCreateAuthUser` (extracted), `getUserByEmail` |
| `netlify/functions/lib/role-sweep.ts` | **new** — `runAutoActivationSweep` |
| `netlify/functions/user-role-sweep.ts` | **new** — HTTP wrapper (Part A) |
| `netlify/functions/user-role-grant.ts` | **new** — manual grant/revoke handler (Part B) |
| `netlify/functions/csv-import.ts` | **modify** — remove inline `getOrCreateAuthUser`, import from lib, call `runAutoActivationSweep` post-Phase-3 |
| `netlify/functions/__tests__/role-tiering.test.ts` | **new** |
| `netlify/functions/__tests__/auth-provisioning.test.ts` | **new** |
| `netlify/functions/__tests__/role-sweep.test.ts` | **new** |
| `netlify/functions/__tests__/user-role-sweep.test.ts` | **new** |
| `netlify/functions/__tests__/user-role-grant.test.ts` | **new** |
| `netlify/functions/__tests__/csv-import.test.ts` | **modify** — add sweep-invocation regression case |
| `netlify.toml` | **modify** — add `[functions.user-role-sweep]`, `[functions.user-role-grant]` |

---

## Architectural flags

None. The self-target formula ambiguity (design decision #1's code vs. prose) was resolved with the project owner before this plan was finalized (see "Self-target rule" above) — a clarification of an already-ADR-sanctioned formula, not a new decision, so no bounce to `/architect`.

## Hand-off sequence

`/migration` → M1–M4 (pgTAP RED → migrations → GREEN).
`/build` → F1–F14 in the TDD order above (Stages 2–6 may be built in parallel once Stage 1 is signed off — all mocked, no DB dependency).
`/test` → adversarial integration pass per ADR-0024 Consequences: every caller-tier × target-role combination including the self-target case (AC#6), Coordinator session containment (AC#7), duplicate-grant idempotency, and revoke-of-nonexistent-row no-op — against the real local stack, not mocks.
