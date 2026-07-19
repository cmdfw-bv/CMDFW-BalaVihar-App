import { describe, it, expect } from 'vitest';
import { userRoleRowInitial, actionsForStatus } from '../UserRoleRow.logic';

describe('userRoleRowInitial', () => {
  it('first character of a trimmed name, uppercase-agnostic (verbatim per reference)', () => {
    expect(userRoleRowInitial('  Priya Rao')).toBe('P');
  });
  it('falls back to "?" for no name', () => {
    expect(userRoleRowInitial(undefined)).toBe('?');
    expect(userRoleRowInitial('   ')).toBe('?');
  });
});

describe('actionsForStatus', () => {
  it('active rows get the manage action', () => expect(actionsForStatus('active')).toBe('manage'));
  it('pending rows get approve/reject', () => expect(actionsForStatus('pending')).toBe('approve-reject'));
});
