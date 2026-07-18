import { describe, it, expect } from 'vitest';
import { logoTitleFontSize } from '../logoTitleFontSize';

// Pure logic only — Logo.tsx's JSX render is wiring, verified live via playwright-cli at
// /test (Shared seam, same as SessionProvider.tsx/RoleSwitcher.tsx elsewhere in this repo).
describe('logoTitleFontSize (Stage 12, F25)', () => {
  it('scales from the mark size, matching the design mirror\'s Logo.jsx (size * 0.52, rounded)', () => {
    expect(logoTitleFontSize(40)).toBe(21);
  });
  it('rounds to the nearest integer', () => expect(logoTitleFontSize(25)).toBe(13));
});
