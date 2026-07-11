#!/usr/bin/env node
// GOVERN hook (3_ARCHITECTURE §12.1, §3): block ad/marketing/analytics trackers.
// Scans code-file writes (tracker hostnames in real URL/import/script contexts, ignoring comments)
// AND package.json (tracker SDK dependencies). Best-effort early warning — full coverage is CI (.docs/CI_rules.md §2.4).
// Fail-LOUD on error, fail-open (exit 0) so a session is never bricked. Exit 2 = block.
const { TRACKER_PACKAGE_RE, stripComments, domainUsageRegex } = require("./_tracker-denylist.js");

let raw = "";
process.stdin.on("data", c => (raw += c));
process.stdin.on("end", () => {
  try {
    const d = JSON.parse(raw || "{}");
    const ti = d.tool_input || {};
    const path = ti.file_path || "";
    const parts = [];
    if (typeof ti.content === "string") parts.push(ti.content);
    if (typeof ti.new_string === "string") parts.push(ti.new_string);
    if (Array.isArray(ti.edits)) for (const e of ti.edits) if (e && typeof e.new_string === "string") parts.push(e.new_string);
    let text = parts.join("\n");
    if (!text) process.exit(0);

    const block = what => {
      console.error(
        "BLOCKED: this change adds " + what + ".\n" +
        "WHY THIS MATTERS: this app may not use marketing/ad/analytics trackers — they send data (potentially about children) to third parties outside our US-region, DPA-covered services.\n" +
        "WHAT TO DO: remove it. If you truly need product analytics, it must be US-resident, under a DPA, and never used for marketing — get that approved first."
      );
      process.exit(2);
    };

    // 1) Dependencies: tracker SDK package names in package.json
    if (/(^|\/)package\.json$/.test(path)) {
      if (TRACKER_PACKAGE_RE.test(text)) block("a marketing/analytics tracker dependency");
      process.exit(0);
    }

    // 2) Code files only beyond this point
    if (!/\.(ts|tsx|js|jsx|mjs|cjs)$/.test(path)) process.exit(0);

    // Strip comments so a domain merely mentioned in prose/comments doesn't trip the guard.
    text = stripComments(text);
    if (domainUsageRegex().test(text)) block("a marketing/ad/analytics tracker");

    process.exit(0);
  } catch (e) {
    console.error("⚠️  residency-guard could not run (" + (e && e.message) + ") — this check was SKIPPED; review the write manually.");
    process.exit(0); // still fail-open: never brick the session
  }
});
