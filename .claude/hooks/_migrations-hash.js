#!/usr/bin/env node
// Shared helper: a content hash of supabase/migrations/*.sql.
// migration-guard compares this against the hash recorded by /test on a green RLS run, so a stale
// "tests passed" marker can't wave through migrations that changed since the tests ran.
// Usage as CLI: `node _migrations-hash.js [projectDir]` prints the hash (used by /test to write the marker).
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

function computeHash(proj) {
  const dir = path.join(proj, "supabase", "migrations");
  let files;
  try {
    files = fs.readdirSync(dir).filter(f => f.endsWith(".sql")).sort();
  } catch {
    return "no-migrations";
  }
  if (!files.length) return "no-migrations";
  const h = crypto.createHash("sha256");
  for (const f of files) {
    h.update(f);
    h.update("\0");
    h.update(fs.readFileSync(path.join(dir, f)));
  }
  return h.digest("hex");
}

module.exports = { computeHash };

if (require.main === module) {
  const proj = process.argv[2] || process.env.CLAUDE_PROJECT_DIR || process.cwd();
  process.stdout.write(computeHash(proj));
}
