import { describe, it, expect } from 'vitest';
import { clampStep } from '../Stepper.logic';

describe('clampStep', () => {
  it('increments freely when no bounds are set', () => {
    expect(clampStep(5, 1)).toBe(6);
  });
  it('does not go below min', () => {
    expect(clampStep(0, -1, 0)).toBe(0);
  });
  it('does not go above max', () => {
    expect(clampStep(10, 1, undefined, 10)).toBe(10);
  });
  it('clamps within both bounds', () => {
    expect(clampStep(2, 5, 0, 4)).toBe(4);
  });
});
