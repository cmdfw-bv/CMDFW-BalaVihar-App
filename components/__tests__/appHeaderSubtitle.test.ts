import { describe, it, expect } from 'vitest';
import { appHeaderSubtitle } from '../appHeaderSubtitle';

// Pure role/scope -> header subtitle label (Stage 12, F27). AppHeader.tsx's JSX render is
// wiring, verified live via playwright-cli at /test (Shared seam).
describe('appHeaderSubtitle', () => {
  it('role + scope: "Teacher · Class"', () => expect(appHeaderSubtitle('teacher', 'class')).toBe('Teacher · Class'));
  it('bv_coordinator label: "BV Coordinator"', () =>
    expect(appHeaderSubtitle('bv_coordinator', 'org')).toBe('BV Coordinator · Org'));
  it('no scope: role only', () => expect(appHeaderSubtitle('admin', null)).toBe('Admin'));
  it('no role (zero-role transitional state): empty string', () => expect(appHeaderSubtitle(null, null)).toBe(''));
  it('unrecognized role string: falls back to the raw string', () =>
    expect(appHeaderSubtitle('not-a-real-role', null)).toBe('not-a-real-role'));
});
