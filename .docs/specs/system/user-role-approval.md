# System — user role approval

> **owner:** System · **consumers:** Admin, Coordinator, BV Coordinator (each calls with their own scope argument) · **scope:** org (Admin, BV Coordinator) / session (Coordinator); privileged server-side writes to `user_roles` · **governing ADR:** [ADR-0024](../../adr/0024-user-role-approval-tiering-and-audit.md) · **covers:** doc 2 (Admin "user/role management (assign with session context, approve, reject)"; Coordinator "approve/reject users in own session"; BV Coordinator "cross-session approvals"); `core-schema-and-rls`'s deferred write path (line 164: `user_roles` ships with zero client write grants, this item is "the later function" that safely writes to it); `csv-enrollment-import`'s explicit exclusion of teacher/coordinator provisioning and of `user_roles` writes for CSV-provisioned guardians/HS students

**Stage:** `/refine` ✓ → `/architect` ✓ (ADR-0024) → `/design` ✓ → `/plan` ✓ ([plan](user-role-approval.plan.md)) → `/migration` ✓ → `/build` ✓ (154/154 unit + 130/130 pgTAP green; three real access-control bugs found and fixed during review — `user-role-grant.ts`'s revoke-by-id and coordinator-containment paths trusting request-body role/scope over the resolved row, and `checkAdminRole` keying off any held role instead of the caller's currently *active* role — all adversarially re-verified closed; live local-stack smoke pass done) → next is `/test` (full adversarial tiering matrix + duplicate-idempotency + revoke-noop pass against the real stack, per ADR-0024 Consequences).

---

## Requirements (refined)

### User story
As an Admin, Coordinator, or BV Coordinator, I want a privileged function that writes `user_roles` — automatically for accounts CSV import already provisioned, and manually (with tiered privilege limits) for accounts it explicitly doesn't touch — so that every provisioned person ends up with exactly the access their role and scope require, and no caller can grant themselves or others more access than their own tier allows.

This item has two sub-capabilities, discovered during refine by tracing what `csv-enrollment-import` (already built, Test ✓) actually does and doesn't do:

**A. Auto-activation sweep (mechanical, no judgment call).** `csv-enrollment-import` provisions `auth.users` accounts for guardians and HS students (Gr9–12) and links them via `family_members` / `students.user_id`, but never writes `user_roles` — every one of those accounts currently has a working login and zero access (every RLS policy default-denies on a missing claim). Parent's "own-children" scope is resolved via the `family_members → students.family_id` join, not via `user_roles.scope_id` — so a parent's row is always the trivial `(role='parent', scope_type='org', scope_id=null)`, fully derivable with no human input. Same for HS students (`role='student'`). This item ships a sweep that grants those rows for any CSV-provisioned account that doesn't have one yet. `csv-enrollment-import` itself is **not modified** (it's already Test ✓ and staged for `/deploy-staging` — reopening its pipeline was considered and rejected). The sweep is invoked right after a successful import (by the Admin upload UI, or as an internal call from the import flow) rather than folded into that item's own transaction.

**B. Manual grant/revoke (judgment call, tiered).** `csv-enrollment-import` explicitly excludes teacher/coordinator/bv_coordinator/admin provisioning — those accounts don't exist yet anywhere in the system, and assigning them requires a human to pick a specific class/session/org, which no CSV column encodes. Admin/Coordinator/BV Coordinator use this path to (1) provision the `auth.users` account if it doesn't exist yet — mirroring `csv-enrollment-import`'s own guardian-provisioning pattern (`getUserByEmail` → `createUser` if not found) — and (2) grant or revoke a `user_roles` row for a target user, subject to strict tiering so no caller can escalate themselves or others.

### Grant tiering (privilege-escalation guard)
No caller may grant or revoke a role at or above their own tier.

| Caller | May grant/revoke | Scope bound |
|---|---|---|
| Admin | any role (student/parent/teacher/coordinator/bv_coordinator/admin) | org-wide |
| BV Coordinator | student/parent/teacher/coordinator (not admin, not bv_coordinator) | org-wide |
| Coordinator | student/parent/teacher only (not coordinator, not bv_coordinator, not admin) | own session only |

