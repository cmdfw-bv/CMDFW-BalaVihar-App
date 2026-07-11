#!/usr/bin/env node
// Shared helper: does a Bash command string invoke `gh ... pr create`?
// See _shell-command-match.js for why this is tokenized rather than a raw regex.
const { findMatchingInvocation } = require("./_shell-command-match.js");

function isGhPrCreate(cmd) {
  return !!findMatchingInvocation(cmd, new Set(["gh"]), ["pr", "create"]);
}

module.exports = { isGhPrCreate };

if (require.main === module) {
  const cmd = process.argv.slice(2).join(" ");
  process.stdout.write(String(isGhPrCreate(cmd)));
}
