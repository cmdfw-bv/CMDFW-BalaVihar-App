#!/usr/bin/env node
// GOVERN hook (3_ARCHITECTURE §12.1): block secrets/private keys from being written into the repo.
// PreToolUse on Write|Edit|MultiEdit. Fail-open on any error (never brick the session).
// Exit 2 = block (stderr shown to Claude). Exit 0 = allow.
let raw = "";
process.stdin.on("data", c => (raw += c));
process.stdin.on("end", () => {
  try {
    const d = JSON.parse(raw || "{}");
    const ti = d.tool_input || {};
    const parts = [];
    if (typeof ti.content === "string") parts.push(ti.content);
    if (typeof ti.new_string === "string") parts.push(ti.new_string);
    if (Array.isArray(ti.edits)) for (const e of ti.edits) if (e && typeof e.new_string === "string") parts.push(e.new_string);
    const text = parts.join("\n");
    if (!text) process.exit(0);

    const rules = [
      [/-----BEGIN (?:[A-Z ]+ )?PRIVATE KEY-----/, "a PEM private key block"],
      [/AWS_SECRET_ACCESS_KEY\s*[:=]\s*['"]?[A-Za-z0-9/+]{40}/, "an AWS secret access key value"],
      [/(?:SERVICE_ROLE_KEY|service_role)\s*[:=]\s*['"]?eyJ[A-Za-z0-9_-]{10,}/, "a Supabase service-role key value"],
      [/VAPID_PRIVATE_KEY\s*[:=]\s*['"]?[A-Za-z0-9_-]{20,}/, "a VAPID private key value"],
    ];
    for (const [re, what] of rules) {
      if (re.test(text)) {
        console.error(
          `BLOCKED (secret-scan): this write appears to contain ${what}. ` +
          `Secrets must live only in netlify/functions/ env vars, never in the repo (3_ARCHITECTURE §3, §11). ` +
          `Use an env var reference instead.`
        );
        process.exit(2);
      }
    }
    process.exit(0);
  } catch {
    process.exit(0); // fail-open
  }
});
