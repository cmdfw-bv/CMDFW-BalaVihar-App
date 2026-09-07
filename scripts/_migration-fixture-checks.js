// scripts/_migration-fixture-checks.js
// Shared pure logic for the migration-fixture guard (scripts/check-migration-fixtures.js).
//
// ADR-2026-09-07-test-fixtures-never-in-migrations, Decision 1: test-only database objects
// install via the seed path, never a migration. Decision 6: that rule is a CI check rather
// than a convention, because the obvious place to put a new fixture helper is exactly where
// the old one was — one contributor away from silently undoing the whole item.
//
// Detection is CREATION-specific. Dropping the fixture surface is the fix, not the offence,
// so `drop schema tests` / `drop extension pgtap` must never be flagged.

// The one migration that legitimately creates the fixture surface: the July 2026 file that
// installed it. It is deliberately NOT edited — it is the record of what cloud staging
// actually ran (ADR Decision 2), and rewriting applied history to make a scan pass would
// trade a truthful migration log for a green check. Removal happens in a later migration.
const HISTORICAL_FIXTURE_MIGRATION = '20260709022932_enable_pgtap_and_test_helpers.sql';
const ALLOWLIST = new Set([HISTORICAL_FIXTURE_MIGRATION]);

// Block comments first, then line comments. Replacing a block comment with a newline per
// removed line keeps reported line numbers honest.
function stripComments(sql) {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ''))
    .replace(/--[^\n]*/g, '');
}

// `tests` as a schema qualifier: `tests.foo`, tolerant of whitespace around the dot.
const CREATE_PATTERNS = [
  { what: 'the pgtap extension', re: /\bcreate\s+extension\s+(?:if\s+not\s+exists\s+)?"?pgtap"?\b/i },
  { what: 'the tests schema', re: /\bcreate\s+schema\s+(?:if\s+not\s+exists\s+)?"?tests"?\s*(?:;|$|authorization\b)/i },
  { what: 'a tests.* helper function', re: /\bcreate\s+(?:or\s+replace\s+)?function\s+"?tests"?\s*\.\s*/i },
];

// Returns [{ line, text, what }] for every fixture-surface CREATION in one file's SQL.
function findFixtureCreations(sql) {
  const findings = [];
  const lines = stripComments(String(sql)).split('\n');
  lines.forEach((text, i) => {
    for (const { what, re } of CREATE_PATTERNS) {
      if (re.test(text)) findings.push({ line: i + 1, text: text.trim(), what });
    }
  });
  return findings;
}

// migrations: [{ name, sql }] — every file under supabase/migrations/.
// Throws on an empty set: zero files means the scan is broken (wrong path, unreadable dir),
// and a guard that reports "clean" when it cannot see anything is worse than no guard.
function scanMigrations(migrations) {
  if (!Array.isArray(migrations) || migrations.length === 0) {
    throw new Error('migration-fixture guard: no migrations found to scan — failing closed');
  }
  const findings = [];
  for (const { name, sql } of migrations) {
    if (ALLOWLIST.has(name)) continue;
    for (const hit of findFixtureCreations(sql)) {
      findings.push({ file: name, ...hit });
    }
  }
  return findings;
}

module.exports = { findFixtureCreations, scanMigrations, HISTORICAL_FIXTURE_MIGRATION };
