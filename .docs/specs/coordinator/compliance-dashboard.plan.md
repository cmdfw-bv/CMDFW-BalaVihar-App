# Coordinator — compliance dashboard — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** [compliance-dashboard.md](compliance-dashboard.md) (Design signed off 2026-07-24, ADR-0030/ADR-0031). **Stage:** `/refine` ✓ → `/architect` ✓ → `/design` ✓ → `/plan` (this doc) → next is `/migration` then `/build`.

**Goal:** Ship the Coordinator's read-only, session-scoped compliance screen — one poll-on-focus call to `get_session_compliance_for_staff`, rendered as a `StatTile` roll-up row plus one `Card` per class carrying two `ComplianceBar` rows (attendance-submission, class-update-posting), honest `—` placeholders for null metrics, and all four design-system states (loading/empty/error-preserving/content).

## Shared seam (§12.6)

**Schema/migrations are the serialized gate, this client feature is not.** `get_session_compliance_for_staff` (`core-schema-and-rls.plan.md` Task 13, same branch) is the only data-access path this screen has — every task below except the RPC-wrapper's own unit tests can be built and unit-tested against a **mocked** Supabase client before Task 13 lands, but the screen cannot be verified against real data (Task 11's `/build` step) until `npm run db:reset` has applied Tasks 12–14. Order of work on this single branch: Tasks 12–14 first (or in parallel if another contributor owns them), then Tasks 1–11 below; Tasks 1–9 (pure logic + the RPC wrapper's mock-based tests) have no hard dependency and can start immediately.

**Branch/worktree:** same branch as the schema work (`mehtamaulik-creator/issue-23-coordinator-compliance-dashboard`) — this is a single-contributor item this pass, not a parallel multi-worktree split.

## Global constraints

- **RPC is the only data path** (AC8, ADR-0019 posture) — the client never queries `class_meetings`/`class_updates`/`attendance`/`enrollments` directly; `supabase.rpc('get_session_compliance_for_staff', { p_session_id, p_window_size })` is the single call this feature ever makes.
- **No client-side scope filtering** (AC1) — `p_session_id` is always the caller's own active-role `scopeId` from `useSession()`; the RPC's own scope check is what enforces correctness, the client just supplies its own scope, never someone else's.
- **Null ≠ 0** (AC5) — `attendance_rate`/`update_rate` of `null` renders as a `—` placeholder, never coerced to `0`. This is threaded through every layer (types, roll-up classification, rendering) rather than patched at the UI edge.
- **Read-only** (AC6) — no mutation, no write RPC call, anywhere in this feature.
- **Poll-on-focus, not Realtime** (AC7) — fetch on mount and on route/window refocus; no `supabase.channel(...)` subscription.
- **TDD** — every pure-logic module (`*.logic.ts`/non-component `.ts` files) gets its test written and run RED before the implementation, per constitution #4. Component/hook wiring (RN/expo-router-dependent) is verified by hand at `/build`, matching this repo's established split (`ComplianceBar.tsx`/`.logic.ts`, `sessionDerivation.ts`/`SessionProvider.tsx`) — vitest's Node environment can't exercise the native runtime.
- **Reuse before build:** `StatTile`, `ComplianceBar`, `Card`, `StateView` are already ported (`components/core/`, `components/dashboard/`) and Sankalp-DoD-compliant — this feature composes them, it does not fork or duplicate them, except the one small, additive `ComplianceBar` prop in Task 2.

**Resolved deferred mechanics (this pass's judgment calls — spec left them for `/plan`):**
1. **Roll-up classification priority (AC4 didn't specify order for a class matching more than one band).** Resolved: check "either metric `< 70`" first → non-compliant; else "both metrics `>= 85`" → fully-compliant; else → at-risk. A class with **either metric `null`** is excluded from all three roll-up counts (not silently counted as any bucket) — same honest-placeholder principle as AC5, applied to the summary row, not just the per-class card.
2. **Refetch-failure vs. initial-load-failure (AC7's "error-preserving" wording needed a concrete state machine).** `StateView`'s built-in `"error"` state replaces `children` entirely — correct for an **initial** load failure (nothing to preserve yet), but would violate AC7 if reused verbatim for a poll-on-focus refetch that fails after content already rendered. Resolved: the hook distinguishes "have we ever had a successful fetch" from "did the most recent fetch fail" — only a failure with **no prior successful fetch** maps to `StateView`'s `"error"` state; a failure **after** a successful fetch keeps `viewState: "content"` (last-good rows untouched) and surfaces an inline error banner instead (Task 5/6).
3. **Poll-on-focus trigger source.** `expo-router`'s `useFocusEffect` (re-exported from `@react-navigation/native`) covers in-app route focus (navigating onto the Dashboard tab) but not a browser tab/window regaining focus while already on this route. Resolved: both — `useFocusEffect` for route focus, plus (web only) a `visibilitychange`/`focus` listener on `document`/`window`, matching the spec's explicit "mount or tab/window refocus" wording.

---

## Task 1: vitest include for `features/`

**Files:**
- Modify: `vitest.config.ts`

- [x] **Step 1** Add `'features/**/__tests__/**/*.test.ts'` to the `test.include` array (currently `lib/**`, `components/**`, `netlify/functions/__tests__/**`, `.claude/hooks/__tests__/**`, `scripts/__tests__/**` — this is the first feature built under `features/`, so the glob doesn't exist yet).
- [x] **Step 2** `npm run test` → confirm it still runs clean (zero new tests yet, no regression in existing suites).

## Task 2: `ComplianceBar` — additive `placeholder` prop (honest `—`, no new component)

Per the design's CenterRollupRow cross-reference: the honest-placeholder visual language (mono `—` in `ink4`, neutral track) is reused, but `CenterRollupRow` itself isn't (its single-bar shape can't carry two independent rates). Rather than duplicate that placeholder markup inline in the new screen, extend the already-built, already-tested `ComplianceBar` with one additive prop — smaller, more reusable, and consistent with how `status`/`display` already override default rendering.

**Files:**
- Modify: `components/dashboard/ComplianceBar.logic.ts`, `components/dashboard/ComplianceBar.tsx`
- Modify: `components/dashboard/__tests__/ComplianceBar.logic.test.ts`

- [x] **Step 1 (RED):** add to `ComplianceBar.logic.test.ts`:
  ```typescript
  describe('placeholder rendering', () => {
    it('a placeholder bar never derives a tone from value', () => {
      expect(complianceTone(0, undefined, true)).toBe('placeholder' as any); // will fail to typecheck/compile until Step 2
    });
  });
  ```
  Run `npm run test` → RED (extra `placeholder` arg doesn't exist on `complianceTone` yet; `'placeholder'` isn't a `ComplianceTone` member).

- [x] **Step 2 (GREEN):** in `ComplianceBar.logic.ts`, add a fourth tone-like state without disturbing the existing 3-tone contract other tests assert on:
  ```typescript
  export type ComplianceTone = "success" | "warning" | "danger" | "info";
  export type ComplianceDisplayState = ComplianceTone | "placeholder";

  export function complianceDisplayState(value: number, explicit?: ComplianceTone, placeholder?: boolean): ComplianceDisplayState {
    if (placeholder) return "placeholder";
    return complianceTone(value, explicit);
  }
  ```
  (Keep `complianceTone` itself unchanged — existing tests/consumers are untouched; `complianceDisplayState` is the new entry point `ComplianceBar.tsx` calls.)

- [x] **Step 3:** in `ComplianceBar.tsx`, add `placeholder?: boolean` to `ComplianceBarProps`. When `true`: render the figure as `—` (mono, `theme.colors.ink4`, same font size as the normal figure — matches `CenterRollupRow.jsx`'s `span` for its placeholder figure) instead of `${value}${suffix}`/`display`; the track's fill uses `theme.colors.line2` (neutral, matches `CenterRollupRow`'s `placeholder ? "var(--line-2)" : c"`) instead of a tone color, at a fixed low width (or `0`, matching the reference's `pct = placeholder ? 0 : ...`) rather than deriving from `value`. `note` still renders if passed (e.g., no note needed when placeholder — the calling screen passes none).
- [x] **Step 4:** rerun `npm run test` → GREEN, and confirm the full existing `ComplianceBar.logic.test.ts` suite (4 pre-existing describe blocks) still passes unchanged.

## Task 3: `features/coordinator/compliance-dashboard/rollup.ts` — pure classification logic

**Files:**
- Create: `features/coordinator/compliance-dashboard/rollup.ts`
- Create: `features/coordinator/compliance-dashboard/__tests__/rollup.test.ts`

**Interfaces:**
- Produces: `ComplianceRow` (mirrors the RPC's return columns), `classifyClass(row): ClassBand`, `computeRollup(rows): RollupCounts` — consumed by `ComplianceDashboardScreen.tsx` (Task 7).

- [x] **Step 1 (RED):** write `rollup.test.ts` first:
  ```typescript
  import { describe, it, expect } from 'vitest';
  import { classifyClass, computeRollup, type ComplianceRow } from '../rollup';

  const row = (attendance_rate: number | null, update_rate: number | null): ComplianceRow => ({
    class_id: 'x', class_name: 'X', enrolled_count: 10,
    window_start: '2026-01-01', window_end: '2026-01-31',
    attendance_rate, update_rate,
  });

  describe('classifyClass', () => {
    it('both >=85 -> fully-compliant', () => expect(classifyClass(row(90, 85))).toBe('fully-compliant'));
    it('either <70 takes priority over at-risk', () => expect(classifyClass(row(60, 100))).toBe('non-compliant'));
    it('both in [70,84] -> at-risk', () => expect(classifyClass(row(70, 84))).toBe('at-risk'));
    it('one >=85, one in [70,84) -> at-risk (not fully-compliant)', () => expect(classifyClass(row(90, 72))).toBe('at-risk'));
    it('either metric null -> unclassified, never miscounted', () => {
      expect(classifyClass(row(null, 90))).toBe('unclassified');
      expect(classifyClass(row(90, null))).toBe('unclassified');
      expect(classifyClass(row(null, null))).toBe('unclassified');
    });
  });

  describe('computeRollup', () => {
    it('counts each band, excluding unclassified from all three buckets', () => {
      const rows = [row(90, 90), row(60, 90), row(75, 80), row(null, null)];
      expect(computeRollup(rows)).toEqual({ fullyCompliant: 1, atRisk: 1, nonCompliant: 1 });
    });
    it('empty input -> all zero', () => expect(computeRollup([])).toEqual({ fullyCompliant: 0, atRisk: 0, nonCompliant: 0 }));
  });
  ```
  Run `npm run test` → RED (module doesn't exist).

- [x] **Step 2 (GREEN):** write `rollup.ts`:
  ```typescript
  export interface ComplianceRow {
    class_id: string;
    class_name: string;
    enrolled_count: number;
    window_start: string | null;
    window_end: string | null;
    attendance_rate: number | null;
    update_rate: number | null;
  }

  export type ClassBand = 'fully-compliant' | 'at-risk' | 'non-compliant' | 'unclassified';

  export interface RollupCounts {
    fullyCompliant: number;
    atRisk: number;
    nonCompliant: number;
  }

  export function classifyClass(row: ComplianceRow): ClassBand {
    const { attendance_rate: a, update_rate: u } = row;
    if (a === null || u === null) return 'unclassified';
    if (a < 70 || u < 70) return 'non-compliant';
    if (a >= 85 && u >= 85) return 'fully-compliant';
    return 'at-risk';
  }

  export function computeRollup(rows: ComplianceRow[]): RollupCounts {
    const counts: RollupCounts = { fullyCompliant: 0, atRisk: 0, nonCompliant: 0 };
    for (const row of rows) {
      const band = classifyClass(row);
      if (band === 'fully-compliant') counts.fullyCompliant++;
      else if (band === 'at-risk') counts.atRisk++;
      else if (band === 'non-compliant') counts.nonCompliant++;
    }
    return counts;
  }
  ```
- [x] **Step 3:** rerun `npm run test` → GREEN.

## Task 4: `features/coordinator/compliance-dashboard/api.ts` — RPC wrapper

**Files:**
- Create: `features/coordinator/compliance-dashboard/api.ts`
- Create: `features/coordinator/compliance-dashboard/__tests__/api.test.ts`

**Interfaces:**
- Produces: `getSessionCompliance(client, sessionId, windowSize?): Promise<ComplianceRow[]>` — the **only** function in this feature that touches `supabase`.

- [x] **Step 1 (RED):** `api.test.ts`, mocking a minimal Supabase client shape (matches this repo's existing pattern of injecting the client rather than importing the singleton — see `netlify/functions/lib/db-ops.ts`'s injectable-client convention, applied client-side here):
  ```typescript
  import { describe, it, expect, vi } from 'vitest';
  import { getSessionCompliance } from '../api';

  function mockClient(result: { data: unknown; error: unknown }) {
    return { rpc: vi.fn().mockResolvedValue(result) } as any;
  }

  describe('getSessionCompliance', () => {
    it('calls the RPC with the given session id and default window size', async () => {
      const client = mockClient({ data: [], error: null });
      await getSessionCompliance(client, 'session-1');
      expect(client.rpc).toHaveBeenCalledWith('get_session_compliance_for_staff', { p_session_id: 'session-1', p_window_size: 4 });
    });
    it('passes through a custom window size', async () => {
      const client = mockClient({ data: [], error: null });
      await getSessionCompliance(client, 'session-1', 8);
      expect(client.rpc).toHaveBeenCalledWith('get_session_compliance_for_staff', { p_session_id: 'session-1', p_window_size: 8 });
    });
    it('returns the rows on success', async () => {
      const rows = [{ class_id: 'c1', class_name: 'C1', enrolled_count: 5, window_start: null, window_end: null, attendance_rate: null, update_rate: null }];
      const client = mockClient({ data: rows, error: null });
      expect(await getSessionCompliance(client, 'session-1')).toEqual(rows);
    });
    it('throws on a Supabase error (caller/hook handles the catch)', async () => {
      const client = mockClient({ data: null, error: { message: 'boom' } });
      await expect(getSessionCompliance(client, 'session-1')).rejects.toThrow('boom');
    });
  });
  ```
  Run `npm run test` → RED.

- [x] **Step 2 (GREEN):** `api.ts`:
  ```typescript
  import type { SupabaseClient } from '@supabase/supabase-js';
  import type { ComplianceRow } from './rollup';

  export async function getSessionCompliance(
    client: SupabaseClient,
    sessionId: string,
    windowSize = 4
  ): Promise<ComplianceRow[]> {
    const { data, error } = await client.rpc('get_session_compliance_for_staff', {
      p_session_id: sessionId,
      p_window_size: windowSize,
    });
    if (error) throw new Error(error.message);
    return (data ?? []) as ComplianceRow[];
  }
  ```
- [x] **Step 3:** rerun `npm run test` → GREEN.

## Task 5: `features/coordinator/compliance-dashboard/viewState.ts` — pure state derivation

**Files:**
- Create: `features/coordinator/compliance-dashboard/viewState.ts`
- Create: `features/coordinator/compliance-dashboard/__tests__/viewState.test.ts`

**Interfaces:**
- Produces: `deriveDashboardViewState(input): DashboardViewState` — resolves deferred mechanic #2 above; consumed by the hook (Task 6).

- [x] **Step 1 (RED):** `viewState.test.ts`:
  ```typescript
  import { describe, it, expect } from 'vitest';
  import { deriveDashboardViewState } from '../viewState';

  describe('deriveDashboardViewState', () => {
    it('no fetch yet -> loading', () => {
      expect(deriveDashboardViewState({ hasEverSucceeded: false, rows: null, lastFetchFailed: false }).viewState).toBe('loading');
    });
    it('first fetch fails (nothing to preserve) -> error, no rows', () => {
      const r = deriveDashboardViewState({ hasEverSucceeded: false, rows: null, lastFetchFailed: true });
      expect(r.viewState).toBe('error');
      expect(r.rows).toEqual([]);
    });
    it('successful fetch, zero classes -> empty', () => {
      expect(deriveDashboardViewState({ hasEverSucceeded: true, rows: [], lastFetchFailed: false }).viewState).toBe('empty');
    });
    it('successful fetch, some classes -> content, no banner', () => {
      const r = deriveDashboardViewState({ hasEverSucceeded: true, rows: [{} as any], lastFetchFailed: false });
      expect(r.viewState).toBe('content');
      expect(r.showRefreshErrorBanner).toBe(false);
    });
    it('a later refetch fails AFTER a prior success -> stays content, shows banner, keeps last-good rows (AC7)', () => {
      const lastGood = [{ class_id: 'a' } as any];
      const r = deriveDashboardViewState({ hasEverSucceeded: true, rows: lastGood, lastFetchFailed: true });
      expect(r.viewState).toBe('content');
      expect(r.showRefreshErrorBanner).toBe(true);
      expect(r.rows).toBe(lastGood);
    });
  });
  ```
  Run `npm run test` → RED.

- [x] **Step 2 (GREEN):** `viewState.ts`:
  ```typescript
  import type { ComplianceRow } from './rollup';

  export type DashboardViewState = 'loading' | 'empty' | 'error' | 'content';

  export interface DeriveInput {
    hasEverSucceeded: boolean;
    rows: ComplianceRow[] | null;
    lastFetchFailed: boolean;
  }

  export interface DeriveResult {
    viewState: DashboardViewState;
    rows: ComplianceRow[];
    showRefreshErrorBanner: boolean;
  }

  export function deriveDashboardViewState({ hasEverSucceeded, rows, lastFetchFailed }: DeriveInput): DeriveResult {
    if (!hasEverSucceeded) {
      if (lastFetchFailed) return { viewState: 'error', rows: [], showRefreshErrorBanner: false };
      return { viewState: 'loading', rows: [], showRefreshErrorBanner: false };
    }
    const safeRows = rows ?? [];
    return {
      viewState: safeRows.length === 0 ? 'empty' : 'content',
      rows: safeRows,
      showRefreshErrorBanner: lastFetchFailed,
    };
  }
  ```
- [x] **Step 3:** rerun `npm run test` → GREEN.

## Task 6: `features/coordinator/compliance-dashboard/useSessionCompliance.ts` — hook wiring

Native/`expo-router`-dependent wiring — not runnable under vitest's Node environment (matches `SessionProvider.tsx`'s precedent of zero direct unit tests, verified instead by hand at `/build`, Task 11). Every decision this hook makes is already covered by Tasks 3/5's pure functions; this step is wiring only.

**Files:**
- Create: `features/coordinator/compliance-dashboard/useSessionCompliance.ts`

- [x] **Step 1:** implement:
  ```typescript
  import { useCallback, useEffect, useRef, useState } from 'react';
  import { Platform } from 'react-native';
  import { useFocusEffect } from 'expo-router';
  import { supabase } from '../../../lib/supabase';
  import { getSessionCompliance } from './api';
  import { computeRollup, type ComplianceRow } from './rollup';
  import { deriveDashboardViewState } from './viewState';

  export function useSessionCompliance(sessionId: string | null, windowSize = 4) {
    const [rows, setRows] = useState<ComplianceRow[] | null>(null);
    const hasEverSucceeded = useRef(false);
    const [lastFetchFailed, setLastFetchFailed] = useState(false);

    const fetchOnce = useCallback(async () => {
      if (!sessionId) return;
      try {
        const data = await getSessionCompliance(supabase, sessionId, windowSize);
        setRows(data);
        hasEverSucceeded.current = true;
        setLastFetchFailed(false);
      } catch {
        setLastFetchFailed(true);
      }
    }, [sessionId, windowSize]);

    // Mount + in-app route refocus.
    useFocusEffect(useCallback(() => { fetchOnce(); }, [fetchOnce]));

    // Browser tab/window refocus (web only — useFocusEffect alone doesn't fire for this).
    useEffect(() => {
      if (Platform.OS !== 'web') return;
      const onVisible = () => { if (document.visibilityState === 'visible') fetchOnce(); };
      document.addEventListener('visibilitychange', onVisible);
      window.addEventListener('focus', onVisible);
      return () => {
        document.removeEventListener('visibilitychange', onVisible);
        window.removeEventListener('focus', onVisible);
      };
    }, [fetchOnce]);

    const derived = deriveDashboardViewState({ hasEverSucceeded: hasEverSucceeded.current, rows, lastFetchFailed });

    return { ...derived, rollup: computeRollup(derived.rows), retry: fetchOnce };
  }
  ```
- [x] **Step 2:** `npm run typecheck` → zero errors (this file has no vitest coverage; typecheck is the only automated gate until Task 11's manual pass).

## Task 7: `ComplianceDashboardScreen.tsx` — composition

**Files:**
- Create: `features/coordinator/compliance-dashboard/ComplianceDashboardScreen.tsx`

- [x] **Step 1:** compose per the design section:
  - Top row: three `StatTile`s (`Fully compliant` / `At-risk` / `Non-compliant`) fed by `rollup`, mono value (not `display`) per the design's explicit call-out.
  - `StateView` wraps the per-class content: `state={viewState}`, `emptyText="No classes in this session yet."`, `errorText="Couldn't load the compliance dashboard."`, `onRetry={retry}`.
  - Inside `StateView`'s content branch: if `showRefreshErrorBanner`, an inline banner (`Card` with `tone="danger"` or equivalent existing tone — check `Card.logic.ts`'s `CardTone` union at build time) reading "Showing last-loaded data — refresh failed." above the class list, never replacing it (AC7, deferred mechanic #2).
  - One `Card` per class: class name as a header `Text`; two `ComplianceBar`s — `label="Attendance submission"` / `label="Class updates posted"` — each either normal (`value=attendance_rate`/`update_rate`, `note` = `"${x} of ${n} meetings ${fully marked|updated}"` computed from `window_start`/`window_end` if a precise "x of n" count is derivable, else a simpler date-range note — confirm exact `note` wording against the live `ComplianceBar` reference at `/build`, spec doesn't mandate exact copy) or `placeholder` (Task 2's new prop) when the corresponding rate is `null`.
  - Loading state: `StateView`'s built-in `"loading"` branch (spinner) is a reasonable interim; the design calls for "skeleton cards" specifically — if skeleton loading isn't already a `StateView` capability, a simple row of 2–3 low-opacity placeholder `Card`s is an acceptable additive variant, confirmed at `/build` against the design's DoD, not over-engineered here as a new shared component.
- [x] **Step 2:** breakpoints/touch targets/tabular numerics are inherited for free from `StatTile`/`ComplianceBar`/`Card` (already Sankalp-DoD-compliant) — no new styling in this file beyond layout (`View`/flex wrapping), confirmed visually at `/build` (Task 11).

## Task 8: Role-branch `app/(tabs)/dashboard.tsx`

The `dashboard` tab is shared by `coordinator`, `bv_coordinator`, and `admin` (`lib/auth/navMap.ts`'s `ROLE_TABS`) — this item builds only the Coordinator view; BV Coordinator's org-wide-metrics dashboard is a separate, not-yet-refined item (spec header, "Consumers").

**Files:**
- Modify: `app/(tabs)/dashboard.tsx`

- [x] **Step 1:**
  ```tsx
  import { View, Text } from "react-native";
  import { useRoleGuard } from "../../lib/auth/useRoleGuard";
  import { useSession } from "../../lib/auth/SessionProvider";
  import ComplianceDashboardScreen from "../../features/coordinator/compliance-dashboard/ComplianceDashboardScreen";

  export default function DashboardScreen() {
    useRoleGuard("dashboard");
    const { activeRole, scopeId } = useSession();

    if (activeRole === "coordinator") {
      return <ComplianceDashboardScreen sessionId={scopeId} />;
    }
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <Text>Dashboard — placeholder</Text>
      </View>
    );
  }
  ```
  (`ComplianceDashboardScreen` takes `sessionId` as a prop rather than calling `useSession()` itself — keeps the screen component pure/testable-by-inspection and matches AC9: no session picker, the active-role's own `scopeId` is the only session this screen ever sees.)
- [x] **Step 2:** `npm run typecheck` → zero errors.

## Task 9: Full unit-test regression

- [x] **Step 1:** `npm run test` → full suite green, including Tasks 1–5's new files and Task 2's extended `ComplianceBar.logic.test.ts`.
- [x] **Step 2:** `npm run lint` → zero errors.

## Task 10: Spec + index bookkeeping

**Files:**
- Modify: `.docs/specs/coordinator/_index.md`
- Modify: `.docs/specs/coordinator/compliance-dashboard.md`

- [x] **Step 1:** `_index.md`'s row status → `` `/plan` ✓ — ready for `/migration` + `/build` `` (or `Built` once Task 11 below is done and verified).
- [x] **Step 2:** add a `Sign-off` checkbox to `compliance-dashboard.md` for this plan, mirroring `core-schema-and-rls.md`'s own convention.

## Task 11: Manual `/build` verification (not automatable — RN/Docker/browser required)

**Prerequisite:** `core-schema-and-rls` Tasks 12–14 applied (`npm run db:reset`), Tasks 1–9 above built.

- [x] Sign in as the seed's `coordinator1@bv-seed.test.local` — confirmed the Dashboard tab shows the compliance screen, not the placeholder (verified 2026-07-24 via a scripted Playwright/Chromium pass driving the running `expo start --web` dev server through the real magic-link sign-in flow against local Supabase/Mailpit — not a mock).
- [x] Confirm **session scoping**: only the Coordinator's own session's classes appear — all 13 classes of session F3 rendered, no error, no cross-session data (cross-scope leakage itself proven at the DB layer by Task 13's pgTAP suite).
- [x] Confirm the **four states**: loading (skeleton cards captured, screenshot `F-loading-skeleton.png`), empty (not exercisable — seed has no zero-class session; covered by `viewState.test.ts`'s unit coverage instead, per this task's own allowance), first-load network failure via intercepted/aborted RPC route (error state + working Retry, screenshots `C-first-load-error.png`/`C2-after-retry.png`), and a **subsequent** poll-on-focus refetch failure after content had rendered (inline banner shown, all 13 last-good class cards stayed visible — no blank screen, screenshot `D-refetch-error-banner.png`).
- [x] Confirm **honest placeholders**: every seeded class's `attendance_rate` fell outside the seed's attendance-seeded window (Task 14's documented gap) and rendered `—`, never `0%`; `update_rate` (which had no such gap) rendered a real `0%` figure, confirming the two metrics are handled independently.
- [x] Confirm **poll-on-focus**: dispatched a `focus` event on the live page (real tab/window-refocus signal, not a reload) — confirmed exactly one new `get_session_compliance_for_staff` RPC call fired per dispatch, both while the RPC was blocked (banner appears) and once unblocked (banner clears, content updates).
- [x] Confirm **no write affordance** anywhere on the screen (AC6) — scanned rendered text for Save/Submit/Edit/Delete/Post/Mark-attendance verbs, zero hits.
- [x] Confirm breakpoints 360/768/1024/1440 — captured screenshots at all four; `document.documentElement.scrollWidth` never exceeded `clientWidth` at any width (no horizontal scroll).
- [x] Confirm role-guard: signed in as `teacher1@bv-seed.test.local` — no "Dashboard" nav item rendered at all (regression-checked, no new work needed, matches existing `useRoleGuard`/`navMap` behavior).

---

## Self-Review (against the spec)

- AC1 (session-scoped rows only, RLS/RPC-enforced) → Task 4/6/8 (client only ever supplies its own `scopeId`; enforcement itself lives in `core-schema-and-rls` Task 13's pgTAP suite) ✓
- AC2 (two `ComplianceBar` metrics per class) → Task 7 ✓
- AC3 ("submitted" definition) → server-side only (Task 13 of `core-schema-and-rls.plan.md`); this plan consumes `attendance_rate` as given, no client-side recomputation ✓
- AC4 (`StatTile` roll-up, thresholds) → Task 3 (classification logic) + Task 7 (rendering) ✓
- AC5 (honest `—` placeholder, never `0%`) → Task 2 (`ComplianceBar` placeholder prop) + Task 3 (`unclassified` band excluded from roll-up) ✓
- AC6 (read-only) → no write path anywhere in Tasks 1–9; Task 11 visually confirms ✓
- AC7 (poll-on-focus, error-preserving) → Task 5 (state derivation) + Task 6 (focus wiring) ✓
- AC8 (no student-level data, RPC-only access) → Task 4 (`api.ts` is the only `supabase` call site in this feature) ✓
- AC9 (single active-role session, no picker) → Task 8 (`sessionId` sourced from `useSession().scopeId`, no picker UI built) ✓

**Edge cases covered:** partial attendance submission (server-side, Task 13 of the schema plan) · new class/no meetings yet (Task 2/3's placeholder + unclassified handling) · mid-window roster change (server-side approximation, Task 13 of the schema plan) · zero-expected-enrollment date (server-side) · multi-session Coordinator (Task 8, no picker, active-role switch only — pre-existing mechanism) · zero-classes session (Task 5's `empty` derivation + Task 7's `StateView` empty branch).

**Placeholder scan:** no TBD/TODO markers. Two items are explicitly left to `/build`'s judgment rather than over-specified here (Task 7's exact `note` copy, Task 7's loading-skeleton visual) — both are cosmetic, non-architectural, and bounded by the design-system DoD already, not open questions about correctness.

**Architectural flags:** none. Both ADRs (0030, 0031) already resolved the only genuinely architectural decisions (System ownership, calendar source-of-truth); Task 2's `ComplianceBar` extension is an additive prop on an already-approved component, not a new access pattern or new shared abstraction.

---

## Sign-off
- [x] **Human sign-off on this plan** (2026-07-24, mehta.maulik@gmail.com) → ready for `/migration` (Tasks 12–14 of `core-schema-and-rls.plan.md`, if not already built) → `/build` (Tasks 1–11 above).
- [x] **`/build` Tasks 1–11 complete** (2026-07-24) — all automated tasks (1–9) plus manual verification (Task 11, scripted Playwright/Chromium pass against the running dev server + local Supabase) done. `npm run test`/`lint`/`typecheck` clean; every Task 11 checklist item confirmed with screenshots → ready for `/test`.
