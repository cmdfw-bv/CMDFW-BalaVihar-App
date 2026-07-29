// scripts/_secret-checks.js
// Shared pure logic for the secrets-pii CI job (scripts/check-secrets.js). Ports the
// VAPID-regex + JWT-decode-service-role checks from .claude/hooks/secret-scan.js that
// gitleaks can't express (it can't decode a base64 JWT payload to inspect a field) —
// generic secret patterns (private keys, AWS keys) stay gitleaks's job.
function hasVapidPrivateKey(text) {
  return /VAPID_PRIVATE_KEY\s*[:=]\s*['"]?[A-Za-z0-9_-]{20,}/.test(text);
}

function hasServiceRoleKey(text) {
  for (const m of text.matchAll(/\beyJ[A-Za-z0-9_-]{6,}\.([A-Za-z0-9_-]{6,})\.[A-Za-z0-9_-]{6,}/g)) {
    try {
      const payload = JSON.parse(Buffer.from(m[1], "base64").toString("utf8"));
      if (payload && payload.role === "service_role") return true;
    } catch {
      /* not a decodable JWT — ignore */
    }
  }
  return false;
}

const PII_PATH_RE = /\.(csv|xlsx?|vcf)$|(^|\/)enrollment[^/]*\.(csv|xlsx?|vcf)$|(^|\/)roster[^/]*\.(csv|xlsx?|vcf)$|(^|\/)\.env(\.|$)/i;
const ENV_EXAMPLE_RE = /(^|\/)\.env\.example$/;
const SEED_DIR_RE = /^supabase\/seed\//;
const ALLOWLISTED_PII_PATHS = new Set([
  "public/enrollment-template.csv", // synthetic-data-only download template, csv-enrollment-import feature (commit a4a8414) — served statically, cannot move under supabase/seed/ or change extension without breaking the shipped feature. See .docs/specs/system/cicd-pipeline.md Edge Cases.
]);

function isBlockedPiiPath(path) {
  if (ENV_EXAMPLE_RE.test(path)) return false;
  if (SEED_DIR_RE.test(path)) return false;
  if (ALLOWLISTED_PII_PATHS.has(path)) return false;
  return PII_PATH_RE.test(path);
}

module.exports = { hasVapidPrivateKey, hasServiceRoleKey, isBlockedPiiPath };
