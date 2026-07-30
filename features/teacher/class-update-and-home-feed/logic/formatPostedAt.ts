// Feed cards and comment rows are read as an ordered list (newest-first for updates, oldest-first
// within a thread), so a date-only stamp made every same-day item look identical and the ordering
// unreadable. Includes the time as well as the date, in the viewer's own locale.
//
// Returns "" rather than "Invalid Date" for unparseable input: a malformed timestamp should render
// as a missing stamp, not as visible error text inside an otherwise fine card.
export function formatPostedAt(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}
