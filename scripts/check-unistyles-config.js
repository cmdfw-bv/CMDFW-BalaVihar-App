#!/usr/bin/env node
// unistyles-config-scan CI job — guards issue #29's root cause from recurring in any new
// file: a module-scope StyleSheet.create() reachable from a layout's top-level imports
// (e.g. app/(tabs)/_layout.tsx) will crash `expo export --platform web` unless the file
// also imports lib/unistyles directly. See scripts/_unistyles-config-checks.js.
const { execFileSync } = require("node:child_process");
const { readFileSync } = require("node:fs");
const { findMissingUnistylesConfigImport } = require("./_unistyles-config-checks.js");

let failed = false;

const sourceFiles = execFileSync("git", ["ls-files"], { encoding: "utf8" })
  .trim()
  .split("\n")
  .filter((f) => /\.(ts|tsx)$/.test(f))
  .filter((f) => !/__tests__\//.test(f));

for (const file of sourceFiles) {
  let text;
  try {
    text = readFileSync(file, "utf8");
  } catch (e) {
    console.error(`✗ could not read ${file} (${e.message}) — failing closed`);
    failed = true;
    continue;
  }
  if (findMissingUnistylesConfigImport(file, text)) {
    console.error(`✗ ${file}: StyleSheet.create() without a direct "lib/unistyles" import — see issue #29`);
    failed = true;
  }
}

if (failed) {
  console.error("\nunistyles-config-scan: FAILED — see findings above.");
  process.exit(1);
}
console.log("✓ unistyles-config-scan: clean");
