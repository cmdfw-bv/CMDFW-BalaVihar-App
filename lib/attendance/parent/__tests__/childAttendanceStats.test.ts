import { describe, it, expect } from 'vitest';
import {
  computeAttendanceStats,
  mapEnrollmentRow,
  mapEnrollmentRows,
  buildChildrenQuery,
  sortChildrenByName,
  CHILDREN_ATTENDANCE_QUERY,
  type EnrollmentRow,
} from '../childAttendanceStats';

describe('computeAttendanceStats', () => {
  it('returns percent: null for zero marked rows (AC#2 — no attendance recorded yet, never 0%/NaN)', () => {
    expect(computeAttendanceStats([])).toEqual({ present: 0, absent: 0, percent: null });
  });
  it('computes 100% for all-present', () => {
    expect(computeAttendanceStats([{ status: 'present' }, { status: 'present' }]))
      .toEqual({ present: 2, absent: 0, percent: 100 });
  });
  it('computes 0% for all-absent (not confused with the null "no data" case)', () => {
    expect(computeAttendanceStats([{ status: 'absent' }]))
      .toEqual({ present: 0, absent: 1, percent: 0 });
  });
  it('rounds a mixed record (2 present, 1 absent -> 67%)', () => {
    expect(computeAttendanceStats([{ status: 'present' }, { status: 'present' }, { status: 'absent' }]))
      .toEqual({ present: 2, absent: 1, percent: 67 });
  });
});

describe('mapEnrollmentRow', () => {
  const row: EnrollmentRow = {
    id: 'enr-1',
    student: { id: 'stu-1', first_name: 'Asha', last_name: 'Rao' },
    class: { name: 'Balvihar 3', grade_band: 'Grade 3' },
    attendance: [{ status: 'present' }, { status: 'absent' }],
  };
  it('maps a raw enrollment row into a ChildAttendance', () => {
    expect(mapEnrollmentRow(row)).toEqual({
      enrollmentId: 'enr-1',
      studentId: 'stu-1',
      name: 'Asha Rao',
      className: 'Balvihar 3',
      gradeBand: 'Grade 3',
      present: 1,
      absent: 1,
      percent: 50,
    });
  });
});

describe('sortChildrenByName', () => {
  it('sorts children alphabetically by name (stable default, not an AC)', () => {
    const unsorted = [
      { enrollmentId: '2', studentId: 's2', name: 'Zara Iyer', className: 'X', gradeBand: 'Y', present: 0, absent: 0, percent: null },
      { enrollmentId: '1', studentId: 's1', name: 'Asha Rao', className: 'X', gradeBand: 'Y', present: 0, absent: 0, percent: null },
    ];
    expect(sortChildrenByName(unsorted).map((c) => c.name)).toEqual(['Asha Rao', 'Zara Iyer']);
  });
});

describe("CHILDREN_ATTENDANCE_QUERY (AC#7 — client query only ever requests the caller's own scope)", () => {
  it('filters on status only — no family/user-id-shaped parameter anywhere in the query shape', () => {
    expect(CHILDREN_ATTENDANCE_QUERY.statusFilter).toBe('active');
    expect(CHILDREN_ATTENDANCE_QUERY.select).not.toMatch(/family|user_id|auth\.uid/i);
  });
});

// PR #51 review, Important #1: PostgREST returns `null` for a to-one embed when the joined row is
// filtered out (e.g. students_parent_select ever diverging from enrollments_parent_select). The
// old code cast straight to a non-null shape and threw inside the hook's shared try, so ONE bad
// row blanked every child behind a generic error. Degrade the row, not the batch.
describe('mapEnrollmentRow — null embeds (PR #51 review Important #1)', () => {
  const good = {
    id: 'e1',
    student: { id: 's1', first_name: 'Asha', last_name: 'Seed' },
    class: { name: 'Gr9 Class', grade_band: 'Gr9' },
    attendance: [{ status: 'present' as const }],
  };

  it('returns null for a row whose student embed is null, instead of throwing', () => {
    expect(mapEnrollmentRow({ ...good, student: null } as never)).toBeNull();
  });

  it('returns null for a row whose class embed is null, instead of throwing', () => {
    expect(mapEnrollmentRow({ ...good, class: null } as never)).toBeNull();
  });

  it('tolerates a null attendance embed as "no records yet", not an error', () => {
    const out = mapEnrollmentRow({ ...good, attendance: null } as never);
    expect(out).not.toBeNull();
    expect(out?.percent).toBeNull();
  });
});

describe('mapEnrollmentRows — one bad row must not blank the list', () => {
  it('keeps every valid child when a sibling row has a null embed', () => {
    const rows = [
      { id: 'e1', student: { id: 's1', first_name: 'Asha', last_name: 'Seed' }, class: { name: 'Gr9 Class', grade_band: 'Gr9' }, attendance: [{ status: 'present' as const }] },
      { id: 'e2', student: null, class: { name: 'Gr8 Class', grade_band: 'Gr8' }, attendance: [] },
      { id: 'e3', student: { id: 's3', first_name: 'Bala', last_name: 'Seed' }, class: { name: 'Gr7 Class', grade_band: 'Gr7' }, attendance: [] },
    ];
    const out = mapEnrollmentRows(rows as never);
    expect(out.map((c) => c.name)).toEqual(['Asha Seed', 'Bala Seed']);
  });
});

// Important #3: the AC#7 guard previously asserted against the CHILDREN_ATTENDANCE_QUERY constant,
// which the hook was free to ignore. Asserting against the builder the hook actually calls is what
// makes this a guard rather than decoration. Shape guard only — RLS is the real boundary.
describe('buildChildrenQuery (AC#7 — bound to the real call path)', () => {
  function fakeClient() {
    const calls: { fn: string; args: unknown[] }[] = [];
    const chain: Record<string, (...a: unknown[]) => unknown> = {};
    for (const fn of ['from', 'select', 'eq']) {
      chain[fn] = (...args: unknown[]) => { calls.push({ fn, args }); return chain; };
    }
    return { chain, calls };
  }

  it('asks enrollments for the documented columns, filtered only on status', () => {
    const { chain, calls } = fakeClient();
    buildChildrenQuery(chain as never);
    expect(calls.map((c) => c.fn)).toEqual(['from', 'select', 'eq']);
    expect(calls[0].args[0]).toBe('enrollments');
    expect(calls[2].args).toEqual(['status', 'active']);
  });

  it('never passes a family- or user-id-shaped filter', () => {
    const { chain, calls } = fakeClient();
    buildChildrenQuery(chain as never);
    const flat = JSON.stringify(calls);
    expect(flat).not.toMatch(/family/i);
    expect(flat).not.toMatch(/user_id/i);
    expect(flat).not.toMatch(/auth\.uid/i);
  });
});
