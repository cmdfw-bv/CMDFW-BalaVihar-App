import { describe, it, expect } from 'vitest';
import { applyFetchResult, selectSessionState, type SessionFetchState } from '../sessionScopedState';
import type { ComplianceRow } from '../rollup';

const rowsA = [{ class_id: 'a' } as ComplianceRow];
const rowsB = [{ class_id: 'b' } as ComplianceRow];

describe('applyFetchResult', () => {
  it('success writes under its own session key', () => {
    const next = applyFetchResult({}, 's1', { ok: true, rows: rowsA });
    expect(next.s1).toEqual({ sessionId: 's1', rows: rowsA, lastFetchFailed: false });
  });

  it('failure with no prior rows for that session is a plain error', () => {
    const next = applyFetchResult({}, 's1', { ok: false });
    expect(next.s1).toEqual({ sessionId: 's1', rows: null, lastFetchFailed: true });
  });

  // AC7: a failed refresh keeps last-good rows so the banner renders over content.
  it('failure after a success for the same session preserves its rows', () => {
    const prev = applyFetchResult({}, 's1', { ok: true, rows: rowsA });
    const next = applyFetchResult(prev, 's1', { ok: false });
    expect(next.s1).toEqual({ sessionId: 's1', rows: rowsA, lastFetchFailed: true });
  });

  // The round-5 finding: A and B can be in flight together across a session switch. If A settles
  // second it must not displace B — the previous single-slot version overwrote B's state, and
  // because selectSessionState then refused to render it, viewState fell back to `loading` with
  // nothing left to re-trigger, stranding the screen on skeletons.
  it('a late response from the session just left does not displace the current session', () => {
    let state: Record<string, SessionFetchState> = {};
    state = applyFetchResult(state, 's2', { ok: true, rows: rowsB }); // B resolves first
    state = applyFetchResult(state, 's1', { ok: true, rows: rowsA }); // A resolves late

    expect(selectSessionState(state.s2 ?? null, 's2')).toEqual({ rows: rowsB, lastFetchFailed: false });
  });

  it('a late FAILURE from the session just left does not put the current session into error', () => {
    let state: Record<string, SessionFetchState> = {};
    state = applyFetchResult(state, 's2', { ok: true, rows: rowsB });
    state = applyFetchResult(state, 's1', { ok: false });

    expect(selectSessionState(state.s2 ?? null, 's2')).toEqual({ rows: rowsB, lastFetchFailed: false });
  });

  it('keeps other sessions intact rather than replacing the whole map', () => {
    let state: Record<string, SessionFetchState> = {};
    state = applyFetchResult(state, 's1', { ok: true, rows: rowsA });
    state = applyFetchResult(state, 's2', { ok: true, rows: rowsB });
    expect(Object.keys(state).sort()).toEqual(['s1', 's2']);
  });
});
