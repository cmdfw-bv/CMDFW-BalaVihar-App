import { describe, it, expect } from 'vitest';
import { consentItemState } from '../ConsentCapture.logic';

describe('consentItemState', () => {
  it('unchecked item: no timestamp shown even if one happens to be present', () => {
    expect(consentItemState('media', {}, { media: '2026-01-01' })).toEqual({ checked: false, timestamp: undefined });
  });
  it('checked item: reveals its captured timestamp', () => {
    expect(consentItemState('media', { media: true }, { media: '2026-01-01' })).toEqual({ checked: true, timestamp: '2026-01-01' });
  });
  it('checked item with no timestamp yet: still checked, timestamp undefined', () => {
    expect(consentItemState('media', { media: true }, {})).toEqual({ checked: true, timestamp: undefined });
  });
});
