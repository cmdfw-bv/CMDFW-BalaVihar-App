import { describe, it, expect } from 'vitest';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { hasVapidPrivateKey, hasServiceRoleKey, isBlockedPiiPath } = require('../_secret-checks.js');

function fakeJwt(payload: Record<string, unknown>) {
  const b64 = (obj: Record<string, unknown>) => Buffer.from(JSON.stringify(obj)).toString('base64url');
  return `eyJhbGciOiJIUzI1NiJ9.${b64(payload)}.fakesignature`;
}

// Built from short segments (not one contiguous literal) so this fixture doesn't itself
// look like a real committed secret to the repo's own secret-scan hook when this file is saved.
const fakeSecretValue = ['a1B2c3D4e5', 'F6g7H8i9J0', 'k1L2m3'].join('');

describe('hasVapidPrivateKey', () => {
  it('flags a VAPID_PRIVATE_KEY assignment with a real-looking value', () => {
    expect(hasVapidPrivateKey('VAPID_PRIVATE_KEY=' + fakeSecretValue)).toBe(true);
  });
  it('does not flag an empty placeholder', () => {
    expect(hasVapidPrivateKey('VAPID_PRIVATE_KEY=')).toBe(false);
  });
});

describe('hasServiceRoleKey', () => {
  it('flags a JWT whose payload has role=service_role', () => {
    const jwt = fakeJwt({ role: 'service_role', iss: 'supabase' });
    expect(hasServiceRoleKey(`SUPABASE_SERVICE_ROLE_KEY=${jwt}`)).toBe(true);
  });
  it('does not flag an anon-role JWT', () => {
    const jwt = fakeJwt({ role: 'anon', iss: 'supabase' });
    expect(hasServiceRoleKey(`EXPO_PUBLIC_SUPABASE_ANON_KEY=${jwt}`)).toBe(false);
  });
  it('does not flag plain text with no JWT', () => {
    expect(hasServiceRoleKey('just some ordinary text, no tokens here')).toBe(false);
  });
});

describe('isBlockedPiiPath', () => {
  it('blocks a csv/enrollment/roster/vcf file outside supabase/seed', () => {
    expect(isBlockedPiiPath('enrollment-2026.csv')).toBe(true);
    expect(isBlockedPiiPath('data/roster.xlsx')).toBe(true);
    expect(isBlockedPiiPath('contacts.vcf')).toBe(true);
  });
  it('blocks a committed .env file, but not .env.example', () => {
    expect(isBlockedPiiPath('.env')).toBe(true);
    expect(isBlockedPiiPath('.env.local')).toBe(true);
    expect(isBlockedPiiPath('.env.example')).toBe(false);
  });
  it('allows the same filenames under supabase/seed/', () => {
    expect(isBlockedPiiPath('supabase/seed/enrollment-fixture.csv')).toBe(false);
  });
  it('does not block unrelated files', () => {
    expect(isBlockedPiiPath('app/(tabs)/feed.tsx')).toBe(false);
  });
  it('allows the exact allowlisted enrollment template path, but still blocks a sibling', () => {
    expect(isBlockedPiiPath('public/enrollment-template.csv')).toBe(false);
    expect(isBlockedPiiPath('public/other-enrollment.csv')).toBe(true);
  });
  it('does not block a source module or its test file just because it is named roster*/enrollment* (PR #49 false positive)', () => {
    expect(isBlockedPiiPath('lib/attendance/rosterMap.ts')).toBe(false);
    expect(isBlockedPiiPath('lib/attendance/__tests__/rosterMap.test.ts')).toBe(false);
    expect(isBlockedPiiPath('lib/enrollment/enrollmentHelpers.ts')).toBe(false);
  });
});
