import { describe, it, expect } from 'vitest';
import { deriveRosterViewState } from '../viewState';

describe('deriveRosterViewState', () => {
  it('loading while the initial fetch is in flight', () => {
    expect(deriveRosterViewState({ fetchStatus: 'loading', rosterRowCount: 0 })).toBe('loading');
  });
  it('error when the initial fetch failed, regardless of row count', () => {
    expect(deriveRosterViewState({ fetchStatus: 'error', rosterRowCount: 3 })).toBe('error');
  });
  it('empty when the fetch succeeded with zero active enrollments (AC#7)', () => {
    expect(deriveRosterViewState({ fetchStatus: 'ready', rosterRowCount: 0 })).toBe('empty');
  });
  it('content when the fetch succeeded with at least one row', () => {
    expect(deriveRosterViewState({ fetchStatus: 'ready', rosterRowCount: 1 })).toBe('content');
  });
});
