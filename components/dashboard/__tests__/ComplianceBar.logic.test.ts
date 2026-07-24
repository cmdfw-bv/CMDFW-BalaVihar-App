import { describe, it, expect } from 'vitest';
import { complianceTone, clampPercent, TONE_TOKEN_KEYS } from '../ComplianceBar.logic';

describe('complianceTone', () => {
  it('an explicit tone always wins over the derived one', () => {
    expect(complianceTone(10, 'success')).toBe('success');
  });
  it('>=85 derives success', () => expect(complianceTone(85)).toBe('success'));
  it('70-84 derives warning', () => expect(complianceTone(70)).toBe('warning'));
  it('<70 derives danger', () => expect(complianceTone(69)).toBe('danger'));
});

describe('clampPercent', () => {
  it('clamps below 0 up to 0', () => expect(clampPercent(-5)).toBe(0));
  it('clamps above 100 down to 100', () => expect(clampPercent(150)).toBe(100));
  it('passes mid-range values through', () => expect(clampPercent(47)).toBe(47));
});

describe('TONE_TOKEN_KEYS contract', () => {
  it('maps all 4 tones to a theme.colors.status.* path', () => {
    expect(TONE_TOKEN_KEYS).toEqual({ success: 'status.present', warning: 'status.excused', danger: 'status.absent', info: 'status.info' });
  });
});
