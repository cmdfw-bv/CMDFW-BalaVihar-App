#!/usr/bin/env node
// scripts/seed-staging.mjs — thin I/O wrapper over _seed-staging.mjs (pure, unit-tested).
//
// Seeds the cloud STAGING project (cmdfw-bv-staging) with synthetic domain data + sign-in
// accounts so every persona can actually log in (#65 AC#5/#6/#9). The decision logic —
// config gate, prod safety rail, provisioning plan, arg parse — lives in _seed-staging.mjs and
// is covered by scripts/__tests__/seed-staging.test.ts. This file is the I/O that drives it.
//
// Run:  STAGING_SUPABASE_URL=… STAGING_SUPABASE_SERVICE_ROLE_KEY=… STAGING_DB_URL=… \
//       STAGING_SEED_EMAIL_BASE=you@gmail.com  npm run seed:staging        [-- --reset]
//
// Build status: the plain seed + additive mode are verified live against cloud staging (2026-09-25
// walk) — domain load + all 7 personas provisioned, personas sign in. The safety-critical decision
// logic (config + prod rails incl. the hardened DB-URL validation, provisioning plan, symbolic→
// concrete scope resolution, reset truncate SQL, additive-mode decision, the +bv- persona-email
// matcher) lives in _seed-staging.mjs and is unit-tested (scripts/__tests__/seed-staging.test.ts).
// The I/O bodies below — applyDomainData (psql), provisionAccounts (Auth Admin API + service-role
// writes), resetStaging and the pagination/confirmation helpers — make real cloud calls or read a
// TTY, so they are NOT unit-tested; they are exercised by the live verification walk (#111) and by
// a manual --reset run. Keep the risky, reusable logic in the pure module so this file stays a
// thin, reviewable I/O shell.
//
// Modes: plain run on a fresh DB loads domain + accounts; plain run when the domain already
// exists is ADDITIVE (accounts-only) — provisions another tester's accounts on their email base
// without wiping (each tester's student persona claims a distinct unlinked pilot-class student);
// --reset wipes everything and reloads.
import { createClient } from '@supabase/supabase-js';
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import * as readline from 'node:readline/promises';
import { fileURLToPath } from 'node:url';
import {
  resolveConfig,
  parseArgs,
  buildProvisioningPlan,
  buildUserRoleRows,
  buildDomainTruncateSql,
  shouldLoadDomain,
  buildPsqlConnParams,
  isProvisionedPersonaEmail,
  DOMAIN_SQL_PATH,
  HS_GRADE_LEVELS,
} from './_seed-staging.mjs';

// Run psql against the staging DB. We pass the connection as DISCRETE values — host/port/user/dbname
// as separate argv, password via PGPASSWORD, sslmode via PGSSLMODE — and never hand psql a connection
// *string* to re-parse. That removes the whole parser-disagreement attack surface (a '#' fragment or
// a comma-separated multi-host that fools the staging-only rail into pointing psql, and the password,
// at the wrong database). -w: never prompt for a password (fail fast instead of hanging). The
// password stays off argv (where `ps` would show it).
export function runPsql(config, psqlArgs) {
  const { host, port, user, dbname, sslmode, password } = buildPsqlConnParams(config.dbUrl);
  // Allowlist (not denylist) the child's environment: pass only what psql needs plus the two PG vars
  // we set here. This keeps our secrets out of the child AND refuses any inherited libpq var
  // (PGHOST / PGOPTIONS / PGSERVICEFILE / PGSSLROOTCERT / …) that could redirect the connection or
  // weaken TLS behind the discrete flags.
  const env = { PGPASSWORD: password, PGSSLMODE: sslmode };
  for (const k of ['PATH', 'HOME', 'LANG', 'LC_ALL', 'LC_CTYPE', 'TMPDIR']) {
    if (process.env[k] !== undefined) env[k] = process.env[k];
  }
  return spawnSync(
    'psql',
    ['-h', host, '-p', port, '-U', user, '-d', dbname, '-w', '--set', 'ON_ERROR_STOP=1', ...psqlArgs],
    { stdio: ['ignore', 'inherit', 'inherit'], env },
  );
}

