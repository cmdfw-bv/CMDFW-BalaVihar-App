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
