# System — Auth hook & identity

> **owner:** System · **consumers:** all 6 personas (every persona feature UoW that needs a real, non-simulated JWT) · **scope:** identity / JWT claims — Postgres Custom Access Token Hook, magic-link sign-in wiring, active-role storage + switch mechanism (plugs into `user_roles`) · **governing ADR:** ADR-0004 (multipersona-auth-hook, Closed — this item implements it), ADR-0003 (access-control-rls, consumer), **ADR-0022 (active-role storage/switch/auto-activation, new)**, ADR-0014 (access-UX role-derived nav/switcher — UI layer, out of scope here) · **covers:** doc 3 §5.1–§5.2–§5.3 (identity, claims chain, active-role switching), §5.5 (hook hardening); doc 1 §6 (magic-link); core-schema-and-rls's deferred precondition (unguarded `scope_id` casts)

**Stage:** Refined ✓ → `/architect` ✓ (ADR-0022) → `/design` ✓ → `/plan` ✓ → Built (pgTAP 100/100, full whole-branch review clean) → `/test` ✓ (live AC#7 sign-in pass, 2026-07-11, real magic-link sign-in verified against `supabase_auth_admin` path) → ready for `/promote` (PR #11).

---

## Requirements (refined)

### User story
**As a** person with one or more role-grants in `user_roles` (Parent, Student, Teacher, Coordinator, BV Coordinator, or Admin), **I want** to sign in passwordlessly via magic link and have my JWT carry a real, hook-stamped `active_role`/`scope_type`/`scope_id`, and to switch which role is active when I hold more than one, **so that** every RLS policy and RPC already built against simulated claims (`core-schema-and-rls`) now enforces against my *real*, database-issued identity — with no gap where I'm signed in but unscoped.

### Decisions captured during refine
- **Active-role storage: `is_active boolean` column on `user_roles`.** A partial unique index enforces at most one active row per `user_id` (`create unique index ... where is_active`). Keeps "grants" and "current selection" in the one table the hook already reads — no second table/join.
- **Switch mechanism is in scope.** A `security definer` RPC (e.g. `switch_active_role(p_user_roles_id uuid)`) that: verifies the target row belongs to `auth.uid()`, flips `is_active` (clears old, sets new) in one transaction, and returns success — the client then calls Supabase's `refreshSession()` to pick up the re-stamped JWT. This is backend plumbing only; the visual role-switcher component (ADR-0014) is a separate, later UI concern owned by whichever item builds shared navigation.
- **No active role at sign-in: auto-activate deterministically.** If a user has exactly one `user_roles` row, it's active by default (set at provisioning time by the future `user-role-approval` item, or backfilled by this item's migration for existing seed rows). If a user has multiple rows and none is marked active (e.g. first login after multi-role provisioning), the hook — or a `before` trigger on first token issuance — auto-activates one by a documented deterministic rule: **narrowest scope first** (`class` > `session` > `org`), tie-broken by `created_at` ascending. A JWT is **never** issued with a null `active_role` for a user who holds at least one grant.
- **Carried precondition from `core-schema-and-rls` (2026-07-09 deferred-findings pass):** the hook must guarantee `scope_id` is always a valid UUID **or absent** for every issued token — every existing RLS policy and RPC does an unguarded `(auth.jwt()->>'scope_id')::uuid` cast that would throw on a malformed claim. The hook function is the single choke point that must make this shape-guarantee true; no downstream policy changes needed.
- **Magic-link sign-in wiring, not a new provisioning path.** Accounts are still provisioned only via coordinator/admin (CSV import / `user-role-approval`, both separate items) — this item wires the **sign-in** side (Supabase Auth magic-link config + hook registration), not account creation. No minor self-registration, unchanged.

