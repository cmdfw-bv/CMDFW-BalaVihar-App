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
// Build status (2026-09-18): the config/guard/plan layer is complete + unit-tested, and
// applyDomainData is implemented (psql against STAGING_DB_URL, #19's domain.sql now on main).
// provisionAccounts + resetStaging are the remaining data-mutation steps: they query the loaded
// data and call the Auth Admin API, so they are implemented and verified LIVE at the #65
// verification walk with cloud creds in hand (they cannot be unit-tested without a real project).
import { createClient } from '@supabase/supabase-js';
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import {
  resolveConfig,
  parseArgs,
  buildProvisioningPlan,
  DOMAIN_SQL_PATH,
} from './_seed-staging.mjs';

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

/** Create an auth account per persona (idempotent) + assign roles/scope. Needs the scope ids
 *  (class/session) from #19's loaded data, so it runs after applyDomainData. */
async function provisionAccounts(_client, config) {
  const plan = buildProvisioningPlan(config.emailBase);
  // Verified live at the walk: for each entry, auth.admin.createUser({ email, email_confirm:
  // true }) (reuse if the user exists), link students.user_id / family_members, then insert
  // user_roles (+ is_active) — scope_id resolved from the loaded classes/session (mirrors
  // supabase/seed/seed.sql). Implemented here at the walk so each cloud call can be watched.
  throw new Error(
    `seed-staging: provisionAccounts is implemented at the #65 verification walk ` +
      `(live cloud calls); the ${plan.length}-account plan and its scope contract are ready.`,
  );
}

/** --reset: delete the provisioned auth users + truncate the synthetic domain tables, then reseed. */
async function resetStaging(_client, _config) {
  throw new Error('seed-staging: --reset is implemented at the #65 verification walk (live cloud calls).');
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
