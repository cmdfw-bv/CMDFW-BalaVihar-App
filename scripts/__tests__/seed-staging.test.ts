import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  STAGING_PROJECT_REF,
  PERSONAS,
  DOMAIN_SQL_PATH,
  resolvePersonaEmail,
  isStagingTarget,
  assertSeedConfig,
  projectRefFromUrl,
  projectRefFromDbUrl,
  buildPsqlConnParams,
  buildProvisioningPlan,
  buildUserRoleRows,
  buildDomainTruncateSql,
  shouldLoadDomain,
  parseArgs,
  resolveConfig,
  isProvisionedPersonaEmail,
} from '../_seed-staging.mjs';

// Realistic staging Postgres connection strings (password redacted). Both forms carry the
// project ref: the pooler encodes it in the username (postgres.<ref>), the direct connection in
// the host (db.<ref>.supabase.co).
const STAGING_DB_URL_POOLER =
  'postgresql://postgres.ejjvqtleuuamgtlmtxkc:pw@aws-0-us-east-1.pooler.supabase.com:6543/postgres';
const STAGING_DB_URL_DIRECT =
  'postgresql://postgres:pw@db.ejjvqtleuuamgtlmtxkc.supabase.co:5432/postgres';

// Repo root, from this test file at scripts/__tests__/seed-staging.test.ts.
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

// The persona → scope_type contract mirrors the DB's authoritative map
// (netlify/functions/lib/role-tiering.ts ROLE_SCOPE_TYPE) and the local seed's inserts
// (supabase/seed/seed.sql). If PERSONAS drifts from that, provisioning would write
// user_roles rows the auth hook / RLS constraints reject (e.g. app_scope_type or the
// user_roles_org_scope_null_id check) — so this file pins it.
const EXPECTED_SCOPE_TYPE: Record<string, string> = {
  student: 'org', // self resolves via students.user_id, stored org/null
  parent: 'org', // own-children resolves via family_members, stored org/null
  teacher: 'class',
  coordinator: 'session',
  bv_coordinator: 'org',
  admin: 'org',
};

describe('DOMAIN_SQL_PATH — the #19 dataset the loader applies', () => {
  it('points at #19 pilot-seed-data domain.sql, and that file exists on disk', () => {
    // The loader consumes the dataset #19 (pilot-seed-data) landed on main; a stale/placeholder
    // path would fail closed only at the cloud walk, not in CI. Pin it to the real location.
    expect(DOMAIN_SQL_PATH).toBe('supabase/seed/domain.sql');
    expect(existsSync(resolve(REPO_ROOT, DOMAIN_SQL_PATH))).toBe(true);
  });
});

describe('PERSONAS — the accounts the seed provisions', () => {
  it('provisions all six single-role personas plus one multi-role account', () => {
    expect(PERSONAS.map((p) => p.tag)).toEqual([
      'student',
      'parent',
      'teacher',
      'coordinator',
      'bv_coordinator',
      'admin',
      'multirole',
    ]);
  });

  it('gives each single-role persona the scope_type the DB requires for that role', () => {
    for (const [tag, scopeType] of Object.entries(EXPECTED_SCOPE_TYPE)) {
      const persona = PERSONAS.find((p) => p.tag === tag);
      expect(persona, `persona ${tag} missing`).toBeDefined();
      expect(persona!.roles).toHaveLength(1);
      expect(persona!.roles[0].role).toBe(tag);
      expect(persona!.roles[0].scopeType).toBe(scopeType);
    }
  });

  it('gives the multirole account parent+teacher+coordinator+bv_coordinator (mirrors the seed)', () => {
    const multi = PERSONAS.find((p) => p.tag === 'multirole');
    expect(multi!.roles.map((r) => r.role).sort()).toEqual([
      'bv_coordinator',
      'coordinator',
      'parent',
      'teacher',
    ]);
  });

  it('carries a scopeRef for every non-org role and none for org roles (null-scope constraint)', () => {
    for (const persona of PERSONAS) {
      for (const grant of persona.roles) {
        if (grant.scopeType === 'org') {
          expect(grant.scopeRef, `${persona.tag}/${grant.role} org grant`).toBeNull();
        } else {
          expect(grant.scopeRef, `${persona.tag}/${grant.role} scoped grant`).toBeTruthy();
        }
      }
    }
  });
});