### Acceptance criteria
1. **Custom Access Token Hook function** (SQL, `security definer`) registered with Supabase Auth, reads the caller's active `user_roles` row (per the `is_active` decision above) and stamps `active_role`, `scope_type`, `scope_id` into the issued/refreshed JWT — matching the exact claim shape every existing RLS policy/RPC already expects (`core-schema-and-rls`).
2. **Hook hardening (§5.5):** `grant execute` on the hook function to `supabase_auth_admin` only; `revoke` from `anon`, `authenticated`, `public`. `user_roles` already has a `supabase_auth_admin` read policy (built in `core-schema-and-rls`) — confirmed sufficient, no new policy needed.
3. **`is_active` column + constraint** added to `user_roles` via migration: nullable-false-by-convention boolean, partial unique index guaranteeing ≤1 active row per `user_id`.
4. **Auto-activation on no-active-role.** A user with ≥1 `user_roles` row and none marked active gets one auto-activated per the deterministic rule above, transparently, before/during token issuance — never a token with a missing `active_role` for a user who holds a grant.
5. **`scope_id` shape guarantee.** The hook never stamps a claim shape that would fail the unguarded `(auth.jwt()->>'scope_id')::uuid` cast pattern already in production RLS/RPC code — i.e. `scope_id` is a valid UUID whenever `scope_type <> 'org'`, and absent/null when `scope_type = 'org'` (mirrors the existing `user_roles_org_scope_null_id` check constraint).
6. **`switch_active_role(p_user_roles_id uuid)` RPC:** `security definer`, verifies the target row's `user_id = auth.uid()`, atomically clears the old active flag and sets the new one, rejects (no-op, no error leaking existence) if the row doesn't belong to the caller. Client follow-up call to `refreshSession()` is documented as the required next step but is a client-side concern, not this RPC's job.
7. **Magic-link sign-in wired end-to-end**, verified live: a user with a seeded `user_roles` row can request a magic link, complete sign-in, and receive a JWT carrying the correct `active_role`/`scope_type`/`scope_id` — replacing every place the existing pgTAP suite currently *simulates* `request.jwt.claims`.
8. **No RLS/RPC policy rewrites required.** Because `core-schema-and-rls` was built against the claim shape this item now produces for real, the full existing pgTAP suite (73/73) continues to pass unmodified once real claims replace simulated ones — this item adds hook-specific tests, it doesn't touch existing policy logic.
9. **Adversarial hook tests** (constitution rule #4, §11.3): multi-role user switching between all their granted roles yields correctly re-scoped JWTs each time (no stale claim leakage from the pre-switch role); a user with zero `user_roles` rows gets a JWT with no `active_role` claim (and every RLS policy already default-denies that case); a malicious client cannot invoke the hook function directly or forge `active_role` via `raw_app_meta_data` (hook only reads `user_roles`, ignores any client-supplied role claim).

### Edge cases
- **Zero-role user.** Someone with a Supabase Auth account but no `user_roles` row yet (e.g. mid-provisioning) gets a JWT with no `active_role`/scope claims — every existing RLS policy already default-denies on missing claims, so this is a no-op, not an error state.
- **Switch race / concurrent switch calls.** Two rapid `switch_active_role` calls for the same user must not leave two rows `is_active = true` — the partial unique index (AC #3) makes the second call's clear-then-set atomic and safe under the DB's transaction isolation; RPC does clear-old/set-new in one statement or transaction, not two round trips.
- **Role revoked while active.** If an admin later removes the `user_roles` row that's currently `is_active` (via the future `user-role-approval` item), the next token refresh must not stamp a claim for a row that no longer exists — falls back to the auto-activation rule (AC #4) or to no-active-role if none remain.
- **HS student without a login yet.** `students.user_id` is nullable until account provisioning links it (per `core-schema-and-rls`); this item's hook simply has nothing to stamp for that student until a `user_roles` row exists — not a special case to handle, just a consequence of AC #1 reading `user_roles` as the sole source.
- **`scope_id` malformed defensive check.** Even though the hook is the single source of new tokens, the hook function itself should validate/guarantee its own output (AC #5) rather than relying on trusting `user_roles` data hygiene — a corrupt `user_roles` row (e.g. `scope_id` null when `scope_type <> 'org'`) must not produce a token that later throws inside an RLS policy; the hook either fixes/rejects at issuance or the existing check constraint on `user_roles` (already in place) prevents such a row from ever being written.

### Priority
**POC-core, foundational.** Recommended first among the open System items — every persona-facing feature UoW needs real auth (not simulated JWT claims) before its own screens can be meaningfully tested end-to-end. Blocks: `user-role-approval` (writes the rows this hook reads), and in practice most persona feature UoWs that want to demo against real sign-in rather than pgTAP simulation.

### Consumers (cross-persona)
All six POC personas — every later feature UoW authenticates through this item's magic-link + hook wiring. `user-role-approval` (System, separate item) will be the privileged write-path into the `user_roles` rows this hook reads. `core-schema-and-rls`'s entire RLS/RPC surface becomes live (not simulated) the moment this item ships.

### Access scope (§5.4)
**System / engine** — this item *is* the mechanism that produces the scope claims every other table's RLS depends on (Parent → own-children, Student → self, Teacher → class, Coordinator → session, BV Coordinator/Admin → org). It doesn't itself gate access to persona data; it makes the claims those existing policies already check trustworthy and real.

### Explicitly out of scope (so a later item picks it up)
- **Role-switcher visual UI** (the pill/chip component, conditional-on-≥2-roles rendering) — ADR-0014, owned by whichever item builds shared/persona navigation, not System.
- **`user_roles` row provisioning** (who gets which role/scope grant, and the approval workflow) — separate `user-role-approval` System item, privileged Netlify function, service-role key.
- **CSV enrollment import** — separate System item; out of scope here even though it will eventually populate `students.user_id` that this item's claims indirectly depend on.
- **Retention/deletion job, notifications, chat delivery** — unrelated, separate System items.

---

## Architect review — sign-off (2026-07-10)

**Outcome: signed off, 1 ADR recorded.** The brief is sound against the architecture — scope model (§5.4), RLS-in-DB (non-negotiable #1), hook hardening (§5.5), minors'-data default-deny on missing claims, and no new external processor/residency concern. One genuinely new decision was surfaced (a schema/mechanism shape not yet settled at the system level) and one point the brief itself left open was resolved rather than passed downstream unresolved:

1. **ADR-0022 — active-role storage, switch mechanism & auto-activation placement.** Three sub-decisions bundled as one ADR because they're the same underlying "how is 'currently active' represented and mutated" question: (a) `is_active boolean` + partial unique index on `user_roles`, (b) a `SECURITY DEFINER` RPC as the switch's only write path — reconciling §5.3's "client writes its own row" prose with `core-schema-and-rls`'s AC#3 that `user_roles` has **zero** client write grants (mirrors the ADR-0019/ADR-0021 privileged-RPC precedent), (c) auto-activation logic lives **only** inside the hook function (human-decided, see ADR-0022 Options) — not a `BEFORE INSERT` trigger, and not both — since a trigger alone can't cover the "role revoked while active" edge case and splitting one invariant across two mechanisms is the exact failure shape ADR-0021 already diagnosed once (Task 11).

**Not ADR-worthy (already-settled precondition, not a new decision):**
- **`scope_id` shape guarantee (AC#5).** Carried forward verbatim from `core-schema-and-rls`'s 2026-07-09 deferred-findings pass as a requirement, not a new choice — the hook is already the designated single choke point for this by that item's own ADR-scoped precondition.
- **`center` as an unused `app_scope_type` enum value.** Confirmed (`supabase/migrations/20260709033959_user_roles_catalog.sql`) that `center` is a defined enum value with no role in §5.4's scope matrix mapped to it today — the auto-activation tie-break rule (`class` > `session` > `org`) correctly has no entry for it. Noted in ADR-0022's Decision for traceability, not a gap requiring resolution now; if a future role is added at center scope, the tie-break rule extends then.

**Hand-off → `/design`:** produce the detailed spec — exact hook function SQL (ensure-then-read logic per ADR-0022), the `is_active` column + partial unique index DDL, `switch_active_role`'s exact signature/grant matrix, the Supabase Auth magic-link + hook-registration wiring steps, and the adversarial pgTAP test plan for AC#9 (multi-role switch, zero-role no-op, hook-forgery resistance) plus a live end-to-end verification pass (AC#7) replacing simulated claims with a real signed-in session.

---

## Design (detailed spec)

> **Stage:** 1 — Design ✓ (this section). `/refine` ✓ → `/architect` ✓ (ADR-0022) → `/design` ✓ → next is `/plan`.
> **Design decisions captured this pass:**
> 1. **The hook is invoker-rights, not `security definer`.** It runs *as* `supabase_auth_admin` — the role GoTrue already connects as — relying on grants/policies scoped to that one trusted role, rather than the `security definer` pattern used by every other privileged RPC in this codebase. `core-schema-and-rls` already pre-built the `select` grant + `user_roles_auth_admin_read` policy for exactly this purpose; this item adds one column-scoped `update (is_active)` grant + matching policy for the same role, instead of switching mechanisms.
> 2. **Migration backfill covers only the unambiguous single-row case.** `/migration` auto-activates a user's sole `user_roles` row (no tie-break needed). Multi-role users with no active row are left for the hook's own ensure-then-read logic to resolve on first token request — the narrowest-scope-first tie-break rule is implemented in exactly one place (the hook), per ADR-0022's "one choke point, not two" principle, not duplicated into a migration-time backfill query too.
> 3. **`scope_id` is omitted from claims, not stamped `null`, when the active grant is org-scoped.** `event->>'scope_id'` reads back as SQL `NULL` either way (missing key vs. JSON null), matching the existing `nullif(auth.jwt()->>'scope_id','')::uuid` cast pattern used throughout `core-schema-and-rls` — "omitted" is the literal shape AC#5 asks for.
> 4. **A genuine concurrent double-switch is caught by the partial unique index as a constraint-violation error, not silently resolved.** `switch_active_role`'s clear-then-set is atomic per call under normal (sequential) use; two truly simultaneous calls activating two *different* target rows for the same user will have one caller's transaction fail on the unique index rather than leave two active rows or silently pick a winner — acceptable at pilot scale (one user, one device, not a multi-tab race in practice), documented in Edge cases below rather than papered over with a retry loop.

### `is_active` column + partial unique index (DDL)

```sql
alter table user_roles add column is_active boolean not null default false;

create unique index if not exists user_roles_one_active_per_user
  on user_roles (user_id)
  where is_active;

-- Backfill: only the unambiguous case (see Design decision #2 above) — a user
-- with exactly one user_roles row gets it activated. Multi-role users with no
-- active row are left for the hook's own ensure-then-read logic (below) to
-- resolve on next token request, not duplicated here.
with single_role_users as (
  select user_id from user_roles group by user_id having count(*) = 1
)
update user_roles ur
set is_active = true
from single_role_users s
where ur.user_id = s.user_id;

-- The hook (below) needs to flip is_active for auto-activation and for
-- switch_active_role's target row; narrowed to the one column it ever writes.
grant update (is_active) on user_roles to supabase_auth_admin;

create policy user_roles_auth_admin_activate on user_roles for update
to supabase_auth_admin
using (true)
with check (true);
```

`using (true)`/`with check (true)` mirrors the existing `user_roles_auth_admin_read` policy's posture: `supabase_auth_admin` is never a client-reachable role (§5.5), so scoping this policy to "own row" would be meaningless — the trust boundary is the role grant itself, not a per-row predicate.

### Custom Access Token Hook — ensure-then-read (DDL)

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

Notes:
- **Not `security definer`, not `stable`** — the ensure step writes, and the function is invoked fresh on every token issue/refresh, so it must execute with `supabase_auth_admin`'s own (now-granted) privileges, not the function owner's.
- `claims := event->'claims'` starts from GoTrue's own pre-populated claims (`sub`, `aud`, `exp`, `role`, etc.) — the function only ever adds/removes the three keys it owns, never touches the rest of the object, so the client always still gets a well-formed base session.
- The hook **ignores any pre-existing `active_role`/`scope_type`/`scope_id` already present in `event->'claims'`** (there normally won't be any, since nothing else sets them) — it derives every claim value fresh from `user_roles` on every call, which is what makes AC#9's forgery-resistance requirement true structurally, not by a separate check.
- **`scope_id` shape guarantee (AC#5) requires no extra hook-side validation.** `user_roles`'s existing check constraint (`user_roles_org_scope_null_id`, `core-schema-and-rls`) already guarantees `scope_id is not null` whenever `scope_type <> 'org'` and `null` when `scope_type = 'org'`, for every row that can ever exist in the table — the hook's only job is to mirror that shape into the claim (include when present, omit when absent), not re-derive or defend against a shape the DB itself never allows to be written.

### `switch_active_role` RPC — exact signature + grant matrix (DDL)

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

This one **is** `security definer` (unlike the hook) — it's invoked by an ordinary `authenticated` client, which has no grant on `user_roles` at all; the function's own `auth.uid()` ownership check is the entire access-control boundary, mirroring `mark_attendance_for_staff`'s precedent. The clear-before-set statement order is what keeps the partial unique index from ever seeing two active rows for the same user mid-call (Design decision #4). Client follow-up: call Supabase's `refreshSession()` after a successful RPC call to pick up the re-stamped JWT — documented here as the required next step, not built by this function (spec's own note, unchanged from refine).

### Supabase Auth wiring — magic-link + hook registration

**Local dev (`supabase/config.toml`):**
```toml
[auth.hook.custom_access_token]
enabled = true
uri = "pg-functions://postgres/public/custom_access_token_hook"
```
Magic-link itself needs no additional toggle beyond the already-`enabled = true` `[auth.email]` block — `supabase.auth.signInWithOtp({ email })` from the client is the existing Supabase Auth flow; locally, Inbucket (already running under `supabase start`) captures the email for the live-verification pass below.

**Staging/prod (cloud project):** the linked cloud project does not read `config.toml` automatically — hook registration there is a one-time Auth-service configuration step (Dashboard → Authentication → Hooks → Custom Access Token, pointed at `public.custom_access_token_hook`), not a SQL migration. This item ships the migration + local wiring only; registering the hook against a real cloud project is a dependency for the not-yet-started `cloud-environment-provisioning` System item and gets documented concretely as a `/deploy-staging` step when this item reaches that stage — flagged here so it isn't silently assumed to "just work" once `/deploy-staging` runs.

### Data & RLS impact

- **No RLS policy rewrites anywhere** (AC#8) — every existing policy/RPC already reads `auth.jwt()->>'active_role'`/`'scope_type'`/`'scope_id'` against simulated claims; this item only changes where those claims come from.
- **`user_roles` grant surface, after this item:**

  | Grantee | Privilege | Scope | Purpose |
  |---|---|---|---|
  | `authenticated` | `select` | (RLS: 0 rows, no policy) | unchanged from `core-schema-and-rls` — confirms the table stays non-client-readable |
  | `supabase_auth_admin` | `select` | (RLS: `using (true)`) | unchanged — hook's read step |
  | `supabase_auth_admin` | `update (is_active)` | (RLS: `using (true)`, `with check (true)`) | **new** — hook's ensure step |
  | *(no client role)* | `insert`/`delete`, or `update` on any other column | — | unchanged — `switch_active_role` (`security definer`) is the only write path to `is_active` from a client; row provisioning stays owned by the future `user-role-approval` item |

- **Hook-forgery resistance is structural, not a checked condition** — `custom_access_token_hook` is invoked only by GoTrue-as-`supabase_auth_admin`; `execute` is revoked from `anon`/`authenticated`/`public`, so a client cannot call it directly, and even if it could, the function derives every claim fresh from `user_roles`, discarding anything already in the incoming `event.claims` (see hook notes above).
- **`switch_active_role` cannot be used to escalate scope** — it only ever flips `is_active` on a row the caller already owns (verified by `auth.uid()`); it cannot create a new `user_roles` row or change a row's `role`/`scope_type`/`scope_id`, so a compromised client can switch *which of the caller's own existing grants* is active, never grant a new one.

### pgTAP adversarial test plan (AC#9)

**`supabase/tests/110_auth_hook_claims.sql`** — calls `custom_access_token_hook(event jsonb)` directly (test-runner is superuser, bypasses the `supabase_auth_admin`-only grant same as `postgres` always can):
1. Single-role user, no row active yet → hook auto-activates the sole row; returned claims carry that row's `active_role`/`scope_type`/`scope_id`.
2. Multi-role user (e.g. `teacher`@class + `coordinator`@session + `bv_coordinator`@org), none active → hook activates the **class**-scoped row (narrowest-first tie-break).
3. Two rows at the same scope_type, none active → hook activates the **earlier `created_at`** row (tie-break's second clause).
4. A row already active → hook is a no-op on the ensure step (no reassignment); returned claims match the pre-existing active row, not some other grant.
5. Zero-role user (no `user_roles` rows at all) → returned claims contain **no** `active_role` key; `event`'s other keys (e.g. `sub`) pass through unchanged.
6. Active row is org-scoped → claims contain `active_role`/`scope_type` but **no** `scope_id` key at all (not a JSON `null`).
7. Active row is non-org-scoped → `scope_id` present, equals the row's `scope_id`, valid uuid text.
8. **Role-revoked-while-active:** delete the currently-active row (simulating a future admin revocation) → next hook call re-heals via the same ensure-then-read path — activates the next-best remaining row, or produces a zero-claim result if none remain.
9. **Forgery resistance:** call the hook with an `event` whose incoming `claims` already contains a fabricated `active_role: 'admin'` → returned claims reflect the *real* `user_roles`-derived role, discarding the forged value entirely.
10. **Privilege check:** `set local role authenticated;` then calling `custom_access_token_hook(...)` throws `42501` (insufficient privilege); `set local role supabase_auth_admin;` succeeds.

**`supabase/tests/120_switch_active_role_rpc.sql`** — uses `tests.authenticate_as` (sets `auth.uid()` + role, not the hook's own claim-stamping):
1. Owner switch: user X holds role A (active) + role B (inactive); authenticated as X, `switch_active_role(B.id)` → B now active, A now inactive.
2. Non-owner call: authenticated as user Y, `switch_active_role(<a row belonging to X>)` → table state for X is unchanged (verified via `tests.clear_authentication()` + direct select as the test-runner role); no error raised.
3. Exactly one active row remains for X after every switch above (partial unique index sanity check).
4. Switching to the row that's **already** active is an idempotent no-op — it stays active, not toggled off.
5. **Hook/RPC integration:** after a successful switch, an immediate `custom_access_token_hook` call for that same user reflects the newly-active role with no lag — proves both mechanisms share one source of truth (`is_active`), not two.

### Live end-to-end verification (AC#7)

Documented as a `/test`-stage manual pass, not pgTAP (this is exactly the "real hook, real sign-in" case pgTAP's simulated claims can't cover):
1. Seed a user with exactly one `user_roles` row; request a magic link via `supabase.auth.signInWithOtp({ email })` against local dev; retrieve it from Inbucket; complete sign-in.
2. Decode the resulting JWT (e.g. `supabase.auth.getSession()` client-side, or inspect the access token directly) and confirm `active_role`/`scope_type`/`scope_id` match the seeded row — replacing, for this one flow, what every existing pgTAP test currently only *simulates*.
3. Seed a second `user_roles` row for the same user; call `switch_active_role(...)`, then `refreshSession()`; re-decode the JWT and confirm the claims now reflect the newly-active row.
4. This satisfies AC#7 as a one-time verification the mechanism works against a real signed-in session; it is not a substitute for the pgTAP suite above and doesn't run on every `/test` pass going forward — the pgTAP suite is the regression gate (§11.3/§12.4), this is the "does the wiring actually work" proof.

### UI
**N/A — no screens.** System/engine item (same classification as `core-schema-and-rls`) — this item makes the JWT claims *real*, it doesn't render anything. The role-switcher visual component (ADR-0014) is explicitly out of scope (see below); the design DoD doesn't apply here.

### Edge cases (carried + refined)
- **Zero-role user** — covered by pgTAP #5 above; every existing RLS policy already default-denies on a missing claim, so this is a no-op, not an error state (unchanged from refine).
- **Switch race / concurrent switch calls** — refined (Design decision #4): sequential calls are safe via row-level locking; a genuinely concurrent double-switch to two *different* target rows surfaces as a unique-constraint-violation error on the losing caller, not a silent double-active state or a silently-resolved winner. No retry logic is built for this — out of scope at pilot scale.
- **Role revoked while active** — covered by pgTAP #8 above: the next token refresh re-runs the same ensure-then-read path, no separate revocation-handling code needed (ADR-0022's "one choke point" consequence, made concrete).
- **HS student without a login yet** — unchanged from refine; `students.user_id` stays nullable until account provisioning (separate item) links it, and this hook simply has nothing to stamp for that student until a `user_roles` row exists.
- **`scope_id` malformed defensive check** — resolved by design, not by hook-side validation: the existing `user_roles_org_scope_null_id` check constraint (`core-schema-and-rls`) already makes a malformed row impossible to write, so the hook's read-time job is just "mirror the shape," covered under Data & RLS impact above.

### Out of scope (unchanged from refine, confirmed still correct)
- Role-switcher visual UI (ADR-0014) — separate item, shared navigation.
- `user_roles` row provisioning/approval workflow — separate `user-role-approval` System item.
- CSV enrollment import — separate System item.
- Retention/deletion job, notifications, chat delivery — unrelated, separate System items.
- Staging/prod hook registration itself (the Dashboard step) — flagged above as a `/deploy-staging`-time dependency on the not-yet-started `cloud-environment-provisioning` item, not built here.

---

## Sign-off
- [x] **Human sign-off on this design** (2026-07-10, shree.srinivas@outlook.com) → ready for **`/plan`**.
