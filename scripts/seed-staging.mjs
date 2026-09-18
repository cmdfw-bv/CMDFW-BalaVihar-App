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
// Build status (2026-09-14): the config/guard/plan layer below is complete and runnable today
// (running with a non-staging URL fails closed — the prod rail). The three data-touching steps
// (applyDomainData / provisionAccounts / resetStaging) are wired but fail closed pending the
// synthetic dataset authored in #19 (pilot-seed-data); they are implemented and verified LIVE
// at the #65 verification walk, when the dataset + cloud creds let each call be watched working.
import { createClient } from '@supabase/supabase-js';
import { existsSync } from 'node:fs';
import { resolveConfig, parseArgs, buildProvisioningPlan } from './_seed-staging.mjs';

// #19 (pilot-seed-data) authors the synthetic dataset as a reusable SQL file; this loader
// applies it. Path is a placeholder until #19 fixes the location.
const DOMAIN_SQL_PATH = 'supabase/seed/staging/domain.sql';

/** Apply #19's synthetic domain dataset (center/session/classes/families/students/enrollments). */
async function applyDomainData(_client) {
  if (!existsSync(DOMAIN_SQL_PATH)) {
    throw new Error(
      `seed-staging: dataset ${DOMAIN_SQL_PATH} not found — it is authored in #19 ` +
        `(pilot-seed-data). This loader consumes it; run once #19 has landed the file.`,
    );
  }
  // supabase-js cannot execute a raw .sql file; applied via a pg/psql path against the pooler
  // (same connection shape as supabase/checks/cloud_fixture_absence.sql). Implemented + watched
  // live at the verification walk with #19's file in hand.
  throw new Error('seed-staging: applyDomainData is implemented at the #65 walk (needs #19 data).');
}

/** Create an auth account per persona (idempotent) + assign roles/scope. Needs the scope ids
 *  (class/session) from #19's loaded data, so it runs after applyDomainData. */
async function provisionAccounts(_client, config) {
  const plan = buildProvisioningPlan(config.emailBase);
  // Intended, verified live at the walk: for each entry, auth.admin.createUser({ email,
  // email_confirm: true }) (reuse if exists), link students.user_id / family_members, then
  // insert user_roles (+ is_active) — scope_id resolved from #19's loaded classes/session.
  throw new Error(
    `seed-staging: provisionAccounts is implemented at the #65 walk (needs #19 data); ` +
      `plan has ${plan.length} accounts ready.`,
  );
}

/** --reset: delete the provisioned auth users + truncate the synthetic domain tables, then reseed. */
async function resetStaging(_client) {
  throw new Error('seed-staging: --reset is implemented at the #65 walk (needs #19 data).');
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

  if (args.reset) await resetStaging(client);
  await applyDomainData(client);
  await provisionAccounts(client, config);

  console.log('seed-staging: done.');
}

main().catch((err) => {
  console.error(`seed-staging: FAILED — ${err.message}`);
  process.exit(1);
});
