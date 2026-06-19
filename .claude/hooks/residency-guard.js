#!/usr/bin/env node
// GOVERN hook (3_ARCHITECTURE §12.1, §3): block ad/marketing/analytics trackers in client/function code.
// PreToolUse on Write|Edit|MultiEdit, code files only. Fail-open. Exit 2 = block.
let raw = "";
process.stdin.on("data", c => (raw += c));
process.stdin.on("end", () => {
  try {
    const d = JSON.parse(raw || "{}");
    const ti = d.tool_input || {};
    const path = ti.file_path || "";
    if (!/\.(ts|tsx|js|jsx|mjs|cjs)$/.test(path)) process.exit(0); // code files only
    const parts = [];
    if (typeof ti.content === "string") parts.push(ti.content);
    if (typeof ti.new_string === "string") parts.push(ti.new_string);
    if (Array.isArray(ti.edits)) for (const e of ti.edits) if (e && typeof e.new_string === "string") parts.push(e.new_string);
    const text = parts.join("\n");
    if (!text) process.exit(0);

    const trackers = /(google-analytics\.com|googletagmanager\.com|connect\.facebook\.net|facebook\.com\/tr|mixpanel\.com|cdn\.segment\.(com|io)|api\.amplitude\.com|static\.hotjar\.com|fullstory\.com)/i;
    if (trackers.test(text)) {
      console.error(
        "BLOCKED (residency-guard): ad/marketing/analytics tracker detected. " +
        "No marketing trackers allowed; product analytics only if US-resident + under DPA + no marketing use (3_ARCHITECTURE §3, §10.4)."
      );
      process.exit(2);
    }
    process.exit(0);
  } catch {
    process.exit(0); // fail-open
  }
});
