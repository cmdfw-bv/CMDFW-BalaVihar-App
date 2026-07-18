import { describe, it, expect } from 'vitest';
import { deriveSessionState } from '../sessionDerivation';

describe('deriveSessionState', () => {
  it('signed-out when there is no session, regardless of claims', () => {
    expect(deriveSessionState(false, { activeRole: 'teacher', scopeType: 'class', scopeId: 'x' }))
      .toEqual({ status: 'signed-out', activeRole: null, scopeType: null, scopeId: null });
  });

  it('zero-role when session exists but claims are null', () => {
    expect(deriveSessionState(true, null))
      .toEqual({ status: 'zero-role', activeRole: null, scopeType: null, scopeId: null });
  });

  it('zero-role when session exists but activeRole claim is null', () => {
    expect(deriveSessionState(true, { activeRole: null, scopeType: null, scopeId: null }))
      .toEqual({ status: 'zero-role', activeRole: null, scopeType: null, scopeId: null });
  });

  it('ready with claims passed through when session + activeRole both present', () => {
    expect(deriveSessionState(true, { activeRole: 'teacher', scopeType: 'class', scopeId: 'abc' }))
      .toEqual({ status: 'ready', activeRole: 'teacher', scopeType: 'class', scopeId: 'abc' });
  });

  it('ready with scopeId null for an org-scoped role (decision #3 — omitted claim)', () => {
    expect(deriveSessionState(true, { activeRole: 'bv_coordinator', scopeType: 'org', scopeId: null }))
      .toEqual({ status: 'ready', activeRole: 'bv_coordinator', scopeType: 'org', scopeId: null });
  });
});
