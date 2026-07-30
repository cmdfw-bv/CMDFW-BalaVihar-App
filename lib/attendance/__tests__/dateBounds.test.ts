import { describe, it, expect } from 'vitest';
import { computeDateBounds, mostRecentSessionDate, addDaysIso } from '../dateBounds';

const session = { start_date: '2026-06-01', end_date: '2026-08-01' };

describe('computeDateBounds (±7-day step-aware, ADR-0031)', () => {
  it('canGoNext is false when stepping +7 from selectedDate would cross the clamped max', () => {
    // max clamps to today (2026-07-24); selectedDate + 7 = 2026-07-24 is not <= itself... use a date 3 days short
    const b = computeDateBounds(session, '2026-07-24', '2026-07-24');
    expect(b).toEqual({ min: '2026-06-01', max: '2026-07-24', canGoPrev: true, canGoNext: false });
  });

  it('canGoNext is true when selectedDate + 7 still lands on/before the clamped max', () => {
    const b = computeDateBounds(session, '2026-07-24', '2026-07-17');
    expect(b.canGoNext).toBe(true); // 2026-07-17 + 7 = 2026-07-24 <= max
  });

  it('canGoNext is false one day short of a full week before max, even though selectedDate < max (the bug a raw comparison would miss)', () => {
    const b = computeDateBounds(session, '2026-07-24', '2026-07-18');
    expect(b.canGoNext).toBe(false); // 2026-07-18 + 7 = 2026-07-25 > max=2026-07-24
  });

  it('clamps max to session.end_date when today is after the session has ended', () => {
    const b = computeDateBounds(session, '2026-09-01', '2026-08-01');
    expect(b.max).toBe('2026-08-01');
    expect(b.canGoNext).toBe(false);
  });

  it('canGoPrev is false when stepping -7 from selectedDate would cross session.start_date', () => {
    const b = computeDateBounds(session, '2026-07-24', '2026-06-01');
    expect(b.canGoPrev).toBe(false); // 2026-06-01 - 7 < start_date
  });

  it('canGoPrev is true when selectedDate - 7 still lands on/after session.start_date', () => {
    const b = computeDateBounds(session, '2026-07-24', '2026-06-08');
    expect(b.canGoPrev).toBe(true); // 2026-06-08 - 7 = 2026-06-01 >= start_date
  });

  it('a session that has not started yet (today before start_date) still returns a usable min/max, canGoPrev/Next both false at start', () => {
    const b = computeDateBounds(session, '2026-05-01', '2026-06-01');
    expect(b).toEqual({ min: '2026-06-01', max: '2026-06-01', canGoPrev: false, canGoNext: false });
  });
});

describe('mostRecentSessionDate (ADR-0031 walk-back default)', () => {
  const weeklySession = { day_of_week: 0, start_date: '2026-06-01', end_date: '2026-08-01' }; // Sunday

  it('returns today unchanged when today itself is the matching weekday', () => {
    expect(mostRecentSessionDate(weeklySession, '2026-07-19')).toBe('2026-07-19'); // a Sunday
  });

  it('walks back to the most recent matching weekday when today is not that weekday', () => {
    expect(mostRecentSessionDate(weeklySession, '2026-07-22')).toBe('2026-07-19'); // Wed -> prior Sunday
  });

  it('caps at session.end_date before walking back when today is after the session ended', () => {
    expect(mostRecentSessionDate(weeklySession, '2026-09-01')).toBe('2026-07-26'); // last Sunday on/before end_date
  });

  it('clamps to start_date in the rare case the walk-back lands before the session started (first partial week, decision #1 residual case)', () => {
    const midWeekStart = { day_of_week: 0, start_date: '2026-07-22', end_date: '2026-08-01' }; // starts Wed, meets Sundays
    expect(mostRecentSessionDate(midWeekStart, '2026-07-23')).toBe('2026-07-22'); // walk-back would hit 2026-07-19, before start_date
  });
});

describe('addDaysIso (helper)', () => {
  it('adds/subtracts days across a month boundary', () => {
    expect(addDaysIso('2026-07-30', 3)).toBe('2026-08-02');
    expect(addDaysIso('2026-08-02', -3)).toBe('2026-07-30');
  });
});
