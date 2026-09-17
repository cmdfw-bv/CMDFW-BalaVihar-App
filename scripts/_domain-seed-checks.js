// scripts/_domain-seed-checks.js
// Shared pure logic for the domain-seed guard (scripts/check-domain-seed.js).
//
// ADR-2026-09-14-synthetic-seed-shared-data-per-env-accounts: supabase/seed/domain.sql is the one
// seed file DESIGNED to be executed against a cloud project (by #65's loader). Its load-bearing
// invariant is that it stays account-free — NO tests.* fixture calls and NO auth.users reference —
// so it loads cleanly into a fixture-free cloud DB. Like #86's migration guard, this is a CI check
// rather than a convention: the obvious place to add a fixture helper is exactly here, one
// contributor away from silently undoing the ADR (@mehtamaulik-creator, PR #94 review).
//
// Comments are stripped first — domain.sql's own header legitimately *names* both tokens while
// explaining the rule, and that prose must not trip the guard.

function stripComments(sql) {
  return String(sql)
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ''))
    .replace(/--[^\n]*/g, '');
}

const PATTERNS = [
  // `tests.<something>` — the fixture-factory schema qualifier (tests.create_supabase_user, etc.).
  // \btests\b avoids matching `students.` (no "tests" word there anyway).
  { what: 'a tests.* fixture call', re: /\btests\s*\.\s*\w/i },
  // a direct reference to the auth.users table (an account row). `students.user_id` is a column,
  // not `auth.users`, so it is not matched.
  { what: 'an auth.users reference', re: /\bauth\s*\.\s*users\b/i },
];

// Returns [{ line, text, what }] for every account-surface reference in domain.sql's executable SQL.
function findAccountRefs(sql) {
  const findings = [];
  const lines = stripComments(sql).split('\n');
  lines.forEach((text, i) => {
    for (const { what, re } of PATTERNS) {
      if (re.test(text)) findings.push({ line: i + 1, text: text.trim(), what });
    }
  });
  return findings;
}

module.exports = { findAccountRefs, stripComments };