// List every auth user, paging through the Auth Admin API (a single call caps at perPage, so a
// project with more accounts than one page would silently miss users — a correctness bug for both
// the idempotent email lookup and the --reset sweep).
// Every caller uses this list to decide what already exists, and --reset uses it to decide what to
// delete — so an UNDERCOUNT is the dangerous direction: it reports success over accounts it never
// saw. The previous `if (data.users.length < perPage) break` trusted a short page to mean "last
// page", which is only true if the server honours the requested perPage. If GoTrue ever clamps it
// below the seeded account count, page 1 comes back short, the loop exits, and the run silently
// misses accounts. Three rails instead of that one assumption (#129 item 3):
//   1. follow the server's own `nextPage` cursor when it gives one, rather than inferring;
//   2. reconcile the collected count against the server's `total` before returning, so an
//      undercount FAILS LOUDLY instead of looking like success;
//   3. a hard page ceiling, so a server that ignores `page` can't spin forever accumulating users.
const LIST_USERS_PER_PAGE = 1000;
const LIST_USERS_MAX_PAGES = 100;

export async function listAllUsers(client) {
  const users = [];
  let page = 1;
  // Remembered across pages: the run ends on an empty page, and that last response carries no
  // metadata, so the total has to be captured when it is actually offered.
  let reportedTotal = null;

  for (let requests = 0; requests < LIST_USERS_MAX_PAGES; requests++) {
    const { data, error } = await client.auth.admin.listUsers({
      page,
      perPage: LIST_USERS_PER_PAGE,
    });
    if (error) throw new Error(`seed-staging: listing users failed (${error.message})`);
    users.push(...data.users);
    if (typeof data.total === 'number' && data.total > 0) {
      reportedTotal = Math.max(reportedTotal ?? 0, data.total);
    }

    // Termination is on an EMPTY page, never on a SHORT one.
    //
    // This cannot lean on the server's metadata, because @supabase/auth-js only populates it when a
    // `Link` header is present: `pagination.total = parseInt(total)` sits INSIDE
    // `if (links.length > 0)`, so a single-page response leaves `total` at 0 and any reconciliation
    // against it is silently inert — which is exactly this project's normal case (~60 accounts at
    // perPage 1000). It also parses the page number with `.substring(0, 1)`, so `nextPage` is
    // unreliable past page 9. Trusting either would reproduce the original bug in a new costume.
    //
    // So: follow `nextPage` when offered AND sane, otherwise keep asking while pages come back
    // non-empty, and stop only when one comes back empty. That holds whether or not the server
    // honours perPage and whether or not it sends headers, at the cost of one extra request per run.
    const nextPage =
      typeof data.nextPage === 'number' && data.nextPage > page
        ? data.nextPage
        : data.users.length > 0
          ? page + 1
          : null;

    if (nextPage === null) {
      // Belt-and-braces on top of the empty-page termination, for runs where the server does report
      // a total. It can only ever catch MORE, never fewer.
      if (reportedTotal !== null && users.length < reportedTotal) {
        throw new Error(
          `seed-staging: listed ${users.length} users but the server reports ${reportedTotal} — ` +
            'refusing to continue on a partial list (a --reset would skip the accounts it never saw)',
        );
      }
      return users;
    }
    page = nextPage;
  }

  throw new Error(
    `seed-staging: listing users exceeded ${LIST_USERS_MAX_PAGES} pages (${users.length} collected) — ` +
      'refusing to continue in case the server is ignoring the page parameter',
  );
}

// The F3 class every student-login persona attaches to (the pilot class with student logins +
// content, mirroring supabase/seed/seed.sql). Kept as a named constant, not scattered literals.
const PILOT_CLASS_GRADE_BAND = '7, 8, 9';

/** Apply #19's synthetic domain dataset (center/session/classes/families/students/enrollments)
 *  by running the same .sql file through psql — supabase-js cannot execute a raw multi-statement
 *  file. Matches the repo's cloud-SQL pattern (supabase/checks/cloud_fixture_absence.sql).
 *  ON_ERROR_STOP=1 so any failure is a non-zero exit, not a printed-and-ignored error. */
