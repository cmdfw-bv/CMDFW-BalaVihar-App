import { describe, it, expect } from 'vitest';
import { complianceTone, complianceDisplayState, clampPercent, TONE_TOKEN_KEYS } from '../ComplianceBar.logic';

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

describe('complianceDisplayState', () => {
  it('a placeholder bar never derives a tone from value', () => {
    expect(complianceDisplayState(0, undefined, true)).toBe('placeholder');
  });
  it('an explicit-tone placeholder still shows placeholder, not the explicit tone', () => {
    expect(complianceDisplayState(10, 'success', true)).toBe('placeholder');
  });
  it('falls back to complianceTone when not a placeholder', () => {
    expect(complianceDisplayState(90, undefined, false)).toBe('success');
    expect(complianceDisplayState(90)).toBe('success');
  });
});

describe('TONE_TOKEN_KEYS contract', () => {
  it('maps all 4 tones to a theme.colors.status.* path', () => {
    expect(TONE_TOKEN_KEYS).toEqual({ success: 'status.present', warning: 'status.excused', danger: 'status.absent', info: 'status.info' });
  });
});
