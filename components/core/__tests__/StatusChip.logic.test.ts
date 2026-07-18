import { describe, it, expect } from 'vitest';
import { statusChipStyle, statusChipShowsDot, STATUS_CHIP_KEYS } from '../StatusChip.logic';

describe('STATUS_CHIP_KEYS contract', () => {
  it('covers all 9 documented statuses', () => {
    expect(STATUS_CHIP_KEYS.sort()).toEqual(
      ['absent', 'excused', 'featured', 'info', 'neutral', 'open', 'past', 'present', 'soon'].sort()
    );
  });
});

describe('statusChipStyle', () => {
  it('open and present share the success-family tone', () => {
    expect(statusChipStyle('open')).toEqual(statusChipStyle('present'));
    expect(statusChipStyle('present').fg).toBe('status.present');
  });
  it('soon uses the primary-soft family (no matching token for its raw-hex border, substitutes primarySoft)', () => {
    expect(statusChipStyle('soon')).toEqual({ bg: 'primarySoft', fg: 'primaryPressed', border: 'primarySoft', dot: 'primary' });
  });
  it('featured uses gold fill with onAction text (exact hex match, no substitution)', () => {
    expect(statusChipStyle('featured')).toEqual({ bg: 'gold', fg: 'onAction', border: 'gold2', dot: 'onAction' });
  });
  it('neutral is the default fallback for an unrecognized status', () => {
    // @ts-expect-error deliberately invalid to prove the fallback branch
    expect(statusChipStyle('bogus')).toEqual(statusChipStyle('neutral'));
  });
});

describe('statusChipShowsDot', () => {
  it('defaults on for open/present when dot is unset', () => {
    expect(statusChipShowsDot('open', undefined)).toBe(true);
    expect(statusChipShowsDot('present', undefined)).toBe(true);
  });
  it('defaults off for any other status when dot is unset', () => {
    expect(statusChipShowsDot('info', undefined)).toBe(false);
  });
  it('an explicit dot prop always wins over the default', () => {
    expect(statusChipShowsDot('info', true)).toBe(true);
    expect(statusChipShowsDot('open', false)).toBe(false);
  });
});