export function applyDomainData(config) {
  if (!existsSync(DOMAIN_SQL_PATH)) {
    throw new Error(
      `seed-staging: dataset ${DOMAIN_SQL_PATH} not found on disk — expected #19's ` +
        `pilot-seed-data file (merged to main).`,
    );
  }
  console.log(`  applying ${DOMAIN_SQL_PATH} via psql …`);
  const res = runPsql(config, ['-f', DOMAIN_SQL_PATH]);
  if (res.error) {
    throw new Error(
      `seed-staging: could not run psql (${res.error.message}). Is psql installed and on PATH?`,
    );
  }
  if (res.status !== 0) {
    throw new Error(
      `seed-staging: psql exited ${res.status} applying ${DOMAIN_SQL_PATH}. ` +
        `domain.sql refuses a non-empty DB (its F3 guard) — run with --reset first to reseed.`,
    );
  }
}

/** Find an auth user by email (read-only), or null. */
export async function findUserByEmail(client, email) {
  const users = await listAllUsers(client);
  return users.find((u) => u.email === email) ?? null;
}

/** Create-or-reuse an auth user by email (idempotent). createUser fails if the email already
 *  exists, so on that path we find the existing user. */
export async function ensureUser(client, email) {
  const { data, error } = await client.auth.admin.createUser({ email, email_confirm: true });
  if (!error) return data.user;
  const existing = await findUserByEmail(client, email);
  if (existing) return existing;
  throw error; // a real failure, not "already registered"
}

/** Resolve the concrete ids the persona scopes need out of the loaded domain data: the F3
 *  session, the pilot class, and ONE student (+ its family) in that class — tied to this base.
 *
 *  Idempotent per base: if this base's student login already owns a student (a re-run), reuse THAT
 *  student + family so the parent/multirole links stay on the same family. Only on a first run do
 *  we claim a fresh UNLINKED Gr 9+ student (students.user_id is 1:1, so each tester must take a
 *  different one). Only Gr 9+ (#119): a Gr 7-8 login is not a class-chat participant, so that persona
 *  would land on an empty chat. The pilot class has 3 Gr 9 students, so a 4th tester needs --reset.
 *  Ordered by (first_name, id) for a stable, reproducible pick. */
export async function resolveScopeIds(client, studentEmail) {
  const { data: session, error: se } = await client
    .from('sessions').select('id').eq('name', 'F3').single();
  if (se || !session) throw new Error(`seed-staging: could not find the F3 session (${se?.message ?? 'no row'})`);

  const { data: klass, error: ce } = await client
    .from('classes').select('id').eq('session_id', session.id).eq('grade_band', PILOT_CLASS_GRADE_BAND).single();
  if (ce || !klass) throw new Error(`seed-staging: could not find the "${PILOT_CLASS_GRADE_BAND}" class (${ce?.message ?? 'no row'})`);

  // Re-run: reuse the student this base's login already owns.
  const existingStudentUser = await findUserByEmail(client, studentEmail);
  if (existingStudentUser) {
    const { data: owned, error: oe } = await client
      .from('students').select('id, family_id').eq('user_id', existingStudentUser.id).limit(1);
    if (oe) throw new Error(`seed-staging: checking the base's existing student failed (${oe.message})`);
    if (owned?.length) {
      return { sessionId: session.id, classId: klass.id, studentId: owned[0].id, familyId: owned[0].family_id };
    }
  }

  // First run: claim an unlinked Gr 9+ student enrolled in the pilot class.
  const { data: students, error: ee } = await client
    .from('students')
    .select('id, family_id, enrollments!inner(class_id)')
    .eq('enrollments.class_id', klass.id)
    .is('user_id', null)
    .in('grade_level', HS_GRADE_LEVELS)
    .order('first_name')
    .order('id')
    .limit(1);
  if (ee) throw new Error(`seed-staging: querying an unlinked pilot-class student failed (${ee.message})`);
  if (!students?.length) {
    throw new Error(
      `seed-staging: no unlinked Gr 9+ student left in the "${PILOT_CLASS_GRADE_BAND}" class — every one is ` +
        `already claimed by a tester's student persona (only Gr 9+ students get logins, #119). Run with --reset ` +
        `to start clean, or add more Gr 9+ students to the seed.`,
    );
  }
  const student = students[0];

  return { sessionId: session.id, classId: klass.id, studentId: student.id, familyId: student.family_id };
}

