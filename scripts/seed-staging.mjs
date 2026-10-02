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
// Build status (2026-09-28): verified live against cloud staging (2026-09-25 walk) — domain load
// + all 7 personas provisioned, personas sign in. Pure decision-logic (config + prod rails,
// provisioning plan, symbolic→concrete scope resolution, reset truncate SQL, additive-mode
// decision) lives in _seed-staging.mjs and is unit-tested (40 tests). The I/O bodies below —
// applyDomainData (psql), provisionAccounts (Auth Admin API + service-role writes) and
// resetStaging — make real cloud calls and can't be unit-tested.
//
// Modes: plain run on a fresh DB loads domain + accounts; plain run when the domain already
// exists is ADDITIVE (accounts-only) — provisions another tester's accounts on their email base
// without wiping (each tester's student persona claims a distinct unlinked pilot-class student);
// --reset wipes everything and reloads.
import { createClient } from '@supabase/supabase-js';
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import {
  resolveConfig,
  parseArgs,
  buildProvisioningPlan,
  buildUserRoleRows,
  buildDomainTruncateSql,
  shouldLoadDomain,
  splitDbUrlSecret,
  DOMAIN_SQL_PATH,
} from './_seed-staging.mjs';

// Run psql against the staging DB with the password supplied via PGPASSWORD (env), never on argv
// (where `ps` would expose it). `safeUrl` carries no password; libpq falls back to PGPASSWORD.
function runPsql(config, psqlArgs) {
  const { safeUrl, password } = splitDbUrlSecret(config.dbUrl);
  return spawnSync('psql', [safeUrl, '--set', 'ON_ERROR_STOP=1', ...psqlArgs], {
    stdio: ['ignore', 'inherit', 'inherit'],
    env: { ...process.env, PGPASSWORD: password },
  });
}

// The F3 class every student-login persona attaches to (the pilot class with student logins +
// content, mirroring supabase/seed/seed.sql). Kept as a named constant, not scattered literals.
const PILOT_CLASS_GRADE_BAND = '7, 8, 9';

/** Apply #19's synthetic domain dataset (center/session/classes/families/students/enrollments)
 *  by running the same .sql file through psql — supabase-js cannot execute a raw multi-statement
 *  file. Matches the repo's cloud-SQL pattern (supabase/checks/cloud_fixture_absence.sql).
 *  ON_ERROR_STOP=1 so any failure is a non-zero exit, not a printed-and-ignored error. */
function applyDomainData(config) {
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
async function findUserByEmail(client, email) {
  const { data, error } = await client.auth.admin.listUsers({ perPage: 1000 });
  if (error) throw new Error(`seed-staging: listing users failed (${error.message})`);
  return data.users.find((u) => u.email === email) ?? null;
}

/** Create-or-reuse an auth user by email (idempotent). createUser fails if the email already
 *  exists, so on that path we find the existing user. */
async function ensureUser(client, email) {
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
 *  we claim a fresh UNLINKED student (students.user_id is 1:1, so each tester must take a different
 *  one — the pilot class has 9, ample). Ordered by (first_name, id) for a stable, reproducible pick. */
async function resolveScopeIds(client, studentEmail) {
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

  // First run: claim an unlinked student enrolled in the pilot class.
  const { data: students, error: ee } = await client
    .from('students')
    .select('id, family_id, enrollments!inner(class_id)')
    .eq('enrollments.class_id', klass.id)
    .is('user_id', null)
    .order('first_name')
    .order('id')
    .limit(1);
  if (ee) throw new Error(`seed-staging: querying an unlinked pilot-class student failed (${ee.message})`);
  if (!students?.length) {
    throw new Error(
      `seed-staging: no unlinked student left in the "${PILOT_CLASS_GRADE_BAND}" class — every one is already ` +
        `claimed by a tester's student persona. Run with --reset to start clean, or add more students to the seed.`,
    );
  }
  const student = students[0];

  return { sessionId: session.id, classId: klass.id, studentId: student.id, familyId: student.family_id };
}

/** True if the synthetic domain data is already loaded (the F3 session exists). Drives additive
 *  (accounts-only) mode for a second/third tester — see shouldLoadDomain. */
async function domainDataExists(client) {
  const { data, error } = await client.from('sessions').select('id').eq('name', 'F3').limit(1);
  if (error) throw new Error(`seed-staging: could not check for existing domain data (${error.message})`);
  return (data?.length ?? 0) > 0;
}

/** Create an auth account per persona (idempotent) + assign roles/scope, mirroring
 *  supabase/seed/seed.sql's account layer via the Auth Admin API + service-role table writes.
 *  Runs after applyDomainData (it needs the loaded classes/session/student/family).
 *  First real run is watched at the #65 verification walk. */
async function provisionAccounts(client, config) {
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
async function resetStaging(client, config) {
  console.log('  --reset: truncating synthetic domain tables, then deleting all provisioned accounts …');
  const res = runPsql(config, ['-c', buildDomainTruncateSql()]);
  if (res.error) throw new Error(`seed-staging: --reset psql failed (${res.error.message}). Is psql on PATH?`);
  if (res.status !== 0) throw new Error(`seed-staging: --reset psql exited ${res.status} truncating domain tables.`);

  const { data: list, error: listErr } = await client.auth.admin.listUsers({ perPage: 1000 });
  if (listErr) throw new Error(`seed-staging: --reset could not list users: ${listErr.message}`);
  for (const u of list.users) {
    if (u.email && u.email.includes('+bv-')) {
      const { error } = await client.auth.admin.deleteUser(u.id);
      if (error) throw new Error(`seed-staging: --reset could not delete ${u.email}: ${error.message}`);
    }
  }
}

async function main() {
  const config = resolveConfig(process.env); // fail-closed: email base + staging-only URL + key
  const args = parseArgs(process.argv.slice(2));

  const client = createClient(config.url, config.serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const plan = buildProvisioningPlan(config.emailBase);
  console.log(`seed-staging → ${config.projectRef} (staging), ${plan.length} accounts:`);
  for (const p of plan) console.log(`  - ${p.tag.padEnd(15)} ${p.email}`); // emails only, no secrets

  if (args.reset) await resetStaging(client, config);

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

main().catch((err) => {
  console.error(`seed-staging: FAILED — ${err.message}`);
  process.exit(1);
});