### Acceptance criteria
1. **Two privileged Netlify Functions** (service-role key, US-region), never a client-side RLS write path — mirrors `csv-enrollment-import`'s trust tier. `user_roles` retains zero client write grants (unchanged from `core-schema-and-rls`).
2. **Caller authentication + tiering check**, same pattern as `csv-enrollment-import` Phase 0: decode the caller's JWT, look up the caller's own `user_roles` row(s) with the service role, reject `403` if the caller doesn't hold a role permitted to perform the requested grant/revoke per the tiering table.
3. **Auto-activation sweep.** For every `family_members` row and every HS `students.user_id` lacking a matching `user_roles` row, insert `(role='parent'|'student', scope_type='org', scope_id=null)`. Idempotent — safe to re-run after a partial/re-import; skips users who don't have an `auth.users` id yet (nothing to grant).
4. **Manual grant.** Caller supplies target email + role + scope_type + scope_id. If no `auth.users` record exists for that email, provision one via `auth.admin.createUser` (no email sent at provisioning time, matching `csv-enrollment-import`'s "silent provisioning" decision — onboarding email is a separate, later concern). Validate the grant against the tiering table and the caller's own active scope (e.g. a Coordinator can only grant within their own active session). Insert the `user_roles` row; duplicate grant (identical user_id/role/scope_type/scope_id) is an idempotent no-op, not an error.
5. **Manual revoke.** Caller supplies the target `user_roles` row (or user_id + role + scope). Validate against the tiering table. Delete the row. No special-casing for revoking an active role — the existing auth-hook re-heal logic (`auth-hook-and-identity`, already built) handles re-activation or no-active-role on the next token refresh.
6. **No self-escalation.** A caller can never grant themselves a role at or above their own tier — enforced by the same tiering check as any other target (no bypass for `target_user_id = caller`).
7. **Scope containment.** Coordinator-initiated grants/revokes must target the Coordinator's own active session; BV Coordinator/Admin are org-wide but still bounded by the role tier in AC#6.
8. **No PII in logs**, matching `csv-enrollment-import`'s convention — log row/entity identifiers, not raw emails/names, in structured log lines.

### Edge cases
- **Sweep re-run after partial CSV import** (`auth_pending` rows from a prior run) — sweep only grants for accounts that already have an `auth.users` id; accounts still pending auth provisioning are silently skipped and picked up on the next sweep after re-import completes them.
- **Coordinator targets a session they don't belong to** — rejected, same as a tiering violation.
- **Duplicate grant** (target already holds the exact role+scope) — idempotent no-op.
- **Revoke of a non-existent or already-revoked row** — no-op, doesn't leak whether the row ever existed (mirrors `switch_active_role`'s existing no-op-not-error pattern).
- **Revoking a caller's last remaining role for themselves is blocked by AC#6 anyway** (that's a self-grant/revoke at-or-above-own-tier situation only in the degenerate case of revoking your own row — still routed through the same tiering check since "revoke my only role" would leave the caller unable to re-grant it).
- **Revoking someone's only remaining `user_roles` row** — they end up with zero rows; the auth hook already treats zero-role users as no-`active_role`/default-deny everywhere, no new handling needed here.
- **Target email belongs to an existing account with a different existing role** — grant simply adds an additional `user_roles` row (multi-role-per-user is the existing supported shape); no conflict.

