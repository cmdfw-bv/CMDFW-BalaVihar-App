import { describe, it, expect } from 'vitest';
import { joinRosterWithEnrollments } from '../rosterMap';

const student = (over: Partial<{ id: string; first_name: string; last_name: string; grade_level: string }> = {}) => ({
  id: 's1', first_name: 'Ann', last_name: 'Iyer', grade_level: 'Grade3', ...over,
});

describe('joinRosterWithEnrollments', () => {
  it('joins a student to its active enrollment by student_id', () => {
    const rows = joinRosterWithEnrollments(
      [student({ id: 's1', first_name: 'Ann', last_name: 'Iyer' })],
      [{ id: 'e1', student_id: 's1' }],
    );
    expect(rows).toEqual([{ enrollmentId: 'e1', studentId: 's1', firstName: 'Ann', lastName: 'Iyer', gradeLevel: 'Grade3' }]);
  });

  it('sorts rows by last name then first name (deterministic render order)', () => {
    const rows = joinRosterWithEnrollments(
      [student({ id: 's1', first_name: 'Zed', last_name: 'Anand' }), student({ id: 's2', first_name: 'Amy', last_name: 'Zee' })],
      [{ id: 'e1', student_id: 's1' }, { id: 'e2', student_id: 's2' }],
    );
    expect(rows.map((r) => r.studentId)).toEqual(['s1', 's2']);
  });

  it('drops a roster student with no matching active enrollment (race between the two reads — e.g. mid-fetch withdrawal, decision #4)', () => {
    const rows = joinRosterWithEnrollments([student({ id: 's1' })], []);
    expect(rows).toEqual([]);
  });

  it('drops an enrollment with no matching roster student (defensive, same race)', () => {
    const rows = joinRosterWithEnrollments([], [{ id: 'e1', student_id: 's1' }]);
    expect(rows).toEqual([]);
  });

  it('returns [] for an empty roster (feeds the empty-state view)', () => {
    expect(joinRosterWithEnrollments([], [])).toEqual([]);
  });
});
