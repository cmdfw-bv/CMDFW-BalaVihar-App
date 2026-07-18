import { describe, it, expect } from 'vitest';
import { isDesktopWidth } from '../isDesktopWidth';
import { breakpoints } from '../theme';

describe('isDesktopWidth (Stage 12, F24)', () => {
  it('false below breakpoints.lg', () => expect(isDesktopWidth(breakpoints.lg - 1)).toBe(false));
  it('true at breakpoints.lg', () => expect(isDesktopWidth(breakpoints.lg)).toBe(true));
  it('true above breakpoints.lg', () => expect(isDesktopWidth(breakpoints.lg + 400)).toBe(true));
});
