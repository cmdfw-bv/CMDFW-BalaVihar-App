#!/usr/bin/env node
// OBSERVABILITY hook (InstructionsLoaded): record which instruction files load, when, and why.
// Makes path-scoped .claude/rules/ loading VISIBLE so non-technical maintainers can confirm a rule
// actually fired (e.g. supabase-sql.md when a supabase/ file is touched). Observe-only — cannot block.
// Appends one line per load to .claude/.instructions-loaded.log (gitignored). Fail-open & silent.
const fs = require("fs");
const path = require("path");
let raw = "";
process.stdin.on("data", c => (raw += c));
process.stdin.on("end", () => {
  try {
    const d = JSON.parse(raw || "{}");
    const proj = d.cwd || process.env.CLAUDE_PROJECT_DIR || process.cwd();
    const rel = p => (p && p.startsWith(proj) ? p.slice(proj.length + 1) : p) || "";
    const file = rel(d.file_path);
    const reason = d.load_reason || "?";
    const type = d.memory_type || "?";
    const globs = Array.isArray(d.globs) && d.globs.length ? ` globs=[${d.globs.join(", ")}]` : "";
    const trig = d.trigger_file_path ? ` trigger=${rel(d.trigger_file_path)}` : "";
    const line = `${new Date().toISOString()}  ${reason.padEnd(16)} ${type.padEnd(8)} ${file}${globs}${trig}\n`;
    fs.appendFileSync(path.join(proj, ".claude", ".instructions-loaded.log"), line);
  } catch {
    // observe-only: never disrupt the session
  }
  process.exit(0);
});
