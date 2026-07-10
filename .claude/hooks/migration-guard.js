#!/usr/bin/env node
// GOVERN hook (3_ARCHITECTURE §6.3, §11.3): gate REMOTE Supabase migration pushes behind passing RLS tests.
// PreToolUse on Bash. Decision is STRUCTURAL, not string-matching on "prod":
//   - `supabase db push`      defaults to the linked REMOTE project  -> gated (unless --local)
//   - `supabase migration up` defaults to LOCAL                      -> gated only with --linked/--db-url
//   - `--local` / `db reset`  -> always allowed (local dev)
// A remote push is blocked unless .claude/.rls-tests-passed holds the CURRENT migrations content-hash,
// which /test writes on a green RLS run (so a stale marker can't pass migrations that changed since).
// NOT a migration command (csv-import, data loads, anything else) -> never gated.
// Fail-LOUD on error, but fail-open (exit 0) so a session is never bricked. Exit 2 = block.
const fs = require("fs");
const path = require("path");
const { computeHash } = require("./_migrations-hash.js");
let raw = "";
process.stdin.on("data", c => (raw += c));
process.stdin.on("end", () => {
  try {
    const d = JSON.parse(raw || "{}");
    const cmd = (d.tool_input && d.tool_input.command) || "";

    const isPush = /(^|[\s;&|])(npx\s+)?supabase\s+db\s+push\b/.test(cmd);
    const isMigUp = /(^|[\s;&|])(npx\s+)?supabase\s+migration\s+up\b/.test(cmd);
    if (!isPush && !isMigUp) process.exit(0); // not a schema-migration command (e.g. csv-import) — never gated

    const hasLocal = /--local\b/.test(cmd);
    const hasRemoteFlag = /--linked\b|--db-url\b/.test(cmd);
    let remote;
    if (hasLocal) remote = false;
    else if (hasRemoteFlag) remote = true;
    else if (isPush) remote = true; // db push defaults to the linked remote project
    else remote = false;            // migration up defaults to local
    if (!remote) process.exit(0);

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
