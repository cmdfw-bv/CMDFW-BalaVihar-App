#!/usr/bin/env node
// GOVERN hook (3_ARCHITECTURE §12.1, §6.3): block PROD Supabase migration pushes unless RLS tests passed.
// PreToolUse on Bash. Fail-open. Exit 2 = block.
// Marker file .claude/.rls-tests-passed is written by /test on a green RLS run (and should be gitignored).
const fs = require("fs");
const path = require("path");
let raw = "";
process.stdin.on("data", c => (raw += c));
process.stdin.on("end", () => {
  try {
    const d = JSON.parse(raw || "{}");
    const cmd = (d.tool_input && d.tool_input.command) || "";
    const isMigrationPush = /supabase\s+(db\s+push|migration\s+up)/.test(cmd);
    const targetsProd = /prod/i.test(cmd) || /\$SUPABASE_PROD/i.test(cmd);
    if (!isMigrationPush || !targetsProd) process.exit(0);

    const proj = d.cwd || process.env.CLAUDE_PROJECT_DIR || process.cwd();
    const marker = path.join(proj, ".claude", ".rls-tests-passed");
    if (fs.existsSync(marker)) process.exit(0);

    console.error(
      "BLOCKED (migration-guard): production migration requires a passing RLS test suite first. " +
      "Run /test (incl. /rls-audit) — it writes .claude/.rls-tests-passed on green — then retry (3_ARCHITECTURE §6.3, §11.3)."
    );
    process.exit(2);
  } catch {
    process.exit(0); // fail-open
  }
});
