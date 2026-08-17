import { describe, it, expect } from 'vitest';
import { selectSessionState, type SessionFetchState } from '../sessionScopedState';
import type { ComplianceRow } from '../rollup';

const rowsA = [{ class_id: 'a' } as ComplianceRow];

describe('selectSessionState', () => {
  it('nothing fetched yet -> no rows, no failure', () => {
    expect(selectSessionState(null, 's1')).toEqual({ rows: null, lastFetchFailed: false });
  });

  it('state belongs to the current session -> passes through', () => {
    const s: SessionFetchState = { sessionId: 's1', rows: rowsA, lastFetchFailed: false };
    expect(selectSessionState(s, 's1')).toEqual({ rows: rowsA, lastFetchFailed: false });
  });

  // The bug this closes: a Coordinator holding two session-scoped roles switches scope. The
  // refetch half was already fixed (the coalescer is keyed on doFetch), but `rows` still held
  // Session A's data and hasEverSucceeded stayed true, so viewState stayed `content` and A's
  // class cards rendered under B's context chip until the new response landed.
  it('state belongs to a previous session -> reads as not-yet-fetched, so viewState falls back to loading', () => {
    const s: SessionFetchState = { sessionId: 's1', rows: rowsA, lastFetchFailed: false };
    expect(selectSessionState(s, 's2')).toEqual({ rows: null, lastFetchFailed: false });
  });

  // A late response from the session we just left must not paint the session we are now on.
  it('a stale failure from the previous session does not put the new session into error', () => {
    const s: SessionFetchState = { sessionId: 's1', rows: null, lastFetchFailed: true };
    expect(selectSessionState(s, 's2')).toEqual({ rows: null, lastFetchFailed: false });
  });

  it('null sessionId -> no rows', () => {
    const s: SessionFetchState = { sessionId: 's1', rows: rowsA, lastFetchFailed: false };
    expect(selectSessionState(s, null)).toEqual({ rows: null, lastFetchFailed: false });
  });

  // AC7 must survive the change: a refetch failure for the SAME session keeps last-good rows.
  it('same-session failure after a success keeps the rows for the refresh banner', () => {
    const s: SessionFetchState = { sessionId: 's1', rows: rowsA, lastFetchFailed: true };
    expect(selectSessionState(s, 's1')).toEqual({ rows: rowsA, lastFetchFailed: true });
  });
});
