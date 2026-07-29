export interface RosterStudent {
  id: string;
  first_name: string;
  last_name: string;
  grade_level: string;
}

export interface EnrollmentLink {
  id: string;
  student_id: string;
}

export interface RosterRow {
  enrollmentId: string;
  studentId: string;
  firstName: string;
  lastName: string;
  gradeLevel: string;
}

// The two reads (get_class_roster_for_staff RPC + direct enrollments select, ADR-0030) are not
// transactional against each other — a student row with no matching enrollment (or vice versa)
// is silently dropped rather than shown half-populated; per decision #4 this is the same
// "stale roster tolerated, no client special-case" posture, just applied to the join itself.
export function joinRosterWithEnrollments(students: RosterStudent[], enrollments: EnrollmentLink[]): RosterRow[] {
  const enrollmentByStudentId = new Map(enrollments.map((e) => [e.student_id, e.id]));
  const rows: RosterRow[] = [];
  for (const s of students) {
    const enrollmentId = enrollmentByStudentId.get(s.id);
    if (!enrollmentId) continue;
    rows.push({ enrollmentId, studentId: s.id, firstName: s.first_name, lastName: s.last_name, gradeLevel: s.grade_level });
  }
  return rows.sort((a, b) => a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName));
}
