#!/usr/bin/env node
// CI secrets-pii job, non-gitleaks half (spec AC#4, ADR-0024): PII/env path denylist +
// VAPID/service-role checks. Fails CLOSED (CI_rules.md §1.1) — any error reading a
// tracked file fails the job, never silently skips it.
const { execFileSync } = require("node:child_process");
const { readFileSync } = require("node:fs");
const { hasVapidPrivateKey, hasServiceRoleKey, isBlockedPiiPath } = require("./_secret-checks.js");

const NON_TEXT_RE = /\.(png|jpg|jpeg|gif|webp|ico|ttf|otf|woff2?|zip|tar|gz|jar|pdf)$/i;

let failed = false;
const files = execFileSync("git", ["ls-files"], { encoding: "utf8" }).trim().split("\n").filter(Boolean);

for (const path of files) {
  if (isBlockedPiiPath(path)) {
    console.error(`✗ blocked PII/env path: ${path}`);
    failed = true;
  }
}

for (const path of files) {
  if (NON_TEXT_RE.test(path)) continue;
  let text;
  try {
    text = readFileSync(path, "utf8");
  } catch (e) {
    console.error(`✗ could not read ${path} (${e.message}) — failing closed`);
    failed = true;
    continue;
  }
  if (hasVapidPrivateKey(text)) {
    console.error(`✗ possible VAPID private key in ${path}`);
    failed = true;
  }
  if (hasServiceRoleKey(text)) {
    console.error(`✗ possible Supabase service-role key in ${path}`);
    failed = true;
  }
}

if (failed) {
  console.error("\nsecrets-pii (VAPID/service-role/PII-path): FAILED — see findings above.");
  process.exit(1);
}
console.log("✓ secrets-pii (VAPID/service-role/PII-path): clean");
