#!/usr/bin/env node
// CI guard for ADR-2026-09-07-test-fixtures-never-in-migrations (spec AC#4).
//
// Fails the build if any migration reintroduces the pgTAP test-fixture surface — the
// pgtap extension, the `tests` schema, or a `tests.*` helper. Those objects install via
// the seed path (supabase/seed/00_test_fixtures.sql), which `supabase db push` never
// loads, so they never reach a cloud database.
//
// Fails CLOSED (CI_rules.md §1.1): an unreadable directory, an unreadable file, or an
// empty migration set fails the job rather than reporting clean.
const { readdirSync, readFileSync } = require('node:fs');
const { join } = require('node:path');
const { scanMigrations } = require('./_migration-fixture-checks.js');

const DIR = 'supabase/migrations';

let names;
try {
  names = readdirSync(DIR).filter((n) => n.endsWith('.sql')).sort();
} catch (e) {
  console.error(`✗ could not read ${DIR} (${e.message}) — failing closed`);
  process.exit(1);
}

const migrations = [];
for (const name of names) {
  try {
    migrations.push({ name, sql: readFileSync(join(DIR, name), 'utf8') });
  } catch (e) {
    console.error(`✗ could not read ${join(DIR, name)} (${e.message}) — failing closed`);
    process.exit(1);
  }
}

let findings;
try {
  findings = scanMigrations(migrations);
} catch (e) {
  console.error(`✗ ${e.message}`);
  process.exit(1);
}

if (findings.length > 0) {
  for (const f of findings) {
    console.error(`✗ ${f.file}:${f.line} creates ${f.what}`);
    console.error(`    ${f.text}`);
  }
  console.error(
    '\nmigration-fixture guard: FAILED — test-only database objects must not ship in a migration.\n' +
      'Migrations apply to every environment, including production; the pgTAP fixtures include a\n' +
      'SECURITY DEFINER function that fabricates confirmed auth.users rows. Install them from\n' +
      'supabase/seed/00_test_fixtures.sql instead, which only `supabase db reset` loads.\n' +
      'See .docs/adr/2026-09-07-test-fixtures-never-in-migrations.md (Decision 1).'
  );
  process.exit(1);
}

console.log(`✓ migration-fixture guard: clean (${migrations.length} migrations scanned)`);
