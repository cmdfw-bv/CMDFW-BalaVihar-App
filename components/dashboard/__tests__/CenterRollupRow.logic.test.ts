import { describe, it, expect } from 'vitest';
import { rollupMeta } from '../CenterRollupRow.logic';

describe('rollupMeta', () => {
  it('placeholder=true always renders the honest em-dash, ignoring any attendance value', () => {
    expect(rollupMeta(92, true)).toEqual({ pct: 0, toneTokenKey: 'status.present', display: '—' });
  });
  it('placeholder=false with a real value: clamped pct, derived tone, numeric display', () => {
    expect(rollupMeta(92, false)).toEqual({ pct: 92, toneTokenKey: 'status.present', display: '92%' });
  });
  it('placeholder=false with attendance undefined: treats it as 0', () => {
    expect(rollupMeta(undefined, false)).toEqual({ pct: 0, toneTokenKey: 'status.absent', display: '0%' });
  });
});
