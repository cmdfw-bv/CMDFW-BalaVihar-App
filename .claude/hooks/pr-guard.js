#!/usr/bin/env node
// GOVERN hook (3_ARCHITECTURE §12.1, §12.3): gate opening a PR (`gh pr create`) behind a green /test run.
// PreToolUse on Bash. Tokenized match on `gh ... pr create` (see _gh-pr-create-match.js for why a raw
// regex isn't enough — it both misses `gh --repo x pr create` and false-fires on commit messages that
// merely mention the phrase).
// A PR is blocked unless .claude/.tests-passed holds the CURRENT source-tree content-hash, which /test
// writes on a full green run (unit/integration + RLS) — so a stale "tests passed" marker can't wave a
// PR through code that changed (or broke) since the tests ran.
// Fail-LOUD on error, but fail-open (exit 0) so a session is never bricked. Exit 2 = block.
const fs = require("fs");
const path = require("path");
const { computeHash } = require("./_tests-hash.js");
const { isGhPrCreate } = require("./_gh-pr-create-match.js");
let raw = "";
process.stdin.on("data", c => (raw += c));
process.stdin.on("end", () => {
  try {
    const d = JSON.parse(raw || "{}");
    const cmd = (d.tool_input && d.tool_input.command) || "";

    if (!isGhPrCreate(cmd)) process.exit(0); // not opening a PR — never gated

    const proj = d.cwd || process.env.CLAUDE_PROJECT_DIR || process.cwd();
    let recorded = null;
    try { recorded = fs.readFileSync(path.join(proj, ".claude", ".tests-passed"), "utf8").trim(); } catch {}
    const current = computeHash(proj);
    if (recorded && recorded === current) process.exit(0); // full suite passed for exactly this source tree

    const why = !recorded
      ? "there is no record that the test suite has passed."
      : "the source tree changed since the tests last passed.";
    console.error(
      "BLOCKED: not opening a PR because " + why + "\n" +
      "WHY THIS MATTERS: Test-Driven Development is non-negotiable here (§12.1) — a PR should only exist once its feature is proven, not while it's still red.\n" +
      "WHAT TO DO: run /test. If it fails, log each failure as a GitHub issue (`gh issue create --label bug ...`), fix it with superpowers:systematic-debugging, " +
      "and re-run /test until green — it then records this exact source tree as tested — then try opening the PR again."
    );
    process.exit(2);
  } catch (e) {
    console.error(`⚠️  pr-guard could not run (${e && e.message}) — the pre-PR test check was SKIPPED; verify /test passed before opening the PR.`);
    process.exit(0); // still fail-open: never brick the session
  }
});