/** True if the synthetic domain data is already loaded (the F3 session exists). Drives additive
 *  (accounts-only) mode for a second/third tester — see shouldLoadDomain. */
export async function domainDataExists(client) {
  const { data, error } = await client.from('sessions').select('id').eq('name', 'F3').limit(1);
  if (error) throw new Error(`seed-staging: could not check for existing domain data (${error.message})`);
  return (data?.length ?? 0) > 0;
}

/** Create an auth account per persona (idempotent) + assign roles/scope, mirroring
 *  supabase/seed/seed.sql's account layer via the Auth Admin API + service-role table writes.
 *  Runs after applyDomainData (it needs the loaded classes/session/student/family).
 *  First real run is watched at the #65 verification walk. */
export async function provisionAccounts(client, config) {
  const plan = buildProvisioningPlan(config.emailBase);
  const studentEmail = plan.find((p) => p.tag === 'student').email;
  const scope = await resolveScopeIds(client, studentEmail);

  for (const p of plan) {
    const user = await ensureUser(client, p.email);

    // Student login owns a student row (students.user_id is 1:1). Idempotent: skip if this login
    // already owns one (resolveScopeIds reused it, so scope.studentId is already theirs).
    if (p.tag === 'student') {
      const { data: owned, error: oe } = await client.from('students').select('id').eq('user_id', user.id).limit(1);
      if (oe) throw new Error(`seed-staging: checking student link for ${p.email}: ${oe.message}`);
      if (!owned?.length) {
        const { error } = await client.from('students').update({ user_id: user.id }).eq('id', scope.studentId);
        if (error) throw new Error(`seed-staging: linking student ${p.email}: ${error.message}`);
      }
    }
    // Parent/guardian (incl. multirole) is a family_member. Idempotent: skip if already a member.
    if (p.tag === 'parent' || p.tag === 'multirole') {
      const { data: mem, error: me } = await client
        .from('family_members').select('id').eq('family_id', scope.familyId).eq('user_id', user.id).limit(1);
      if (me) throw new Error(`seed-staging: checking guardian link for ${p.email}: ${me.message}`);
      if (!mem?.length) {
        const { error } = await client
          .from('family_members').insert({ family_id: scope.familyId, user_id: user.id, relationship: 'guardian' });
        if (error) throw new Error(`seed-staging: linking guardian ${p.email}: ${error.message}`);
      }
    }

    // Roles via the insert_user_role_grant RPC — it does `on conflict (…coalesce(scope_id)…) do
    // nothing`, matching user_roles' only unique index (an expression PostgREST's .upsert can't
    // target), so re-runs are idempotent. is_active=false; the auth hook auto-activates on sign-in.
    const rows = buildUserRoleRows(p.roles, scope).map((r) => ({ ...r, user_id: user.id }));
    for (const r of rows) {
      const { error: re } = await client.rpc('insert_user_role_grant', {
        p_user_id: r.user_id,
        p_role: r.role,
        p_scope_type: r.scope_type,
        p_scope_id: r.scope_id,
        p_is_active: false,
      });
      if (re) throw new Error(`seed-staging: assigning ${r.role} to ${p.email}: ${re.message}`);
    }

    console.log(`  provisioned ${p.tag.padEnd(15)} ${p.email} (${rows.length} role${rows.length > 1 ? 's' : ''})`);
  }
}

/** --reset: wipe the synthetic data + every provisioned persona account (main then reloads +
 *  reprovisions). Order matters: TRUNCATE first, THEN delete users.
 *
 *  Truncate CASCADE on the domain tables removes the content that references auth.users with
 *  ON DELETE RESTRICT (class_updates.posted_by, comments.author_user_id/target_parent_id) plus
 *  audit_log (via target_student_id), comments and consents — so the user deletes below aren't
 *  blocked. (It also leaves conversations/messages with stale scope_ids; fine for synthetic staging.)
 *  Deleting users BEFORE truncating fails the moment any persona has posted — the bug this fixes.
 *
 *  Deletes ALL provisioned persona accounts (emails carry the `+bv-` tag), across every tester —
 *  not just the current base — otherwise other testers keep user_roles with now-dangling scope_ids. */
