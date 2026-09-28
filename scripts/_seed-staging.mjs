// scripts/_seed-staging.mjs
// Pure helpers for the cloud staging seed (scripts/seed-staging.mjs) — no fs, no network,
// no process, so every rule below is unit-testable in isolation
// (scripts/__tests__/seed-staging.test.ts), matching the _adr-index.mjs / _secret-checks.js
// pattern. Spec: .docs/specs/system/staging-deploy-verification.md (#65), plan T1.
//
// This module is the safety-critical core of the seed: isStagingTarget() is the rail that keeps
// the script off production, and assertSeedConfig() fails closed before any write happens.

// The one cloud project the seed is ever allowed to touch (Supabase `cmdfw-bv-staging`).
// A future prod project B has a different ref and must NOT pass this gate.
export const STAGING_PROJECT_REF = 'ejjvqtleuuamgtlmtxkc';

// The reusable, tests.*-free synthetic dataset authored by #19 (pilot-seed-data) and merged to
// main; the loader (scripts/seed-staging.mjs applyDomainData) applies this same file to cloud
// staging. Repo-relative. Pinned + existence-checked in the unit tests so a stale path fails in
// CI, not only at the cloud walk. (config.toml loads it locally after 00_test_fixtures.sql.)
export const DOMAIN_SQL_PATH = 'supabase/seed/domain.sql';

// Persona → role/scope contract. scopeType mirrors the authoritative DB map
// (netlify/functions/lib/role-tiering.ts ROLE_SCOPE_TYPE) and the local seed inserts
// (supabase/seed/seed.sql): student/parent/bv_coordinator/admin are org-scoped (scope_id null,
// per the user_roles_org_scope_null_id check); teacher is class-scoped; coordinator is
// session-scoped. `scopeRef` is a SYMBOLIC handle the I/O wrapper (T3) resolves to a concrete
// id from the loaded synthetic data — null for org roles, 'class'/'session' for scoped ones.
// The multirole account mirrors seed.sql: parent + teacher + coordinator + bv_coordinator.
export const PERSONAS = [
  { tag: 'student', roles: [{ role: 'student', scopeType: 'org', scopeRef: null }] },
  { tag: 'parent', roles: [{ role: 'parent', scopeType: 'org', scopeRef: null }] },
  { tag: 'teacher', roles: [{ role: 'teacher', scopeType: 'class', scopeRef: 'class' }] },
  { tag: 'coordinator', roles: [{ role: 'coordinator', scopeType: 'session', scopeRef: 'session' }] },
  { tag: 'bv_coordinator', roles: [{ role: 'bv_coordinator', scopeType: 'org', scopeRef: null }] },
  { tag: 'admin', roles: [{ role: 'admin', scopeType: 'org', scopeRef: null }] },
  {
    tag: 'multirole',
    roles: [
      { role: 'parent', scopeType: 'org', scopeRef: null },
      { role: 'teacher', scopeType: 'class', scopeRef: 'class' },
      { role: 'coordinator', scopeType: 'session', scopeRef: 'session' },
      { role: 'bv_coordinator', scopeType: 'org', scopeRef: null },
    ],
  },
];

// Turn a full-email base + a persona tag into a plus-addressed variant that all route to the
// base's one inbox: resolvePersonaEmail('a@gmail.com','teacher') -> 'a+bv-teacher@gmail.com'.
// Requires a FULL email (with @) so no domain is hard-coded; refuses a local part that already
// carries a '+' (that would nest sub-addresses ambiguously).
export function resolvePersonaEmail(base, tag) {
  if (typeof base !== 'string' || base.trim() === '') {
    throw new Error('resolvePersonaEmail: email base is required (a full email like name@domain)');
  }
  if (typeof tag !== 'string' || tag.trim() === '') {
    throw new Error('resolvePersonaEmail: persona tag is required');
  }
  const at = base.indexOf('@');
  if (at <= 0 || base.indexOf('@', at + 1) !== -1) {
    throw new Error(`resolvePersonaEmail: "${base}" is not a full email (expected one name@domain)`);
  }
  const local = base.slice(0, at);
  const domain = base.slice(at + 1);
  if (local.includes('+')) {
    throw new Error(`resolvePersonaEmail: base local part "${local}" already contains '+'`);
  }
  if (domain.trim() === '') {
    throw new Error(`resolvePersonaEmail: "${base}" has no domain`);
  }
  return `${local}+bv-${tag}@${domain}`;
}

