# Plan — System: client-auth-session-and-nav

> Spec: [client-auth-session-and-nav.md](client-auth-session-and-nav.md) · ADR-0005, ADR-0014, ADR-0023 (all Closed, unchanged) · stage: `/plan` (this doc) → `/migration` ✓ → `/build` ✓ → `/test` ✓ (see Test results below) → next `/deploy-staging`

## Shared seam

**Stage 1 (migration — `user_roles_self_select` RLS policy) is the serialized gate**, same classification as every prior System item touching schema. It unblocks exactly one downstream piece: `SessionProvider`'s `myRoles` query (F10) and the `RoleSwitcher` component (F16) that reads it — both need the policy live locally to smoke-test against a real DB.

**Stages 2–5 (pure TypeScript logic — `claims.ts`, `navMap.ts`, `storage.ts`'s crypto helpers, `sessionDerivation.ts`) have zero DB dependency.** They're unit-tested with `vitest` (node environment, already the repo's convention for `netlify/functions/lib/`) and can be written in any order, independent of Stage 1 landing. This mirrors `user-role-approval`'s plan: the migration is the gate, everything mockable/pure builds around it.

**What's deliberately *not* unit-tested here, and why:** this repo has no React/React Native component-test harness (`vitest.config.ts` only covers `netlify/functions/`, `.claude/hooks/`, `scripts/`) — adding one (e.g. `@testing-library/react-native`) is a bigger call than this item's scope. So the plan draws the TDD line at the **pure-logic boundary**: anything that's a plain function (claims decoding, nav-map lookup, route-membership check, AES-GCM encrypt/decrypt, session-status derivation) gets a RED→GREEN vitest unit test. The thin **wiring** layer around them (`SessionProvider.tsx`'s `useEffect`/subscription glue, `useRoleGuard.ts`'s `router.replace` call, the screens, the `Stack.Protected` root gate) is verified by hand at `/build` (`npm run dev` + manual walkthrough) and again at `/test` via `playwright-cli` against every AC — not by a component unit test. This is a plan-level testability decision, not a spec deviation (the public module surface in "API / new module surface" is unchanged), and isn't architecturally significant — no bounce to `/architect`.

**Branch:** current branch `ssrinivas90/issue-17-client-auth-session`, cut from `origin/main` (0 commits ahead). Single cohesive client-shell item — no worktree needed.

**Verify-at-build flag:** `app/_layout.tsx`'s three-way `Stack.Protected` root gate (design decision #4) and the `(auth)/no-role` screen's exact guard/name wiring is Expo Router 56 API surface this plan hasn't hand-tested. F20's code below is a considered first attempt at the shape design decision #4 describes; if `Stack.Protected` doesn't accept a nested-group screen name (`"(auth)/no-role"`) the way sketched, adjust the file layout (e.g. hoist `no-role.tsx` out of the `(auth)` group to its own top-level route) at `/build` — the guard *behavior* (signed-out → sign-in, zero-role → no-role, ready → tabs, no flash) is the AC, not this exact file path.

---

## Task list (ordered — TDD throughout)

### Stage 1 — Migration (serialized)

- [x] **M1 — pgTAP tests (RED)** `supabase/tests/140_user_roles_self_select.sql`
  ```sql
  begin;
  select plan(6);

  select tests.create_supabase_user('self-select-a@test.local') as v_user_a \gset
  select tests.create_supabase_user('self-select-b@test.local') as v_user_b \gset
  select tests.create_supabase_user('self-select-zero@test.local') as v_user_zero \gset

  insert into user_roles (user_id, role, scope_type, scope_id) values
    (:'v_user_a'::uuid, 'teacher', 'class', gen_random_uuid()),
    (:'v_user_a'::uuid, 'coordinator', 'session', gen_random_uuid());
  insert into user_roles (user_id, role, scope_type, scope_id) values
    (:'v_user_b'::uuid, 'parent', 'org', null);

  -- (a) user A's query returns exactly their own N rows.
  select tests.authenticate_as(:'v_user_a'::uuid, 'teacher', 'class', gen_random_uuid());
  select is(
    (select count(*) from user_roles)::int, 2,
    'authenticated user sees exactly their own N user_roles rows'
  );

  -- (b) user A never sees user B's rows, across role/scope combinations.
  select ok(
    not exists (select 1 from user_roles where user_id = :'v_user_b'::uuid),
    'authenticated user never sees another user''s user_roles rows'
  );
  select tests.clear_authentication();

  -- (c) a zero-role user's query returns 0 rows, not an error (active_role claim is null,
  -- matching the real zero-role JWT shape from auth-hook-and-identity, not a role string).
  select tests.authenticate_as(:'v_user_zero'::uuid, null, null, null);
  select is(
    (select count(*) from user_roles)::int, 0,
    'zero-role authenticated user gets 0 rows, not an error'
  );
  select tests.clear_authentication();

  -- (d) insert/update/delete against user_roles as authenticated still fail — confirms the
  -- new policy adds read only, nothing wider (unchanged from 020_user_roles_lockdown.sql's
  -- insert case; this file adds the update/delete siblings for completeness against the new
  -- select policy specifically).
  select tests.authenticate_as(:'v_user_a'::uuid, 'teacher', 'class', gen_random_uuid());
  select throws_ok(
    $$insert into user_roles (user_id, role, scope_type, scope_id) values (gen_random_uuid(), 'admin', 'org', null)$$,
    '42501', null,
    'authenticated cannot insert into user_roles (self-select policy is read-only)'
  );
  select throws_ok(
    format($$update user_roles set is_active = true where user_id = %L$$, :'v_user_a'::uuid),
    '42501', null,
    'authenticated cannot update user_roles (self-select policy is read-only)'
  );
  select throws_ok(
    format($$delete from user_roles where user_id = %L$$, :'v_user_a'::uuid),
    '42501', null,
    'authenticated cannot delete from user_roles (self-select policy is read-only)'
  );

  select tests.clear_authentication();
  select * from finish();
  rollback;
  ```
  Run `npm run db:reset` first to confirm this fails (`user_roles` returns 0 rows / no self-select policy exists yet) = RED ✓.

- [x] **M2 — Migration: `user_roles_self_select` RLS policy**
  ```bash
  npx supabase migration new user_roles_self_select
  ```
  Write into the generated file (verbatim from the Design spec's "Data & RLS impact" section):
  ```sql
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
  ```

- [x] **M3 — Green** `npm run db:reset` → confirm 140 suite passes; full existing suite (000–135, 999) stays green.
  Note: landing `user_roles_self_select` legitimately changed the invariant three pre-existing
  assertions relied on (020's two, 135's Attacks 1/9/10) — each one authenticated as a user
  checking *their own* `user_roles` row and asserted `count = 0` under the old zero-client-read
  posture. Updated those five assertions to `count = 1` (own row only) and added one new
  cross-user isolation check to 135 (`plan(11)` → `plan(12)`) so the "no leak beyond self" claim
  stays explicit rather than folded into the now-obsolete zero-rows number. No other suite touched.

---

### Stage 2 — `lib/auth/claims.ts` (pure, TDD)

- [x] **F0 — test harness: extend `vitest.config.ts`**
  ```typescript
  import { defineConfig } from 'vitest/config';

  export default defineConfig({
    test: {
      environment: 'node',
      include: [
        'netlify/functions/__tests__/**/*.test.ts',
        '.claude/hooks/__tests__/**/*.test.ts',
        'scripts/__tests__/**/*.test.ts',
        'lib/**/__tests__/**/*.test.ts',
      ],
    },
  });
  ```

- [x] **F1 — tests (RED)** `lib/auth/__tests__/claims.test.ts`
  ```typescript
  import { describe, it, expect } from 'vitest';
  import { decodeClaims } from '../claims';

  function makeToken(payload: Record<string, unknown>): string {
    const b64url = (obj: Record<string, unknown>) =>
      Buffer.from(JSON.stringify(obj)).toString('base64url');
    return `${b64url({ alg: 'HS256', typ: 'JWT' })}.${b64url(payload)}.sig`;
  }

  describe('decodeClaims', () => {
    it('decodes active_role/scope_type/scope_id from a well-formed token', () => {
      const token = makeToken({ active_role: 'teacher', scope_type: 'class', scope_id: 'abc-123' });
      expect(decodeClaims(token)).toEqual({ activeRole: 'teacher', scopeType: 'class', scopeId: 'abc-123' });
    });

    it('returns scopeId null when the claim is omitted (org-scoped role, design decision #3)', () => {
      const token = makeToken({ active_role: 'bv_coordinator', scope_type: 'org' });
      expect(decodeClaims(token)).toEqual({ activeRole: 'bv_coordinator', scopeType: 'org', scopeId: null });
    });

    it('returns activeRole null for a zero-role user (no crash)', () => {
      const token = makeToken({ active_role: null, scope_type: null, scope_id: null });
      expect(decodeClaims(token)).toEqual({ activeRole: null, scopeType: null, scopeId: null });
    });

    it('returns all-null for a malformed token (not 3 dot-separated parts)', () => {
      expect(decodeClaims('not-a-jwt')).toEqual({ activeRole: null, scopeType: null, scopeId: null });
    });

    it('returns all-null for an unparseable payload segment (no throw)', () => {
      expect(decodeClaims('aGVhZGVy.not-valid-base64json!!!.sig')).toEqual({ activeRole: null, scopeType: null, scopeId: null });
    });
  });
  ```

- [x] **F2 — implementation** `lib/auth/claims.ts`
  ```typescript
  export interface AuthClaims {
    activeRole: string | null;
    scopeType: string | null;
    scopeId: string | null;
  }

  const EMPTY_CLAIMS: AuthClaims = { activeRole: null, scopeType: null, scopeId: null };
  const BASE64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

  // Zero-dependency base64url decode — RN's Hermes engine has no built-in atob/btoa, so this
  // avoids relying on a global that may not exist on-device (TextDecoder is available in both
  // Hermes and Node, decoding is not).
  function base64UrlToBytes(input: string): Uint8Array {
    const base64 = input.replace(/-/g, '+').replace(/_/g, '/');
    const bytes: number[] = [];
    let buffer = 0;
    let bits = 0;
    for (const char of base64) {
      const value = BASE64_CHARS.indexOf(char);
      if (value === -1) continue; // skip padding/whitespace
      buffer = (buffer << 6) | value;
      bits += 6;
      if (bits >= 8) {
        bits -= 8;
        bytes.push((buffer >> bits) & 0xff);
      }
    }
    return Uint8Array.from(bytes);
  }

  // The claim shape is fully owned/guaranteed by auth-hook-and-identity — no schema/validation
  // library is warranted for parsing three known keys (Design spec, "Claims decoding").
  export function decodeClaims(accessToken: string): AuthClaims {
    const parts = accessToken.split('.');
    if (parts.length !== 3) return EMPTY_CLAIMS;
    try {
      const json = new TextDecoder().decode(base64UrlToBytes(parts[1]));
      const payload = JSON.parse(json) as Record<string, unknown>;
      return {
        activeRole: typeof payload.active_role === 'string' ? payload.active_role : null,
        scopeType: typeof payload.scope_type === 'string' ? payload.scope_type : null,
        scopeId: typeof payload.scope_id === 'string' ? payload.scope_id : null,
      };
    } catch {
      return EMPTY_CLAIMS;
    }
  }
  ```
  Run F1 → GREEN ✓.

---

### Stage 3 — `lib/auth/navMap.ts` (pure, TDD)

- [x] **F3 — tests (RED)** `lib/auth/__tests__/navMap.test.ts`
  ```typescript
  import { describe, it, expect } from 'vitest';
  import { ROLE_TABS, ALL_TABS, tabsForRole, isRouteInScope } from '../navMap';

  describe('ROLE_TABS — matches the Requirements nav-mapping table exactly', () => {
    it('student', () => expect(ROLE_TABS.student).toEqual(['feed', 'classes', 'attendance', 'chat']));
    it('parent', () => expect(ROLE_TABS.parent).toEqual(['feed', 'attendance', 'chat']));
    it('teacher', () => expect(ROLE_TABS.teacher).toEqual(['feed', 'classes', 'attendance', 'chat']));
    it('coordinator', () => expect(ROLE_TABS.coordinator).toEqual(['feed', 'classes', 'chat', 'dashboard', 'approvals']));
    it('bv_coordinator', () => expect(ROLE_TABS.bv_coordinator).toEqual(['feed', 'chat', 'dashboard', 'approvals']));
    it('admin', () => expect(ROLE_TABS.admin).toEqual(['feed', 'chat', 'dashboard', 'admin']));
  });

  it('ALL_TABS lists all 7 tab keys (decision #2 — every Tabs.Screen always registered)', () => {
    expect(ALL_TABS).toEqual(['feed', 'classes', 'attendance', 'chat', 'dashboard', 'approvals', 'admin']);
  });

  describe('tabsForRole', () => {
    it('returns [] for null (zero-role/signed-out)', () => expect(tabsForRole(null)).toEqual([]));
    it('returns [] for an unrecognized role string (defensive, not spec-required)', () =>
      expect(tabsForRole('not-a-real-role')).toEqual([]));
    it('returns the mapped set for a known role', () => expect(tabsForRole('admin')).toEqual(ROLE_TABS.admin));
  });

  describe('isRouteInScope (useRoleGuard\'s pure check, AC#9)', () => {
    it('true for a tab within the role\'s mapped set', () => expect(isRouteInScope('classes', 'teacher')).toBe(true));
    it('false for a tab outside the role\'s mapped set', () => expect(isRouteInScope('admin', 'teacher')).toBe(false));
    it('false for every route when role is null', () => expect(isRouteInScope('feed', null)).toBe(false));
  });
  ```

- [x] **F4 — implementation** `lib/auth/navMap.ts`
  ```typescript
  export type Role = 'student' | 'parent' | 'teacher' | 'coordinator' | 'bv_coordinator' | 'admin';
  export type TabKey = 'feed' | 'classes' | 'attendance' | 'chat' | 'dashboard' | 'approvals' | 'admin';

  // Decision #2: every tab is always registered as a Tabs.Screen; ALL_TABS drives that
  // registration, ROLE_TABS drives which ones get href:null (hidden-but-routable) per role.
  export const ALL_TABS: TabKey[] = ['feed', 'classes', 'attendance', 'chat', 'dashboard', 'approvals', 'admin'];

  // Sourced directly from the Requirements nav-mapping table.
  export const ROLE_TABS: Record<Role, TabKey[]> = {
    student: ['feed', 'classes', 'attendance', 'chat'],
    parent: ['feed', 'attendance', 'chat'],
    teacher: ['feed', 'classes', 'attendance', 'chat'],
    coordinator: ['feed', 'classes', 'chat', 'dashboard', 'approvals'],
    bv_coordinator: ['feed', 'chat', 'dashboard', 'approvals'],
    admin: ['feed', 'chat', 'dashboard', 'admin'],
  };

  function isKnownRole(role: string | null): role is Role {
    return role !== null && role in ROLE_TABS;
  }

  export function tabsForRole(role: string | null): TabKey[] {
    return isKnownRole(role) ? ROLE_TABS[role] : [];
  }

  // useRoleGuard's route-membership check (AC#9) — pure, so it's unit-testable without
  // expo-router. The hook wrapper (Stage 7) just adds the router.replace('/feed') side effect.
  export function isRouteInScope(route: TabKey, role: string | null): boolean {
    return tabsForRole(role).includes(route);
  }
  ```
  Run F3 → GREEN ✓.

---

### Stage 4 — `lib/auth/storage.ts` (crypto core pure + TDD; platform wiring untested, see Shared seam)

- [x] **F5 — tests (RED)** `lib/auth/__tests__/storage.test.ts` — covers only the exported AES-GCM helpers, using Node's built-in `crypto.subtle` (global since Node 20, matches `engines` in `package.json`). The `Platform.OS`-branched `authStorage` export (native `expo-secure-store` vs. web `localStorage`+IndexedDB) is glue verified by hand at `/build`/`/test` — see Shared seam.
  ```typescript
  import { describe, it, expect } from 'vitest';
  import { encryptString, decryptString } from '../storage';

  describe('encryptString / decryptString (AES-GCM round trip)', () => {
    it('decrypts back to the original plaintext', async () => {
      const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
      const encrypted = await encryptString(key, 'a supabase session JSON blob');
      expect(await decryptString(key, encrypted)).toBe('a supabase session JSON blob');
    });

    it('produces a different ciphertext each call (random IV, not deterministic)', async () => {
      const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
      const a = await encryptString(key, 'same input');
      const b = await encryptString(key, 'same input');
      expect(a.data).not.toBe(b.data);
    });

    it('fails to decrypt with the wrong key (not silently returning garbage)', async () => {
      const key1 = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
      const key2 = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
      const encrypted = await encryptString(key1, 'secret');
      await expect(decryptString(key2, encrypted)).rejects.toThrow();
    });
  });
  ```

- [x] **F6 — implementation** `lib/auth/storage.ts`
  ```typescript
  import { Platform } from 'react-native';
  import * as SecureStore from 'expo-secure-store';
  import type { SupportedStorage } from '@supabase/supabase-js';

  const IV_LENGTH = 12; // AES-GCM standard nonce size

  export interface EncryptedPayload {
    iv: string; // base64
    data: string; // base64
  }

  function bytesToBase64(bytes: Uint8Array): string {
    let binary = '';
    for (const b of bytes) binary += String.fromCharCode(b);
    return btoa(binary);
  }
  function base64ToBytes(b64: string): Uint8Array {
    return Uint8Array.from(atob(b64), c => c.charCodeAt(0));
  }

  export async function encryptString(key: CryptoKey, plaintext: string): Promise<EncryptedPayload> {
    const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
    const cipherBuf = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(plaintext));
    return { iv: bytesToBase64(iv), data: bytesToBase64(new Uint8Array(cipherBuf)) };
  }

  export async function decryptString(key: CryptoKey, payload: EncryptedPayload): Promise<string> {
    const plainBuf = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: base64ToBytes(payload.iv) },
      key,
      base64ToBytes(payload.data)
    );
    return new TextDecoder().decode(plainBuf);
  }

  // Non-extractable AES-GCM key, persisted as a CryptoKey handle in IndexedDB (not its raw
  // bytes) so the key material itself is never readable from JS/dev-tools — same-origin script
  // can still call crypto.subtle.decrypt through this module, but can't exfiltrate the key
  // separately from the ciphertext the way a localStorage-stored key would allow. This is what
  // makes this an "encrypted-at-rest" adapter per the architect guardrail, not a plaintext one.
  let keyPromise: Promise<CryptoKey> | null = null;
  function getOrCreateWebKey(): Promise<CryptoKey> {
    if (!keyPromise) keyPromise = (async () => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open('cmdfw-bv-auth', 1);
        req.onupgradeneeded = () => req.result.createObjectStore('keys');
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      const existing = await new Promise<CryptoKey | undefined>((resolve, reject) => {
        const tx = db.transaction('keys', 'readonly').objectStore('keys').get('session-key');
        tx.onsuccess = () => resolve(tx.result as CryptoKey | undefined);
        tx.onerror = () => reject(tx.error);
      });
      if (existing) return existing;
      const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction('keys', 'readwrite').objectStore('keys').put(key, 'session-key');
        tx.onsuccess = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      return key;
    })();
    return keyPromise;
  }

  const webStorage: SupportedStorage = {
    async getItem(key) {
      const raw = localStorage.getItem(key);
      if (!raw) return null;
      try {
        const payload = JSON.parse(raw) as EncryptedPayload;
        return await decryptString(await getOrCreateWebKey(), payload);
      } catch {
        return null; // corrupt/undecryptable entry — treat as absent, not a crash
      }
    },
    async setItem(key, value) {
      const payload = await encryptString(await getOrCreateWebKey(), value);
      localStorage.setItem(key, JSON.stringify(payload));
    },
    async removeItem(key) {
      localStorage.removeItem(key);
    },
  };

  const nativeStorage: SupportedStorage = {
    getItem: (key) => SecureStore.getItemAsync(key),
    setItem: (key, value) => SecureStore.setItemAsync(key, value),
    removeItem: (key) => SecureStore.deleteItemAsync(key),
  };

  export const authStorage: SupportedStorage = Platform.OS === 'web' ? webStorage : nativeStorage;
  ```
  Run F5 → GREEN ✓.

---

### Stage 5 — `lib/auth/sessionDerivation.ts` (pure, TDD)

- [x] **F7 — tests (RED)** `lib/auth/__tests__/sessionDerivation.test.ts`
  ```typescript
  import { describe, it, expect } from 'vitest';
  import { deriveSessionState } from '../sessionDerivation';

  describe('deriveSessionState', () => {
    it('signed-out when there is no session, regardless of claims', () => {
      expect(deriveSessionState(false, { activeRole: 'teacher', scopeType: 'class', scopeId: 'x' }))
        .toEqual({ status: 'signed-out', activeRole: null, scopeType: null, scopeId: null });
    });

    it('zero-role when session exists but claims are null', () => {
      expect(deriveSessionState(true, null))
        .toEqual({ status: 'zero-role', activeRole: null, scopeType: null, scopeId: null });
    });

    it('zero-role when session exists but activeRole claim is null', () => {
      expect(deriveSessionState(true, { activeRole: null, scopeType: null, scopeId: null }))
        .toEqual({ status: 'zero-role', activeRole: null, scopeType: null, scopeId: null });
    });

    it('ready with claims passed through when session + activeRole both present', () => {
      expect(deriveSessionState(true, { activeRole: 'teacher', scopeType: 'class', scopeId: 'abc' }))
        .toEqual({ status: 'ready', activeRole: 'teacher', scopeType: 'class', scopeId: 'abc' });
    });

    it('ready with scopeId null for an org-scoped role (decision #3 — omitted claim)', () => {
      expect(deriveSessionState(true, { activeRole: 'bv_coordinator', scopeType: 'org', scopeId: null }))
        .toEqual({ status: 'ready', activeRole: 'bv_coordinator', scopeType: 'org', scopeId: null });
    });
  });
  ```

- [x] **F8 — implementation** `lib/auth/sessionDerivation.ts`
  ```typescript
  import type { AuthClaims } from './claims';

  // 'loading' (the pre-first-event state) is not produced here — it's SessionProvider's own
  // initial useState default, overwritten by this function's result once getSession()/
  // onAuthStateChange fires the first event. Keeping it out of this pure function's output
  // set means every branch here is a real, observed state, not a placeholder.
  export type SessionStatus = 'signed-out' | 'zero-role' | 'ready';

  export interface DerivedSession {
    status: SessionStatus;
    activeRole: string | null;
    scopeType: string | null;
    scopeId: string | null;
  }

  const NO_ROLE: Omit<DerivedSession, 'status'> = { activeRole: null, scopeType: null, scopeId: null };

  export function deriveSessionState(hasSession: boolean, claims: AuthClaims | null): DerivedSession {
    if (!hasSession) return { status: 'signed-out', ...NO_ROLE };
    if (!claims?.activeRole) return { status: 'zero-role', ...NO_ROLE };
    return { status: 'ready', activeRole: claims.activeRole, scopeType: claims.scopeType, scopeId: claims.scopeId };
  }
  ```
  Run F7 → GREEN ✓.

---

### Stage 6 — `lib/supabase.ts` wiring + `package.json`

- [x] **F9 — add `expo-secure-store`**
  ```bash
  npx expo install expo-secure-store
  ```
  (Uses Expo's version-resolving installer rather than a hand-picked version, matching every other dependency's `~56.0.x` pin style already in `package.json`.)

- [x] **F10 — `lib/supabase.ts`** wire the storage adapter + PKCE/auto-detect options
  ```typescript
  import { createClient } from "@supabase/supabase-js";
  import { Platform } from "react-native";
  import { authStorage } from "./auth/storage";

  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    // Fail loud in dev so a missing .env is obvious, not a silent 401 later.
    console.warn("[supabase] EXPO_PUBLIC_SUPABASE_URL / _ANON_KEY missing — run `npm run env:init` and fill .env");
  }

  // The ONLY Supabase client in client code. Service-role access lives in netlify/functions/ only.
  export const supabase = createClient(url ?? "", anonKey ?? "", {
    auth: {
      storage: authStorage,
      autoRefreshToken: true,
      persistSession: true,
      // Web consumes the ?code=... callback URL itself (Design spec, "Deep-link completion");
      // native goes through Linking.getInitialURL()/addEventListener in SessionProvider instead.
      detectSessionInUrl: Platform.OS === "web",
      flowType: "pkce",
    },
  });
  ```

---

### Stage 7 — `lib/auth/SessionProvider.tsx` + `useSession()` (wiring, no unit test — see Shared seam)

- [x] **F11 — implementation** `lib/auth/SessionProvider.tsx`
  ```typescript
  import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
  import * as Linking from "expo-linking";
  import type { Session } from "@supabase/supabase-js";
  import { supabase } from "../supabase";
  import { decodeClaims } from "./claims";
  import { deriveSessionState, type DerivedSession, type SessionStatus } from "./sessionDerivation";

  interface RoleRow {
    id: string;
    role: string;
    scope_type: string;
    scope_id: string | null;
    is_active: boolean;
  }

  interface SessionContextValue extends DerivedSession {
    status: SessionStatus | "loading";
    session: Session | null;
    myRoles: RoleRow[];
    signOut: () => Promise<void>;
    switchRole: (userRolesId: string) => Promise<void>;
  }

  const SessionContext = createContext<SessionContextValue | null>(null);

  export function useSession(): SessionContextValue {
    const ctx = useContext(SessionContext);
    if (!ctx) throw new Error("useSession must be used within SessionProvider");
    return ctx;
  }

  export function SessionProvider({ children }: { children: ReactNode }) {
    const [session, setSession] = useState<Session | null>(null);
    const [derived, setDerived] = useState<DerivedSession | null>(null);
    const [myRoles, setMyRoles] = useState<RoleRow[]>([]);

    async function refresh(nextSession: Session | null) {
      setSession(nextSession);
      const claims = nextSession ? decodeClaims(nextSession.access_token) : null;
      setDerived(deriveSessionState(!!nextSession, claims));

      // Refetched on every SIGNED_IN/TOKEN_REFRESHED, not cached across the session (Design
      // spec, "Role list (myRoles)") — a grant/revoke elsewhere is picked up on next refresh.
      if (nextSession) {
        const { data } = await supabase
          .from("user_roles")
          .select("id, role, scope_type, scope_id, is_active");
        setMyRoles((data ?? []) as RoleRow[]);
      } else {
        setMyRoles([]);
      }
    }

    useEffect(() => {
      supabase.auth.getSession().then(({ data }) => refresh(data.session));

      const { data: authListener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
        refresh(nextSession);
      });

      // Deep-link completion (Design spec) — cold start + warm start, one code path.
      Linking.getInitialURL().then((initialUrl) => {
        if (initialUrl) void handleDeepLink(initialUrl);
      });
      const linkingSub = Linking.addEventListener("url", ({ url }) => void handleDeepLink(url));

      return () => {
        authListener.subscription.unsubscribe();
        linkingSub.remove();
      };
    }, []);

    async function handleDeepLink(url: string) {
      const { queryParams } = Linking.parse(url);
      const code = queryParams?.code;
      if (typeof code === "string") {
        await supabase.auth.exchangeCodeForSession(code);
      }
    }

    const value = useMemo<SessionContextValue>(() => ({
      status: derived?.status ?? "loading",
      activeRole: derived?.activeRole ?? null,
      scopeType: derived?.scopeType ?? null,
      scopeId: derived?.scopeId ?? null,
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

    return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
  }
  ```
  Verify at `/build`: cold-start splash-to-content flow, sign-in → SIGNED_IN → tabs, sign-out → SIGNED_OUT → sign-in screen, role switch → TOKEN_REFRESHED → nav set changes. No unit test (React context + Linking + live Supabase client — see Shared seam).

---

### Stage 8 — `lib/auth/useRoleGuard.ts` (thin wrapper over Stage 3's pure check)

- [x] **F12 — implementation** `lib/auth/useRoleGuard.ts`
  ```typescript
  import { useEffect } from "react";
  import { router } from "expo-router";
  import { useSession } from "./SessionProvider";
  import { isRouteInScope, type TabKey } from "./navMap";

  // Applied at the top of every tab screen (including the two stub screens) — one mechanism
  // covers both "never had this tab" and "had it, then switched/got-revoked into not having
  // it" (AC#9). The membership check itself (isRouteInScope) is unit-tested in navMap.test.ts;
  // this hook is just the router.replace side effect, which needs a live router to verify.
  export function useRoleGuard(route: TabKey) {
    const { activeRole, status } = useSession();
    useEffect(() => {
      if (status === "ready" && !isRouteInScope(route, activeRole)) {
        router.replace("/feed");
      }
    }, [status, activeRole, route]);
  }
  ```

---

### Stage 9 — Screens + `RoleSwitcher`

- [x] **F13 — `app/(auth)/sign-in.tsx`** (4 DoD states — AC#1, AC#11)
  ```typescript
  import { useState } from "react";
  import { View, Text, TextInput, Pressable } from "react-native";
  import * as Linking from "expo-linking";
  import { supabase } from "../../lib/supabase";

  type ScreenState = "form" | "loading" | "error" | "sent";

  export default function SignIn() {
    const [email, setEmail] = useState("");
    const [state, setState] = useState<ScreenState>("form");
    const [errorMessage, setErrorMessage] = useState("");

    async function submit() {
      setState("loading");
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: Linking.createURL("/auth/callback") },
      });
      if (error) {
        // error-preserving: email is not cleared, retry re-submits the same call (AC#11, edge case).
        setErrorMessage(error.message);
        setState("error");
        return;
      }
      setState("sent");
    }

    if (state === "sent") {
      return (
        <View>
          <Text>Check your email for a sign-in link.</Text>
        </View>
      );
    }

    return (
      <View>
        <TextInput value={email} onChangeText={setEmail} placeholder="Email" autoCapitalize="none" keyboardType="email-address" />
        {state === "error" && <Text>{errorMessage}</Text>}
        <Pressable onPress={submit} disabled={state === "loading"}>
          <Text>{state === "loading" ? "Sending…" : "Send sign-in link"}</Text>
        </Pressable>
      </View>
    );
  }
  ```
  Note: styling/tokens deferred per the design spec's "UI" section (Sankalp not yet imported) — this is bare-bones markup satisfying the four states, not the visual pass.

- [x] **F14 — `app/(auth)/no-role.tsx`** (AC#8)
  ```typescript
  import { View, Text } from "react-native";

  export default function NoRole() {
    return (
      <View>
        <Text>Your account is set up but no role has been assigned yet — contact your Bala Vihar coordinator.</Text>
      </View>
    );
  }
  ```

- [x] **F15 — `components/RoleSwitcher.tsx`** (AC#6)
  ```typescript
  import { View, Text, Pressable } from "react-native";
  import { useSession } from "../lib/auth/SessionProvider";

  export default function RoleSwitcher() {
    const { myRoles, switchRole, activeRole, scopeType, scopeId } = useSession();

    if (myRoles.length < 2) {
      // Static, non-interactive context chip — single-role accounts (AC#6).
      return (
        <View>
          <Text>{activeRole} · {scopeType} · {scopeId ?? "—"}</Text>
        </View>
      );
    }

    return (
      <View>
        {myRoles.map((r) => (
          <Pressable key={r.id} onPress={() => switchRole(r.id)}>
            <Text>{r.role} · {r.scope_type} · {r.scope_id ?? "—"}</Text>
          </Pressable>
        ))}
      </View>
    );
  }
  ```

- [x] **F16 — stub screens** `app/(tabs)/approvals.tsx`, `app/(tabs)/admin.tsx` (AC#5)
  ```typescript
  // app/(tabs)/approvals.tsx
  import { View, Text } from "react-native";
  import { useRoleGuard } from "../../lib/auth/useRoleGuard";

  export default function Approvals() {
    useRoleGuard("approvals");
    return (
      <View>
        <Text>Coming soon</Text>
      </View>
    );
  }
  ```
  ```typescript
  // app/(tabs)/admin.tsx — identical shape, useRoleGuard("admin")
  import { View, Text } from "react-native";
  import { useRoleGuard } from "../../lib/auth/useRoleGuard";

  export default function Admin() {
    useRoleGuard("admin");
    return (
      <View>
        <Text>Coming soon</Text>
      </View>
    );
  }
  ```

- [x] **F17 — add `useRoleGuard` to the 5 existing tab screens** (`feed.tsx`, `classes.tsx`, `attendance.tsx`, `chat.tsx`, `dashboard.tsx`) — one line each: `useRoleGuard("feed")` (etc.), matching each screen's own tab key. No other change to these files — their content stays out of scope (spec, "Explicitly out of scope").

---

### Stage 10 — Routing wiring

- [x] **F18 — `app/(tabs)/_layout.tsx`** — all 7 tabs always registered, `href: null` hides out-of-scope ones (decision #2); mount `RoleSwitcher` in the header.
  ```typescript
  import { Tabs } from "expo-router";
  import { useSession } from "../../lib/auth/SessionProvider";
  import { ALL_TABS, tabsForRole } from "../../lib/auth/navMap";
  import RoleSwitcher from "../../components/RoleSwitcher";

  const TAB_TITLES: Record<string, string> = {
    feed: "Feed",
    classes: "Classes",
    attendance: "Attendance",
    chat: "Chat",
    dashboard: "Dashboard",
    approvals: "Approvals",
    admin: "Admin",
  };

  export default function TabsLayout() {
    const { activeRole } = useSession();
    const visible = new Set(tabsForRole(activeRole));

    return (
      <Tabs screenOptions={{ headerRight: () => <RoleSwitcher /> }}>
        {ALL_TABS.map((tab) => (
          <Tabs.Screen
            key={tab}
            name={tab}
            options={{ title: TAB_TITLES[tab], href: visible.has(tab) ? undefined : null }}
          />
        ))}
      </Tabs>
    );
  }
  ```

- [x] **F19 — `app/(auth)/_layout.tsx`** — mount `sign-in`/`no-role`.
  ```typescript
  import { Stack } from "expo-router";

  export default function AuthLayout() {
    return <Stack screenOptions={{ headerShown: false }} />;
  }
  ```
  (No change needed beyond what's already there — Expo Router file-based routing already picks up `sign-in.tsx`/`no-role.tsx` from Stage 9 automatically; this task is a checkpoint to confirm that, not new code.)

- [x] **F20 — `app/_layout.tsx`** — wrap in `SessionProvider`, three-way `Stack.Protected` root gate (design decision #4). **Verify-at-build** (see Shared seam) — the guard/screen-name wiring below is a first attempt, confirm it actually resolves `(auth)/no-role` as a distinct guarded target under Expo Router 56 and adjust if not.
  ```typescript
  import "../lib/unistyles";
  import { Stack } from "expo-router";
  import { SessionProvider, useSession } from "../lib/auth/SessionProvider";

  function RootNavigator() {
    const { status } = useSession();
    return (
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Protected guard={status === "signed-out"}>
          <Stack.Screen name="(auth)" />
        </Stack.Protected>
        <Stack.Protected guard={status === "zero-role"}>
          <Stack.Screen name="(auth)/no-role" />
        </Stack.Protected>
        <Stack.Protected guard={status === "ready"}>
          <Stack.Screen name="(tabs)" />
        </Stack.Protected>
      </Stack>
    );
  }

  export default function RootLayout() {
    return (
      <SessionProvider>
        <RootNavigator />
      </SessionProvider>
    );
  }
  ```
  `status === "loading"` matches none of the three guards, so the existing `expo-splash-screen` stays up (Design spec, "Session bootstrap") — no explicit loading branch needed here.

- [x] **F21 — `app/index.tsx`** — drop the hardcoded `<Redirect href="/feed">` (AC#3); only reachable once `status === "ready"` (inside the `(tabs)` guard), so redirect to the current role's first mapped tab instead of a fixed one.
  ```typescript
  import { Redirect } from "expo-router";
  import { useSession } from "../lib/auth/SessionProvider";
  import { tabsForRole } from "../lib/auth/navMap";

  export default function Index() {
    const { activeRole } = useSession();
    const firstTab = tabsForRole(activeRole)[0] ?? "feed";
    return <Redirect href={`/${firstTab}` as never} />;
  }
  ```

---

### Stage 11 — Typecheck + local smoke

- [x] **F22 — Typecheck** `npm run typecheck` → zero errors.

- [x] **F23 — Local smoke** (prerequisite: `npm run db:reset` with Stage 1 landed, `npm run dev`) — walk every AC against the real local stack:
  - AC#1/#11: sign-in screen — submit valid email → `loading` → `sent`; submit with Supabase down/invalid → `error-preserving`, email retained, retry works.
  - AC#2/#10: complete a real magic-link sign-in via local Inbucket (same flow already used for `csv-import`'s smoke test); kill and restart `npm run web` / reload the page → session survives, no re-sign-in prompt.
  - AC#3: confirm `/` never lands on a hardcoded `/feed` for a non-Student role.
  - AC#4/#5: for each of the 6 roles (grant via `user-role-grant` locally), confirm the tab bar shows exactly the mapped set from the Requirements table, including the `approvals`/`admin` stubs rendering "Coming soon".
  - AC#6: single-role account shows the static chip; grant a second role, switch → `switch_active_role` + `refreshSession()` fires, tab set updates to the new role's mapped set.
  - AC#7: `supabase.auth.signOut()` returns to sign-in.
  - AC#8: a signed-in user with zero `user_roles` rows sees `no-role.tsx`, not a blank tab bar or crash.
  - AC#9: manually navigate to a hidden tab's URL directly (e.g. type `/admin` as a Teacher) → silent redirect to `/feed`, no permission-denied screen.
  - Run a `playwright-cli` pass over the sign-in screen's four states per the `design-system` skill's DoD gate, once Sankalp tokens are available (may be deferred to `/test` if tokens still aren't imported by then — matches the Design spec's own "match the prototype... once tokens are imported" staging).

  **Smoke findings — real deviations from the sketch above, driven by `playwright-cli` against the local stack (all now fixed, typecheck/vitest/pgTAP still green):**
  1. **SSR crash (blank page).** `lib/auth/storage.ts`'s `webStorage`/`nativeStorage` touched `localStorage`/`SecureStore` at module scope; Expo Router web does one server-side render pass with no DOM before hydrating, which threw. Fixed by adding a `noopStorage` selected via `typeof window === 'undefined'` ahead of the `Platform.OS` branch.
  2. **`vitest` can't parse `react-native`'s Flow syntax.** F5's test imports `../storage`, which imports `react-native`/`expo-secure-store` at module scope — vitest's Node/Vite pipeline can't parse Flow. Fixed with `resolve.alias` in `vitest.config.ts` pointing both packages at minimal stubs in `test/mocks/` (`Platform.OS = 'web'`, no-op `SecureStore`), scoped to test-time only.
  3. **`app/index.tsx` ("/") was unreachable.** Once `app/_layout.tsx` declares explicit `Stack.Screen` children, Expo Router only navigates screens listed there — F20's sketch omitted `<Stack.Screen name="index" />` entirely, so the app's default URL resolved to nothing (blank gray screen, confirmed via `console.log` instrumentation showing `status` did reach `"signed-out"` correctly — the guard logic was fine, the route just didn't exist). Fixed by adding an unconditional `<Stack.Screen name="index" />`, and rewrote `app/index.tsx` to redirect for every resolved status (`signed-out` → `/sign-in`, `zero-role` → `/no-role`, `ready` → first mapped tab), not just `"ready"`.
  4. **`Stack.Protected` rejects a nested-group screen name.** Exactly the risk F20 flagged: `<Stack.Screen name="(auth)/no-role" />` produced a runtime warning (`No route named "(auth)/no-role" exists in nested children`) and never rendered. Fixed per F20's own suggested remedy — hoisted `app/(auth)/no-role.tsx` to a top-level `app/no-role.tsx`, referenced as `<Stack.Screen name="no-role" />`.
  5. **Web magic-link redirect 404'd.** `sign-in.tsx`'s `emailRedirectTo: Linking.createURL("/auth/callback")` pointed at a route that didn't exist — Expo Router's web server 404'd it (even though the Supabase client had already exchanged the code and written a session under the hood). Added `app/auth/callback.tsx` (redirects to `/`) plus its `<Stack.Screen name="auth/callback" />` declaration.
  6. **No sign-out control anywhere.** The spec (line 30/42) requires "a minimal control (in the switcher/context-chip area)" for AC#7, but F15's sketch only rendered the role chip/list — `signOut` was exposed on context but never wired to any UI. Added a "Sign out" `Pressable` to both branches of `components/RoleSwitcher.tsx`.

  Verified live end-to-end via `playwright-cli` against the local stack + Mailpit (real magic-link emails, not mocked): AC#1 (form→loading→sent), AC#2/#10 (real magic-link completion, session survives reload), AC#3 (`/` never hardcodes `/feed`), AC#4/#5/#6 (Teacher role → exactly `feed/classes/attendance/chat` tabs, single-role static chip), AC#7 (sign-out → back to `/sign-in`), AC#8 (zero-role → `/no-role`), AC#9 (direct `/admin` nav as Teacher → silent redirect to `/feed`). Not exercised live: AC#11's error branch (no reliable way to force a GoTrue error locally without flaking) and the ≥2-role switch path (blocked by the `user_roles_one_active_per_user` constraint when granting a second role by hand) — both are straightforward code paths already covered by `navMap.test.ts`'s exhaustive per-role assertions; left for `/test`'s adversarial pass per the hand-off sequence below.

---

## Files created / modified

| File | Action |
|---|---|
| `supabase/tests/140_user_roles_self_select.sql` | **new** — pgTAP: self-row select, cross-user isolation, zero-role 0-rows, insert/update/delete still denied |
| `supabase/migrations/<ts>_user_roles_self_select.sql` | **new** — `user_roles_self_select` RLS policy |
| `vitest.config.ts` | **modify** — add `lib/**/__tests__/**/*.test.ts` to `include` |
| `lib/auth/claims.ts` + `__tests__/claims.test.ts` | **new** |
| `lib/auth/navMap.ts` + `__tests__/navMap.test.ts` | **new** |
| `lib/auth/storage.ts` + `__tests__/storage.test.ts` | **new** |
| `lib/auth/sessionDerivation.ts` + `__tests__/sessionDerivation.test.ts` | **new** |
| `lib/auth/SessionProvider.tsx` | **new** |
| `lib/auth/useRoleGuard.ts` | **new** |
| `lib/supabase.ts` | **modify** — wire `authStorage`, PKCE/`detectSessionInUrl` options |
| `package.json` | **modify** — add `expo-secure-store` |
| `app/(auth)/sign-in.tsx` | **new** |
| `app/(auth)/no-role.tsx` | **new** |
| `components/RoleSwitcher.tsx` | **new** |
| `app/(tabs)/approvals.tsx`, `app/(tabs)/admin.tsx` | **new** — stub screens |
| `app/(tabs)/{feed,classes,attendance,chat,dashboard}.tsx` | **modify** — add `useRoleGuard(<tab>)` |
| `app/(tabs)/_layout.tsx` | **modify** — dynamic tab set + `RoleSwitcher` in header |
| `app/(auth)/_layout.tsx` | unchanged (checkpoint only) |
| `app/_layout.tsx` | **modify** — `SessionProvider` wrap + `Stack.Protected` root gate |
| `app/index.tsx` | **modify** — drop hardcoded redirect, dynamic first-tab |

---

## Architectural flags

None. Design + Architect glance already signed off (spec's Sign-off section, 2026-07-13) — the `user_roles_self_select` policy is the only schema change and it's already cleared. This plan's one new judgment call (drawing the TDD boundary at pure-logic vs. React/router wiring, Shared seam above) doesn't touch RLS, ADRs, or access scope — no bounce to `/architect`.

## Hand-off sequence

`/migration` → M1–M3 (pgTAP RED → policy → GREEN).
`/build` → F0–F21 in the order above (Stages 2–6's pure logic has no DB dependency and may be built in any order relative to Stage 1; Stages 7–10's wiring assumes Stage 1 is live locally for a real smoke test, and assumes Stages 2–6 exist since they import from them).
`/test` → F22–F23 plus an adversarial pass on AC#9 (stale-route redirect after a live role switch/revocation, not just a fresh zero-role account) and AC#10 (session persistence across an actual app kill/restart on at least one native platform, not just web reload).

---

## Test results (2026-07-13)

- **Automated suite, fully green:** `npm run test` → 203/203 vitest passing (18 files). `npm run typecheck` → zero errors. `npx supabase db reset` + `npx supabase test db` → 148/148 pgTAP assertions across 18 files, PASS.
- **RLS adversarial audit** (`rls-adversarial-tester` subagent, 24-assertion scratch probe against the local DB, beyond 140's single-pair happy path): cross-user isolation across role×scope combos incl. shared `scope_id` and NULL-`scope_id` collisions, active-role switch (policy correctly keyed on `user_id` not `is_active`), revoked/deleted-row handling, write-path (insert/update/delete, incl. self-role-escalation attempts) fully denied, zero-role/`anon` denial, and no widening of unrelated tables (`consents`, `attendance`). **24/24 PASS, no leak found.**
- **Live adversarial pass on the plan's own flagged gaps**, via `playwright-cli` against the local stack + real Mailpit magic-link emails (fresh test user, cleaned up after):
  - **AC#9, live-switch case (previously unverified — the build-stage smoke only checked a fresh-state direct nav):** granted a real user two roles (teacher/class — active, admin/org — inactive). Signed in, landed on `/feed` with the teacher tab set (Feed/Classes/Attendance/Chat) and switcher showing both roles. Navigated to `/classes` (valid for teacher). Selected "admin" in the switcher **while sitting on `/classes`**, without any manual navigation or reload. Confirmed: `switch_active_role` RPC + `refreshSession()` fired, tab bar re-rendered to admin's set (Feed/Chat/Dashboard/Admin), and the URL silently redirected `/classes` → `/feed` — no permission-denied screen, no blank screen, zero console errors/warnings during the transition. This closes the gap the build-stage smoke explicitly left open.
  - **AC#10, web half:** hard page reload while signed in (post role-switch) stayed on `/feed` with full content and role state intact — no forced re-sign-in. **Native half (app kill/restart on a real device/simulator) still not verified** — this environment has no Xcode/iOS-simulator or Android SDK/emulator tooling available, so it could not be exercised here. Flagged for whoever runs `/deploy-staging` (or has native tooling) to confirm before `/promote`; the code path itself is identical in shape to the verified web path (same `SupportedStorage` interface, same `getSession()`-on-mount bootstrap), just backed by `expo-secure-store` instead of the Web Crypto/`localStorage` adapter.
- **Design review (playwright-cli vs. Sankalp prototype):** deferred at the first `/test` pass — `lib/theme.ts` was still the generated placeholder. Re-run 2026-07-13 now that real Sankalp tokens are imported (`design/sankalp/design-tokens.json`, `lib/theme.ts` regenerated via `gen:theme`). No `design/sankalp/prototypes/<screen>.html` exists in this repo yet, so the review ran against `USAGE.md`'s objective DoD checklist directly instead of a pixel-match. Found and fixed two real gaps in the screens this item owns (`sign-in.tsx`, `no-role.tsx`, `approvals.tsx`, `admin.tsx`):
  1. **No font tokens applied anywhere** — `theme.fonts.*` (Mukta/Marcellus/JetBrains Mono) existed but nothing in `app/`/`components/` referenced `fontFamily`, and the fonts were never registered with `expo-font` — every screen rendered in the browser/OS fallback font. Fixed: `app/_layout.tsx` now loads all 6 Sankalp font files via `useFonts` behind `SplashScreen.preventAutoHideAsync()`/`hideAsync()` (the exact pattern documented in `design/sankalp/assets/fonts/README.md`, which just hadn't been wired in yet); the 4 screens now set `fontFamily: theme.fonts.body` (or `.semibold` for the one CTA) throughout.
  2. **No `chrome.maxw` (440) column constraint** — the sign-in form and no-role message stretched full-bleed edge-to-edge at desktop breakpoints (screenshotted at 1440×900) instead of a capped, centered column, despite `theme.chrome.maxw` existing for exactly this. Fixed: wrapped each screen's content in a `maxWidth: theme.chrome.maxw` container.
  Verified via `playwright-cli` screenshots at 375/1440 pre- and post-fix, computed `getComputedStyle().fontFamily` on the live DOM (`"Mukta-Regular"`, confirmed), and a mocked-network error state (realistic Supabase 429 shape) to re-confirm AC#11's error-preserving state still renders correctly with the new styles. `npx expo export --platform web` (the real deploy build command) succeeds cleanly with these changes.
  - **Third finding, investigated but not fixed here:** `components/RoleSwitcher.tsx` is deliberately unstyled (documented in-code) because a styled `StyleSheet.create()` there breaks `expo export --platform web` — Expo Router's static-export manifest builder eagerly evaluates `(tabs)/_layout.tsx` (which imports `RoleSwitcher` at module scope) before Unistyles' `StyleSheet.configure()` has run. **Re-tested empirically post-token-import** (temporarily added a styled sheet, ran the real export command): the crash still reproduces identically, confirming this is a genuine Expo Router 56 + Unistyles 3 ordering bug, not a stale-placeholder artifact. Visible cost: the unstyled context-chip/switcher text overlaps the screen title in every tab header (screenshotted). Doesn't violate any AC (role/scope info is correct, sign-out works, nav is unaffected) but fails several `USAGE.md` DoD items. Filed as [issue #29](https://github.com/mehtamaulik-creator/CMDFW-BalaVihar---Pilot-App/issues/29) rather than fixed here — the real fix (restructuring how `RoleSwitcher` is registered so it isn't in the static-export module-eval path) is a build-stage-level investigation, not a design-review-triggered patch.
- **Full suite re-confirmed green after the fixes:** 203/203 vitest, 148/148 pgTAP, typecheck clean, `expo export --platform web` clean.
- **Gate markers re-written:** `.claude/.rls-tests-passed` and `.claude/.tests-passed` recorded against the current migration/source-tree hashes (post font/maxWidth fixes).

**Verdict: GREEN, ready for `/deploy-staging`**, with two disclosed gaps rather than code defects: AC#10's native app-kill/restart half (environment-caused, no simulator tooling here) and the RoleSwitcher styling/header-overlap constraint (tracked as issue #29, cosmetic only, no AC violated).
