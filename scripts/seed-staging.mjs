#!/usr/bin/env node
// scripts/seed-staging.mjs — thin I/O wrapper over _seed-staging.mjs (pure, unit-tested).
//
// Seeds the cloud STAGING project (cmdfw-bv-staging) with synthetic domain data + sign-in
// accounts so every persona can actually log in (#65 AC#5/#6/#9). The decision logic —
// config gate, prod safety rail, provisioning plan, arg parse — lives in _seed-staging.mjs and
// is covered by scripts/__tests__/seed-staging.test.ts. This file is the I/O that drives it.
//
// Run:  STAGING_SUPABASE_URL=… STAGING_SUPABASE_SERVICE_ROLE_KEY=… \
//       STAGING_SEED_EMAIL_BASE=you@gmail.com  npm run seed:staging        [-- --reset]
//
// Build status (2026-09-22): all steps implemented. The pure decision-logic (config + prod
// rails, provisioning plan, symbolic→concrete scope resolution, the reset truncate SQL) lives in
// _seed-staging.mjs and is unit-tested (37 tests). The I/O bodies below — applyDomainData (psql),
// provisionAccounts (Auth Admin API + service-role table writes) and resetStaging — make real
// cloud calls and so cannot be unit-tested; their FIRST real run is watched at the #65
// verification walk (cloud creds in hand), which may surface adjustments to the live calls.
import { createClient } from '@supabase/supabase-js';
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import {
  resolveConfig,
  parseArgs,
  buildProvisioningPlan,
  buildUserRoleRows,
  buildDomainTruncateSql,
  DOMAIN_SQL_PATH,
} from './_seed-staging.mjs';

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
  const res = spawnSync('psql', [config.dbUrl, '--set', 'ON_ERROR_STOP=1', '-f', DOMAIN_SQL_PATH], {
    stdio: ['ignore', 'inherit', 'inherit'],
  });
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

/** Create-or-reuse an auth user by email (idempotent). createUser fails if the email already
 *  exists, so on that path we find the existing user via listUsers. */
async function ensureUser(client, email) {
  const { data, error } = await client.auth.admin.createUser({ email, email_confirm: true });
  if (!error) return data.user;
  const { data: list, error: listErr } = await client.auth.admin.listUsers({ perPage: 1000 });
  if (listErr) throw listErr;
  const existing = list.users.find((u) => u.email === email);
  if (existing) return existing;
  throw error; // a real failure, not "already registered"
}

/** Resolve the concrete ids the persona scopes need out of the loaded domain data: the F3
 *  session, the pilot class, and one student (+ its family) in that class. */
async function resolveScopeIds(client) {
  const { data: session, error: se } = await client
    .from('sessions').select('id').eq('name', 'F3').single();
  if (se || !session) throw new Error(`seed-staging: could not find the F3 session (${se?.message ?? 'no row'})`);

  const { data: klass, error: ce } = await client
    .from('classes').select('id').eq('session_id', session.id).eq('grade_band', PILOT_CLASS_GRADE_BAND).single();
  if (ce || !klass) throw new Error(`seed-staging: could not find the "${PILOT_CLASS_GRADE_BAND}" class (${ce?.message ?? 'no row'})`);

  const { data: enr, error: ee } = await client
    .from('enrollments').select('students(id, family_id)').eq('class_id', klass.id).limit(1);
  if (ee || !enr?.length) throw new Error(`seed-staging: no student enrolled in the pilot class (${ee?.message ?? 'none'})`);
  const student = enr[0].students;

  return { sessionId: session.id, classId: klass.id, studentId: student.id, familyId: student.family_id };
}

/** Create an auth account per persona (idempotent) + assign roles/scope, mirroring
 *  supabase/seed/seed.sql's account layer via the Auth Admin API + service-role table writes.
 *  Runs after applyDomainData (it needs the loaded classes/session/student/family).
 *  First real run is watched at the #65 verification walk. */
async function provisionAccounts(client, config) {
  const plan = buildProvisioningPlan(config.emailBase);
  const scope = await resolveScopeIds(client);

  for (const p of plan) {
    const user = await ensureUser(client, p.email);

    // Persona-specific data links (mirrors seed.sql): a student login owns a student row; a
    // parent/guardian (incl. the multirole account) is a family_member of a real family.
    if (p.tag === 'student') {
      const { error } = await client.from('students').update({ user_id: user.id }).eq('id', scope.studentId);
      if (error) throw new Error(`seed-staging: linking student ${p.email}: ${error.message}`);
    }
    if (p.tag === 'parent' || p.tag === 'multirole') {
      const { error } = await client
        .from('family_members').insert({ family_id: scope.familyId, user_id: user.id, relationship: 'guardian' });
      if (error && !/duplicate|already exists/i.test(error.message)) {
        throw new Error(`seed-staging: linking guardian ${p.email}: ${error.message}`);
      }
    }

    // Roles: resolve symbolic scope -> concrete scope_id (pure, unit-tested), attach user_id, insert.
    // Plain insert (mirrors supabase/seed/seed.sql; is_active uses its column default) — NOT upsert:
    // user_roles' only unique index is on coalesce(scope_id,…), an expression PostgREST's
    // .upsert(onConflict:) can't target (see 20260711230332_user_roles_grant_identity_idx.sql).
    // Re-seeding is via --reset (deletes the users → cascades user_roles), so duplicates can't accrue:
    // a re-run without --reset fails earlier at applyDomainData's F3 guard, before this line.
    const rows = buildUserRoleRows(p.roles, scope).map((r) => ({ ...r, user_id: user.id }));
    const { error: re } = await client.from('user_roles').insert(rows);
    if (re) throw new Error(`seed-staging: assigning roles to ${p.email}: ${re.message}`);

    console.log(`  provisioned ${p.tag.padEnd(15)} ${p.email} (${rows.length} role${rows.length > 1 ? 's' : ''})`);
  }
}

/** --reset: delete the provisioned auth users + truncate the synthetic domain tables (main then
 *  reloads + reprovisions). Auth users live in auth.users, so they are removed via the Admin API;
 *  the domain tables are truncated via psql (CASCADE clears the account-linked rows). */
async function resetStaging(client, config) {
  console.log('  --reset: deleting provisioned auth users + truncating synthetic domain tables …');
  const plan = buildProvisioningPlan(config.emailBase);
  const emails = new Set(plan.map((p) => p.email));
  const { data: list, error: listErr } = await client.auth.admin.listUsers({ perPage: 1000 });
  if (listErr) throw new Error(`seed-staging: --reset could not list users: ${listErr.message}`);
  for (const u of list.users) {
    if (emails.has(u.email)) {
      const { error } = await client.auth.admin.deleteUser(u.id);
      if (error) throw new Error(`seed-staging: --reset could not delete ${u.email}: ${error.message}`);
    }
  }
  const res = spawnSync('psql', [config.dbUrl, '--set', 'ON_ERROR_STOP=1', '-c', buildDomainTruncateSql()], {
    stdio: ['ignore', 'inherit', 'inherit'],
  });
  if (res.error) throw new Error(`seed-staging: --reset psql failed (${res.error.message}). Is psql on PATH?`);
  if (res.status !== 0) throw new Error(`seed-staging: --reset psql exited ${res.status} truncating domain tables.`);
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
  applyDomainData(config);
  await provisionAccounts(client, config);

  console.log('seed-staging: done.');
}

main().catch((err) => {
  console.error(`seed-staging: FAILED — ${err.message}`);
  process.exit(1);
});
