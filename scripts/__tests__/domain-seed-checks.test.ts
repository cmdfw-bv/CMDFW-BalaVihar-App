import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { findAccountRefs } from '../_domain-seed-checks.js';

// Guards ADR-2026-09-14: supabase/seed/domain.sql must stay account-free (no tests.* fixture
// calls, no auth.users) so #65's loader can apply it to a fixture-free cloud DB. Happy path +
// planted violations (the guard is only worth anything if it goes red on bad input).
const DOMAIN = readFileSync('supabase/seed/domain.sql', 'utf8');

describe('domain-seed guard — domain.sql stays account-free', () => {
  it('passes on the real domain.sql', () => {
    expect(findAccountRefs(DOMAIN)).toEqual([]);
  });

  it('ignores the header comment that legitimately names tests.* and auth.users', () => {
    // the real file mentions both tokens in its `--` header while explaining the rule
    expect(DOMAIN).toMatch(/tests\.\*/); // the prose is there...
    expect(findAccountRefs(DOMAIN)).toHaveLength(0); // ...but stripped before scanning
  });

  it('flags a planted tests.* fixture call', () => {
    const bad = DOMAIN + "\n  perform tests.create_supabase_user('x@y.z');\n";
    expect(findAccountRefs(bad).some((f: { what: string }) => f.what.includes('tests.*'))).toBe(true);
  });

  it('flags a planted auth.users reference', () => {
    const bad = DOMAIN + '\n  insert into foo select id from auth.users;\n';
    expect(findAccountRefs(bad).some((f: { what: string }) => f.what.includes('auth.users'))).toBe(true);
  });

  it('does not flag students.user_id (a column, not the auth.users table)', () => {
    const ok = 'insert into students (id, user_id) values (gen_random_uuid(), null);';
    expect(findAccountRefs(ok)).toEqual([]);
  });
});
