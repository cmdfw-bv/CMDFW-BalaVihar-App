# System — Client auth session & nav

> **owner:** System · **consumers:** all 6 personas (Student, Parent, Teacher, Coordinator, BV Coordinator, Admin) — every persona-facing screen renders inside this shell · **scope:** client shell — magic-link sign-in UI, session provider/hook, role-derived tab navigation, conditional active-role switcher, sign-out (ADR-0005, ADR-0014, ADR-0023) · **governing ADR:** ADR-0005 (auth-magic-link, Closed — consumer), ADR-0014 (access-ux-role-derived-nav-conditional-switcher, Closed — this item implements it), ADR-0023 (active-role-storage-and-switch, Closed — consumer of `switch_active_role` RPC + claim shape) · **covers:** doc 3 §5.1/§5.3 (identity, active-role switching — client side), §12.13 (four-state DoD, no-permission-denied); doc 2 §2 (per-persona POC-core feature list, drives nav map); doc 1 §6 (magic-link)

**Stage:** Refined ✓ → Architect ✓ (no new ADR — governing ADRs unchanged: 0005, 0014, 0023; secure-storage guardrail added below) → Design ✓ (this section) → Architect glance ✓ (`user_roles_self_select` migration reviewed — no new ADR; see Design decision #3) → Human sign-off ✓ → `/plan` ✓ → `/migration` ✓ → `/build` ✓ → `/test` ✓ (203/203 vitest, 148/148 pgTAP, RLS adversarial 24/24, live playwright pass incl. AC#9 live-switch + AC#10 web — see [plan doc's Test results](client-auth-session-and-nav.plan.md#test-results-2026-07-13)) → PR #30 reviewed (arunasharad-coder) + merged 2026-07-18 (`1e15253`) — review surfaced a real web sign-in double-code-exchange bug (fixed, native-only deep-link guard) and a minors'-PII audit-exemption gap closed via **ADR-0027** (ADR-0019 addendum) → next `/deploy-staging` → `/promote`.

---

## Requirements (refined)

### User story
**As a** person with one or more role-grants in `user_roles` who completes magic-link sign-in, **I want** the client app to establish and persist my session, derive my navigation from my JWT's active-role claims, and — if I hold more than one role — offer a way to switch which role is active, **so that** I land directly on the screens my current role grants, with no permission-denied state ever, and switching roles swaps the whole app to the newly-scoped view.

### Decisions captured during refine
- **Nav map is role-derived from the JWT's `active_role` claim**, not a client-side permission check — the tab bar renders only the tabs a role's scope covers, sourced from doc 2's per-persona POC-core feature list.
- **Full nav mapping** (all 6 personas × 7 tabs — 5 existing placeholder screens plus 2 newly-surfaced gaps), worked through with the project owner role by role:

  | Role | Feed | Classes | Attendance | Chat | Dashboard | Approvals | Admin |
  |---|---|---|---|---|---|---|---|
  | Student | ✓ | ✓ | ✓ (view own) | ✓ | — | — | — |
  | Parent | ✓ | — | ✓ (view children's) | ✓ | — | — | — |
  | Teacher | ✓ | ✓ | ✓ (mark/submit) | ✓ | — | — | — |
  | Coordinator | ✓ | ✓ | — (rolled into Dashboard) | ✓ | ✓ | ✓ (stub) | — |
  | BV Coordinator | ✓ | — | — (rolled into Dashboard) | ✓ | ✓ | ✓ (stub) | — |
  | Admin | ✓ | — | — (rolled into Dashboard) | ✓ | ✓ | — | ✓ (stub) |

  - **Chat is available to every role**, not just Student/Parent/Teacher. ADR-0015's participant ladder already grants Coordinator "participant in every class chat in their session," and BV Coordinator/Admin "participant in any thread org-wide + leadership group" — this item's nav map surfaces an access decision ADR-0015 already made, it doesn't create a new one.
  - **Attendance for Coordinator/BV Coordinator/Admin folds into Dashboard** rather than getting its own tab — doc 2 defines their "compliance dashboard" as *already being* the per-class/per-center attendance rollup, so a separate Attendance tab would duplicate the same data.
  - **Approvals (Coordinator, BV Coordinator) and Admin (user/role mgmt + error monitoring)** are two doc-2 POC-core capabilities that don't map to any of the 5 existing placeholder screens. This item **stubs the route/tab** for both (visible in nav, placeholder content) so the nav map is complete now; the screen content itself is built by later items (`user-role-approval`'s UI is unbuilt; `error-monitoring-infra` is "Not started").
- **Sign-out is in scope.** A minimal control (in the switcher/context-chip area) calling `supabase.auth.signOut()` — completes the session lifecycle this item builds; no dedicated settings screen needed yet.
- **Zero-`user_roles` signed-in user gets a dedicated empty state** ("Your account is set up but no role has been assigned yet — contact your Bala Vihar coordinator"), not an error state. Rationale: `auth-hook-and-identity`'s own edge case already treats zero-role as "a no-op, not an error state" at the claims layer; ADR-0014's "error" state specifically means a failed operation with preserved work to retry, which a provisioning-timing gap is not.
- **Switching roles = re-issuing the token**, per §5.3 / ADR-0023: client calls the already-built `switch_active_role(p_user_roles_id)` RPC, then `refreshSession()`; the UI's switcher is cosmetic, the new JWT is the actual enforcement. The conditional switcher (ADR-0014): shown only when an account holds ≥2 roles; single-role accounts see a static context chip naming the bound scope (Center · Session · Grade/Class) instead.
- **Session persistence**: session must survive app restarts (native) and page reloads (web) — the exact storage mechanism (e.g. `expo-secure-store` vs. an `AsyncStorage` adapter for the Supabase client) is a `/design`-stage decision, not a refine-stage one. **Architect guardrail:** whatever mechanism `/design` picks must be secure/encrypted-at-rest (e.g. `expo-secure-store` natively, an encrypted/non-plaintext adapter on web) — plaintext `AsyncStorage` for the session token is not acceptable, since the token gates access to minors' records on devices a household may share (ADR-0018). No shared-device idle-timeout/re-auth policy is required for the pilot — accepted as a POC-scope trade-off, not an oversight.

### Acceptance criteria
1. **Magic-link sign-in screen** in `app/(auth)/`, wired to `supabase.auth.signInWithOtp({ email })`; handles the deep-link/callback completion (native deep link + web URL) back into an authenticated session.
2. **Session provider/hook** in `lib/auth/` wraps the app: exposes current session, decoded `active_role`/`scope_type`/`scope_id` claims, and subscribes to `supabase.auth.onAuthStateChange` so claim changes (sign-in, sign-out, role switch, token refresh) propagate to nav without a manual reload.
3. **Root routing replaces the hardcoded redirect**: `app/index.tsx` / `app/_layout.tsx` route unauthenticated sessions to `(auth)` sign-in, and authenticated sessions to the role-derived tab set — never a hardcoded `/feed`.
4. **Role-derived tab bar** renders exactly the tabs listed in the nav-mapping table above for the current `active_role` — no more, no less; a role never sees a tab outside its mapped set.
5. **Stub routes for Approvals and Admin** exist and appear in nav per the mapping table, with minimal placeholder content (e.g. "Coming soon") — not full screens, just complete nav.
6. **Conditional active-role switcher**: rendered only for accounts holding ≥2 `user_roles` rows; invokes `switch_active_role` RPC + `refreshSession()` on selection; single-role accounts see a static, non-interactive context chip (Center · Session · Grade/Class) instead — never both, never neither.
7. **Sign-out control** calls `supabase.auth.signOut()` and returns to the sign-in screen.
8. **Zero-role empty state**: a signed-in user whose JWT carries no `active_role` claim sees the dedicated empty-state screen (not a crash, not a blank tab bar, not an error banner).
9. **Out-of-scope/stale route handling (ADR-0014)**: navigating to a route outside the current active role's mapped tabs (e.g. a bookmarked link after a role change) silently redirects to the user's home feed — never a permission-denied screen, never a broken/blank screen.
10. **Session persists** across app restart (native) and page reload (web) without forcing re-sign-in while the underlying Supabase session is still valid.
11. **All four DoD states** (loading · empty · error-preserving · content — §12.13) are drawn for the sign-in flow itself (e.g. loading while the magic-link request is in flight, error-preserving with retry if the OTP request fails, content once sign-in completes).

### Edge cases
- **Zero-role user** — dedicated empty state (AC#8), not error; see rationale above.
- **Sign-in request fails** (network, invalid email, SES/rate-limit issue) — error-preserving state (§12.13 DoD), the user's entered email is not lost, retry available.
- **Role revoked while active** (companion to `auth-hook-and-identity`'s same-named edge case) — next token refresh carries the auto-activated replacement role (or the zero-role empty state if none remain); client doesn't need special-case logic beyond re-reading claims on every refresh, since the hook already re-heals server-side.
- **Stale/bookmarked route after a role switch or revocation** — silent redirect to home feed (AC#9, ADR-0014) — never leaks that an out-of-scope route "exists."
- **`switch_active_role` no-ops silently** (e.g. a stale/tampered row id) per ADR-0023 — client shows no error (matches the RPC's own no-existence-leak contract) but also doesn't optimistically flip the UI; it reflects whatever the next `refreshSession()` actually returns.
- **Magic-link deep link opened on a device with no existing app session** (e.g. cold start from an email client) — same sign-in completion path as a warm start, per AC#1.

### Priority
**POC-core, foundational — client gate.** Per the issue: this is the gate for all persona UI (attendance, feed, dashboards, chat) — every persona feature UoW (#18–#24) needs a real, role-derived shell to render into. Startable now; was blocked only on `auth-hook-and-identity` (Built, PR #11 merged), which is satisfied.

### Consumers (cross-persona)
All 6 personas — every later persona-facing feature UoW mounts inside this item's authenticated, role-derived shell rather than the current hardcoded `/feed` stub.

### Access scope (§5.4)
**Client UX shell, not an enforcement layer.** This item does not gate data access — RLS (ADR-0003) and the JWT claims (`auth-hook-and-identity`) remain the sole enforcement. This item only ensures the UI never *offers* navigation to something the active role's claims wouldn't be allowed to see, per ADR-0014's UX guarantee layered on top of DB-enforced access.

### Explicitly out of scope (so a later item picks it up)
- **Screen content** for Feed/Classes/Attendance/Chat/Dashboard/Approvals/Admin — each persona's own feature UoW (#18–#24) builds its screen's actual content; this item only builds the shell + nav + which tabs exist.
- **`user_roles` provisioning** — separate `user-role-approval` item (Built).
- **Chat backend wiring** (Realtime broadcast, `conversations`/`conversation_participants` schema) — separate `realtime-chat-delivery` item (Not started); this item's Chat tab may render against an empty/unbuilt backend until that item ships.
- **Error-monitoring integration itself** (Sentry wiring) — separate `error-monitoring-infra` item (Not started); this item only reserves the Admin tab's nav slot.
- **Notifications** (push subscription UI, preferences) — separate `notifications-infra` item.

---

## Design (detailed spec)

> **Stage:** 1 — Design ✓ (this section). `/refine` ✓ → `/architect` ✓ (no ADR) → `/design` ✓ → `/architect` glance ✓ (decision #3 below — no new ADR) → human sign-off ✓ → `/plan` ✓ → next is `/migration`.
> **Design decisions captured this pass:**
> 1. **Session storage:** `expo-secure-store` on native (Keychain/Keystore-backed); a hand-written Web Crypto–encrypted adapter over `localStorage` on web. Both implement Supabase's `SupportedStorage` interface and are swapped in behind one `lib/auth/storage.ts` — satisfies the architect's encrypted-at-rest guardrail without a plaintext `AsyncStorage` path on either platform.
> 2. **Tab routing:** one `app/(tabs)/_layout.tsx`, all 7 `Tabs.Screen` entries (`feed`/`classes`/`attendance`/`chat`/`dashboard`/`approvals`/`admin`) always registered; tabs outside `ROLE_TABS[activeRole]` get `options={{ href: null }}` — hidden from the bar but still routable, which is what makes the stale-route silent-redirect (AC#9) a real case to guard rather than an unreachable one.
> 3. **Switcher data path — new migration.** The JWT only ever carries the *active* role; `user_roles` was deliberately left zero-client-readable by `auth-hook-and-identity`. This item adds one narrow self-row `select` RLS policy (`user_id = auth.uid()`) so the switcher can read the caller's own grant rows. **This is the first "client shell" item to carry a schema migration** — flagged below for a quick `/architect` glance before `/plan`, not because it's expected to be ADR-significant (it's narrow, self-row, and precedented by `switch_active_role`'s own ownership check) but because it reverses `core-schema-and-rls`'s deliberate zero-read posture on this table and that reversal deserves a recorded, conscious yes rather than a silent one.
> 4. **Root routing gate:** `app/_layout.tsx` uses three `Stack.Protected` guards (Expo Router 56, already in this repo's dependency range) keyed off session status — `signed-out` → `(auth)`, `zero-role` → a dedicated non-tab empty-state screen, `ready` → `(tabs)` — replacing today's hardcoded `<Redirect href="/feed" />` in `app/index.tsx`. Chosen over a conditional `<Redirect>` to avoid a visible flash/redirect-loop while the session restores from secure storage on cold start.

> **Architect review (decision #3, this pass):** Signed off — **no new ADR.** `core-schema-and-rls`'s zero-client-read posture on `user_roles` was a locked-down-until-the-hook-exists default, not a standing decision recorded in its own ADR; reversing it for one narrow self-row `select` doesn't reopen or supersede anything Closed. Checked against precedent and the guardrails this pass covers:
> - **Shape precedent:** `push_subscriptions_owner_all` already grants a caller `for all` (full CRUD) on `user_id = auth.uid()` rows — this item's policy is strictly narrower (read-only) using the identical self-row shape. Not a new RLS pattern.
> - **Write-path precedent:** `switch_active_role`'s `security definer` ownership check (`v_owner is distinct from auth.uid()`) already established that `user_roles` access keys off row ownership; this policy applies the same test at the RLS layer instead of inside an RPC.
> - **ADR-0003 (RLS is the authoritative enforcement layer):** unaffected — this adds a DB-enforced policy, not an app-layer check, and grants nothing beyond the caller's own rows.
> - **Minors'-data audit (constitution #6, ADR-0019):** ADR-0019 already draws the line this decision needs — "Parent (own-children) and Student (self) reads... unaudited by design; this is the subject... viewing their own data, not the oversight case `audit_log` exists to cover." A user reading their own `role`/`scope_type`/`scope_id` pointer is the same self-access case; no `audit_log` entry is warranted, and none is added.
> - **Blast radius:** read-only, own-rows-only, no change to `custom_access_token_hook`, `switch_active_role`, or any other table's policy. `insert`/`update`/`delete` on `user_roles` remain zero-grant.
>
> Governing ADRs unchanged (0005, 0014, 0023) — none superseded, none added. Cleared for `/plan` once the human sign-off below is checked.

### Behavior

**Session bootstrap (cold start).** `SessionProvider` (new, wraps the app in `app/_layout.tsx`) calls `supabase.auth.getSession()` on mount, which reads through the storage adapter from decision #1, and subscribes to `supabase.auth.onAuthStateChange` for the app's lifetime — every event (`INITIAL_SESSION`, `SIGNED_IN`, `SIGNED_OUT`, `TOKEN_REFRESHED`, `USER_UPDATED`) re-runs the same derivation: decode claims → fetch `myRoles` → recompute `status`. `status` is one of `loading | signed-out | zero-role | ready`; the existing `expo-splash-screen` stays up for `loading` so no wrong-tree flash occurs before the first `Stack.Protected` decision.

**Claims decoding.** `active_role`/`scope_type`/`scope_id` are read from the session's `access_token` JWT payload via a small zero-dependency base64url-JSON decode helper (`lib/auth/claims.ts`) — the claim shape is fully owned and guaranteed by `auth-hook-and-identity`, so no schema/validation library is warranted for parsing three known keys.

**Role list (`myRoles`).** `supabase.from('user_roles').select('id, role, scope_type, scope_id, is_active')` — returns the caller's own rows once the new self-select policy (decision #3) lands. Refetched alongside claims on every `SIGNED_IN`/`TOKEN_REFRESHED`, not cached across the session, so a grant/revoke elsewhere is picked up on the next token refresh rather than going stale. `myRoles.length >= 2` is the sole condition gating switcher-vs-static-chip (ADR-0014 AC#6) — no separate "has multiple roles" flag to keep in sync.

**Magic-link sign-in.** `app/(auth)/sign-in.tsx`: email field + submit calls `supabase.auth.signInWithOtp({ email, options: { emailRedirectTo } })`, `emailRedirectTo = Linking.createURL('/auth/callback')` (resolves to the `cmdfwbalavihar://auth/callback` custom scheme on native per `app.json`'s existing `scheme`, and the deployed origin + path on web). Screen states per AC#11: `content` (form) → `loading` (request in flight) → `error-preserving` (request failed, entered email retained, retry available) → `content` (post-success "check your email" message — not a new DoD state).

**Deep-link completion.** Owned by `SessionProvider`, not a dedicated route — it calls `Linking.getInitialURL()` (cold start) and subscribes to `Linking.addEventListener('url', …)` (warm start) for the whole app lifetime. Supabase JS v2's default PKCE flow means the incoming callback URL carries `?code=...`, exchanged via `supabase.auth.exchangeCodeForSession(code)`. On web, `detectSessionInUrl: true` (the client default) consumes the URL automatically; `SessionProvider` just calls `getSession()` post-mount and the router strips the now-consumed query/hash via `router.replace('/')`. Same completion path for a cold-start deep link as a warm-start one (per refine's edge case) — one code path, no native/web branch beyond the URL-capture mechanism itself.

**Switch role.** The switcher (rendered in the tab group's header/context area) lists `myRoles`, each row labeled `role · Center · Session · Grade/Class`; selecting one calls `switch_active_role(id)` then `supabase.auth.refreshSession()`. The resulting `TOKEN_REFRESHED` event re-runs the full bootstrap derivation above, including a new `activeRole`-derived tab set. No optimistic UI flip — the switcher reflects only what `refreshSession()` actually returns, per the refine-stage no-op edge case.

**Sign-out.** `supabase.auth.signOut()` → `SIGNED_OUT` → `status` flips to `signed-out` → the root `Stack.Protected` swap to `(auth)` happens automatically, no manual navigation call.

**Stale/out-of-scope route (AC#9).** `href: null` (decision #2) hides a tab from the bar but Expo Router still resolves it directly, so a shared `useRoleGuard()` hook — applied at the top of every tab screen, including the two stub screens — checks route membership in `ROLE_TABS[activeRole]` and calls `router.replace('/feed')` if it isn't. One mechanism covers both "never had this tab" and "had it, then switched/got-revoked into not having it."

**Zero-role empty state.** A dedicated screen (`app/(auth)/no-role.tsx`, reached via the `zero-role` `Stack.Protected` guard, outside `(tabs)` entirely — not an empty tab bar) shows the "account set up, no role assigned yet — contact your Bala Vihar coordinator" message (AC#8). No role badge/chip renders here — there's nothing to show.

### Data & RLS impact

**New migration** (`supabase/migrations/<timestamp>_user_roles_self_select.sql`):
```sql
create policy user_roles_self_select on user_roles for select
to authenticated
using (user_id = auth.uid());
```

**Grant/policy surface after this item:**

| Grantee | Privilege | Scope | Purpose |
|---|---|---|---|
| `authenticated` | `select` | RLS: own rows only (`user_id = auth.uid()`) — **new** | client's switcher role-list read |
| `authenticated` | `insert`/`update`/`delete` | — (unchanged, zero grant) | still no client write path to `user_roles` — `switch_active_role` remains the only writer |
| `supabase_auth_admin` | `select` / `update (is_active)` | `using (true)` (unchanged) | hook's read/ensure step — untouched by this item |

No changes to `custom_access_token_hook`, `switch_active_role`, or any other existing policy/RPC.

**Adversarial RLS test additions** (owned by this item's `/migration` stage, `supabase/tests/`, constitution rule #4): (a) user A's query returns exactly their own N `user_roles` rows; (b) user A's query never returns user B's rows, across every role/scope combination; (c) a zero-role user's query returns 0 rows (not an error); (d) `insert`/`update`/`delete` against `user_roles` as `authenticated` still fail — confirms the new policy adds read only, nothing wider.

**Reconciling with "client shell, not an enforcement layer" (Access scope, above):** this policy grants a user read of their *own* identity/role metadata for nav purposes — the same information already implied by their own JWT, just listable instead of singular. It does not gate access to any other person's data and doesn't change what any existing policy on any other table does.

### API / new module surface (`lib/auth/`)
- `storage.ts` — `SupportedStorage`-conformant adapter: `expo-secure-store` (native) / Web Crypto–encrypted `localStorage` wrapper (web).
- `claims.ts` — decode `active_role`/`scope_type`/`scope_id` from a session's `access_token`.
- `navMap.ts` — `ROLE_TABS: Record<Role, TabKey[]>`, sourced directly from the nav-mapping table in Requirements above.
- `SessionProvider.tsx` + `useSession()` — exposes `{ status, session, activeRole, scopeType, scopeId, myRoles, signOut, switchRole }`.
- `useRoleGuard.ts` — the stale-route redirect hook used by every tab screen.

### File / route changes
- **New:** `lib/auth/{storage,claims,navMap,SessionProvider,useRoleGuard}.ts`, `app/(auth)/sign-in.tsx`, `app/(auth)/no-role.tsx`, `app/(tabs)/approvals.tsx`, `app/(tabs)/admin.tsx`, `components/RoleSwitcher.tsx` (renders switcher or static chip per `myRoles.length`), `supabase/migrations/<timestamp>_user_roles_self_select.sql`.
- **Modified:** `app/_layout.tsx` (wrap in `SessionProvider`, add `Stack.Protected` guards), `app/index.tsx` (drop the hardcoded `Redirect`), `app/(tabs)/_layout.tsx` (compute tab set from `ROLE_TABS[activeRole]`, mount `RoleSwitcher` in the header), `app/(auth)/_layout.tsx` (mount `sign-in`/`no-role`), `lib/supabase.ts` (wire the new `storage` adapter + PKCE/`detectSessionInUrl` client options), `package.json` (add `expo-secure-store`).

### UI
**Sankalp status:** landed (commit `db453e8`) — `lib/theme.ts` is the live visual contract and the Chinmaya Mission Design System project (`bv-connect/**`) is the canonical reference; this section's original "not yet imported" framing is superseded (see plan doc's `2026-07-14` design-parity re-validation, which re-checked every screen/component this item owns against `bv-connect/**` directly rather than just the DoD checklist).
- **Four states, drawn explicitly for the sign-in screen** (AC#11): `content` (email form) → `loading` (OTP request in flight) → `error-preserving` (request failed, email retained, retry) → `content` (post-success "check your email"). Tab screens show `loading` only for the rare case claims/role-list haven't resolved by first mount (session restore from secure storage is normally synchronous-feeling); each tab's own `empty`/`error-preserving` states are that persona feature's own concern (out of scope here).
- **No permission-denied state anywhere** (ADR-0014) — structurally enforced by `href: null` + `useRoleGuard`, never a rendered "denied" screen.
- **Role badge + scope:** the switcher (≥2 roles) or the static context chip (1 role), both `role · Center · Session · Grade/Class`, per ADR-0014 §4. The zero-role empty-state screen shows neither. **Correction (2026-07-14 re-validation):** the switcher is a single compact trigger + bottom-sheet (matching `bv-connect/components/navigation/PersonaSwitcher.jsx`), not one always-visible pill per held role — see plan doc test results, issue #34. **Correction (2026-07-14, issue #35 resolved):** the `Center · Session · Grade/Class` part of the label is now a real resolved name (e.g. "Frisco · F3 · Shishu Vihaar Class" for a teacher, "Frisco · F3" for a coordinator), via a new `resolve_my_scope_labels()` SECURITY DEFINER RPC keyed on `auth.uid()` — see `client-auth-session-and-nav.plan.md`'s issue #35 resolution section.
- **≥44px touch targets, tokens-not-hex, tabular numerics:** carried forward as a `/build`-time gate; this item's own screens (sign-in form, empty state, stub screens) have no comparison numerics to set tabular, so that rule is N/A here rather than deferred. **Correction (2026-07-14):** the original one-pill-per-role switcher violated this at narrow widths with ≥3 roles (issue #34) — fixed.

### Edge cases (design detail)
- **Zero-role user** — dedicated `no-role` screen via the `zero-role` `Stack.Protected` guard (AC#8); not an empty tab bar, not an error.
- **Sign-in request fails** — `error-preserving` state on `sign-in.tsx`, entered email retained in local component state (not cleared on failure), retry re-submits the same `signInWithOtp` call.
- **Role revoked while active** — covered by `TOKEN_REFRESHED`'s full re-derivation (bootstrap step); no special-case client code, matches `auth-hook-and-identity`'s own hook-side self-healing.
- **Stale/bookmarked route after a role switch or revocation** — `useRoleGuard` (Behavior, above); silent redirect to `/feed`, never a "this route exists but you can't see it" leak.
- **`switch_active_role` no-ops silently** — no optimistic flip; switcher UI reflects only the post-`refreshSession()` state (Behavior, above).
- **Magic-link deep link on a cold start with no existing app session** — same completion path as a warm start (`getInitialURL()` covers it), per Behavior above.

### Out of scope (confirmed, unchanged from refine)
- Screen content for Feed/Classes/Attendance/Chat/Dashboard/Approvals/Admin — later persona UoWs (#18–#24).
- `user_roles` *provisioning* (insert/grant new rows) — separate `user-role-approval` item (Built); this item only adds a **read** policy, never a write path.
- Chat backend wiring, error-monitoring (Sentry) wiring, notifications — separate, not-yet-started System items; this item only reserves/stubs their nav slots.

---

## Sign-off
- [x] **Human sign-off on this design** (project owner, 2026-07-13) → ready for **`/plan`**.
- [x] **Architect glance on the new `user_roles_self_select` migration** (Design decision #3) — reviewed 2026-07-13, **no new ADR**: narrow self-row `select`, precedented by `push_subscriptions_owner_all` (shape) and `switch_active_role` (ownership check), ADR-0019's self-access audit exemption applies, governing ADRs 0005/0014/0023 unchanged. Full reasoning recorded inline above decision #4.

---

## Amendment — issue #46: `/no-role` is a dead end (bug fix)

**Stage:** Refined ✓ → Architect ✓ (no ADR — retry interval + `Button` reuse resolved inline) → Design ✓ → Human sign-off ✓ (2026-07-25) → next `/plan`.

Found during manual walkthrough of `class-update-and-home-feed` (#21): `app/no-role.tsx` (AC#8 of the original item above) renders the zero-role empty state but offers no way off it — `app/_layout.tsx`'s `Stack.Protected` guards make `(auth)` unreachable once `status === "zero-role"`, so a user who lands here before their role grant lands (or after a mid-session revoke) is stuck until they manually clear browser site data. Root item is otherwise Built/ready-for-`/deploy-staging`; this amendment is a contained bug fix against that one screen, not a reopening of the whole item.

### User story
**As a** signed-in user whose JWT currently carries no `active_role` claim, **I want** a way to sign out from `/no-role`, and for the app to notice automatically once my role grant lands, **so that** a provisioning-timing gap never strands me on a dead-end screen.

### Decisions captured during refine
- **Both halves of the issue's suggested fix are in scope**: a sign-out control, *and* an automatic `refreshSession()` retry loop (interval + regained-focus) — confirmed with the human rather than shipping sign-out-only. The auto-refresh closes the loop for the common case (grant lands while the tab is just sitting open); sign-out remains the manual escape hatch for everything else (wrong account, grant taking longer than expected, revoke-with-no-replacement-role).
- **The seeded-student `user_roles` gap** mentioned in the issue ("Related") is **out of scope for this item** — filed separately as [issue #53](https://github.com/cmdfw-bv/CMDFW-BalaVihar-App/issues/53), mirroring how #32 was its own dedicated fix for the analogous parent-account gap. Keeps this amendment scoped to the client-side dead-end only.
- **No new state machine.** `refreshSession()` already fires the existing `onAuthStateChange` → `TOKEN_REFRESHED` → full re-derivation path that `SessionProvider`/`sessionDerivation.ts` (Design, above) already implements — the auth hook auto-activates a single-role grant on next token mint (per `auth-hook-and-identity`), so a plain `refreshSession()` call is sufficient; no new client-side status or polling state is introduced beyond the timer/listener that triggers the call.
- **Failures stay silent.** A `refreshSession()` call that doesn't yet find a role (still zero-role) or hits a network hiccup must not show an error banner or disrupt the screen — same silent-no-op contract this item's `switchRole` already follows for `switch_active_role`. The screen has one visible affordance (sign-out); the auto-refresh is invisible unless it succeeds.
- **Scope stays this one screen.** No changes to `SessionProvider`'s public surface (`signOut` is already exposed, per Behavior above), no changes to the `signed-out`/`ready` paths, no RLS/migration impact.

### Acceptance criteria
1. `/no-role` renders a sign-out control (reusing `components/core/Button`, one primary action per view per the design-system DoD) that calls the existing `useSession().signOut()` and returns to `(auth)` sign-in.
2. While `/no-role` is mounted, it automatically calls `supabase.auth.refreshSession()` on an interval, and again whenever the app/tab regains focus (`AppState` → `"active"` on native; `visibilitychange`/`focus` on web) — covering both "left the tab open" and "came back to it" recovery paths without a manual sign-out.
3. If a refresh picks up a newly-granted role, the existing `TOKEN_REFRESHED` handler re-derives `status` to `"ready"` and the root `Stack.Protected` swap to `(tabs)` happens automatically — no manual reload, no special-case navigation call on this screen.
4. A refresh that finds no role yet (or fails) leaves the screen exactly as-is — no error banner, no visible retry state, no console-visible crash.
5. No behavior change to `signed-out` or `ready` statuses, `sign-in.tsx`, or any tab screen.

### Edge cases
- **Sign-out fires while an interval/focus refresh is in flight** — no race: `signOut()` ends the session, the next `onAuthStateChange` (`SIGNED_OUT`) re-derives status to `"signed-out"` regardless of what the in-flight `refreshSession()` resolves to.
- **`refreshSession()` against an already-invalidated/long-idle session** — fails silently (AC#4); user remains on `/no-role` until they sign out or a valid refresh succeeds.
- **Multiple tabs open on web** — each tab runs its own independent interval/focus listener; benign, since each just calls the same idempotent `refreshSession()`.
- **Role revoked with no replacement while already on `/no-role`** (shouldn't normally occur — revoke-while-*inactive*-and-zero-role is a narrower case than the original item's "revoked while active" edge case) — no special-case needed, same silent no-op as above.

### Priority
**POC-core bug fix** — closes a real dead-end for any user hitting a provisioning-timing race; small, single-screen blast radius against an otherwise-Built item.

### Consumers (cross-persona)
Same as the root item — all 6 personas (anyone can transiently land on `zero-role`).

### Access scope (§5.4)
Unchanged — client UX only. `signOut()` and `refreshSession()` are both existing Supabase Auth client calls this item already uses elsewhere (`RoleSwitcher`'s `switchRole` already calls `refreshSession()`); no RLS/migration impact.

### Explicitly out of scope
- The seeded-student `user_roles` provisioning gap — [issue #53](https://github.com/cmdfw-bv/CMDFW-BalaVihar-App/issues/53).
- Any change to the sign-in screen, tab screens, or the `signed-out`/`ready` status paths.

### Architect review
- **No architecturally-significant decision → no ADR.** Contained client-only reuse of already-audited Supabase Auth calls (`signOut()`, `refreshSession()` — both already exercised elsewhere in this item, per `SessionProvider.tsx`); no new schema/RLS shape, no new external processor, no cross-scope access change, no minors'-data/residency impact. Governing ADRs 0005/0014/0019/0023 checked (all Closed) — none need superseding, this amendment doesn't change the mechanism any of them settled.
- **Retry interval: 60s.** The focus-triggered refresh (AC#2) already handles the common "returned to the tab" recovery path immediately; the timer only serves the "left it open, walked away" case, where there's no urgency. 60s resolves that case within about a minute without adding unnecessary `refreshSession()`-driven refresh-token churn (relevant given the "multiple tabs" edge case above — each tab rotates the refresh token on its own call).
- **AC#1's `components/core/Button` stands as written — no conflict with `RoleSwitcher`'s existing bespoke sign-out `Pressable`.** Different contexts: `RoleSwitcher`'s sign-out is a secondary affordance inside compact header chrome (a full pill button there would compete visually with the role-switcher trigger); `/no-role` is a full-screen empty state where sign-out is the view's one primary action — exactly the case `Button` (primary variant) is for, per the design-system DoD. `RoleSwitcher.tsx` is unchanged, out of scope.

### Design (detailed spec)

> **Design decisions captured this pass:**
> 1. **Auto-refresh — new `lib/auth/useAutoRefreshOnRegain.ts` hook**, not an extension of `SessionProvider`'s public surface (ruled out during refine) and not inlined directly in `app/no-role.tsx`. Same shape as the existing `useRoleGuard.ts` — a small, standalone, screen-mounted hook. Signature: `useAutoRefreshOnRegain(intervalMs: number): void` — pure side effect, no return value, no local state.
> 2. **One underlying call, two triggers.** Internally: `setInterval(() => { void supabase.auth.refreshSession().catch(() => {}); }, intervalMs)` (called with `60_000`, per the Architect review's interval decision above) plus a platform-branched "regained focus" listener firing the identical call — `AppState.addEventListener('change', (next) => { if (next === 'active') … })` on native, `document.addEventListener('visibilitychange', …)` + `window.addEventListener('focus', …)` on web, per AC#2's explicit native/web split. Both triggers call the exact same one-line `refreshSession().catch(() => {})` — no separate "reason" branching, since AC#4 requires identical silent-no-op handling regardless of what triggered the call.
> 3. **Errors are swallowed at the call site, inside the hook — never surfaced.** `.catch(() => {})` on every `refreshSession()` call: no console output (AC#4 forbids console-visible noise), no error state, no out-of-cadence retry. Mirrors `SessionProvider.tsx`'s existing `switchRole` no-op contract for `switch_active_role`.
> 4. **No dependency on `useSession()`/context for the refresh call itself** — the hook imports `supabase` directly (`lib/supabase.ts`, already the pattern every other `lib/auth/` module follows). `TOKEN_REFRESHED` reaches `SessionProvider` via its existing `onAuthStateChange` subscription regardless of which call site triggered the underlying refresh, so routing this through context would add indirection with no behavioral difference — confirmed against the refine-stage decision that `SessionProvider`'s public surface doesn't change.
> 5. **Lifecycle is entirely `Stack.Protected`-driven — no manual teardown needed.** `app/no-role.tsx` only mounts while `status === "zero-role"`; the moment a refresh (interval- or focus-triggered) succeeds and flips `status` to `"ready"`, `Stack.Protected` swaps the screen out, unmounting it — the hook's `useEffect` cleanup (`clearInterval` + listener `.remove()`) runs automatically on that unmount, same as on `signOut()`'s swap to `"signed-out"`. No explicit "stop polling" call anywhere.
> 6. **Sign-out control:** `components/core/Button` (`variant="primary"`, `size="lg"`, label "Sign out"), `onClick={() => { void signOut(); }}` from the existing `useSession()`. One primary action per view, per the design-system DoD — same component already used for `sign-in.tsx`'s submit action; `RoleSwitcher.tsx`'s bespoke sign-out `Pressable` is a different, unchanged context (Architect review above).

### Behavior
`app/no-role.tsx` (function component, unchanged file) adds two things to its existing render: a `useAutoRefreshOnRegain(60_000)` call at the top, and a `Button` below the existing message text, wired to `useSession().signOut()`.

- **Steady state:** every 60s, and again immediately whenever the app/tab regains focus, the hook fires `supabase.auth.refreshSession()`. Nothing visible happens unless it succeeds *and* the new token carries an `active_role` claim.
- **Recovery path:** a `refreshSession()` call picks up a newly-granted role → Supabase JS emits `TOKEN_REFRESHED` → `SessionProvider`'s existing `refresh()` (unchanged, `SessionProvider.tsx:45`) re-derives `status` → `"ready"` → root `Stack.Protected` (`app/_layout.tsx`) swaps `no-role` out for `(tabs)` → `useAutoRefreshOnRegain`'s effect cleanup fires on unmount, clearing the interval/listener. No code in `no-role.tsx` reacts to this directly — it's the same claims-re-derivation path AC#3 points to.
- **No-op path:** a call that finds no role yet, or rejects (network hiccup, invalidated session), is caught and dropped inside the hook (decision #3) — the screen's render is untouched, no re-render is even triggered since the hook holds no state.
- **Sign-out path:** button press → `signOut()` → `supabase.auth.signOut()` → `SIGNED_OUT` → `status` → `"signed-out"` → `Stack.Protected` swaps to `(auth)` → `no-role.tsx` unmounts → hook cleanup clears any in-flight interval/listener. If a `refreshSession()` call was in flight when sign-out fired, its eventual resolution (success or failure) is a no-op either way — the component that would have reacted to it is already gone (refine-stage edge case, restated here as: cleanup wins the race unconditionally, not "usually").

### Data & RLS impact
None. `signOut()` and `refreshSession()` are both existing Supabase Auth client calls, already exercised elsewhere in this item (`RoleSwitcher.switchRole` already calls `refreshSession()`; every screen's sign-out already calls `signOut()`) — no new migration, no new RLS policy, no change to `custom_access_token_hook` or any existing grant.

### UI
**Reference:** `components/core/Button.tsx` (ported from `design/sankalp/components/core/Button.jsx` / `.prompt.md`, already landed) — no new component, no DesignSync pull needed for this amendment.
- `variant="primary"`, `size="lg"` — the screen's one primary action, per the design-system DoD ("one primary action per view"); no secondary/ghost buttons added, nothing competes with it.
- `theme.chrome.hitMin` (Button's own `minHeight`) already clears the ≥44px touch-target rule — no override needed.
- Existing `no-role.tsx` container/text styling (`theme.space.lg` padding, `theme.chrome.maxw` width cap, `theme.fonts.body`) is unchanged; the button is appended below the message using the same token-driven spacing (`theme.space.lg` gap), no hex literals introduced.
- No new DoD state is introduced — this remains the same single "content" render the empty-state screen already was; the auto-refresh is invisible by design (decision #3 / AC#4), so there is no loading/error variant to draw for it.

### Edge cases (design detail)
Carried forward unchanged from Refined, above, with one implementation note:
- **Unmount race is unconditional, not best-effort** — because the hook holds no local state (decision #1), there is no "setState after unmount" hazard to guard against; a `refreshSession()` promise that resolves after `no-role.tsx` has already unmounted (via sign-out or a successful earlier refresh) simply has no listener left to react to it.

### Out of scope
Unchanged from Refined, above — the seeded-student provisioning gap ([issue #53](https://github.com/cmdfw-bv/CMDFW-BalaVihar-App/issues/53)) and any change to `sign-in.tsx`, tab screens, or the `signed-out`/`ready` status paths.

### Sign-off
- [x] Human sign-off on this refined scope (project owner, 2026-07-25).
- [x] Architect review (2026-07-25) — no ADR; retry interval and Button-choice open questions resolved inline above → ready for **`/design`**.
- [x] **Human sign-off on this design** (project owner, 2026-07-25) → ready for **`/plan`**.
