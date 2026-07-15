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
  it('resolved scope label overrides the capitalized scope_type: "Teacher · Frisco · F3 · Shishu Vihaar Class"', () =>
    expect(appHeaderSubtitle('teacher', 'class', 'Frisco · F3 · Shishu Vihaar Class')).toBe(
      'Teacher · Frisco · F3 · Shishu Vihaar Class'
    ));
  it('null resolved label (org-scoped role, nothing to resolve) falls back to capitalized scope_type: "Admin · Org"', () =>
    expect(appHeaderSubtitle('admin', 'org', null)).toBe('Admin · Org'));
  it('parent with no resolved scope label falls back to "My Children", not capitalized scope_type: "Parent · My Children"', () =>
    expect(appHeaderSubtitle('parent', 'org', null)).toBe('Parent · My Children'));
  it('resolved label is ignored when there is no active role: empty string', () =>
    expect(appHeaderSubtitle(null, null, 'Frisco · F3')).toBe(''));
});