// The prod safety rail: only the staging ref passes. Anything else — a prod ref, empty,
// undefined — is refused.
export function isStagingTarget(projectRef) {
  return projectRef === STAGING_PROJECT_REF;
}

// Fail-closed config check, run before the seed does anything. Throws a NAMED error if the
// email base is missing/invalid or the target is not the staging project. Returns the
// normalized config on success.
export function assertSeedConfig(config) {
  const emailBase = config?.emailBase;
  const projectRef = config?.projectRef;
  if (typeof emailBase !== 'string' || emailBase.trim() === '') {
    throw new Error('assertSeedConfig: STAGING_SEED_EMAIL_BASE (a full email) is required');
  }
  // Reuse the email rule so an invalid base is rejected here, not mid-provisioning.
  resolvePersonaEmail(emailBase, 'probe');
  if (!isStagingTarget(projectRef)) {
    throw new Error(
      `assertSeedConfig: refusing to seed "${projectRef ?? '(none)'}" — not the staging project (${STAGING_PROJECT_REF})`,
    );
  }
  return { emailBase, projectRef };
}

// Derive the project ref from a Supabase API URL (https://<ref>.supabase.co). The wrapper
// feeds this into the guard, so the safety check is against the URL we actually connect to —
// not a ref passed separately that could disagree with it.
export function projectRefFromUrl(url) {
  if (typeof url !== 'string' || url.trim() === '') {
    throw new Error('projectRefFromUrl: url is required');
  }
  let host;
  try {
    host = new URL(url).hostname;
  } catch {
    throw new Error(`projectRefFromUrl: "${url}" is not a valid URL`);
  }
  const suffix = '.supabase.co';
  if (!host.endsWith(suffix)) {
    throw new Error(`projectRefFromUrl: "${host}" is not a <ref>.supabase.co host`);
  }
  const ref = host.slice(0, -suffix.length);
  if (ref === '' || ref.includes('.')) {
    throw new Error(`projectRefFromUrl: no project ref in "${host}"`);
  }
  return ref;
}

// Derive the project ref from a Postgres connection string (for the psql-based steps —
// applyDomainData / reset). Handles both forms Supabase hands out:
//   - pooler:  postgresql://postgres.<ref>:<pw>@aws-0-<region>.pooler.supabase.com:6543/postgres
//   - direct:  postgresql://postgres:<pw>@db.<ref>.supabase.co:5432/postgres
// The ref lets us apply the same prod-safety rail to the DB URL as to the API URL.
export function projectRefFromDbUrl(dbUrl) {
  if (typeof dbUrl !== 'string' || dbUrl.trim() === '') {
    throw new Error('projectRefFromDbUrl: connection string is required');
  }
  let parsed;
  try {
    parsed = new URL(dbUrl);
  } catch {
    throw new Error(`projectRefFromDbUrl: "${dbUrl}" is not a valid connection string`);
  }
  const host = parsed.hostname;
  const directSuffix = '.supabase.co';
  if (host.startsWith('db.') && host.endsWith(directSuffix)) {
    const ref = host.slice('db.'.length, -directSuffix.length);
    if (ref === '' || ref.includes('.')) {
      throw new Error(`projectRefFromDbUrl: no project ref in host "${host}"`);
    }
    return ref;
  }
  if (host.endsWith('.pooler.supabase.com')) {
    // Pooler encodes the ref in the username: postgres.<ref>
    const user = decodeURIComponent(parsed.username);
    const dot = user.indexOf('.');
    const ref = dot === -1 ? '' : user.slice(dot + 1);
    if (ref === '' || ref.includes('.')) {
      throw new Error(`projectRefFromDbUrl: no project ref in pooler username "${user}"`);
    }
    return ref;
  }
  throw new Error(`projectRefFromDbUrl: "${host}" is not a Supabase database host`);
}

// Expand PERSONAS into the concrete list of accounts to provision, each with its plus-addressed
// email resolved from the base. Pure — the I/O wrapper (T3) walks this to call the Auth Admin API.
export function buildProvisioningPlan(emailBase) {
  return PERSONAS.map((p) => ({
    tag: p.tag,
    email: resolvePersonaEmail(emailBase, p.tag),
    roles: p.roles,
  }));
}