export async function resetStaging(client, config) {
  console.log('  --reset: truncating synthetic domain tables, then deleting all provisioned accounts …');
  const res = runPsql(config, ['-c', buildDomainTruncateSql()]);
  if (res.error) throw new Error(`seed-staging: --reset psql failed (${res.error.message}). Is psql on PATH?`);
  if (res.status !== 0) throw new Error(`seed-staging: --reset psql exited ${res.status} truncating domain tables.`);

  const users = await listAllUsers(client);
  for (const u of users) {
    // Anchored to our persona tags (not a loose "+bv-" substring) so --reset never sweeps a
    // bystander account whose own sub-address happens to contain "+bv-".
    if (isProvisionedPersonaEmail(u.email)) {
      const { error } = await client.auth.admin.deleteUser(u.id);
      if (error) throw new Error(`seed-staging: --reset could not delete ${u.email}: ${error.message}`);
    }
  }
}

/** Destructive-action guard: --reset wipes ALL synthetic data + every provisioned persona account
 *  on staging. Require an explicit typed confirmation unless --yes was passed (CI/non-interactive).
 *  If there's no TTY to prompt on, refuse rather than silently wiping. */
export async function confirmReset(config) {
  console.log('');
  console.log('  ⚠  --reset will TRUNCATE the synthetic domain tables (CASCADE) and DELETE every');
  console.log(`     provisioned +bv- persona account on staging project ${config.projectRef}.`);
  console.log('     This cannot be undone.');
  if (!process.stdin.isTTY) {
    throw new Error(
      'seed-staging: --reset needs confirmation but stdin is not a TTY — re-run with --yes to confirm non-interactively.',
    );
  }
  const phrase = `reset ${config.projectRef}`;
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = await rl.question(`     Type "${phrase}" to proceed: `);
    if (answer.trim() !== phrase) {
      throw new Error('seed-staging: --reset not confirmed — aborting, nothing was changed.');
    }
  } finally {
    rl.close();
  }
}

export async function main() {
  const config = resolveConfig(process.env); // fail-closed: email base + staging-only URL + key
  const args = parseArgs(process.argv.slice(2));

  const client = createClient(config.url, config.serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Before anything destructive: confirm the dataset we'll reload actually exists on disk, so a
  // --reset can't wipe staging and THEN fail at the reload step — which would leave staging empty.
  if (!existsSync(DOMAIN_SQL_PATH)) {
    throw new Error(
      `seed-staging: dataset ${DOMAIN_SQL_PATH} not found on disk — expected #19's pilot-seed-data ` +
        `file (merged to main). Aborting before any destructive step.`,
    );
  }

  const plan = buildProvisioningPlan(config.emailBase);
  console.log(`seed-staging → ${config.projectRef} (staging), ${plan.length} accounts:`);
  for (const p of plan) console.log(`  - ${p.tag.padEnd(15)} ${p.email}`); // emails only, no secrets

  if (args.reset) {
    if (!args.yes) await confirmReset(config);
    await resetStaging(client, config);
  }

  // Additive by default: load the domain only on a fresh/reset DB. If the data is already there,
  // this is a second/third tester joining — skip the load (which domain.sql would refuse anyway)
  // and just provision this base's accounts alongside the existing ones.
  const domainExists = await domainDataExists(client);
  if (shouldLoadDomain({ reset: args.reset, domainExists })) {
    applyDomainData(config);
  } else {
    console.log('  domain data already present — accounts-only (additive) mode; skipping domain load.');
  }
  await provisionAccounts(client, config);

  console.log('seed-staging: done.');
}

// Run only when invoked as the CLI entry point — NOT on import. This is what lets a test import
// this module (and the exported I/O functions above) without launching a real seed run (PR #108
// round-3 testability thread). The pure decision logic is already unit-tested in _seed-staging.mjs.
const invokedDirectly = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (invokedDirectly) {
  main().catch((err) => {
    console.error(`seed-staging: FAILED — ${err.message}`);
    process.exit(1);
  });
}
