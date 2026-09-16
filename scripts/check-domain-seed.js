#!/usr/bin/env node
// CI guard for ADR-2026-09-14-synthetic-seed-shared-data-per-env-accounts.
//
// supabase/seed/domain.sql is the one seed file designed to run against a cloud project (#65's
// loader), so it must stay account-free: no tests.* fixture calls, no auth.users references.
// Fails the build if either appears in executable SQL (comments are ignored).
//
// Fails CLOSED: an unreadable or empty file fails the job rather than reporting clean.
const { readFileSync } = require('node:fs');
const { findAccountRefs } = require('./_domain-seed-checks.js');

const FILE = 'supabase/seed/domain.sql';

let sql;
try {
  sql = readFileSync(FILE, 'utf8');
} catch (e) {
  console.error(`✗ could not read ${FILE} (${e.message}) — failing closed`);
  process.exit(1);
}
if (!sql.trim()) {
  console.error(`✗ ${FILE} is empty — failing closed`);
  process.exit(1);
}

const findings = findAccountRefs(sql);
if (findings.length > 0) {
  console.error(`✗ ${FILE} must be account-free (no tests.* calls, no auth.users) — ADR-2026-09-14:`);
  for (const f of findings) console.error(`  line ${f.line}: ${f.what} — ${f.text}`);
  process.exit(1);
}
console.log(`✓ ${FILE} is account-free (no tests.* calls, no auth.users reference)`);
