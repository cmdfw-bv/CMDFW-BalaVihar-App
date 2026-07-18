import { describe, it, expect } from 'vitest';
import { colorAtPath } from '../tokenPath';
import { lightTheme } from '../../../lib/theme';

describe('colorAtPath', () => {
  it('resolves a nested dotted path', () => {
    expect(colorAtPath(lightTheme.colors, 'status.present')).toBe(lightTheme.colors.status.present);
  });
  it('resolves a top-level path', () => {
    expect(colorAtPath(lightTheme.colors, 'ink')).toBe(lightTheme.colors.ink);
  });
  it('falls back to ink for an unknown path instead of throwing', () => {
    expect(colorAtPath(lightTheme.colors, 'nope.nope')).toBe(lightTheme.colors.ink);
  });
});
