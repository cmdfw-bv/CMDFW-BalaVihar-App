export interface WeeklySchedule {
  day_of_week: number; // 0=Sunday..6=Saturday (ADR-0031, matches Postgres extract(dow from ...))
  start_time: string; // "HH:MM:SS", as returned for a Postgres `time` column
  end_time: string;
}

const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function timeParts(time: string): { hour12: number; minute: number; period: 'AM' | 'PM' } {
  const [hStr, mStr] = time.split(':');
  const h = Number(hStr);
  const period: 'AM' | 'PM' = h < 12 ? 'AM' : 'PM';
  return { hour12: h % 12 === 0 ? 12 : h % 12, minute: Number(mStr), period };
}

function clock({ hour12, minute }: { hour12: number; minute: number }): string {
  return `${hour12}:${String(minute).padStart(2, '0')}`;
}

// Replaces the header's prior raw start_date-end_date display (ADR-0031): teachers need to know
// WHICH weekday/time their session meets, not the enrollment-period range, since only that one
// weekday is ever navigable (dateBounds.ts's ±7-day step). Single AM/PM suffix when both times
// share a period (the common case, e.g. "2:00–3:30 PM"), both shown when the range crosses noon.
export function formatSessionSchedule(session: WeeklySchedule): string {
  const start = timeParts(session.start_time);
  const end = timeParts(session.end_time);
  const startLabel = start.period === end.period ? clock(start) : `${clock(start)} ${start.period}`;
  return `${WEEKDAY_NAMES[session.day_of_week]}s, ${startLabel}–${clock(end)} ${end.period}`;
}
