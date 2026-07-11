#!/usr/bin/env node
// GOVERN hook (3_ARCHITECTURE §6.3, §11.3): gate REMOTE Supabase migration pushes behind passing RLS tests.
// PreToolUse on Bash. Decision is STRUCTURAL, not string-matching on "prod" — see
// _migration-command-match.js for the push/migration-up/--local rules and _shell-command-match.js
// for why matching is tokenized per invocation rather than a raw regex over the whole command string.
// A remote push is blocked unless .claude/.rls-tests-passed holds the CURRENT migrations content-hash,
// which /test writes on a green RLS run (so a stale marker can't pass migrations that changed since).
// Fail-LOUD on error, but fail-open (exit 0) so a session is never bricked. Exit 2 = block.
const fs = require("fs");
const path = require("path");
const { computeHash } = require("./_migrations-hash.js");
const { isRemoteMigrationPush } = require("./_migration-command-match.js");
let raw = "";
process.stdin.on("data", c => (raw += c));
process.stdin.on("end", () => {
  try {
    const d = JSON.parse(raw || "{}");
    const cmd = (d.tool_input && d.tool_input.command) || "";

    if (!isRemoteMigrationPush(cmd)) process.exit(0); // not a gated remote migration push — never gated

    const proj = d.cwd || process.env.CLAUDE_PROJECT_DIR || process.cwd();
    let recorded = null;
    try { recorded = fs.readFileSync(path.join(proj, ".claude", ".rls-tests-passed"), "utf8").trim(); } catch {}
    const current = computeHash(proj);
    if (recorded && recorded === current) process.exit(0); // RLS suite passed for exactly these migrations

    const why = !recorded
      ? "there is no record that the RLS test suite has passed."
      : "the migrations changed since the RLS tests last passed.";
    console.error(
      "BLOCKED: not pushing migrations to a remote database because " + why + "\n" +
      "WHY THIS MATTERS: a remote push changes who can read real data — including children's records. " +
      "Access control (RLS) has to be proven safe first.\n" +
      "WHAT TO DO: run /test — it runs the RLS suite and, when green, records these exact migrations as tested — then try the push again.\n" +
      "(Local work is never blocked: use `supabase db reset`, or add --local.)"
    );
    process.exit(2);
  } catch (e) {
    console.error(`⚠️  migration-guard could not run (${e && e.message}) — the remote-migration check was SKIPPED; verify RLS tests passed before pushing.`);
    process.exit(0); // still fail-open: never brick the session
  }
});
