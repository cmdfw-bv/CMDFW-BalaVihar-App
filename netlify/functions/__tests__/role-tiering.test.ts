import { describe, it, expect } from 'vitest';
import { TIER, ROLE_SCOPE_TYPE, tierOf, isGrantAllowed, type AppRole } from '../lib/role-tiering';

describe('TIER / tierOf', () => {
  it('coordinator=1, bv_coordinator=2, admin=3', () => {
    expect(TIER.coordinator).toBe(1);
    expect(TIER.bv_coordinator).toBe(2);
    expect(TIER.admin).toBe(3);
  });
  it('tierOf returns 0 for student/parent/teacher (unlisted in TIER)', () => {
    expect(tierOf('student')).toBe(0);
    expect(tierOf('parent')).toBe(0);
    expect(tierOf('teacher')).toBe(0);
  });
});

describe('ROLE_SCOPE_TYPE (design decision #6)', () => {
  it('maps every role to its fixed scope_type', () => {
    expect(ROLE_SCOPE_TYPE.student).toBe('org');
    expect(ROLE_SCOPE_TYPE.parent).toBe('org');
    expect(ROLE_SCOPE_TYPE.teacher).toBe('class');
    expect(ROLE_SCOPE_TYPE.coordinator).toBe('session');
    expect(ROLE_SCOPE_TYPE.bv_coordinator).toBe('org');
    expect(ROLE_SCOPE_TYPE.admin).toBe('org');
  });
});

const CALLER_U = 'caller-uuid';
const TARGET_U = 'target-uuid';

describe('isGrantAllowed — non-self targets (grant tiering table)', () => {
  const cases: Array<[AppRole, number, AppRole, boolean]> = [
    ['coordinator', 1, 'student', true],
    ['coordinator', 1, 'parent', true],
    ['coordinator', 1, 'teacher', true],
    ['coordinator', 1, 'coordinator', false],
    ['coordinator', 1, 'bv_coordinator', false],
    ['coordinator', 1, 'admin', false],
    ['bv_coordinator', 2, 'student', true],
    ['bv_coordinator', 2, 'teacher', true],
    ['bv_coordinator', 2, 'coordinator', true],
    ['bv_coordinator', 2, 'bv_coordinator', false],
    ['bv_coordinator', 2, 'admin', false],
    ['admin', 3, 'student', true],
    ['admin', 3, 'teacher', true],
    ['admin', 3, 'coordinator', true],
    ['admin', 3, 'bv_coordinator', true],
    ['admin', 3, 'admin', true],
  ];
  it.each(cases)('%s (tier %i) -> %s for another user: allowed=%s', (callerRole, callerTier, targetRole, expected) => {
    expect(isGrantAllowed(callerRole, callerTier, null, targetRole, TARGET_U, CALLER_U)).toBe(expected);
  });
});

describe('isGrantAllowed — self targets (AC#6, decision #1: literal targetTier < callerTier, no admin carve-out)', () => {
  const cases: Array<[AppRole, number, AppRole, boolean]> = [
    ['coordinator', 1, 'student', true],
    ['coordinator', 1, 'coordinator', false],
    ['bv_coordinator', 2, 'student', true],
    ['bv_coordinator', 2, 'coordinator', true],  // below caller's own tier — allowed
    ['bv_coordinator', 2, 'bv_coordinator', false],
    ['admin', 3, 'student', true],
    ['admin', 3, 'coordinator', true],           // below caller's own tier — allowed
    ['admin', 3, 'bv_coordinator', true],         // below caller's own tier — allowed
    ['admin', 3, 'admin', false],                 // same tier as caller — blocked, no exception
  ];
  it.each(cases)('%s (tier %i) targeting own %s row: allowed=%s', (callerRole, callerTier, targetRole, expected) => {
    expect(isGrantAllowed(callerRole, callerTier, null, targetRole, CALLER_U, CALLER_U)).toBe(expected);
  });
});