describe('resolvePersonaEmail — plus-addressing from a full-email base', () => {
  it('inserts +bv-<tag> into the local part of a full email', () => {
    expect(resolvePersonaEmail('arunasharad@gmail.com', 'teacher')).toBe(
      'arunasharad+bv-teacher@gmail.com',
    );
  });

  it('works for any domain, not just gmail', () => {
    expect(resolvePersonaEmail('bvportal@cmdfw.org', 'student')).toBe(
      'bvportal+bv-student@cmdfw.org',
    );
  });

  it('rejects a base with no @ (not a full email)', () => {
    expect(() => resolvePersonaEmail('arunasharad', 'teacher')).toThrow();
  });

  it('rejects a base whose local part already contains + (ambiguous)', () => {
    expect(() => resolvePersonaEmail('arunasharad+x@gmail.com', 'teacher')).toThrow();
  });
});

describe('isStagingTarget — the prod safety rail', () => {
  it('passes only the staging project ref', () => {
    expect(isStagingTarget(STAGING_PROJECT_REF)).toBe(true);
    expect(isStagingTarget('ejjvqtleuuamgtlmtxkc')).toBe(true);
  });

  it('refuses any other ref, including a would-be prod ref, empty, or undefined', () => {
    expect(isStagingTarget('some-other-prod-ref')).toBe(false);
    expect(isStagingTarget('')).toBe(false);
    expect(isStagingTarget(undefined)).toBe(false);
  });
});

describe('assertSeedConfig — fail-closed before any write', () => {
  it('accepts a valid staging config', () => {
    expect(() =>
      assertSeedConfig({ emailBase: 'arunasharad@gmail.com', projectRef: STAGING_PROJECT_REF }),
    ).not.toThrow();
  });

  it('refuses a missing email base', () => {
    expect(() =>
      assertSeedConfig({ emailBase: '', projectRef: STAGING_PROJECT_REF }),
    ).toThrow(/email/i);
  });

  it('refuses a non-staging target — never seed prod', () => {
    expect(() =>
      assertSeedConfig({ emailBase: 'arunasharad@gmail.com', projectRef: 'prod-ref' }),
    ).toThrow(/staging/i);
  });
});

describe('projectRefFromUrl — derive the target ref from the connection URL', () => {
  it('extracts the ref from a Supabase project URL', () => {
    expect(projectRefFromUrl('https://ejjvqtleuuamgtlmtxkc.supabase.co')).toBe(
      'ejjvqtleuuamgtlmtxkc',
    );
  });

  it('tolerates a trailing slash', () => {
    expect(projectRefFromUrl('https://ejjvqtleuuamgtlmtxkc.supabase.co/')).toBe(
      'ejjvqtleuuamgtlmtxkc',
    );
  });

  it('throws on a URL with no project subdomain or a non-supabase host', () => {
    expect(() => projectRefFromUrl('https://supabase.co')).toThrow();
    expect(() => projectRefFromUrl('https://example.com')).toThrow();
    expect(() => projectRefFromUrl('not-a-url')).toThrow();
  });
});

