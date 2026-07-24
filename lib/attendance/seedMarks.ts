import type { RosterRow } from './rosterMap';

export interface AttendanceRecord {
  enrollment_id: string;
  status: 'present' | 'absent';
}

export interface MarkState {
  status: 'present' | 'absent';
  saved: boolean;
  error: boolean;
}

export type MarksByEnrollment = Record<string, MarkState>;

// Refine decision: "default Present, mark exceptions" — a row seeds from its stored attendance
// row when one exists (re-opening a submitted/corrected date), else defaults to present/unsaved.
export function seedMarks(rows: RosterRow[], attendanceRows: AttendanceRecord[]): MarksByEnrollment {
  const statusByEnrollmentId = new Map(attendanceRows.map((a) => [a.enrollment_id, a.status]));
  const marks: MarksByEnrollment = {};
  for (const row of rows) {
    const stored = statusByEnrollmentId.get(row.enrollmentId);
    marks[row.enrollmentId] = stored
      ? { status: stored, saved: true, error: false }
      : { status: 'present', saved: false, error: false };
  }
  return marks;
}
