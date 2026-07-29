import { describe, it, expect } from 'vitest';
import { seedMarks } from '../seedMarks';
import type { RosterRow } from '../rosterMap';

const rows: RosterRow[] = [
  { enrollmentId: 'e1', studentId: 's1', firstName: 'Ann', lastName: 'Iyer', gradeLevel: 'Grade3' },
  { enrollmentId: 'e2', studentId: 's2', firstName: 'Bob', lastName: 'Rao', gradeLevel: 'Grade3' },
];

describe('seedMarks', () => {
  it('defaults every row to present/unsaved when there is no existing attendance row (AC#3)', () => {
    expect(seedMarks(rows, [])).toEqual({
      e1: { status: 'present', saved: false, error: false },
      e2: { status: 'present', saved: false, error: false },
    });
  });

  it('loads the stored status for a row with an existing attendance record, marked saved (re-opening a submitted date)', () => {
    const marks = seedMarks(rows, [{ enrollment_id: 'e1', status: 'absent' }]);
    expect(marks.e1).toEqual({ status: 'absent', saved: true, error: false });
    expect(marks.e2).toEqual({ status: 'present', saved: false, error: false }); // untouched row still defaults
  });

  it('ignores an attendance row whose enrollment_id is not in the current roster (defensive — stale join)', () => {
    const marks = seedMarks(rows, [{ enrollment_id: 'e-not-in-roster', status: 'absent' }]);
    expect(Object.keys(marks)).toEqual(['e1', 'e2']);
  });
});