### Priority
**POC-core** (doc 2: named as a core capability for Admin, Coordinator, and BV Coordinator). Depends on `core-schema-and-rls` (built) and `auth-hook-and-identity` (built, PR #11 merged) for a real caller JWT with `active_role`/`scope_type`/`scope_id` to authorize against. Blocks: teacher/coordinator/bv_coordinator personas being demoable with real logins, and parents/HS-students getting real (non-zero) access after CSV import.

### Consumers (cross-persona)
Admin, Coordinator, BV Coordinator — each calls the manual grant/revoke path with their own scope argument (mirrors `core-schema-and-rls`'s own note on this item's ownership pattern, line 164).

### Access scope
Per the tiering table above. Both functions run server-side with the service-role key; `user_roles` has no client-writable RLS policy (unchanged).

### Explicitly out of scope
- Onboarding/invitation email to newly-provisioned teacher/coordinator accounts (silent provisioning only, matching `csv-enrollment-import`'s existing decision — a later notifications-infra concern).
- Admin/Coordinator/BV Coordinator UI screens for triggering grants or viewing pending sweeps (persona UoW, not this backend item).
- `audit_log` schema changes — resolved by [ADR-0024](../../adr/0024-user-role-approval-tiering-and-audit.md): `audit_log.action`'s `('read','denied')` CHECK constraint is unchanged; grant/revoke is audited via a structured, PII-free log line (AC#8), matching `csv-enrollment-import`'s identical precedent, not an `audit_log` extension.
- Extending `csv-enrollment-import`'s own Phase 3 (considered and explicitly rejected during refine — don't reopen an already-Test-✓ item).

---

## Design (detailed spec)

> **Stage:** `/refine` ✓ → `/architect` ✓ (ADR-0024) → `/design` ✓ → `/plan` ✓ → `/migration` ✓ → `/build` ✓ → next is `/test`.
> **Design decisions captured this pass:**
> 1. **Self-escalation is strict for everyone, including Admin.** Whenever `target_user_id === caller.user_id`, the rule is always `target_role_tier < caller_tier` — no carve-out for Admin. Admin may grant/revoke `admin` freely for *other* users (per the grant-tiering table), but can never touch their own admin/bv_coordinator/coordinator-tier row through this function; only another privileged caller can. Only student/parent/teacher (tier 0) grants can ever be self-targeted. Matches the refined spec's edge-case note ("revoking your own row is blocked by AC#6 anyway") literally, with no exception carved out there.
> 2. **Initial Admin bootstrap is explicitly out of scope.** Since no caller can ever self-grant a first admin/coordinator/bv_coordinator row (decision #1), and no such row exists yet at first deploy, the very first Admin `user_roles` row is seeded directly — a one-time migration seed or documented manual SQL/Studio step at `/deploy-staging` time — not through this function. No break-glass/zero-admins bypass is built into the highest-stakes function in the system for a one-time-ever situation.
> 3. **Sweep logic lives in a shared lib, called two ways.** `netlify/functions/lib/role-sweep.ts` exports `runAutoActivationSweep(client)`. `csv-import.ts` calls it **in-process** right after its Phase 3 commits (no network hop, reuses the already-verified admin caller from its own Phase 0 — csv-import.ts is not modified in its transaction/response shape, only gains one additional call at the end). `netlify/functions/user-role-sweep.ts` is a thin HTTP wrapper around the same lib function, with its own Phase 0 admin check, so the Admin UI can re-trigger the sweep directly (e.g. after a partial/interrupted import) without re-uploading a CSV. This satisfies AC#1's "two privileged Netlify Functions" without a self-inflicted network call on every import.
> 4. **New migration: grant-identity uniqueness.** `user_roles` has no unique constraint on `(user_id, role, scope_type, scope_id)` today — AC#4's "duplicate grant is an idempotent no-op" needs one to be implementable via `ON CONFLICT DO NOTHING` rather than a race-prone app-level check-then-insert. Added as a partial-safe unique index using `coalesce(scope_id, <sentinel>)` (plain `unique(...)` wouldn't dedupe org-scoped rows, since Postgres treats each `NULL` `scope_id` as distinct).
> 5. **Caller's tiering permission is derived from their currently *active* role**, re-queried fresh server-side against `user_roles` (`is_active = true`) with the service role — not from any role they merely hold elsewhere, and not decoded from the client-supplied JWT. Mirrors `csv-enrollment-import` Phase 0's "verify server-side, don't trust the client" posture, and gives one unambiguous "which hat are they wearing right now" answer, consistent with how every other RLS-gated table already treats `active_role`.
> 6. **Role → `scope_type` is fixed by the existing scope model (§5.4), not caller-supplied freely.** `student`/`parent`/`bv_coordinator`/`admin` → `org`; `teacher` → `class`; `coordinator` → `session`. Validated (422 on mismatch) before the tiering check runs.
> 7. **Coordinator's "own active session" containment (AC#7) only binds the `teacher` grant** — the one Coordinator-grantable role carrying a non-`org` scope. The function resolves the target class's `session_id` and rejects (403) if it doesn't equal the caller's own active `scope_id`. `student`/`parent` grants by a Coordinator have no session dimension on the row itself (always `org`-scoped) — decision #6's map already fully constrains them, so no extra containment check applies.
> 8. **`getOrCreateAuthUser` is extracted** from `csv-import.ts` into `netlify/functions/lib/auth-provisioning.ts` and imported by both `csv-import.ts` and `user-role-grant.ts` — same silent-provisioning pattern (`generate_link`, `magiclink`, no email sent), not duplicated.
> 9. **`is_active` on a newly-created row is `true` only if it's the target user's first-ever `user_roles` row; otherwise `false`.** Applies uniformly to sweep grants and manual grants. A user who already holds an active role keeps it active — they use the existing `switch_active_role` RPC (`auth-hook-and-identity`, built) to activate the new grant later. Mirrors the `auth-hook-and-identity` migration backfill's own single-row-only auto-activation rule.

### Behavior

#### Overview

Two Netlify Functions, both service-role, US-region:

```
netlify/functions/user-role-sweep.ts   POST /api/user-role-sweep    (Part A: auto-activation sweep)
netlify/functions/user-role-grant.ts   POST /api/user-role-grant    (Part B: manual grant/revoke)
```

Shared `lib/`:

```
lib/role-sweep.ts          runAutoActivationSweep(client) — used by both user-role-sweep.ts and csv-import.ts
lib/role-tiering.ts        TIER map, ROLE_SCOPE_TYPE map, isGrantAllowed(...)
lib/auth-provisioning.ts   getOrCreateAuthUser(...) — extracted from csv-import.ts, shared with user-role-grant.ts
```

#### `runAutoActivationSweep(client)` (Part A)

For every `family_members` row and every HS `students.user_id` lacking a matching `user_roles` row (AC#3), insert one, `RETURNING` the created rows so each can be logged individually (ADR-0024 Consequences: "each auto-activation-sweep grant emits one structured log line"):

```sql
-- Parents
insert into user_roles (user_id, role, scope_type, scope_id, is_active)
select fm.user_id, 'parent', 'org', null,
  not exists (select 1 from user_roles ur2 where ur2.user_id = fm.user_id)
from family_members fm
where fm.user_id is not null
  and not exists (
    select 1 from user_roles ur
    where ur.user_id = fm.user_id and ur.role = 'parent' and ur.scope_type = 'org'
  )
returning id, user_id, role, scope_type;

-- HS students
insert into user_roles (user_id, role, scope_type, scope_id, is_active)
select s.user_id, 'student', 'org', null,
  not exists (select 1 from user_roles ur2 where ur2.user_id = s.user_id)
from students s
where s.user_id is not null
  and not exists (
    select 1 from user_roles ur
    where ur.user_id = s.user_id and ur.role = 'student' and ur.scope_type = 'org'
  )
returning id, user_id, role, scope_type;
```

For each returned row: `console.log(JSON.stringify({ event: 'role_swept', user_roles_id: id, role, scope_type }))` (no PII — AC#8). Returns `{ granted_parent: number; granted_student: number }` to the caller.

#### `user-role-sweep.ts` (HTTP wrapper)

**Phase 0 — Auth + role check.** Identical shape to `csv-import.ts` Phase 0: decode `Authorization: Bearer <token>`, `client.auth.getUser(token)` → `401` on failure, `checkAdminRole` → `403` if caller doesn't hold `admin`.
**Phase 1.** Calls `runAutoActivationSweep(client)`, returns its result as `200`.

#### `csv-import.ts` (one addition, no other change)

After Phase 3 commits (existing behavior unchanged), add: `const sweepResult = await runAutoActivationSweep(client);` — folded into the existing response only as an internal side effect (the CSV-import response shape, `ImportResponse`, is unchanged; the sweep runs but its counts aren't surfaced in that response — Admin can see them via a direct `/api/user-role-sweep` call if needed).

#### `user-role-grant.ts` (Part B)

**Phase 0 — Auth + tiering lookup.**
1. Decode `Authorization: Bearer <token>` → `401` if missing/malformed.
2. `client.auth.getUser(token)` → `401` on error.
3. `select role, scope_type, scope_id from user_roles where user_id = $1 and is_active = true` (service role) → if no row, `403` ("caller holds no active role").
4. `caller_tier = TIER[caller_role] ?? 0` where `TIER = { coordinator: 1, bv_coordinator: 2, admin: 3 }` → if `0`, `403` ("caller's active role cannot grant/revoke").

**Phase 1 — Parse + validate request (no writes).**
1. `action` ∈ `{'grant','revoke'}`, `role` ∈ `app_role`, `scope_type` ∈ `app_scope_type` — all required. `422` on missing/invalid.
2. `scope_type` must equal `ROLE_SCOPE_TYPE[role]` (decision #6) — `422` on mismatch.
3. `scope_id` required and must be a UUID when `scope_type !== 'org'`; must be absent/null when `scope_type === 'org'` — `422` on mismatch (mirrors the existing `user_roles_org_scope_null_id` check constraint, enforced here pre-write for a clean error instead of a DB exception).
4. **Grant:** exactly one of `target_email` / `target_user_id` required. **Revoke:** exactly one of `user_roles_id` OR (`target_email`|`target_user_id` + `role` + `scope_type` + `scope_id`) required.

**Phase 2 — Resolve target user + target role (no writes yet).**
- Grant: if `target_email` given, `getOrCreateAuthUser(...)` (provisions silently if not found, decision #8) → `target_user_id`.
- Revoke: if `user_roles_id` given, `select id, user_id, role, scope_type, scope_id from user_roles where id = $1`. Not found → skip to no-op response (Phase 4, below) — **tiering is not evaluated when there's nothing to revoke**, so this can't be used to probe for a row's existence.
- Revoke by tuple: resolve `target_user_id` (via email lookup if needed — `getUserByEmail`, not `getOrCreateAuthUser`; revoke never provisions), then look up the row by the unique grant-identity tuple (decision #4). Not found → same no-op path.

**Phase 3 — Tiering + scope containment (`lib/role-tiering.ts`).**
```typescript
function isGrantAllowed(callerRole: AppRole, callerTier: number, callerScopeId: string | null,
                         targetRole: AppRole, targetUserId: string, callerUserId: string): boolean {
  const targetTier = TIER[targetRole] ?? 0;
  if (targetUserId === callerUserId) return targetTier < callerTier;      // decision #1, no exception
  if (callerRole === 'admin') return true;                                 // admin: any role, for others
  return targetTier < callerTier;                                         // bv_coordinator/coordinator: strict
}
```
Additionally, if `callerRole === 'coordinator' && targetRole === 'teacher'` (grant or revoke): `select session_id from classes where id = $scope_id` → reject `403` unless it equals the caller's own active `scope_id` (decision #7).
`isGrantAllowed(...) === false` → `403`.

**Phase 4 — Execute.**
- **Grant:** `insert into user_roles (user_id, role, scope_type, scope_id, is_active) values (...) on conflict (user_id, role, scope_type, coalesce(scope_id, '00000000-0000-0000-0000-000000000000'::uuid)) do nothing returning id`. `is_active` per decision #9 (`true` only if the target user has zero existing rows). Empty `RETURNING` → `status: 'noop'`. Non-empty → `status: 'granted'`, log `{ event: 'role_granted', user_roles_id, role, scope_type, actor_role: callerRole }`.
- **Revoke:** `delete from user_roles where id = $resolved_id returning id`. Empty (already resolved as not-found in Phase 2, or deleted concurrently) → `status: 'noop'`. Non-empty → `status: 'revoked'`, log `{ event: 'role_revoked', user_roles_id, role, scope_type, actor_role: callerRole }`.

No PII (email/name) in any log line — only `user_roles.id`, `role`, `scope_type`, and the caller's own role (AC#8).

---

### Data & RLS impact

#### Migration required (one addition to existing schema)

```sql
-- Grant-identity uniqueness (decision #4) — enables idempotent-no-op duplicate grants (AC#4)
-- via ON CONFLICT rather than an app-level check-then-insert race.
create unique index if not exists user_roles_grant_identity_idx
  on user_roles (user_id, role, scope_type, coalesce(scope_id, '00000000-0000-0000-0000-000000000000'::uuid));
```

No other schema change. `user_roles`'s existing columns, check constraint (`user_roles_org_scope_null_id`), and `is_active` partial unique index (from `auth-hook-and-identity`) are unchanged.

#### Tables written (service-role — RLS bypassed intentionally, same posture as `csv-import.ts`)

| Table | Operation | From |
|---|---|---|
| `user_roles` | `INSERT ... ON CONFLICT DO NOTHING` | sweep + manual grant |
| `user_roles` | `DELETE ... RETURNING` | manual revoke |
| `auth.users` | `auth.admin.generate_link` (magiclink, silent) | manual grant only, when `target_email` has no existing account |

#### Tables read (service-role)

`user_roles` (caller's active row for tiering; target-row/tuple resolution for revoke; existence checks for sweep/grant idempotency), `family_members`, `students` (sweep source rows), `classes` (Coordinator teacher-grant session containment, decision #7), `auth.users` (`getUserByEmail`/`getOrCreateAuthUser`).

#### No RLS policy changes

Both functions hold the service-role key and bypass RLS for all writes — identical posture to `csv-import.ts`. `user_roles` remains client-unwritable (unchanged from `core-schema-and-rls`); this item does not add or modify any RLS policy.

#### `audit_log`

Not written by either function (ADR-0024, Option B). Structured, PII-free log lines (above) are the POC audit trail for grants, revokes, and sweep activity.

---

### API contract

**`POST /api/user-role-sweep`**
```
Authorization: Bearer <supabase-session-token>
```
Response `200`: `{ granted_parent: number; granted_student: number }`
`401` missing/invalid JWT · `403` caller does not hold `admin`.

**`POST /api/user-role-grant`**
```typescript
// Request
{
  action:          'grant' | 'revoke';
  role:             'student' | 'parent' | 'teacher' | 'coordinator' | 'bv_coordinator' | 'admin';
  scope_type:       'org' | 'center' | 'session' | 'class';
  scope_id?:        string | null;   // required unless scope_type === 'org'
  target_email?:    string;          // grant: provisions auth.users if missing; revoke: resolves existing user
  target_user_id?:  string;          // alternative to target_email
  user_roles_id?:   string;          // revoke only: direct row id, skips tuple resolution
}

// Response 200
{ status: 'granted' | 'revoked' | 'noop'; user_roles_id?: string }
```

| Code | Meaning |
|---|---|
| `200` | Success — granted, revoked, or idempotent no-op |
| `401` | Missing/invalid JWT |
| `403` | Caller holds no qualifying active role, tiering violation, self-escalation, or Coordinator session-containment violation |
| `422` | Malformed request — bad `role`/`scope_type` pairing, missing required field, invalid `scope_id` shape |
| `500` | Unexpected server error |

---

### Edge cases (design detail)

| Scenario | Handling |
|---|---|
| Sweep re-run after partial CSV import (`auth_pending` rows) | Skipped silently — `family_members`/`students.user_id` still null for those; picked up on next sweep after re-import completes them (AC#3, unchanged from refine) |
| Coordinator targets a class outside their active session | `403` (decision #7) |
| Coordinator grants/revokes `student`/`parent` | No session containment — always `org`-scoped, fully constrained by decision #6's role→scope map already |
| Duplicate grant (identical `user_id`/`role`/`scope_type`/`scope_id`) | `ON CONFLICT DO NOTHING` → `status: 'noop'`, `200` (AC#4) |
| Revoke of a non-existent or already-revoked row | `status: 'noop'`, `200` — resolved in Phase 2 before any tiering check runs, so the response is identical whether the row never existed or existed and was already deleted (no existence leak) |
| Caller (including Admin) targets their own admin/bv_coordinator/coordinator-tier row | `403` — decision #1, no exception for Admin |
| Target email belongs to an existing account with a different existing role | Grant adds an additional `user_roles` row (multi-role-per-user, existing supported shape); `is_active` stays `false` on the new row (decision #9) unless it's their first row ever |
| First Admin account (system bootstrap) | Out of scope for this function (decision #2) — seeded directly via migration/SQL at `/deploy-staging` |
| New auth account has zero prior roles | `is_active = true` on the sweep/grant-created row (decision #9) — same single-role auto-activation the hook itself would otherwise apply lazily, done explicitly and immediately here instead |

---

### UI

**N/A for this item.** Same classification as `auth-hook-and-identity` — backend-only System item, no screens; the design DoD does not apply here. Admin's "trigger sweep" and Admin/Coordinator/BV Coordinator's "grant/revoke" screens are a separate persona UoW (already flagged in "Explicitly out of scope" above) that will call `POST /api/user-role-sweep` and `POST /api/user-role-grant` per the API contract above.

---

### Out of scope (confirmed)
- Onboarding/invitation email to newly-provisioned accounts (silent provisioning only — unchanged from refine).
- Admin/Coordinator/BV Coordinator UI screens (persona UoW, not this backend item).
- `audit_log` schema changes (ADR-0024, Option B — structured log lines instead).
- Extending `csv-enrollment-import`'s own Phase 3 (unchanged from refine).
- **Initial Admin bootstrap** (decision #2) — seeded directly via migration/SQL, not built as a function code path.
- Break-glass/emergency access-recovery paths (e.g. if every Admin account is somehow locked out) — not a POC-stage concern; would be its own ADR if ever needed.

---

## Sign-off
- [x] **Human sign-off on this design** (2026-07-11, shree.srinivas@outlook.com) → ready for **`/plan`**.
