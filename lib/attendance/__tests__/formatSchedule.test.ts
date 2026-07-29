import { describe, it, expect } from 'vitest';
import { formatSessionSchedule } from '../formatSchedule';

describe('formatSessionSchedule', () => {
  it('formats a same-period range with a single AM/PM suffix (pilot target: Frisco F3, Sunday 2:00-3:30PM)', () => {
    expect(formatSessionSchedule({ day_of_week: 0, start_time: '14:00:00', end_time: '15:30:00' })).toBe('Sundays, 2:00–3:30 PM');
  });

  it('formats Saaket S4 (Friday 6:45-8:15PM)', () => {
    expect(formatSessionSchedule({ day_of_week: 5, start_time: '18:45:00', end_time: '20:15:00' })).toBe('Fridays, 6:45–8:15 PM');
  });

  it('shows both AM and PM suffixes when the range crosses noon', () => {
    expect(formatSessionSchedule({ day_of_week: 0, start_time: '11:00:00', end_time: '13:00:00' })).toBe('Sundays, 11:00 AM–1:00 PM');
  });

  it('formats a morning-only session (9:00-10:30AM)', () => {
    expect(formatSessionSchedule({ day_of_week: 0, start_time: '09:00:00', end_time: '10:30:00' })).toBe('Sundays, 9:00–10:30 AM');
  });
});
