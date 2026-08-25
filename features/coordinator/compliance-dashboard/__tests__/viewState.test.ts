import { describe, it, expect } from 'vitest';
import { deriveDashboardViewState, rollupTileValues } from '../viewState';

describe('deriveDashboardViewState', () => {
  it('no fetch yet -> loading', () => {
    expect(deriveDashboardViewState({ hasSession: true, hasEverSucceeded: false, rows: null, lastFetchFailed: false }).viewState).toBe('loading');
  });
  it('first fetch fails (nothing to preserve) -> error, no rows', () => {
    const r = deriveDashboardViewState({ hasSession: true, hasEverSucceeded: false, rows: null, lastFetchFailed: true });
    expect(r.viewState).toBe('error');
    expect(r.rows).toEqual([]);
  });
  it('successful fetch, zero classes -> empty', () => {
    expect(deriveDashboardViewState({ hasSession: true, hasEverSucceeded: true, rows: [], lastFetchFailed: false }).viewState).toBe('empty');
  });
  it('successful fetch, some classes -> content, no banner', () => {
    const r = deriveDashboardViewState({ hasSession: true, hasEverSucceeded: true, rows: [{} as any], lastFetchFailed: false });
    expect(r.viewState).toBe('content');
    expect(r.showRefreshErrorBanner).toBe(false);
  });
  it('a later refetch fails AFTER a prior success -> stays content, shows banner, keeps last-good rows (AC7)', () => {
    const lastGood = [{ class_id: 'a' } as any];
    const r = deriveDashboardViewState({ hasSession: true, hasEverSucceeded: true, rows: lastGood, lastFetchFailed: true });
    expect(r.viewState).toBe('content');
    expect(r.showRefreshErrorBanner).toBe(true);
    expect(r.rows).toBe(lastGood);
  });

  // A coordinator whose JWT carries no scope_id claim used to sit on skeletons forever: the
  // hook's doFetch returns early with nothing to query, so no fetch ever settles, hasEverSucceeded
  // stays false, and `loading` is permanent with no retry affordance on screen. There is no
  // session to load, so `loading` is a lie — `error` renders StateView's message plus a retry,
  // which is the honest render and recovers if the claim appears after a role re-activation
  // (PR #50 review round 6, @ssrinivas90).
  it('no session to query -> error, never a permanent loading state', () => {
    const r = deriveDashboardViewState({ hasSession: false, hasEverSucceeded: false, rows: null, lastFetchFailed: false });
    expect(r.viewState).toBe('error');
    expect(r.rows).toEqual([]);
    expect(r.showRefreshErrorBanner).toBe(false);
  });

  it('no session outranks last-good rows -> still error, never stale content under a session we cannot name', () => {
    const r = deriveDashboardViewState({ hasSession: false, hasEverSucceeded: true, rows: [{} as any], lastFetchFailed: false });
    expect(r.viewState).toBe('error');
    expect(r.rows).toEqual([]);
  });
});

describe('rollupTileValues', () => {
  const rollup = { fullyCompliant: 3, atRisk: 1, nonCompliant: 2 };

  // AC5's "honest placeholder, never a false zero" applied to the roll-up row, not just the
  // per-class bars: computeRollup([]) during loading/error would otherwise read as "0 Fully
  // compliant · 0 At-risk · 0 Non-compliant" in the largest type on the screen — the same
  // misread AC5 exists to prevent, one level up, and the more dangerous direction (a coordinator
  // reading it concludes everything is fine) (PR #50 review, @ssrinivas90).
  it('loading -> every tile is an honest placeholder, never 0', () => {
    expect(rollupTileValues('loading', rollup)).toEqual({ fullyCompliant: '—', atRisk: '—', nonCompliant: '—' });
  });

  it('error -> every tile is an honest placeholder, never a false 0', () => {
    expect(rollupTileValues('error', rollup)).toEqual({ fullyCompliant: '—', atRisk: '—', nonCompliant: '—' });
  });

  it('content -> real counts, as strings', () => {
    expect(rollupTileValues('content', rollup)).toEqual({ fullyCompliant: '3', atRisk: '1', nonCompliant: '2' });
  });

  it('empty -> real counts too (a genuinely empty session is 0, not a placeholder)', () => {
    const zero = { fullyCompliant: 0, atRisk: 0, nonCompliant: 0 };
    expect(rollupTileValues('empty', zero)).toEqual({ fullyCompliant: '0', atRisk: '0', nonCompliant: '0' });
  });
});
