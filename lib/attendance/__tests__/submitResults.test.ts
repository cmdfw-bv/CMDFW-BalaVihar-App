import { describe, it, expect } from 'vitest';
import { applySubmitResults } from '../submitResults';
import type { MarksByEnrollment } from '../seedMarks';

const baseMarks: MarksByEnrollment = {
  e1: { status: 'present', saved: false, error: false },
  e2: { status: 'absent', saved: false, error: false },
  e3: { status: 'present', saved: false, error: true }, // e.g. a previous failed attempt
};

describe('applySubmitResults', () => {
  it('a fulfilled call returning a row flips that row to saved/no-error', () => {
    const next = applySubmitResults(baseMarks, [
      { enrollmentId: 'e1', settled: { status: 'fulfilled', value: { status: 'present' } } },
    ]);
    expect(next.e1).toEqual({ status: 'present', saved: true, error: false });
  });

  it('a fulfilled call returning null (RPC denial contract, not a throw) is treated as a failure, not a silent no-op', () => {
    const next = applySubmitResults(baseMarks, [
      { enrollmentId: 'e2', settled: { status: 'fulfilled', value: null } },
    ]);
    expect(next.e2).toEqual({ status: 'absent', saved: false, error: true });
  });

  it('a rejected call (network/transient) is also treated as a failure', () => {
    const next = applySubmitResults(baseMarks, [
      { enrollmentId: 'e1', settled: { status: 'rejected', reason: new Error('network') } },
    ]);
    expect(next.e1).toEqual({ status: 'present', saved: false, error: true });
  });

  it('a successful retry clears a previously-failed row\'s error flag (Retry (N failed) path)', () => {
    const next = applySubmitResults(baseMarks, [
      { enrollmentId: 'e3', settled: { status: 'fulfilled', value: { status: 'present' } } },
    ]);
    expect(next.e3).toEqual({ status: 'present', saved: true, error: false });
  });

  it('rows not present in the results list are left untouched (retryFailed only resubmits the failed subset)', () => {
    const next = applySubmitResults(baseMarks, [
      { enrollmentId: 'e1', settled: { status: 'fulfilled', value: { status: 'present' } } },
    ]);
    expect(next.e2).toBe(baseMarks.e2);
    expect(next.e3).toBe(baseMarks.e3);
  });

  it('does not mutate the input record (pure)', () => {
    const before = JSON.stringify(baseMarks);
    applySubmitResults(baseMarks, [{ enrollmentId: 'e1', settled: { status: 'fulfilled', value: { status: 'present' } } }]);
    expect(JSON.stringify(baseMarks)).toBe(before);
  });
});
