import { describe, it, expect } from 'vitest';
import { roleBadgeMeta, ROLE_KEYS } from '../RoleBadge.logic';

describe('ROLE_KEYS contract', () => {
  it('covers all 6 personas', () => {
    expect(ROLE_KEYS.sort()).toEqual(['admin', 'bv', 'coordinator', 'parent', 'student', 'teacher'].sort());
  });
});

describe('roleBadgeMeta', () => {
  it('bv resolves to the BV Coordinator label and the plural roles.bv token path (not the singular role map, which lacks bv)', () => {
    expect(roleBadgeMeta('bv')).toEqual({ label: 'BV Coordinator', colorTokenKey: 'roles.bv' });
  });
  it('student resolves to the Student label', () => {
    expect(roleBadgeMeta('student')).toEqual({ label: 'Student', colorTokenKey: 'roles.student' });
  });
});
