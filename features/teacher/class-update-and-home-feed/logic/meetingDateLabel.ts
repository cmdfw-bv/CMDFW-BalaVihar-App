const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * Short label for a `class_meetings.meeting_date` (ADR-0036) — e.g. `2026-01-11` -> `Jan 11`.
 *
 * Formatted by splitting the string rather than via `new Date(iso)`. A Postgres `date` carries no
 * timezone, but `new Date('2026-01-11')` parses as UTC midnight, so every viewer west of Greenwich
 * would render the previous day — the same off-by-one this feature already avoided by not deriving
 * `meeting_date` from `created_at`. Splitting keeps the label the date the DB actually holds.
 *
 * Returns '' (not 'Invalid Date') on a malformed value, matching formatPostedAt's convention.
 */
export function meetingDateLabel(iso: string): string {
  const m = ISO_DATE.exec(iso.trim());
  if (!m) return '';
  const monthIndex = Number(m[2]) - 1;
  if (monthIndex < 0 || monthIndex > 11) return '';
  return `${MONTHS[monthIndex]} ${Number(m[3])}`;
}
