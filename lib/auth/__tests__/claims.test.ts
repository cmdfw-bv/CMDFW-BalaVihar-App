import { describe, it, expect } from 'vitest';
import { decodeClaims } from '../claims';

function makeToken(payload: Record<string, unknown>): string {
  const b64url = (obj: Record<string, unknown>) =>
    Buffer.from(JSON.stringify(obj)).toString('base64url');
  return `${b64url({ alg: 'HS256', typ: 'JWT' })}.${b64url(payload)}.sig`;
}

describe('decodeClaims', () => {
  it('decodes active_role/scope_type/scope_id from a well-formed token', () => {
    const token = makeToken({ active_role: 'teacher', scope_type: 'class', scope_id: 'abc-123' });
    expect(decodeClaims(token)).toEqual({ activeRole: 'teacher', scopeType: 'class', scopeId: 'abc-123' });
  });

  it('returns scopeId null when the claim is omitted (org-scoped role, design decision #3)', () => {
    const token = makeToken({ active_role: 'bv_coordinator', scope_type: 'org' });
    expect(decodeClaims(token)).toEqual({ activeRole: 'bv_coordinator', scopeType: 'org', scopeId: null });
  });

  it('returns activeRole null for a zero-role user (no crash)', () => {
    const token = makeToken({ active_role: null, scope_type: null, scope_id: null });
    expect(decodeClaims(token)).toEqual({ activeRole: null, scopeType: null, scopeId: null });
  });

  it('returns all-null for a malformed token (not 3 dot-separated parts)', () => {
    expect(decodeClaims('not-a-jwt')).toEqual({ activeRole: null, scopeType: null, scopeId: null });
  });

  it('returns all-null for an unparseable payload segment (no throw)', () => {
    expect(decodeClaims('aGVhZGVy.not-valid-base64json!!!.sig')).toEqual({ activeRole: null, scopeType: null, scopeId: null });
  });
});
