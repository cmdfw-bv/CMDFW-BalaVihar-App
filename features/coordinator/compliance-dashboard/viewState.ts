import type { ComplianceRow, RollupCounts } from './rollup';

export type DashboardViewState = 'loading' | 'empty' | 'error' | 'content';

export interface DeriveInput {
  /**
   * Whether there is a session to query at all — false when the Coordinator's JWT carries no
   * `scope_id` claim, so `dashboard.tsx` passes `sessionId={null}`.
   *
   * Required rather than optional, deliberately: the bug this closes was a state nobody thought
   * to pass, and an `= true` default would let the next caller reintroduce it silently.
   */
  hasSession: boolean;
  hasEverSucceeded: boolean;
  rows: ComplianceRow[] | null;
  lastFetchFailed: boolean;
}

export interface DeriveResult {
  viewState: DashboardViewState;
  rows: ComplianceRow[];
  showRefreshErrorBanner: boolean;
}

export function deriveDashboardViewState({ hasSession, hasEverSucceeded, rows, lastFetchFailed }: DeriveInput): DeriveResult {
  // First, and ahead of every other branch: with no session there is nothing to fetch, so no
  // fetch ever settles and `loading` would never resolve — skeletons forever, with no retry
  // affordance on screen. `error` is the honest render (StateView's message + retry), and it
  // outranks last-good rows too: showing one session's cards while we cannot name the current
  // session is the same class of bug as the round-5 stale-content finding.
  if (!hasSession) return { viewState: 'error', rows: [], showRefreshErrorBanner: false };
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

export interface RollupTileValues {
  fullyCompliant: string;
  atRisk: string;
  nonCompliant: string;
}

/**
 * The roll-up tiles render above the loading/error branch, so they render in every state. In
 * `loading` and `error` there are no rows to count — `deriveDashboardViewState` returns `[]` for
 * both — and `computeRollup([])` is an honest 0/0/0 only in `empty`, where the session really does
 * have zero classes. In the other two it is a fabricated figure: "Non-compliant 0" over a failed
 * fetch reads as "everything is fine" (PR #50 review, @ssrinivas90).
 *
 * Same principle as ComplianceBar's `placeholder` prop one level up — honest "—", never a false
 * zero (compliance-dashboard AC5).
 */
export function rollupTileValues(viewState: DashboardViewState, rollup: RollupCounts): RollupTileValues {
  if (viewState === 'loading' || viewState === 'error') {
    return { fullyCompliant: '—', atRisk: '—', nonCompliant: '—' };
  }
  return {
    fullyCompliant: String(rollup.fullyCompliant),
    atRisk: String(rollup.atRisk),
    nonCompliant: String(rollup.nonCompliant),
  };
}
