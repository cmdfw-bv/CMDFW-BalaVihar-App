import { describe, it, expect } from 'vitest';
import { meetingDateLabel } from '../meetingDateLabel';

describe('meetingDateLabel', () => {
  it('renders an ISO meeting date as a short month/day label', () => {
    expect(meetingDateLabel('2026-01-11')).toBe('Jan 11');
  });

  // The value comes from a Postgres `date`, which has no timezone. Parsing it with `new Date(iso)`
  // would treat it as UTC midnight and render the *previous* day for anyone west of Greenwich —
  // the same off-by-one-day class of bug ADR-0036 avoided by not deriving meeting_date from
  // created_at in the first place.
  it('does not shift the day for a viewer in a negative-offset timezone', () => {
    expect(meetingDateLabel('2026-03-01')).toBe('Mar 1');
    expect(meetingDateLabel('2026-12-31')).toBe('Dec 31');
  });

  it('returns an empty string for a malformed value rather than "Invalid Date"', () => {
    expect(meetingDateLabel('')).toBe('');
    expect(meetingDateLabel('11-01-2026')).toBe('');
  });
});
