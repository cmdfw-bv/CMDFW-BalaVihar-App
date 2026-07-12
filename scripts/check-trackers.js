#!/usr/bin/env node
// CI residency-scan job (ADR-0025 item 1): scans package.json + lockfile dependency names
// and source text for tracker hostnames — reusing residency-guard.js's denylist as the
// single source of truth. Fails CLOSED (CI_rules.md §1.1): any read error fails the job.
const { execFileSync } = require("node:child_process");
const { readFileSync } = require("node:fs");
const { findTrackerPackageNames, findTrackerHostnames } = require("./_tracker-checks.js");

let failed = false;

// 1) package.json direct + dev dependencies
const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const declaredDeps = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
for (const name of findTrackerPackageNames(declaredDeps)) {
  console.error(`✗ tracker dependency in package.json: ${name}`);
  failed = true;
}

// 2) package-lock.json — every installed package, including transitive
const lock = JSON.parse(readFileSync("package-lock.json", "utf8"));
const installedNames = Object.keys(lock.packages || {})
  .filter((p) => p.includes("node_modules/"))
  .map((p) => p.slice(p.lastIndexOf("node_modules/") + "node_modules/".length));
for (const name of findTrackerPackageNames([...new Set(installedNames)])) {
  console.error(`✗ tracker dependency in package-lock.json: ${name}`);
  failed = true;
}

// 3) Source text — tracker hostnames actually used (not just mentioned)
// Exclude only the specific files that legitimately contain tracker-domain string
// literals for non-tracking reasons: the denylist module itself (its TRACKER_DOMAINS
// array quotes each hostname, which trips domainUsageRegex()), and any file under a
// __tests__/ directory (test fixtures deliberately contain domain-in-URL literals to
// exercise the detection regex). Every other hook/script file stays scanned.
const sourceFiles = execFileSync("git", ["ls-files"], { encoding: "utf8" })
  .trim()
  .split("\n")
  .filter((f) => /\.(ts|tsx|js|jsx|mjs|cjs)$/.test(f))
  .filter((f) => !/__tests__\//.test(f) && f !== ".claude/hooks/_tracker-denylist.js");

for (const file of sourceFiles) {
  let text;
  try {
    text = readFileSync(file, "utf8");
  } catch (e) {
    console.error(`✗ could not read ${file} (${e.message}) — failing closed`);
    failed = true;
    continue;
  }
  const hostname = findTrackerHostnames(text);
  if (hostname) {
    console.error(`✗ tracker hostname "${hostname}" used in ${file}`);
    failed = true;
  }
}

if (failed) {
  console.error("\nresidency-scan: FAILED — see findings above.");
  process.exit(1);
}
console.log("✓ residency-scan (dependencies + source): clean");
