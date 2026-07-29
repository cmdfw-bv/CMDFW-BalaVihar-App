export interface SessionRange {
  start_date: string; // ISO yyyy-mm-dd
  end_date: string;
}

export interface WeeklySession extends SessionRange {
  day_of_week: number; // 0=Sunday..6=Saturday, matching Postgres extract(dow from ...) (ADR-0031)
}

export interface DateBounds {
  min: string;
  max: string;
  canGoPrev: boolean;
  canGoNext: boolean;
}

const STEP_DAYS = 7; // sessions meet on one fixed weekday (ADR-0031) — stepping by 1 would land on a dead date

// ISO yyyy-mm-dd arithmetic via Date.UTC (never local timezone) so month/year rollovers are correct
// without a date library.
export function addDaysIso(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

export function isoWeekday(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0=Sunday..6=Saturday
}

// ADR-0031 Decision #2: default selectedDate is no longer raw today — it's the most recent date
// on/before min(today, session.end_date) whose weekday matches session.day_of_week (walk back 0-6
// days). Rare residual case (decision #1's "first partial week" note): if the walk-back lands
// before session.start_date, clamp to start_date itself rather than invent a new UI state.
export function mostRecentSessionDate(session: WeeklySession, today: string): string {
  const cappedToday = today < session.end_date ? today : session.end_date;
  const diff = (isoWeekday(cappedToday) - session.day_of_week + 7) % 7;
  const candidate = addDaysIso(cappedToday, -diff);
  return candidate < session.start_date ? session.start_date : candidate;
}

// Design decision #1 (clamp) + ADR-0031 (±7-day step): canGoPrev/canGoNext must check the FULL
// step against the bound, not just compare selectedDate's current position — otherwise Prev/Next
// reports true right up to the boundary and then steps past min/max on the next tap.
export function computeDateBounds(session: SessionRange, today: string, selectedDate: string): DateBounds {
  const min = session.start_date;
  const rawMax = today < session.end_date ? today : session.end_date;
  const max = rawMax < min ? min : rawMax; // floor: a not-yet-started session (today < start_date) must not report max < min
  return {
    min,
    max,
    canGoPrev: addDaysIso(selectedDate, -STEP_DAYS) >= min,
    canGoNext: addDaysIso(selectedDate, STEP_DAYS) <= max,
  };
}
