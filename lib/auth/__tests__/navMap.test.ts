import { describe, it, expect } from 'vitest';
import { ROLE_TABS, ALL_TABS, tabsForRole, isRouteInScope } from '../navMap';

describe('ROLE_TABS — matches the Requirements nav-mapping table exactly', () => {
  it('student', () => expect(ROLE_TABS.student).toEqual(['feed', 'classes', 'attendance', 'chat']));
  it('parent', () => expect(ROLE_TABS.parent).toEqual(['feed', 'attendance', 'chat']));
  it('teacher', () => expect(ROLE_TABS.teacher).toEqual(['feed', 'classes', 'attendance', 'chat']));
  it('coordinator', () => expect(ROLE_TABS.coordinator).toEqual(['feed', 'classes', 'chat', 'dashboard', 'approvals']));
  it('bv_coordinator', () => expect(ROLE_TABS.bv_coordinator).toEqual(['feed', 'chat', 'dashboard', 'approvals']));
  it('admin', () => expect(ROLE_TABS.admin).toEqual(['feed', 'chat', 'dashboard', 'admin']));
});

it('ALL_TABS lists all 7 tab keys (decision #2 — every Tabs.Screen always registered)', () => {
  expect(ALL_TABS).toEqual(['feed', 'classes', 'attendance', 'chat', 'dashboard', 'approvals', 'admin']);
});

describe('tabsForRole', () => {
  it('returns [] for null (zero-role/signed-out)', () => expect(tabsForRole(null)).toEqual([]));
  it('returns [] for an unrecognized role string (defensive, not spec-required)', () =>
    expect(tabsForRole('not-a-real-role')).toEqual([]));
  it('returns the mapped set for a known role', () => expect(tabsForRole('admin')).toEqual(ROLE_TABS.admin));
});

describe('isRouteInScope (useRoleGuard\'s pure check, AC#9)', () => {
  it('true for a tab within the role\'s mapped set', () => expect(isRouteInScope('classes', 'teacher')).toBe(true));
  it('false for a tab outside the role\'s mapped set', () => expect(isRouteInScope('admin', 'teacher')).toBe(false));
  it('false for every route when role is null', () => expect(isRouteInScope('feed', null)).toBe(false));
});
