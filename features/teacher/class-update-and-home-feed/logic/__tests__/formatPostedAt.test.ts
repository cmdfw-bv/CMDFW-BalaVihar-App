import { describe, it, expect } from 'vitest';
import { formatPostedAt } from '../formatPostedAt';

// Feed cards and comments are ordered newest-first / oldest-first, so two items posted the same
// day must not render an identical timestamp — a date alone made ordering unreadable.
describe('formatPostedAt', () => {
  it('distinguishes two times on the same calendar day', () => {
    const morning = formatPostedAt('2026-07-28T09:15:00Z');
    const evening = formatPostedAt('2026-07-28T21:45:00Z');
    expect(morning).not.toBe(evening);
  });

  it('includes the date, not just a time', () => {
    // Rendered in the runner's locale, so assert on structure rather than exact glyphs:
    // a date part contributes at least two digit-groups beyond the time's own hour/minute.
    const out = formatPostedAt('2026-07-28T09:15:00Z');
    const digitGroups = out.match(/\d+/g) ?? [];
    expect(digitGroups.length).toBeGreaterThanOrEqual(4);
  });

  it('returns an empty string for an unparseable timestamp rather than "Invalid Date"', () => {
    expect(formatPostedAt('not-a-date')).toBe('');
  });

  it('returns an empty string for an empty input', () => {
    expect(formatPostedAt('')).toBe('');
  });

  it('is stable for the same instant expressed two ways', () => {
    expect(formatPostedAt('2026-07-28T12:00:00Z')).toBe(formatPostedAt('2026-07-28T12:00:00.000Z'));
  });
});
