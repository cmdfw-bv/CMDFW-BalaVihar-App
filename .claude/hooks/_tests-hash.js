#!/usr/bin/env node
// Shared helper: a content hash of the source tree /test exercises (app/, features/, lib/,
// netlify/functions/, supabase/migrations, supabase/tests, package.json).
// pr-guard compares this against the hash recorded by /test on a full green run, so a stale
// "tests passed" marker can't wave a PR through code that changed (or broke) since the tests ran.
// Usage as CLI: `node _tests-hash.js [projectDir]` prints the hash (used by /test to write the marker).
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ROOTS = ["app", "features", "lib", "netlify/functions", "supabase/migrations", "supabase/tests"];
const FILES = ["package.json"];

function walk(dir, out) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (e.name === "node_modules" || e.name.startsWith(".")) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, out);
    else out.push(full);
  }
}

function computeHash(proj) {
  const files = [];
  for (const r of ROOTS) walk(path.join(proj, r), files);
  for (const f of FILES) {
    const full = path.join(proj, f);
    if (fs.existsSync(full)) files.push(full);
  }
  files.sort();
  if (!files.length) return "no-source";
  const h = crypto.createHash("sha256");
  for (const f of files) {
    h.update(path.relative(proj, f));
    h.update("\0");
    h.update(fs.readFileSync(f));
  }
  return h.digest("hex");
}

module.exports = { computeHash };

if (require.main === module) {
  const proj = process.argv[2] || process.env.CLAUDE_PROJECT_DIR || process.cwd();
  process.stdout.write(computeHash(proj));
}
