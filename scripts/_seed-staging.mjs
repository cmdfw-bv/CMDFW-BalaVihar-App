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

// Match ONLY an email this seed itself provisioned: a plus-address whose local part ends in
// `+bv-<one of our persona tags>`. The --reset wipe keys off this so it deletes our synthetic
// accounts across every tester base — and never a bystander whose own sub-address happens to
// contain "+bv-" (e.g. "+bv-newsletter"). Anchored to the exact tag set, at the end of the local
// part, so "+bv-teacher-notes" does not match either.
const PROVISIONED_EMAIL_RE = new RegExp(`\\+bv-(?:${PERSONAS.map((p) => p.tag).join('|')})$`);
export function isProvisionedPersonaEmail(email) {
  if (typeof email !== 'string') return false;
  const at = email.indexOf('@');
  if (at <= 0) return false;
  return PROVISIONED_EMAIL_RE.test(email.slice(0, at));
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
// sslmode values that actually encrypt the connection. disable/allow/prefer can fall back to
// plaintext — never acceptable for a URL carrying a service-role-adjacent DB password.
const ENCRYPTED_SSLMODES = new Set(['require', 'verify-ca', 'verify-full']);

export function projectRefFromDbUrl(dbUrl) {
  if (typeof dbUrl !== 'string' || dbUrl.trim() === '') {
    throw new Error('projectRefFromDbUrl: connection string is required');
  }
  // A '#' starts a URI fragment, which the WHATWG URL parser peels off into parsed.hash — so query
  // params hidden after it (?...#host=db.prod...) never reach the param guard below. Nothing in a
  // Postgres connection string legitimately needs a fragment, so refuse it outright.
  if (dbUrl.includes('#')) {
    throw new Error('projectRefFromDbUrl: STAGING_DB_URL must not contain a "#" fragment');
  }
  // libpq accepts a comma-separated multi-host authority (host1,host2) and connects to the first
  // that answers — a prod host could ride in ahead of the staging one while the parser still reads
  // a staging-looking ref. The WHATWG parser folds the whole comma list into one hostname, so check
  // the raw authority (between the last '@' and the path/query) for a comma ourselves.
  const authority = dbUrl.slice(dbUrl.lastIndexOf('@') + 1).split(/[/?#]/)[0];
  if (authority.includes(',')) {
    throw new Error('projectRefFromDbUrl: STAGING_DB_URL must not list multiple hosts');
  }
  let parsed;
  try {
    parsed = new URL(dbUrl);
  } catch {
    // Never echo the raw URL — it may carry the password.
    throw new Error('projectRefFromDbUrl: STAGING_DB_URL is not a valid connection string');
  }
  // libpq honors query params like ?host= / ?user= that would override the host/user we derive the
  // ref from — a prod host could ride in on a staging-looking ref. Refuse anything but sslmode so
  // the ref we check is the one actually connected to; and require sslmode to be an encrypting mode.
  for (const [key, value] of parsed.searchParams.entries()) {
    if (key.toLowerCase() !== 'sslmode') {
      throw new Error(
        `projectRefFromDbUrl: STAGING_DB_URL carries a disallowed query param "${key}" — only sslmode is allowed`,
      );
    }
    if (!ENCRYPTED_SSLMODES.has(value.toLowerCase())) {
      throw new Error(
        `projectRefFromDbUrl: STAGING_DB_URL sslmode="${value}" is not encrypted — use require, verify-ca, or verify-full`,
      );
    }
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

// decodeURIComponent, but fall back to the raw value when it isn't a valid percent-escape — a DB
// password or username may legitimately contain a literal '%'.
function safeDecode(value) {
  if (!value) return '';
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

// Decompose a validated staging connection string into DISCRETE psql connection values, so the I/O
// wrapper can pass host/port/user/dbname as separate argv and the password/sslmode via env — and
// NEVER hand a connection string to psql to be re-parsed. That re-parse is the whole attack surface:
// libpq and the WHATWG URL parser disagree about where a URL ends (a '#' fragment, a comma-separated
// multi-host), so a prod host can ride in past a staging-looking ref check. Pulling the fields apart
// once, here, closes that entire class — there is nothing left for psql to misinterpret. We still
// run the full prod-safety rail (projectRefFromDbUrl: staging ref + reject #/multi-host/plaintext
// sslmode) as defense in depth. Pure.
export function buildPsqlConnParams(dbUrl) {
  if (typeof dbUrl !== 'string' || dbUrl.trim() === '') {
    throw new Error('buildPsqlConnParams: connection string is required');
  }
  // Validates the ref AND rejects the parser-disagreement shapes before we read any field.
  projectRefFromDbUrl(dbUrl);
  let parsed;
  try {
    parsed = new URL(dbUrl);
  } catch {
    throw new Error('buildPsqlConnParams: STAGING_DB_URL is not a valid connection string');
  }
  // sslmode is already validated by the rail to be an encrypting mode when present; default to
  // 'require' when absent so the connection is never silently plaintext.
  const sslmode = (parsed.searchParams.get('sslmode') || 'require').toLowerCase();
  return {
    host: parsed.hostname,
    port: parsed.port || '5432',
    user: safeDecode(parsed.username),
    dbname: safeDecode(parsed.pathname.replace(/^\//, '')) || 'postgres',
    sslmode,
    password: safeDecode(parsed.password),
  };
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
// CASCADE reaches wider than just the domain tables — it also clears everything that FKs to them:
// attendance, class_meetings, class_updates, comments, and consents.
//
// audit_log also references students, but via ON DELETE SET NULL (20260709040853) — so a row-level
// DELETE of a student would KEEP the audit row and null its target_student_id (constitution #6:
// minors'-access audit trail is retained). TRUNCATE ... CASCADE does NOT honor ON DELETE actions,
// though: it truncates audit_log wholesale. That's acceptable here ONLY because this is synthetic
// staging data (no real minors) that gets reloaded, and the staging-only guard keeps --reset off
// prod — where the retention property must hold. It does NOT touch conversations/messages, which
// keep now-dangling scope_ids — also acceptable on synthetic staging. The provisioned auth users
// are deleted separately via the Auth Admin API (they live in auth.users). RESTART IDENTITY keeps
// serials clean.
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

// CLI arg parse: --reset wipes-then-reseeds (AC#9); --yes skips the destructive-reset
// confirmation prompt (for non-interactive/CI use). Everything defaults off.
export function parseArgs(argv) {
  const has = (f) => Array.isArray(argv) && argv.includes(f);
  return { reset: has('--reset'), yes: has('--yes') };
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
