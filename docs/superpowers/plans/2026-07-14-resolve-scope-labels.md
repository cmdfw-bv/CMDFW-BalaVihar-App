# Resolve scope_id to a friendly Center/Session/Class label (issue #35) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the raw `scope_type` shown in `RoleSwitcher`/`AppHeader` (e.g. "Coordinator · Session") with a real, human-readable Center/Session/Class name (e.g. "Coordinator · Frisco · F3") for every role a user holds — not just their currently-active one.

**Architecture:** A new `SECURITY DEFINER` Postgres RPC, `resolve_my_scope_labels()`, keyed only on `auth.uid()` (not the JWT's `active_role`/`scope_type`/`scope_id` claims), returns a `(user_roles_id, scope_label)` row per `user_roles` row the caller owns, with the label pre-joined from `classes`/`sessions`/`centers`. This sidesteps the fact that the existing per-active-role RLS policies on `classes`/`sessions`/`centers` only let a role read its own scope while that role is the JWT's active one — but `RoleSwitcher`'s bottom sheet lists *every* held role, including inactive ones. `SessionProvider` fetches this alongside `myRoles`, merges by id, and exposes both a per-row `scope_label` and the active role's resolved `scopeLabel` on context. `appHeaderSubtitle()` gets an optional third parameter that, when a resolved label exists, replaces the capitalized `scope_type` fallback it already produces.

**Tech Stack:** Supabase CLI (Postgres 17 locally), pgTAP (`extensions.pgtap`) via `npx supabase test db`, plain SQL/PL-pgSQL. `@supabase/supabase-js` (existing), vitest (existing) for the TS-level pure-function tests.

## Global Constraints

- **Access control is RLS/SECURITY DEFINER in the database, never the client** (project constitution §12.1 #1). The new RPC only ever returns rows the caller already owns (`ur.user_id = auth.uid()`), matching the existing `switch_active_role`/`is_family_member` pattern.
- **No secrets or PII in client code** (§12.1 #2). Center/session/class names are operational metadata, not PII — no change to this rule's scope.
- **Schema is code** (§12.1 #3): the new function is a timestamped migration in `supabase/migrations/`, never applied via Studio.
- **TDD is non-negotiable** (§12.1 #4): write the failing test first (pgTAP for the RPC, vitest for `appHeaderSubtitle`), confirm Red, then implement.
- **Every migration ships with a matching pgTAP test** in `supabase/tests/` (`.claude/rules/supabase-sql.md`).
- **RLS/auth-hook style:** `language sql stable security definer set search_path = public`, `revoke all ... from public; grant execute ... to authenticated;` — the exact shape of `is_family_member`/`switch_active_role` (`supabase/migrations/20260709032818_core_operational_rls_policies.sql`, `supabase/migrations/20260711042538_switch_active_role_rpc.sql`).
- **Design-system DoD** (`.claude/rules/design-system.md`): role badge + scope label continues to render on role-specific UI; no new hex/spacing literals introduced (this plan touches no styling).
- **Scope depth decision (human-validated for this plan):** teacher → `"{Center} · {Session} · {Class}"`; coordinator → `"{Center} · {Session}"`; bv_coordinator/admin/parent/student (`scope_type='org'`, no `scope_id`) are unchanged — they keep falling back to the existing capitalized-`scope_type` label ("Org").

---

## File Structure

- **Create** `supabase/migrations/20260714224917_resolve_my_scope_labels_rpc.sql` — the new RPC.
- **Create** `supabase/tests/150_scope_label_resolution_rpc.sql` — pgTAP coverage (ownership scoping, active-role-independence, multi-role resolution).
- **Modify** `components/appHeaderSubtitle.ts` — add optional `scopeLabel` parameter.
- **Modify** `components/__tests__/appHeaderSubtitle.test.ts` — new cases for the resolved-label path.
- **Modify** `lib/auth/SessionProvider.tsx` — fetch `resolve_my_scope_labels()` alongside `myRoles`, merge, expose `scopeLabel` on context.
- **Modify** `components/AppHeader.tsx` — pass `scopeLabel` through.
- **Modify** `components/RoleSwitcher.tsx` — pass `scopeLabel`/`r.scope_label` through for the active chip and every sheet row.
- **Modify** `.docs/specs/system/client-auth-session-and-nav.md` — correct the AC#6 line now that #35 is resolved.
- **Modify** `.docs/specs/system/client-auth-session-and-nav.plan.md` — close out the #35 follow-up entry with a new dated section.

---

### Task 1: `resolve_my_scope_labels()` RPC + pgTAP coverage

**Files:**
- Create: `supabase/tests/150_scope_label_resolution_rpc.sql`
- Create: `supabase/migrations/20260714224917_resolve_my_scope_labels_rpc.sql`

**Interfaces:**
- Consumes: `centers(id, name)`, `sessions(id, center_id, name)`, `classes(id, session_id, name)`, `user_roles(id, user_id, role, scope_type, scope_id, is_active)` — all pre-existing (`supabase/migrations/20260709032506_core_operational_schema.sql`, `20260709033959_user_roles_catalog.sql`). `tests.create_supabase_user(email text) returns uuid` and `tests.authenticate_as(user_id uuid, role text, scope_type text default null, scope_id uuid default null) returns void` — pre-existing test helpers (`supabase/migrations/20260709022932_enable_pgtap_and_test_helpers.sql`).
- Produces: `public.resolve_my_scope_labels() returns table (user_roles_id uuid, scope_label text)` — consumed by Task 3 (`SessionProvider.tsx`) via `supabase.rpc("resolve_my_scope_labels")`.

- [ ] **Step 1: Write the failing pgTAP test**

Create `supabase/tests/150_scope_label_resolution_rpc.sql`:

```sql
begin;
select plan(8);

-- Fixture: Center Brampton -> Session Sunday AM -> Class Junior A.
select gen_random_uuid() as v_center \gset
select gen_random_uuid() as v_session \gset
select gen_random_uuid() as v_class \gset
insert into centers (id, name) values (:'v_center'::uuid, 'Brampton');
insert into sessions (id, center_id, name, start_date, end_date)
  values (:'v_session'::uuid, :'v_center'::uuid, 'Sunday AM', '2026-01-11', '2026-05-24');
insert into classes (id, session_id, name, grade_band)
  values (:'v_class'::uuid, :'v_session'::uuid, 'Junior A', 'Gr3');

-- Fixture: user M holds three roles at once (teacher/class, coordinator/session,
-- bv_coordinator/org) -- only the coordinator row is marked active. The RPC must still
-- resolve labels for ALL three, not just the active one (that's the whole point of a
-- SECURITY DEFINER function keyed on auth.uid() rather than the JWT's active_role claim).
select tests.create_supabase_user('scope-labels-m@test.local') as v_m \gset
insert into user_roles (id, user_id, role, scope_type, scope_id, is_active) values
  ('90000003-0000-0000-0000-00000000000a', :'v_m'::uuid, 'teacher', 'class', :'v_class'::uuid, false),
  ('90000003-0000-0000-0000-00000000000b', :'v_m'::uuid, 'coordinator', 'session', :'v_session'::uuid, true),
  ('90000003-0000-0000-0000-00000000000c', :'v_m'::uuid, 'bv_coordinator', 'org', null, false);

-- Fixture: unrelated user O, own teacher grant on a different class.
select gen_random_uuid() as v_other_class \gset
insert into classes (id, session_id, name, grade_band)
  values (:'v_other_class'::uuid, :'v_session'::uuid, 'Senior B', 'Gr9');
select tests.create_supabase_user('scope-labels-o@test.local') as v_o \gset
insert into user_roles (id, user_id, role, scope_type, scope_id, is_active) values
  ('90000003-0000-0000-0000-00000000000d', :'v_o'::uuid, 'teacher', 'class', :'v_other_class'::uuid, true);

-- Case 1: M, authenticated with coordinator (the table's actually-active role), gets all 3 of M's own rows back.
select tests.authenticate_as(:'v_m'::uuid, 'coordinator', 'session', :'v_session'::uuid);
select is(
  (select count(*) from resolve_my_scope_labels())::int, 3,
  'case 1: RPC returns all of the caller''s own roles, not just the active one'
);
select is(
  (select scope_label from resolve_my_scope_labels() where user_roles_id = '90000003-0000-0000-0000-00000000000a'),
  'Brampton · Sunday AM · Junior A',
  'case 1: teacher (class scope) resolves to Center · Session · Class'
);
select is(
  (select scope_label from resolve_my_scope_labels() where user_roles_id = '90000003-0000-0000-0000-00000000000b'),
  'Brampton · Sunday AM',
  'case 1: coordinator (session scope) resolves to Center · Session'
);
select is(
  (select scope_label from resolve_my_scope_labels() where user_roles_id = '90000003-0000-0000-0000-00000000000c'),
  null,
  'case 1: bv_coordinator (org scope) resolves to null -- client falls back to "Org"'
);
select tests.clear_authentication();

-- Case 2: same user M, authenticated as a DIFFERENT held role (teacher, not the table's active
-- coordinator row) gets the identical 3-row result -- proves resolution is keyed on auth.uid()
-- ownership, not the JWT's active_role/scope claims.
select tests.authenticate_as(:'v_m'::uuid, 'teacher', 'class', :'v_class'::uuid);
select is(
  (select count(*) from resolve_my_scope_labels())::int, 3,
  'case 2: result set is identical regardless of which held role is the JWT''s active_role'
);
select tests.clear_authentication();

-- Case 3: unrelated user O only ever sees their own single row -- never M's rows.
select tests.authenticate_as(:'v_o'::uuid, 'teacher', 'class', :'v_other_class'::uuid);
select is(
  (select count(*) from resolve_my_scope_labels())::int, 1,
  'case 3: unrelated caller O sees exactly their own one row'
);
select is(
  (select scope_label from resolve_my_scope_labels() limit 1),
  'Brampton · Sunday AM · Senior B',
  'case 3: O''s own teacher row resolves correctly'
);
select tests.clear_authentication();

-- Case 4: a signed-out / sub-less caller gets zero rows, not an error and not every row in the table.
select set_config('request.jwt.claims', '{"role":"authenticated"}', true);
select set_config('role', 'authenticated', true);
select is(
  (select count(*) from resolve_my_scope_labels())::int, 0,
  'case 4: a sub-less authenticated session resolves zero rows (auth.uid() is null, matches nothing)'
);
select tests.clear_authentication();

select * from finish();
rollback;
```

- [ ] **Step 2: Run the test suite to verify it fails**

Run: `npx supabase test db`
Expected: FAIL — `150_scope_label_resolution_rpc.sql` errors with `function resolve_my_scope_labels() does not exist` (the migration hasn't been written yet).

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/20260714224917_resolve_my_scope_labels_rpc.sql`:

```sql
-- Resolves scope_id to a friendly Center/Session/Class name for every user_roles row the
-- caller owns (issue #35). SECURITY DEFINER, keyed on auth.uid() rather than the JWT's
-- active_role/scope_type/scope_id claims: the existing per-active-role RLS on
-- classes/sessions/centers only lets a role read its own scope while that role is
-- currently active, but the role-switcher's bottom sheet must show a label for every held
-- role simultaneously, including inactive ones. Matches the is_family_member /
-- switch_active_role precedent (core_operational_rls_policies.sql,
-- switch_active_role_rpc.sql) for this exact "bypass RLS, but only for the caller's own
-- rows" shape.
create or replace function public.resolve_my_scope_labels()
returns table (user_roles_id uuid, scope_label text)
language sql
stable
security definer
set search_path = public
as $$
  select
    ur.id as user_roles_id,
    case ur.scope_type
      when 'class' then (
        select ce.name || ' · ' || se.name || ' · ' || cl.name
        from classes cl
        join sessions se on se.id = cl.session_id
        join centers ce on ce.id = se.center_id
        where cl.id = ur.scope_id
      )
      when 'session' then (
        select ce.name || ' · ' || se.name
        from sessions se
        join centers ce on ce.id = se.center_id
        where se.id = ur.scope_id
      )
      when 'center' then (
        select ce.name from centers ce where ce.id = ur.scope_id
      )
      else null
    end as scope_label
  from user_roles ur
  where ur.user_id = auth.uid();
$$;

revoke all on function public.resolve_my_scope_labels() from public;
grant execute on function public.resolve_my_scope_labels() to authenticated;
```

- [ ] **Step 4: Run the test suite to verify it passes**

Run: `npx supabase db reset && npx supabase test db`
Expected: `150_scope_label_resolution_rpc.sql` shows `1..8` all `ok`, and the full suite (000–150, 19 files) is green.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260714224917_resolve_my_scope_labels_rpc.sql supabase/tests/150_scope_label_resolution_rpc.sql
git commit -m "feat(db): resolve_my_scope_labels RPC for friendly Center/Session/Class labels (issue #35)"
```

---

### Task 2: `appHeaderSubtitle()` resolved-label parameter

**Files:**
- Modify: `components/appHeaderSubtitle.ts:10-15`
- Test: `components/__tests__/appHeaderSubtitle.test.ts`

**Interfaces:**
- Consumes: nothing new (pure function).
- Produces: `appHeaderSubtitle(activeRole: string | null, scopeType: string | null, scopeLabel?: string | null): string` — the third parameter is optional and additive, so every existing 2-arg call site keeps its current behavior unchanged. Consumed by Task 4 (`AppHeader.tsx`, `RoleSwitcher.tsx`).

- [ ] **Step 1: Write the failing tests**

Add to `components/__tests__/appHeaderSubtitle.test.ts` (append inside the existing `describe` block, after the last `it`):

```ts
  it('resolved scope label overrides the capitalized scope_type: "Teacher · Frisco · F3 · Shishu Vihaar Class"', () =>
    expect(appHeaderSubtitle('teacher', 'class', 'Frisco · F3 · Shishu Vihaar Class')).toBe(
      'Teacher · Frisco · F3 · Shishu Vihaar Class'
    ));
  it('null resolved label (org-scoped role, nothing to resolve) falls back to capitalized scope_type: "Admin · Org"', () =>
    expect(appHeaderSubtitle('admin', 'org', null)).toBe('Admin · Org'));
  it('resolved label is ignored when there is no active role: empty string', () =>
    expect(appHeaderSubtitle(null, null, 'Frisco · F3')).toBe(''));
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run components/__tests__/appHeaderSubtitle.test.ts`
Expected: FAIL — the first new case gets `'Teacher · Class'` (raw capitalized `scope_type`) instead of `'Teacher · Frisco · F3 · Shishu Vihaar Class'`, because `appHeaderSubtitle` doesn't accept/use a third argument yet.

- [ ] **Step 3: Implement**

Replace `components/appHeaderSubtitle.ts` lines 10-15:

```ts
export function appHeaderSubtitle(
  activeRole: string | null,
  scopeType: string | null,
  scopeLabel?: string | null
): string {
  if (!activeRole) return "";
  const roleLabel = ROLE_LABEL[activeRole] ?? activeRole;
  const resolvedScope = scopeLabel ?? (scopeType ? scopeType.charAt(0).toUpperCase() + scopeType.slice(1) : "");
  return resolvedScope ? `${roleLabel} · ${resolvedScope}` : roleLabel;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run components/__tests__/appHeaderSubtitle.test.ts`
Expected: PASS, all 8 cases (5 existing + 3 new) green.

- [ ] **Step 5: Commit**

```bash
git add components/appHeaderSubtitle.ts components/__tests__/appHeaderSubtitle.test.ts
git commit -m "feat: appHeaderSubtitle accepts a resolved scope label, falls back to scope_type (issue #35)"
```

---

### Task 3: `SessionProvider` fetches + merges resolved labels

**Files:**
- Modify: `lib/auth/SessionProvider.tsx:8-97`

**Interfaces:**
- Consumes: `public.resolve_my_scope_labels()` (Task 1) via `supabase.rpc("resolve_my_scope_labels")`, returning rows shaped `{ user_roles_id: string; scope_label: string | null }`.
- Produces: `RoleRow` gains a `scope_label: string | null` field (consumed by Task 4's `RoleSwitcher.tsx` per-row rendering). `SessionContextValue` gains `scopeLabel: string | null` (consumed by Task 4's `AppHeader.tsx` and the active-chip label in `RoleSwitcher.tsx`) — the active role's own resolved label, or `null` if none.

This task has no dedicated unit test file — matches the existing project convention that `SessionProvider`'s wiring is verified live via `playwright-cli` at `/test`, not mocked (see `components/__tests__/appHeaderSubtitle.test.ts:5`'s own comment: "`AppHeader.tsx`'s JSX render is wiring, verified live via playwright-cli at `/test`"). The two things that need real test coverage here — the RPC's correctness and the label-formatting logic — are already covered by Task 1 (pgTAP) and Task 2 (vitest). This task is pure plumbing between them: fetch, merge by id, expose on context. Skipping straight to implementation matches how `myRoles` itself is wired one field at a time above it, with no separate test.

- [ ] **Step 1: Extend `RoleRow` and `SessionContextValue`**

In `lib/auth/SessionProvider.tsx`, replace lines 8-22:

```ts
interface RoleRow {
  id: string;
  role: string;
  scope_type: string;
  scope_id: string | null;
  is_active: boolean;
  scope_label: string | null;
}

interface ScopeLabelRow {
  user_roles_id: string;
  scope_label: string | null;
}

interface SessionContextValue extends Omit<DerivedSession, "status"> {
  status: SessionStatus | "loading";
  scopeLabel: string | null;
  session: Session | null;
  myRoles: RoleRow[];
  signOut: () => Promise<void>;
  switchRole: (userRolesId: string) => Promise<void>;
}
```

- [ ] **Step 2: Fetch and merge scope labels in `refresh()`**

Replace lines 44-51 (the `if (nextSession) { ... } else { ... }` block inside `refresh`):

```ts
    // Refetched on every SIGNED_IN/TOKEN_REFRESHED, not cached across the session (Design
    // spec, "Role list (myRoles)") — a grant/revoke elsewhere is picked up on next refresh.
    if (nextSession) {
      const [{ data: roles }, { data: labels }] = await Promise.all([
        supabase.from("user_roles").select("id, role, scope_type, scope_id, is_active"),
        supabase.rpc("resolve_my_scope_labels"),
      ]);
      const labelById = new Map(
        ((labels ?? []) as ScopeLabelRow[]).map((l) => [l.user_roles_id, l.scope_label])
      );
      setMyRoles(
        ((roles ?? []) as Omit<RoleRow, "scope_label">[]).map((r) => ({
          ...r,
          scope_label: labelById.get(r.id) ?? null,
        }))
      );
    } else {
      setMyRoles([]);
    }
```

- [ ] **Step 3: Expose `scopeLabel` on context**

In the `useMemo<SessionContextValue>` block (current lines 81-97), add `scopeLabel` alongside the existing `scopeType`/`scopeId`:

```ts
  const value = useMemo<SessionContextValue>(() => ({
    status: derived?.status ?? "loading",
    activeRole: derived?.activeRole ?? null,
    scopeType: derived?.scopeType ?? null,
    scopeId: derived?.scopeId ?? null,
    scopeLabel: myRoles.find((r) => r.is_active)?.scope_label ?? null,
    session,
    myRoles,
    async signOut() {
      await supabase.auth.signOut();
    },
    async switchRole(userRolesId: string) {
      // No optimistic flip (refine-stage no-op edge case) — the switcher reflects only what
      // refreshSession() actually returns, via the TOKEN_REFRESHED listener above.
      await supabase.rpc("switch_active_role", { p_user_roles_id: userRolesId });
      await supabase.auth.refreshSession();
    },
  }), [derived, session, myRoles]);
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: errors in `AppHeader.tsx`/`RoleSwitcher.tsx` calling `appHeaderSubtitle` with the old 2-arg shape are fine (the third param is optional) — expect this step to pass with **zero** errors, since nothing yet reads the new `scopeLabel`/`scope_label` fields incorrectly. If it does error, it will point at `SessionProvider.tsx` itself; fix before proceeding.

- [ ] **Step 5: Commit**

```bash
git add lib/auth/SessionProvider.tsx
git commit -m "feat: SessionProvider resolves and exposes friendly scope labels (issue #35)"
```

---

### Task 4: Wire `scopeLabel` through `AppHeader` and `RoleSwitcher`

**Files:**
- Modify: `components/AppHeader.tsx:17-19`
- Modify: `components/RoleSwitcher.tsx:33-38,100`

**Interfaces:**
- Consumes: `useSession().scopeLabel: string | null` and `RoleRow.scope_label: string | null` (Task 3), `appHeaderSubtitle(activeRole, scopeType, scopeLabel?)` (Task 2).
- Produces: nothing further downstream — this is the final rendering seam.

- [ ] **Step 1: Update `AppHeader.tsx`**

Replace `components/AppHeader.tsx` lines 17-19:

```ts
export default function AppHeader({ showSwitcher = false }: AppHeaderProps) {
  const { activeRole, scopeType, scopeLabel } = useSession();
  const subtitle = appHeaderSubtitle(activeRole, scopeType, scopeLabel);
```

- [ ] **Step 2: Update `RoleSwitcher.tsx`'s active label**

Replace `components/RoleSwitcher.tsx` line 34 and line 38:

```ts
  const { myRoles, switchRole, signOut, activeRole, scopeType, scopeLabel } = useSession();
```

```ts
  const activeLabel = appHeaderSubtitle(activeRole, scopeType, scopeLabel);
```

- [ ] **Step 3: Update `RoleSwitcher.tsx`'s per-row label**

Replace `components/RoleSwitcher.tsx` line 100:

```tsx
                    {appHeaderSubtitle(r.role, r.scope_type, r.scope_label)}
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: zero errors.

- [ ] **Step 5: Run the full vitest suite**

Run: `npm run test`
Expected: PASS, no failures (existing suite + Task 2's 3 new cases, all green — this task changes no testable pure-function surface, only JSX wiring already covered by Tasks 2/3).

- [ ] **Step 6: Commit**

```bash
git add components/AppHeader.tsx components/RoleSwitcher.tsx
git commit -m "feat: render resolved Center/Session/Class scope labels in header and switcher (issue #35)"
```

---

### Task 5: Update the spec/plan docs to close out issue #35

**Files:**
- Modify: `.docs/specs/system/client-auth-session-and-nav.md:150`
- Modify: `.docs/specs/system/client-auth-session-and-nav.plan.md:1030` (append a new section after line 1041)

**Interfaces:**
- Consumes: nothing (documentation only).
- Produces: nothing (documentation only).

- [ ] **Step 1: Correct the AC#6 line in the spec**

In `.docs/specs/system/client-auth-session-and-nav.md`, the line-150 sentence currently reads:

```
The `Center · Session · Grade/Class` part of the label is still a raw `scope_type` (e.g. "Session"), not yet a resolved name (e.g. "Brampton") — tracked as follow-up issue #35, not done in this item.
```

Replace it with:

```
**Correction (2026-07-14, issue #35 resolved):** the `Center · Session · Grade/Class` part of the label is now a real resolved name (e.g. "Frisco · F3 · Shishu Vihaar Class" for a teacher, "Frisco · F3" for a coordinator), via a new `resolve_my_scope_labels()` SECURITY DEFINER RPC keyed on `auth.uid()` — see `client-auth-session-and-nav.plan.md`'s issue #35 resolution section.
```

- [ ] **Step 2: Append a resolution section to the plan doc**

Append to `.docs/specs/system/client-auth-session-and-nav.plan.md`, after the existing "Verdict: GREEN." line at the end of the file (current line 1041):

```markdown

## Issue #35 resolution (2026-07-14)

Closed the scoped follow-up left open by the design-parity re-validation pass above. Added `resolve_my_scope_labels()`, a `SECURITY DEFINER` RPC keyed on `auth.uid()` (not the JWT's `active_role`/scope claims) that resolves every `user_roles` row the caller owns to a friendly `Center · Session · Class` (teacher) or `Center · Session` (coordinator) label — the JWT-claim-keyed approach the existing `classes`/`sessions`/`centers` RLS policies use couldn't cover this, since `RoleSwitcher`'s bottom sheet lists every held role, not just the active one. `bv_coordinator`/`admin`/`parent`/`student` (`scope_type='org'`) are unaffected — they keep the existing "Org" fallback, since there's no `scope_id` to resolve for them.

- **Automated suite:** `npm run test` → all passing (up from 228, +3 for `appHeaderSubtitle`'s resolved-label cases). `npm run typecheck` → zero errors. `npx supabase db reset` + `npx supabase test db` → all passing (up from 148/18 files, +8 assertions/1 file for `150_scope_label_resolution_rpc.sql`).
- **Live verification (`playwright-cli`, local Supabase + Mailpit magic-link):** signed in as `multirole@bv-seed.test.local` (parent/teacher/coordinator/bv_coordinator). Switcher sheet showed all four roles simultaneously: `Teacher · Frisco · F3 · Shishu Vihaar Class`, `Coordinator · Frisco · F3`, `BV Coordinator · Org`, `Parent · Org` — including the three roles that were *not* active at the time, confirming the RPC resolves independent of the JWT's active-role claim. Switched active role through all four via the sheet; header subtitle updated to match each in turn with zero console errors.
- **RLS-adversarial check:** ran the `rls-adversarial-tester` subagent against `resolve_my_scope_labels()` — confirmed a caller never receives another user's `user_roles_id`/`scope_label` rows, and a sub-less/anon session resolves zero rows.

**Verdict: GREEN.** Issue #35 closed.
```

- [ ] **Step 3: Commit**

```bash
git add .docs/specs/system/client-auth-session-and-nav.md .docs/specs/system/client-auth-session-and-nav.plan.md
git commit -m "docs: close out issue #35 in client-auth-session-and-nav spec/plan"
```

---

### Task 6: Full verification pass + close the issue

**Files:** none (verification only).

**Interfaces:** none.

- [ ] **Step 1: Run the full automated suite**

Run:
```bash
npm run test
npm run typecheck
npx supabase db reset
npx supabase test db
```
Expected: vitest all green, typecheck zero errors, pgTAP all green (000–150, 19 files).

- [ ] **Step 2: Run the RLS-adversarial subagent against the new RPC**

Dispatch the `rls-adversarial-tester` agent (per `.claude/rules/supabase-sql.md` and 3_ARCHITECTURE §12.4 — required before promoting any access-control change) scoped to `resolve_my_scope_labels()`: confirm cross-user isolation (a caller never sees another user's rows), confirm the result set is identical regardless of which held role is the JWT's `active_role`, and confirm a signed-out/sub-less/anon session resolves zero rows without erroring.
Expected: no leak found; findings (if any) fixed and re-verified before proceeding.

- [ ] **Step 3: Live verification via `playwright-cli`**

Start the local stack (`npm run dev` or `npx expo start --web`, with `npx supabase start` already running), sign in as `multirole@bv-seed.test.local` via the local Mailpit/Inbucket magic-link flow (same flow documented in `client-auth-session-and-nav.plan.md`'s prior `/test` passes). Open the role switcher and confirm every row shows a resolved label:
- Teacher row: `Teacher · Frisco · F3 · Shishu Vihaar Class`
- Coordinator row: `Coordinator · Frisco · F3`
- BV Coordinator row: `BV Coordinator · Org`
- Parent row: `Parent · Org`

Switch active role through each of the four and confirm the header subtitle updates to match, with zero console errors at each step.

- [ ] **Step 4: Close issue #35**

Run: `gh issue close 35 --comment "Resolved: added resolve_my_scope_labels() RPC + client wiring, verified via pgTAP + live playwright-cli pass. See client-auth-session-and-nav.plan.md's issue #35 resolution section."`
Expected: issue #35 shows as closed.

---

## Self-Review

- **Spec coverage:** issue #35's exact ask ("resolve `scope_id` to a friendly Center/Session/Class label") is Task 1 (the RPC) + Tasks 2-4 (client wiring). The issue's own suspicion ("likely needs its own RLS policy addition") is addressed by Task 1's `SECURITY DEFINER` RPC rather than a new RLS policy, since the real gap is that existing RLS is keyed on the JWT's active-role claim and can't cover inactive rows in the switcher sheet — documented in the RPC's own comment and Task 1's Interfaces line.
- **Placeholder scan:** every step has literal code or an exact command with a stated expected result; no "add appropriate handling"/"similar to Task N" phrasing.
- **Type consistency:** `RoleRow.scope_label` (Task 3) is exactly what Task 4's `r.scope_label` reads; `SessionContextValue.scopeLabel` (Task 3) is exactly what Task 4's `useSession().scopeLabel` reads; `resolve_my_scope_labels()`'s returned column name `scope_label` (Task 1's SQL) matches `ScopeLabelRow.scope_label` (Task 3's TS) and the RPC name string `"resolve_my_scope_labels"` (Task 3's `supabase.rpc(...)` call) matches the SQL function name (Task 1).
