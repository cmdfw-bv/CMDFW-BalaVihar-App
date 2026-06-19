#!/usr/bin/env node
// GOVERN hook (3_ARCHITECTURE §12.1): ADVISORY — flag edits to security-critical SQL so review/RLS-tests aren't skipped.
// PreToolUse on Write|Edit|MultiEdit for supabase/ files. Never blocks (exit 0); prints a reminder to Claude.
let raw = "";
process.stdin.on("data", c => (raw += c));
process.stdin.on("end", () => {
  try {
    const d = JSON.parse(raw || "{}");
    const ti = d.tool_input || {};
    const path = ti.file_path || "";
    if (!/supabase\//.test(path) || !/\.sql$/.test(path)) process.exit(0);
    const parts = [];
    if (typeof ti.content === "string") parts.push(ti.content);
    if (typeof ti.new_string === "string") parts.push(ti.new_string);
    if (Array.isArray(ti.edits)) for (const e of ti.edits) if (e && typeof e.new_string === "string") parts.push(e.new_string);
    const text = parts.join("\n").toLowerCase();
    if (/(row level security|enable row level|create policy|alter policy|consents|audit_log|custom_access_token|supabase_auth_admin)/.test(text)) {
      console.log(
        "NOTE (schema-guard): this touches security-critical SQL (RLS / consent / audit / auth-hook). " +
        "Pair it with adversarial pgTAP role×scope tests and get human review before promotion (3_ARCHITECTURE §11.3, §12)."
      );
    }
    process.exit(0); // advisory only
  } catch {
    process.exit(0);
  }
});
