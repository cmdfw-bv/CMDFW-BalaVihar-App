import { describe, it, expect } from 'vitest';
import { resolveButtonMode, BUTTON_VARIANTS, BUTTON_SIZES } from '../Button.logic';

describe('resolveButtonMode', () => {
  it('renders as a link only when href is set and not disabled', () => {
    expect(resolveButtonMode('/x', false)).toBe('link');
  });
  it('falls back to button when disabled, even with href', () => {
    expect(resolveButtonMode('/x', true)).toBe('button');
  });
  it('falls back to button when no href', () => {
    expect(resolveButtonMode(undefined, false)).toBe('button');
  });
});

describe('BUTTON_VARIANTS contract', () => {
  it('defines all 7 documented variants', () => {
    expect(Object.keys(BUTTON_VARIANTS).sort()).toEqual(
      ['danger', 'dark', 'ghost', 'gold', 'outline', 'primary', 'secondary'].sort()
    );
  });
});

describe('BUTTON_SIZES contract', () => {
  it('defines all 4 documented sizes', () => {
    expect(Object.keys(BUTTON_SIZES).sort()).toEqual(['lg', 'md', 'sm', 'xl'].sort());
  });
});