describe('projectRefFromDbUrl — derive the target ref from a Postgres connection string', () => {
  it('extracts the ref from a pooler connection string (username postgres.<ref>)', () => {
    expect(projectRefFromDbUrl(STAGING_DB_URL_POOLER)).toBe('ejjvqtleuuamgtlmtxkc');
  });

  it('extracts the ref from a direct connection string (host db.<ref>.supabase.co)', () => {
    expect(projectRefFromDbUrl(STAGING_DB_URL_DIRECT)).toBe('ejjvqtleuuamgtlmtxkc');
  });

  it('throws on a non-Supabase or malformed connection string', () => {
    expect(() => projectRefFromDbUrl('postgresql://postgres:pw@localhost:5432/postgres')).toThrow();
    expect(() => projectRefFromDbUrl('postgresql://postgres@db..supabase.co:5432/x')).toThrow();
    expect(() => projectRefFromDbUrl('not-a-url')).toThrow();
    expect(() => projectRefFromDbUrl('')).toThrow();
  });

  it('rejects a libpq host= query-param override (would bypass the staging-only rail)', () => {
    // A pooler URL whose ref is staging but whose ?host= points at a prod direct host — libpq would
    // connect to the prod host, so the ref-based guard must refuse it.
    expect(() =>
      projectRefFromDbUrl(
        'postgresql://postgres.ejjvqtleuuamgtlmtxkc:pw@aws-0-us-east-1.pooler.supabase.com:6543/postgres?host=db.someprodref000000.supabase.co',
      ),
    ).toThrow(/param/i);
  });

  it('rejects a user= query-param override', () => {
    expect(() =>
      projectRefFromDbUrl(
        'postgresql://postgres:pw@db.ejjvqtleuuamgtlmtxkc.supabase.co:5432/postgres?user=postgres.someprodref000000',
      ),
    ).toThrow(/param/i);
  });

  it('allows a bare sslmode query param', () => {
    expect(
      projectRefFromDbUrl('postgresql://postgres:pw@db.ejjvqtleuuamgtlmtxkc.supabase.co:5432/postgres?sslmode=require'),
    ).toBe('ejjvqtleuuamgtlmtxkc');
  });

  it('never echoes the password in an error message', () => {
    // A malformed URL carrying a password must not have that password surface in the thrown message.
    try {
      projectRefFromDbUrl('postgres://user:SUPERSECRETPW@ bad url');
      throw new Error('expected a throw');
    } catch (e) {
      expect(String((e as Error).message)).not.toContain('SUPERSECRETPW');
    }
  });

  // Bypass cases Maulik found: the staging-only rail must hold against each.
  it('rejects a "#" fragment (query params hidden after # slip past the param guard)', () => {
    expect(() =>
      projectRefFromDbUrl(
        'postgresql://postgres.ejjvqtleuuamgtlmtxkc:pw@aws-0-us-east-1.pooler.supabase.com:6543/postgres#host=db.someprodref000000.supabase.co',
      ),
    ).toThrow(/#|fragment/i);
  });

  it('rejects a comma-separated multi-host (libpq host1,host2) where a prod host rides first', () => {
    expect(() =>
      projectRefFromDbUrl(
        'postgresql://postgres.ejjvqtleuuamgtlmtxkc:pw@db.someprodref000000.supabase.co,aws-0-us-east-1.pooler.supabase.com:6543/postgres',
      ),
    ).toThrow(/host/i);
  });

  it('rejects sslmode=disable (would send password + data in plaintext)', () => {
    expect(() =>
      projectRefFromDbUrl('postgresql://postgres:pw@db.ejjvqtleuuamgtlmtxkc.supabase.co:5432/postgres?sslmode=disable'),
    ).toThrow(/sslmode/i);
    expect(() =>
      projectRefFromDbUrl('postgresql://postgres:pw@db.ejjvqtleuuamgtlmtxkc.supabase.co:5432/postgres?sslmode=prefer'),
    ).toThrow(/sslmode/i);
  });

  it('still allows an encrypted sslmode', () => {
    expect(
      projectRefFromDbUrl('postgresql://postgres:pw@db.ejjvqtleuuamgtlmtxkc.supabase.co:5432/postgres?sslmode=verify-full'),
    ).toBe('ejjvqtleuuamgtlmtxkc');
  });
});

describe('buildPsqlConnParams — decompose the URL into discrete psql connection values', () => {
  it('splits a pooler URL into host/port/user/dbname + password (nothing re-parsed downstream)', () => {
    const p = buildPsqlConnParams(
      'postgresql://postgres.ejjvqtleuuamgtlmtxkc:Secret123@aws-0-us-east-1.pooler.supabase.com:6543/postgres',
    );
    expect(p.host).toBe('aws-0-us-east-1.pooler.supabase.com');
    expect(p.port).toBe('6543');
    expect(p.user).toBe('postgres.ejjvqtleuuamgtlmtxkc');
    expect(p.dbname).toBe('postgres');
    expect(p.password).toBe('Secret123');
  });

  it('splits a direct URL and defaults the port to 5432 when absent', () => {
    const p = buildPsqlConnParams(
      'postgresql://postgres:pw@db.ejjvqtleuuamgtlmtxkc.supabase.co/postgres',
    );
    expect(p.host).toBe('db.ejjvqtleuuamgtlmtxkc.supabase.co');
    expect(p.port).toBe('5432');
    expect(p.user).toBe('postgres');
  });

  it('defaults sslmode to an encrypting mode, and preserves an explicit encrypting one', () => {
    expect(
      buildPsqlConnParams('postgresql://postgres:pw@db.ejjvqtleuuamgtlmtxkc.supabase.co:5432/postgres').sslmode,
    ).toBe('require');
    expect(
      buildPsqlConnParams(
        'postgresql://postgres:pw@db.ejjvqtleuuamgtlmtxkc.supabase.co:5432/postgres?sslmode=verify-full',
      ).sslmode,
    ).toBe('verify-full');
  });

  it('keeps a literal "%" in the password instead of throwing on a bad percent-escape', () => {
    // '%pw' is not a valid percent-escape; decodeURIComponent would throw. We must fall back to raw.
    const p = buildPsqlConnParams(
      'postgresql://postgres.ejjvqtleuuamgtlmtxkc:ab%pw12@aws-0-us-east-1.pooler.supabase.com:6543/postgres',
    );
    expect(p.password).toBe('ab%pw12');
  });

  it('never surfaces the password on any non-password field (nothing to re-parse into argv)', () => {
    const p = buildPsqlConnParams(
      'postgresql://postgres.ejjvqtleuuamgtlmtxkc:Secret123@aws-0-us-east-1.pooler.supabase.com:6543/postgres',
    );
    for (const field of ['host', 'port', 'user', 'dbname', 'sslmode'] as const) {
      expect(p[field]).not.toContain('Secret123');
    }
  });

  it('applies the full prod-safety rail — rejects #, multi-host, and plaintext sslmode', () => {
    const base = 'postgresql://postgres.ejjvqtleuuamgtlmtxkc:pw@aws-0-us-east-1.pooler.supabase.com:6543/postgres';
    expect(() => buildPsqlConnParams(base + '#host=db.prod000000000000.supabase.co')).toThrow(/#|fragment/i);
    expect(() =>
      buildPsqlConnParams(
        'postgresql://postgres.ejjvqtleuuamgtlmtxkc:pw@db.prod000000000000.supabase.co,aws-0-us-east-1.pooler.supabase.com:6543/postgres',
      ),
    ).toThrow(/host/i);
    expect(() => buildPsqlConnParams(base + '?sslmode=disable')).toThrow(/sslmode/i);
  });
});

describe('buildProvisioningPlan — the accounts to create, with resolved emails', () => {
  it('produces one entry per persona with its plus-addressed email and roles', () => {
    const plan = buildProvisioningPlan('arunasharad@gmail.com');
    expect(plan).toHaveLength(PERSONAS.length);
    const teacher = plan.find((p) => p.tag === 'teacher');
    expect(teacher!.email).toBe('arunasharad+bv-teacher@gmail.com');
    expect(teacher!.roles[0].role).toBe('teacher');
  });

  it('resolves the multirole account email and keeps all four of its roles', () => {
    const plan = buildProvisioningPlan('arunasharad@gmail.com');
    const multi = plan.find((p) => p.tag === 'multirole');
    expect(multi!.email).toBe('arunasharad+bv-multirole@gmail.com');
    expect(multi!.roles).toHaveLength(4);
  });
});

describe('buildUserRoleRows — resolve a persona\'s symbolic scope to concrete user_roles rows', () => {
  const resolved = { classId: 'class-uuid-1', sessionId: 'session-uuid-1' };

  it('maps an org role to scope_id null', () => {
    const rows = buildUserRoleRows([{ role: 'admin', scopeType: 'org', scopeRef: null }], resolved);
    expect(rows).toEqual([{ role: 'admin', scope_type: 'org', scope_id: null }]);
  });

  it('maps a class role to the resolved class id', () => {
    const rows = buildUserRoleRows([{ role: 'teacher', scopeType: 'class', scopeRef: 'class' }], resolved);
    expect(rows).toEqual([{ role: 'teacher', scope_type: 'class', scope_id: 'class-uuid-1' }]);
  });

  it('maps a session role to the resolved session id', () => {
    const rows = buildUserRoleRows(
      [{ role: 'coordinator', scopeType: 'session', scopeRef: 'session' }],
      resolved,
    );
    expect(rows).toEqual([{ role: 'coordinator', scope_type: 'session', scope_id: 'session-uuid-1' }]);
  });

  it('maps the multirole account\'s four roles in one pass', () => {
    const multi = PERSONAS.find((p) => p.tag === 'multirole')!;
    const rows = buildUserRoleRows(multi.roles, resolved);
    expect(rows).toEqual([
      { role: 'parent', scope_type: 'org', scope_id: null },
      { role: 'teacher', scope_type: 'class', scope_id: 'class-uuid-1' },
      { role: 'coordinator', scope_type: 'session', scope_id: 'session-uuid-1' },
      { role: 'bv_coordinator', scope_type: 'org', scope_id: null },
    ]);
  });

  it('fails closed when a scoped role has no resolved id (never writes a null-scope class role)', () => {
    expect(() =>
      buildUserRoleRows([{ role: 'teacher', scopeType: 'class', scopeRef: 'class' }], { sessionId: 's' }),
    ).toThrow(/class/i);
  });
});

describe('buildDomainTruncateSql — the --reset wipe of synthetic domain tables', () => {
  it('truncates the domain tables with CASCADE, restarting identities', () => {
    const sql = buildDomainTruncateSql();
    expect(sql).toMatch(/truncate/i);
    expect(sql).toMatch(/cascade/i);
    // Must cover the account-free domain tables domain.sql populates.
    for (const t of ['centers', 'sessions', 'classes', 'families', 'students', 'enrollments']) {
      expect(sql).toContain(t);
    }
  });
});

describe('shouldLoadDomain — additive (multi-tester) vs fresh vs reset', () => {
  it('loads the domain on a fresh, empty DB', () => {
    expect(shouldLoadDomain({ reset: false, domainExists: false })).toBe(true);
  });

  it('SKIPS the domain load when data already exists — accounts-only/additive (a second tester)', () => {
    expect(shouldLoadDomain({ reset: false, domainExists: true })).toBe(false);
  });

  it('loads the domain on --reset regardless of prior state (reset wipes, then reloads)', () => {
    expect(shouldLoadDomain({ reset: true, domainExists: true })).toBe(true);
    expect(shouldLoadDomain({ reset: true, domainExists: false })).toBe(true);
  });
});

describe('parseArgs — CLI flags', () => {
  it('detects --reset', () => {
    expect(parseArgs(['--reset'])).toEqual({ reset: true, yes: false });
  });

  it('defaults both flags to false when absent', () => {
    expect(parseArgs([])).toEqual({ reset: false, yes: false });
  });

  it('detects --yes (skip the destructive --reset confirmation prompt)', () => {
    expect(parseArgs(['--reset', '--yes'])).toEqual({ reset: true, yes: true });
  });
});

describe('isProvisionedPersonaEmail — anchor the --reset wipe to our persona tags', () => {
  it('matches a provisioned persona email for any tester base', () => {
    expect(isProvisionedPersonaEmail('arunasharad+bv-teacher@gmail.com')).toBe(true);
    expect(isProvisionedPersonaEmail('mehta.maulik+bv-multirole@gmail.com')).toBe(true);
  });

  it('does NOT match a bystander email that merely contains "+bv-"', () => {
    // A real user whose own sub-address happens to include +bv- but not one of OUR persona tags
    // must never be swept by --reset.
    expect(isProvisionedPersonaEmail('someone+bv-newsletter@gmail.com')).toBe(false);
    expect(isProvisionedPersonaEmail('someone+bv-teacher-notes@gmail.com')).toBe(false);
  });

  it('does not match a plain address or a non-string', () => {
    expect(isProvisionedPersonaEmail('plainuser@gmail.com')).toBe(false);
    expect(isProvisionedPersonaEmail(undefined as unknown as string)).toBe(false);
  });

  it('matches every tag buildProvisioningPlan emits', () => {
    for (const p of buildProvisioningPlan('arunasharad@gmail.com')) {
      expect(isProvisionedPersonaEmail(p.email)).toBe(true);
    }
  });
});

describe('resolveConfig — fail-closed env gate for the wrapper', () => {
  const goodEnv = {
    STAGING_SEED_EMAIL_BASE: 'arunasharad@gmail.com',
    STAGING_SUPABASE_URL: 'https://ejjvqtleuuamgtlmtxkc.supabase.co',
    STAGING_SUPABASE_SERVICE_ROLE_KEY: 'service-role-key-value',
    STAGING_DB_URL: STAGING_DB_URL_POOLER,
  };

  it('returns a normalized config for a valid staging env', () => {
    const cfg = resolveConfig(goodEnv);
    expect(cfg.emailBase).toBe('arunasharad@gmail.com');
    expect(cfg.projectRef).toBe('ejjvqtleuuamgtlmtxkc');
    expect(cfg.url).toBe('https://ejjvqtleuuamgtlmtxkc.supabase.co');
    expect(cfg.serviceRoleKey).toBe('service-role-key-value');
    expect(cfg.dbUrl).toBe(STAGING_DB_URL_POOLER);
  });

  it('refuses when the service-role key is missing', () => {
    expect(() =>
      resolveConfig({ ...goodEnv, STAGING_SUPABASE_SERVICE_ROLE_KEY: '' }),
    ).toThrow(/service.role/i);
  });

  it('refuses when the API URL points at a non-staging project', () => {
    expect(() =>
      resolveConfig({ ...goodEnv, STAGING_SUPABASE_URL: 'https://someprodref000000.supabase.co' }),
    ).toThrow(/staging/i);
  });

  it('refuses a missing email base', () => {
    expect(() => resolveConfig({ ...goodEnv, STAGING_SEED_EMAIL_BASE: '' })).toThrow(/email/i);
  });

  it('refuses when the DB URL is missing', () => {
    expect(() => resolveConfig({ ...goodEnv, STAGING_DB_URL: '' })).toThrow(/STAGING_DB_URL/i);
  });

  it('refuses when the DB URL points at a non-staging project (prod-safety rail)', () => {
    const prodDbUrl =
      'postgresql://postgres.someprodref000000:pw@aws-0-us-east-1.pooler.supabase.com:6543/postgres';
    expect(() => resolveConfig({ ...goodEnv, STAGING_DB_URL: prodDbUrl })).toThrow(/staging/i);
  });

  it('refuses when the DB URL and API URL disagree on the project', () => {
    // Both must resolve to the same staging ref — a mismatched pair is a misconfiguration.
    expect(() =>
      resolveConfig({ ...goodEnv, STAGING_DB_URL: STAGING_DB_URL_DIRECT.replace('ejjvqtleuuamgtlmtxkc', 'someotherref00000000') }),
    ).toThrow(/staging/i);
  });
});
