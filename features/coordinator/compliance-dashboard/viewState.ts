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
