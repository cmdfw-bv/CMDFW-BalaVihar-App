import { describe, it, expect } from 'vitest';
import {
  computeAttendanceStats,
  mapEnrollmentRow,
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