// Resolve a persona's roles (each {role, scopeType, scopeRef}) into concrete user_roles rows,
// filling scope_id from the ids resolved out of the loaded domain data. Pure so the mapping —
// including the fail-closed "a scoped role must have an id" rule — is unit-tested; the I/O
// wrapper (provisionAccounts) inserts what this returns. Mirrors supabase/seed/seed.sql's rows.
export function buildUserRoleRows(roles, resolved) {
  return roles.map((r) => {
    let scopeId;
    if (r.scopeRef === null) scopeId = null;
    else if (r.scopeRef === 'class') scopeId = resolved?.classId;
    else if (r.scopeRef === 'session') scopeId = resolved?.sessionId;
    else throw new Error(`buildUserRoleRows: unknown scopeRef "${r.scopeRef}" for role ${r.role}`);
    // Fail closed: never write a class/session role with a null scope_id (the user_roles CHECK
    // would reject it, or worse, an org-null slip would over-grant). Require a resolved id.
    if (r.scopeRef !== null && !scopeId) {
      throw new Error(
        `buildUserRoleRows: role ${r.role} needs a resolved ${r.scopeRef} id, but none was provided`,
      );
    }
    return { role: r.role, scope_type: r.scopeType, scope_id: scopeId };
  });
}

// The --reset wipe (AC#9): truncate the account-free synthetic domain tables domain.sql populates.
// CASCADE clears the account-linked rows (attendance/class_updates/consents/class_meetings) that
// FK to them; the provisioned auth users are deleted separately via the Auth Admin API (they live
// in auth.users, not these). RESTART IDENTITY keeps any serial columns clean across reseeds.
export function buildDomainTruncateSql() {
  const tables = ['enrollments', 'students', 'classes', 'sessions', 'families', 'centers'];
  return `truncate table ${tables.map((t) => `public.${t}`).join(', ')} restart identity cascade;`;
}

// Decide whether to (re)load the domain dataset. This is what makes a plain re-run ADDITIVE —
// safe for provisioning a second/third tester (Maulik, Srinath) on their own email base without
// wiping the shared data or tripping domain.sql's "F3 already exists" guard:
//   - --reset            -> load (resetStaging wiped first, so reload the domain)
//   - domain absent      -> load (fresh empty DB)
//   - domain present      -> SKIP (accounts-only: just provision this base's accounts)
export function shouldLoadDomain({ reset, domainExists }) {
  return reset || !domainExists;
}

// Minimal CLI arg parse: only --reset is supported (wipe-then-reseed, AC#9).
export function parseArgs(argv) {
  return { reset: Array.isArray(argv) && argv.includes('--reset') };
}

// Fail-closed env gate for the wrapper: reads the STAGING_* env, refuses if the service-role
// key or URL is missing, and (via assertSeedConfig) if the email base is missing or the URL's
// project ref is not staging. Returns the normalized config the wrapper needs.
export function resolveConfig(env) {
  const emailBase = env?.STAGING_SEED_EMAIL_BASE;
  const url = env?.STAGING_SUPABASE_URL;
  const serviceRoleKey = env?.STAGING_SUPABASE_SERVICE_ROLE_KEY;
  const dbUrl = env?.STAGING_DB_URL;
  if (typeof serviceRoleKey !== 'string' || serviceRoleKey.trim() === '') {
    throw new Error('resolveConfig: STAGING_SUPABASE_SERVICE_ROLE_KEY is required');
  }
  if (typeof url !== 'string' || url.trim() === '') {
    throw new Error('resolveConfig: STAGING_SUPABASE_URL is required');
  }
  if (typeof dbUrl !== 'string' || dbUrl.trim() === '') {
    throw new Error('resolveConfig: STAGING_DB_URL (the Postgres connection string) is required');
  }
  const projectRef = projectRefFromUrl(url);
  assertSeedConfig({ emailBase, projectRef });
  // Same prod-safety rail on the DB URL: its ref must be the staging project AND agree with the
  // API URL's ref — a mismatched pair is a misconfiguration we refuse rather than psql the wrong DB.
  const dbRef = projectRefFromDbUrl(dbUrl);
  if (!isStagingTarget(dbRef) || dbRef !== projectRef) {
    throw new Error(
      `resolveConfig: refusing STAGING_DB_URL for "${dbRef}" — not the staging project ` +
        `(${STAGING_PROJECT_REF})${dbRef !== projectRef ? ` or disagrees with the API URL ref "${projectRef}"` : ''}`,
    );
  }
  return { emailBase, url, serviceRoleKey, dbUrl, projectRef };
}
