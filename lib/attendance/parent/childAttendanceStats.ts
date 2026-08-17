import type { SupabaseClient } from '@supabase/supabase-js';

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

// Embeds are nullable on purpose (PR #51 review, Important #1). PostgREST returns `null` for a
// to-one embed whose joined row is filtered out — which happens the moment
// students_parent_select / classes_parent_select diverge even slightly from
// enrollments_parent_select. Typing them as always-present was the bug: it made `row.student.id`
// look safe and threw at runtime instead.
export interface EnrollmentRow {
  id: string;
  student: { id: string; first_name: string; last_name: string } | null;
  class: { name: string; grade_band: string } | null;
  attendance: { status: 'present' | 'absent' }[] | null;
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

// Returns null rather than throwing, so one unrenderable row degrades to being omitted instead of
// collapsing the whole list behind an error state (PR #51 review, Important #1). A missing
// attendance embed is "no records yet", which computeAttendanceStats already models as percent:null.
export function mapEnrollmentRow(row: EnrollmentRow): ChildAttendance | null {
  if (!row?.student || !row?.class) return null;
  return {
    enrollmentId: row.id,
    studentId: row.student.id,
    name: `${row.student.first_name} ${row.student.last_name}`,
    className: row.class.name,
    gradeBand: row.class.grade_band,
    ...computeAttendanceStats(row.attendance ?? []),
  };
}

// The batch entry point the hook calls: drop unrenderable rows, keep the rest, sorted.
export function mapEnrollmentRows(rows: EnrollmentRow[]): ChildAttendance[] {
  const mapped = rows.map(mapEnrollmentRow).filter((c): c is ChildAttendance => c !== null);
  return sortChildrenByName(mapped);
}

export function sortChildrenByName(children: ChildAttendance[]): ChildAttendance[] {
  return [...children].sort((a, b) => a.name.localeCompare(b.name));
}

// Builds the actual query the hook issues. Exported so AC#7's regression guard can assert against
// the *call path* rather than the CHILDREN_ATTENDANCE_QUERY constant, which the hook was
// previously free to ignore (PR #51 review, Important #3). This is a query-shape guard, not a
// security control — RLS remains the real boundary.
export function buildChildrenQuery(client: SupabaseClient) {
  return client
    .from(CHILDREN_ATTENDANCE_QUERY.table)
    .select(CHILDREN_ATTENDANCE_QUERY.select)
    .eq('status', CHILDREN_ATTENDANCE_QUERY.statusFilter);
}
