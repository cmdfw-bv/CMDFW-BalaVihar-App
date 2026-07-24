export interface AttendanceStats {
  present: number;
  absent: number;
  percent: number | null;
}

export interface ChildAttendance extends AttendanceStats {
  enrollmentId: string;
  studentId: string;
  name: string;
  className: string;
  gradeBand: string;
}

export interface EnrollmentRow {
  id: string;
  student: { id: string; first_name: string; last_name: string };
  class: { name: string; grade_band: string };
  attendance: { status: 'present' | 'absent' }[];
}

// The query shape itself, extracted as data (not inlined in the fetch hook) so it's unit
// testable without a live Supabase call — AC#7's own coverage: prove the built query only
// ever asks for status='active', never a family/user id (see plan Shared seam).
export const CHILDREN_ATTENDANCE_QUERY = {
  table: 'enrollments',
  select: 'id, student:students(id, first_name, last_name), class:classes(name, grade_band), attendance(status)',
  statusFilter: 'active',
} as const;

export function computeAttendanceStats(records: { status: 'present' | 'absent' }[]): AttendanceStats {
  const present = records.filter((r) => r.status === 'present').length;
  const absent = records.filter((r) => r.status === 'absent').length;
  const total = present + absent;
  return { present, absent, percent: total === 0 ? null : Math.round((present / total) * 100) };
}

export function mapEnrollmentRow(row: EnrollmentRow): ChildAttendance {
  return {
    enrollmentId: row.id,
    studentId: row.student.id,
    name: `${row.student.first_name} ${row.student.last_name}`,
    className: row.class.name,
    gradeBand: row.class.grade_band,
    ...computeAttendanceStats(row.attendance),
  };
}

export function sortChildrenByName(children: ChildAttendance[]): ChildAttendance[] {
  return [...children].sort((a, b) => a.name.localeCompare(b.name));
}
