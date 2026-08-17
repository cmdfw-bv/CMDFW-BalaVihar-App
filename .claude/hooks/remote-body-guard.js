#!/usr/bin/env node
// GOVERN hook (3_ARCHITECTURE §12.1): never overwrite existing remote content with the text of a
// failed fetch.
//
// PreToolUse on Bash. The read-modify-write round trip used to update an issue or PR body — fetch
// the body to a file, edit the file, push it back — destroys the remote body when the READ fails.
// `gh` writes its error to the file, the edit happily pushes it, and the original text is gone with
// no error anywhere in the chain.
//
// WHAT THIS DOES AND DOES NOT COVER. PreToolUse fires before the command runs, so the guard can only
// judge bytes already on disk. That covers the shape which actually caused the incident: fetch and
// edit issued as SEPARATE tool calls, with the error text sitting in the file by the time the write
// is proposed. It cannot cover a single compound command that redirects into the body file itself
// (`gh issue view ... > f && gh issue edit ... --body-file f`) — the file it would inspect is not
// the file that will be pushed — so that shape is skipped rather than judged on stale bytes.
//
// Observed 2026-08-17 against issue #9 during a GitHub 503 window. The write did not land only
// because the API was still down when it ran; had the outage ended one second earlier it would have
// replaced a maintainer's issue body with "No server is currently available to service your request".
//
// The general shape is the one this repo keeps getting caught by: a step failed, produced output that
// looked like success to the next step, and nothing in between checked. Same family as `npm run lint`
// exiting 0 having linted nothing (#69). Tracked as a class in #72.
//
// Fail-LOUD on error, but fail-open (exit 0) so a session is never bricked. Exit 2 = block.
const fs = require("fs");
const path = require("path");
const { remoteBodyWrites, looksLikeApiError } = require("./_remote-body-write-match.js");

// Does this command redirect into `file` before the write? `>` and `>>` only — the shapes that make
// the on-disk bytes at hook time irrelevant.
function writesToFileEarlier(cmd, file) {
  const esc = file.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(">>?\\s*" + esc + "(\\s|$)").test(cmd);
}

let raw = "";
process.stdin.on("data", c => (raw += c));
process.stdin.on("end", () => {
  try {
    const d = JSON.parse(raw || "{}");
    const cmd = (d.tool_input && d.tool_input.command) || "";

    const files = remoteBodyWrites(cmd);
    if (files.length === 0) process.exit(0); // not replacing remote content — never gated

    const proj = d.cwd || process.env.CLAUDE_PROJECT_DIR || process.cwd();
    const bad = [];
    for (const f of files) {
      // PreToolUse fires BEFORE the command runs. If this same command writes the body file first
      // (`gh issue view ... > f && gh issue edit ... --body-file f`), whatever is on disk now is not
      // what will be pushed — judging it would reject a correct, atomic round trip on stale or
      // absent bytes. Skip; that shape fails at runtime instead if the fetch dies.
      if (writesToFileEarlier(cmd, f)) continue;

      const abs = path.isAbsolute(f) ? f : path.join(proj, f);
      let text;
      try {
        text = fs.readFileSync(abs, "utf8");
      } catch {
        // Unreadable or missing: gh cannot push it either, so nothing is destroyed and blocking only
        // produces a confusing message. Also covers unexpanded `$VAR` and `~`-relative paths, which
        // this hook has no way to resolve.
        continue;
      }
      if (looksLikeApiError(text)) {
        const why = !text.trim()
          ? "it is empty"
          : "its contents look like an API error, not a body";
        bad.push([f, why + " — first line: " + (text.trim().split("\n")[0] || "").slice(0, 120)]);
      }
    }
    if (bad.length === 0) process.exit(0);

    console.error(
      "BLOCKED: this would overwrite existing remote content with what looks like a failed fetch.\n" +
      bad.map(([f, why]) => `  • ${f} — ${why}`).join("\n") + "\n" +
      "WHY THIS MATTERS: `gh` writes its error text to the output file when a read fails, and the " +
      "following write pushes that text over the real body. The original is unrecoverable and nothing " +
      "in the chain reports an error. This happened here on 2026-08-17 and only missed because the " +
      "second call failed too.\n" +
      "WHAT TO DO: re-run the fetch and confirm it succeeded before writing — check the content, not " +
      "just the exit code. A read-modify-write against a remote body should verify the fetched text " +
      "still looks like the thing you meant to edit (a known heading, a plausible length) before " +
      "pushing it back."
    );
    process.exit(2);
  } catch (e) {
    console.error(
      `⚠️  remote-body-guard could not run (${e && e.message}) — the failed-fetch check was SKIPPED; ` +
      "verify the body file holds real content before overwriting anything remote."
    );
    process.exit(0); // still fail-open: never brick the session
  }
});
