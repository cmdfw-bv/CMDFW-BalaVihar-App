#!/usr/bin/env node
// GOVERN hook (3_ARCHITECTURE §12.1): block secrets/private keys from being written into the repo.
// PreToolUse on Write|Edit|MultiEdit. Best-effort early warning — full coverage is CI/gitleaks (.docs/CI_rules.md §2.1).
// Fail-LOUD on error, fail-open (exit 0) so a session is never bricked. Exit 2 = block.
let raw = "";
process.stdin.on("data", c => (raw += c));
process.stdin.on("end", () => {
  try {
    const d = JSON.parse(raw || "{}");
    const ti = d.tool_input || {};

    // Local dev secrets are allowed in gitignored .env files (e.g. .env, .env.local) —
    // but NOT .env.example, which is a committed template and must stay secret-free.
    const filePath = typeof ti.file_path === "string" ? ti.file_path : "";
    const fileName = filePath.split("/").pop() || "";
    if (/^\.env(\..+)?$/.test(fileName) && fileName !== ".env.example") process.exit(0);

    const parts = [];
    if (typeof ti.content === "string") parts.push(ti.content);
    if (typeof ti.new_string === "string") parts.push(ti.new_string);
    if (Array.isArray(ti.edits)) for (const e of ti.edits) if (e && typeof e.new_string === "string") parts.push(e.new_string);
    const text = parts.join("\n");
    if (!text) process.exit(0);

    const block = what => {
      console.error(
        `BLOCKED: this change looks like it contains ${what}.\n` +
        `WHY THIS MATTERS: a secret committed to the code or Git history can be read by anyone who ever sees the repo — forever, even after it's deleted.\n` +
        `WHAT TO DO: keep secrets only in the server's environment settings (the netlify/functions env). In code, refer to them by name (e.g. process.env.NAME) — never paste the value.`
      );
      process.exit(2);
    };

    const rules = [
      [/-----BEGIN (?:[A-Z ]+ )?PRIVATE KEY-----/, "a private key block"],
      [/AWS_SECRET_ACCESS_KEY\s*[:=]\s*['"]?[A-Za-z0-9/+]{40}/, "an AWS secret access key"],
      [/\bAKIA[0-9A-Z]{16}\b/, "an AWS access key id"],
      [/VAPID_PRIVATE_KEY\s*[:=]\s*['"]?[A-Za-z0-9_-]{20,}/, "a VAPID private key"],
    ];
    for (const [re, what] of rules) if (re.test(text)) block(what);

    // Bare Supabase service-role key: a JWT whose decoded payload has role=service_role.
    // The anon key is ALSO a JWT but is public/allowed, so decode rather than blanket-block on "eyJ".
    for (const m of text.matchAll(/\beyJ[A-Za-z0-9_-]{6,}\.([A-Za-z0-9_-]{6,})\.[A-Za-z0-9_-]{6,}/g)) {
      try {
        const payload = JSON.parse(Buffer.from(m[1], "base64").toString("utf8"));
        if (payload && payload.role === "service_role") block("a Supabase service-role key (a token that bypasses access control)");
      } catch { /* not a decodable JWT — ignore */ }
    }

    process.exit(0);
  } catch (e) {
    console.error(`⚠️  secret-scan could not run (${e && e.message}) — this check was SKIPPED; review the write manually.`);
    process.exit(0); // still fail-open: never brick the session
  }
});
