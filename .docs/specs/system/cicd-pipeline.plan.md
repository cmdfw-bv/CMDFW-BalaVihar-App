# System — CI/CD pipeline — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** [cicd-pipeline.md](cicd-pipeline.md) (Design signed off 2026-07-11, incl. ADR-0025 addendum).

**Goal:** Stand up `.github/workflows/ci.yml` as four required, fail-closed GitHub Actions jobs (`app-tests`, `db-and-rls`, `secrets-pii`, `residency-scan`) that independently re-run the app suite, the pgTAP RLS suite, a secret/PII scan, and a residency/tracker-dependency scan on every PR into `main`/`staging` — closing the gap where local `.claude/hooks/` checks only fire inside a Claude Code session.

**Architecture:** One workflow file, four parallel jobs (design decision #1 — named checks, not one monolithic log). Two new CI-only scripts (`scripts/check-secrets.js`, `scripts/check-trackers.js`) each backed by a pure, unit-tested logic module. The residency denylist is extracted out of the existing `residency-guard.js` hook into a shared module so the local hook and CI consume the exact same list (ADR-0025 — no drift). No schema/migrations/RLS/app-UI surface — this is an infra-only UoW.

**Tech Stack:** GitHub Actions (`actions/checkout@v4`, `actions/setup-node@v4`) · `gitleaks` v8.30.1 CLI (raw binary, not the Action wrapper — design decision #2) · Supabase CLI via the repo's pinned `devDependency` (`npx supabase ...`, not `supabase/setup-cli` — see Task 5 note) · Node built-ins only for the new scripts (no new runtime deps) · vitest (already in repo) for the new pure-logic tests.

## Global Constraints

- **Four jobs, independently named** so a red GitHub check states which stage failed without parsing a combined log (spec design decision #1, AC#8).
- **Every job fails CLOSED.** A check that can't run (missing tool, thrown error) must fail the build, never silently pass (`CI_rules.md` §1.1, carried into ADR-0024). Every shell step in `ci.yml` runs under `set -euo pipefail` where it's a multi-line script.
- **No CI secrets of any kind are provisioned** (ADR-0024 consequence, ADR-0025 consequence, spec AC#6). Every job runs against ephemeral/local/repo-committed state only — no repository secrets are referenced anywhere in this plan.
- **No docs-only fast path** — every job runs on every PR regardless of changed paths (spec design decision #3).
- **Reuse `residency-guard.js`'s existing denylist as the single source of truth for `residency-scan`** — do not maintain a second copy (ADR-0025 decision #1, spec design decision "no drift").
- **`secrets-pii` and `db-and-rls` are excluded from branch-protection admin bypass** — security-critical, no one waves them through (spec Design table note; carried to Task 8's handoff).
- **Branch protection + CODEOWNERS real-handle fill-in are one-time human repo-admin steps** — not executed unattended by Claude Code (spec Edge cases, ADR-0024 consequence, ADR-0025 consequence). This repo was originally a personal-account repo (`mehtamaulik-creator/CMDFW-BalaVihar---Pilot-App`, confirmed via `gh repo view`); it has since been transferred to the `cmdfw-bv` org and renamed to `cmdfw-bv/CMDFW-BalaVihar-App` (2026-07-23) — now org-owned, which is what makes gitleaks-action's paid-license gate potentially relevant if we ever switched off the raw CLI (see design decision #2 in `cicd-pipeline.md`), though that's still why the CLI (not the Action) was chosen.
- **CI does not auto-file GitHub issues on failure** (spec design decision #4) — a maintainer or the next Claude Code session reads the named failing job and follows `/test`'s existing issue-filing convention.
- **Out of scope, do NOT build here:** cloud Supabase A/B provisioning, `/deploy-staging`/`/promote` mechanics, native (EAS) build CI, Sentry wiring, the pgTAP "coverage floor" heuristic (ADR-0025 consequence — explicitly rejected, false-positive risk).

**Shared seam (§12.6):** none. This UoW touches no `supabase/migrations/**` and produces no schema — it is a single, non-parallelized infra UoW entirely on its own branch, `ssrinivas90/issue-8-cicd-pipeline` (already checked out, forked correctly from `origin/main`). Tasks below are sequential, not parallel-worktree candidates — each task's script is small and the workflow YAML (Task 5) depends on every prior task's file existing.

---

### Task 1: Extract the shared tracker denylist + refactor `residency-guard.js` to consume it

**Files:**
- Create: `.claude/hooks/_tracker-denylist.js`
- Create: `.claude/hooks/__tests__/tracker-denylist.test.ts`
- Modify: `.claude/hooks/residency-guard.js`

**Interfaces:**
- Produces: `TRACKER_DOMAINS` (array), `TRACKER_PACKAGE_RE` (quoted-text regex), `TRACKER_PACKAGE_NAME_RE` (bare-name regex), `stripComments(text)`, `domainUsageRegex()` — all consumed by Task 2's `scripts/_tracker-checks.js` and by the refactored hook in this task.

- [ ] **Step 1: Write the failing tests**

```ts
// .claude/hooks/__tests__/tracker-denylist.test.ts
import { describe, it, expect } from 'vitest';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { TRACKER_PACKAGE_RE, TRACKER_PACKAGE_NAME_RE, stripComments, domainUsageRegex } = require('../_tracker-denylist.js');

describe('TRACKER_PACKAGE_NAME_RE', () => {
  it('matches known tracker package names', () => {
    expect(TRACKER_PACKAGE_NAME_RE.test('mixpanel-browser')).toBe(true);
    expect(TRACKER_PACKAGE_NAME_RE.test('@amplitude/analytics-browser')).toBe(true);
    expect(TRACKER_PACKAGE_NAME_RE.test('@segment/analytics-next')).toBe(true);
  });

  it('does not match unrelated package names', () => {
    expect(TRACKER_PACKAGE_NAME_RE.test('react-native-unistyles')).toBe(false);
    expect(TRACKER_PACKAGE_NAME_RE.test('@supabase/supabase-js')).toBe(false);
  });
});

describe('TRACKER_PACKAGE_RE (quoted, raw-text form)', () => {
  it('matches a tracker dependency quoted in package.json source', () => {
    expect(TRACKER_PACKAGE_RE.test('"dependencies": { "mixpanel-browser": "^2.0.0" }')).toBe(true);
  });
  it('does not match an unrelated quoted dependency', () => {
    expect(TRACKER_PACKAGE_RE.test('"dependencies": { "expo": "~56.0.12" }')).toBe(false);
  });
});

describe('stripComments', () => {
  it('removes line and block comments', () => {
    const src = 'const a = 1; // mixpanel.com\n/* googletagmanager.com */ const b = 2;';
    const stripped = stripComments(src);
    expect(stripped).not.toContain('mixpanel.com');
    expect(stripped).not.toContain('googletagmanager.com');
    expect(stripped).toContain('const b = 2;');
  });
});

describe('domainUsageRegex', () => {
  it('matches a tracker domain used in a URL string', () => {
    const text = 'fetch("https://www.google-analytics.com/collect")';
    expect(domainUsageRegex().test(text)).toBe(true);
  });
  it('does not match a domain merely mentioned in prose', () => {
    const text = 'We must never call google-analytics.com from this app.';
    expect(domainUsageRegex().test(text)).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
npx vitest run .claude/hooks/__tests__/tracker-denylist.test.ts
```
Expected: FAIL — `Cannot find module '../_tracker-denylist.js'`.

- [ ] **Step 3: Write `_tracker-denylist.js`** (values copied verbatim from the current `residency-guard.js` so behavior doesn't change)

```js
// .claude/hooks/_tracker-denylist.js
// Single source of truth for the residency/tracker denylist (ADR-0025). Consumed by:
//  - .claude/hooks/residency-guard.js (local, advisory, fail-open PreToolUse check)
//  - scripts/check-trackers.js (CI, required, fail-closed residency-scan job)
const TRACKER_DOMAINS = [
  "google-analytics.com", "googletagmanager.com", "connect.facebook.net", "facebook.com/tr",
  "mixpanel.com", "cdn.segment.com", "cdn.segment.io", "api.amplitude.com",
  "static.hotjar.com", "fullstory.com",
];

const TRACKER_PACKAGE_NAMES =
  "react-ga4?|mixpanel-browser|amplitude-js|@amplitude\\/[\\w-]+|@segment\\/[\\w-]+|analytics-node|@fullstory\\/[\\w-]+|@hotjar\\/[\\w-]+";

// Matches a bare, parsed dependency name (e.g. from package.json's parsed JSON, or a
// lockfile package-path's trailing segment) — no surrounding quotes.
const TRACKER_PACKAGE_NAME_RE = new RegExp("^(" + TRACKER_PACKAGE_NAMES + ")$", "i");

// Matches the same names occurring quoted in raw file text (e.g. scanning package.json's
// literal source rather than its parsed form).
const TRACKER_PACKAGE_RE = new RegExp('"(' + TRACKER_PACKAGE_NAMES + ')"', "i");

function stripComments(text) {
  return text.replace(/(?<!:)\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
}

function domainUsageRegex() {
  const dom = TRACKER_DOMAINS.map((s) => s.replace(/[.]/g, "\\.")).join("|");
  // Require the domain inside a quote or right after a URL scheme — i.e. actually used, not named.
  return new RegExp("(?:https?://|['\"`])(?:www\\.)?(" + dom + ")", "i");
}

module.exports = { TRACKER_DOMAINS, TRACKER_PACKAGE_RE, TRACKER_PACKAGE_NAME_RE, stripComments, domainUsageRegex };
```

- [ ] **Step 4: Run to verify it passes**

```bash
npx vitest run .claude/hooks/__tests__/tracker-denylist.test.ts
```
Expected: PASS (10 tests).

- [ ] **Step 5: Refactor `residency-guard.js` to consume the shared module** (delete the inline `pkgs`/`domains`/`dom`/`ctx` definitions; behavior is unchanged, only the source of the lists moves)

Replace the file's top with:
```js
#!/usr/bin/env node
// GOVERN hook (3_ARCHITECTURE §12.1, §3): block ad/marketing/analytics trackers.
// Scans code-file writes (tracker hostnames in real URL/import/script contexts, ignoring comments)
// AND package.json (tracker SDK dependencies). Best-effort early warning — full coverage is CI (.docs/CI_rules.md §2.4).
// Fail-LOUD on error, fail-open (exit 0) so a session is never bricked. Exit 2 = block.
const { TRACKER_PACKAGE_RE, stripComments, domainUsageRegex } = require("./_tracker-denylist.js");

let raw = "";
```
(the rest of the `process.stdin.on(...)` wiring is unchanged)

Then inside the handler, replace:
```js
    // 1) Dependencies: tracker SDK package names in package.json
    if (/(^|\/)package\.json$/.test(path)) {
      const pkgs = /"(react-ga4?|mixpanel-browser|amplitude-js|@amplitude\/[\w-]+|@segment\/[\w-]+|analytics-node|@fullstory\/[\w-]+|@hotjar\/[\w-]+)"/i;
      if (pkgs.test(text)) block("a marketing/analytics tracker dependency");
      process.exit(0);
    }

    // 2) Code files only beyond this point
    if (!/\.(ts|tsx|js|jsx|mjs|cjs)$/.test(path)) process.exit(0);

    // Strip comments so a domain merely mentioned in prose/comments doesn't trip the guard.
    text = text.replace(/(?<!:)\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");

    const domains = [
      "google-analytics.com", "googletagmanager.com", "connect.facebook.net", "facebook.com/tr",
      "mixpanel.com", "cdn.segment.com", "cdn.segment.io", "api.amplitude.com",
      "static.hotjar.com", "fullstory.com",
    ];
    const dom = domains.map(s => s.replace(/[.]/g, "\\.")).join("|");
    // Require the domain inside a quote or right after a URL scheme — i.e. actually used, not named.
    const ctx = new RegExp("(?:https?://|['\"`])(?:www\\.)?(" + dom + ")", "i");
    if (ctx.test(text)) block("a marketing/ad/analytics tracker");
```
with:
```js
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
```

- [ ] **Step 6: Verify the hook still behaves identically (manual smoke — the hook itself has no test file, per existing repo convention of testing only the extracted pure logic)**

```bash
echo '{"tool_input":{"file_path":"app/foo.ts","content":"fetch(\"https://www.google-analytics.com/collect\")"}}' | node .claude/hooks/residency-guard.js; echo "exit=$?"
echo '{"tool_input":{"file_path":"app/foo.ts","content":"const x = 1;"}}' | node .claude/hooks/residency-guard.js; echo "exit=$?"
```
Expected: first prints `BLOCKED: ...` and `exit=2`; second prints nothing and `exit=0`.

- [ ] **Step 7: Full suite + commit**

```bash
npm test
git add .claude/hooks/_tracker-denylist.js .claude/hooks/__tests__/tracker-denylist.test.ts .claude/hooks/residency-guard.js
git commit -m "refactor: extract shared tracker denylist (ADR-0025 single source of truth)"
```

---

### Task 2: `scripts/check-trackers.js` — the `residency-scan` CI job

**Files:**
- Modify: `vitest.config.ts` (add `scripts/__tests__` to `include`)
- Create: `scripts/_tracker-checks.js`
- Create: `scripts/__tests__/tracker-checks.test.ts`
- Create: `scripts/check-trackers.js`

**Interfaces:**
- Consumes: `.claude/hooks/_tracker-denylist.js`'s `TRACKER_PACKAGE_NAME_RE`, `stripComments`, `domainUsageRegex` (Task 1).
- Produces: `findTrackerPackageNames(names: string[]): string[]`, `findTrackerHostnames(text: string): string | null` — consumed by `scripts/check-trackers.js`'s CLI below, and by Task 5's workflow step `node scripts/check-trackers.js`.

- [ ] **Step 1: Extend the vitest include glob**

In `vitest.config.ts`, change:
```ts
    include: ['netlify/functions/__tests__/**/*.test.ts', '.claude/hooks/__tests__/**/*.test.ts'],
```
to:
```ts
    include: ['netlify/functions/__tests__/**/*.test.ts', '.claude/hooks/__tests__/**/*.test.ts', 'scripts/__tests__/**/*.test.ts'],
```

- [ ] **Step 2: Write the failing test**

```ts
// scripts/__tests__/tracker-checks.test.ts
import { describe, it, expect } from 'vitest';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { findTrackerPackageNames, findTrackerHostnames } = require('../_tracker-checks.js');

describe('findTrackerPackageNames', () => {
  it('flags known tracker dependency names', () => {
    expect(findTrackerPackageNames(['expo', 'mixpanel-browser', '@supabase/supabase-js'])).toEqual(['mixpanel-browser']);
  });
  it('returns an empty list when nothing matches', () => {
    expect(findTrackerPackageNames(['expo', 'react', 'vitest'])).toEqual([]);
  });
});

describe('findTrackerHostnames', () => {
  it('finds a tracker hostname actually used in source', () => {
    expect(findTrackerHostnames('fetch("https://static.hotjar.com/c.js")')).toBe('static.hotjar.com');
  });
  it('ignores a hostname only mentioned in a comment', () => {
    expect(findTrackerHostnames('// see static.hotjar.com docs\nconst x = 1;')).toBeNull();
  });
  it('returns null when no tracker hostname is present', () => {
    expect(findTrackerHostnames('fetch("https://api.example.com/data")')).toBeNull();
  });
});
```

- [ ] **Step 3: Run to verify it fails**

```bash
npx vitest run scripts/__tests__/tracker-checks.test.ts
```
Expected: FAIL — `Cannot find module '../_tracker-checks.js'`.

- [ ] **Step 4: Write `scripts/_tracker-checks.js`**

```js
// scripts/_tracker-checks.js
// Pure helpers for the residency-scan CI job (scripts/check-trackers.js) — reuses the
// SAME denylist .claude/hooks/residency-guard.js already defines (ADR-0025: single source
// of truth, no drift between the local hook and CI).
const { TRACKER_PACKAGE_NAME_RE, stripComments, domainUsageRegex } = require("../.claude/hooks/_tracker-denylist.js");

function findTrackerPackageNames(names) {
  return names.filter((n) => TRACKER_PACKAGE_NAME_RE.test(n));
}

function findTrackerHostnames(sourceText) {
  const stripped = stripComments(sourceText);
  const match = stripped.match(domainUsageRegex());
  return match ? match[1] : null;
}

module.exports = { findTrackerPackageNames, findTrackerHostnames };
```

- [ ] **Step 5: Run to verify it passes**

```bash
npx vitest run scripts/__tests__/tracker-checks.test.ts
```
Expected: PASS (5 tests).

- [ ] **Step 6: Write the CLI, `scripts/check-trackers.js`**

```js
#!/usr/bin/env node
// CI residency-scan job (ADR-0025 item 1): scans package.json + lockfile dependency names
// and source text for tracker hostnames — reusing residency-guard.js's denylist as the
// single source of truth. Fails CLOSED (CI_rules.md §1.1): any read error fails the job.
const { execFileSync } = require("node:child_process");
const { readFileSync } = require("node:fs");
const { findTrackerPackageNames, findTrackerHostnames } = require("./_tracker-checks.js");

let failed = false;

// 1) package.json direct + dev dependencies
const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const declaredDeps = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
for (const name of findTrackerPackageNames(declaredDeps)) {
  console.error(`✗ tracker dependency in package.json: ${name}`);
  failed = true;
}

// 2) package-lock.json — every installed package, including transitive
const lock = JSON.parse(readFileSync("package-lock.json", "utf8"));
const installedNames = Object.keys(lock.packages || {})
  .filter((p) => p.includes("node_modules/"))
  .map((p) => p.slice(p.lastIndexOf("node_modules/") + "node_modules/".length));
for (const name of findTrackerPackageNames([...new Set(installedNames)])) {
  console.error(`✗ tracker dependency in package-lock.json: ${name}`);
  failed = true;
}

// 3) Source text — tracker hostnames actually used (not just mentioned)
const sourceFiles = execFileSync("git", ["ls-files"], { encoding: "utf8" })
  .trim()
  .split("\n")
  .filter((f) => /\.(ts|tsx|js|jsx|mjs|cjs)$/.test(f));

for (const file of sourceFiles) {
  let text;
  try {
    text = readFileSync(file, "utf8");
  } catch (e) {
    console.error(`✗ could not read ${file} (${e.message}) — failing closed`);
    failed = true;
    continue;
  }
  const hostname = findTrackerHostnames(text);
  if (hostname) {
    console.error(`✗ tracker hostname "${hostname}" used in ${file}`);
    failed = true;
  }
}

if (failed) {
  console.error("\nresidency-scan: FAILED — see findings above.");
  process.exit(1);
}
console.log("✓ residency-scan (dependencies + source): clean");
```

- [ ] **Step 7: Verify against the real repo state**

```bash
node scripts/check-trackers.js; echo "exit=$?"
```
Expected: `✓ residency-scan (dependencies + source): clean` and `exit=0` (the repo has no tracker deps or hostnames today).

- [ ] **Step 8: Commit**

```bash
git add vitest.config.ts scripts/_tracker-checks.js scripts/__tests__/tracker-checks.test.ts scripts/check-trackers.js
git commit -m "feat: residency-scan CI script (ADR-0025 item 1)"
```

---

### Task 3: `scripts/check-secrets.js` — the non-gitleaks half of `secrets-pii`

**Files:**
- Create: `scripts/_secret-checks.js`
- Create: `scripts/__tests__/secret-checks.test.ts`
- Create: `scripts/check-secrets.js`

**Interfaces:**
- Produces: `hasVapidPrivateKey(text: string): boolean`, `hasServiceRoleKey(text: string): boolean`, `isBlockedPiiPath(path: string): boolean` — consumed by `scripts/check-secrets.js`'s CLI below, and by Task 5's workflow step `node scripts/check-secrets.js`.

- [ ] **Step 1: Write the failing test**

```ts
// scripts/__tests__/secret-checks.test.ts
import { describe, it, expect } from 'vitest';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { hasVapidPrivateKey, hasServiceRoleKey, isBlockedPiiPath } = require('../_secret-checks.js');

function fakeJwt(payload: Record<string, unknown>) {
  const b64 = (obj: Record<string, unknown>) => Buffer.from(JSON.stringify(obj)).toString('base64url');
  return `eyJhbGciOiJIUzI1NiJ9.${b64(payload)}.fakesignature`;
}

// Built from short segments (not one contiguous literal) so this fixture doesn't itself
// look like a real committed secret to the repo's own secret-scan hook when this file is saved.
const fakeSecretValue = ['a1B2c3D4e5', 'F6g7H8i9J0', 'k1L2m3'].join('');

describe('hasVapidPrivateKey', () => {
  it('flags a VAPID_PRIVATE_KEY assignment with a real-looking value', () => {
    expect(hasVapidPrivateKey('VAPID_PRIVATE_KEY=' + fakeSecretValue)).toBe(true);
  });
  it('does not flag an empty placeholder', () => {
    expect(hasVapidPrivateKey('VAPID_PRIVATE_KEY=')).toBe(false);
  });
});

describe('hasServiceRoleKey', () => {
  it('flags a JWT whose payload has role=service_role', () => {
    const jwt = fakeJwt({ role: 'service_role', iss: 'supabase' });
    expect(hasServiceRoleKey(`SUPABASE_SERVICE_ROLE_KEY=${jwt}`)).toBe(true);
  });
  it('does not flag an anon-role JWT', () => {
    const jwt = fakeJwt({ role: 'anon', iss: 'supabase' });
    expect(hasServiceRoleKey(`EXPO_PUBLIC_SUPABASE_ANON_KEY=${jwt}`)).toBe(false);
  });
  it('does not flag plain text with no JWT', () => {
    expect(hasServiceRoleKey('just some ordinary text, no tokens here')).toBe(false);
  });
});

describe('isBlockedPiiPath', () => {
  it('blocks a csv/enrollment/roster/vcf file outside supabase/seed', () => {
    expect(isBlockedPiiPath('enrollment-2026.csv')).toBe(true);
    expect(isBlockedPiiPath('data/roster.xlsx')).toBe(true);
    expect(isBlockedPiiPath('contacts.vcf')).toBe(true);
  });
  it('blocks a committed .env file, but not .env.example', () => {
    expect(isBlockedPiiPath('.env')).toBe(true);
    expect(isBlockedPiiPath('.env.local')).toBe(true);
    expect(isBlockedPiiPath('.env.example')).toBe(false);
  });
  it('allows the same filenames under supabase/seed/', () => {
    expect(isBlockedPiiPath('supabase/seed/enrollment-fixture.csv')).toBe(false);
  });
  it('does not block unrelated files', () => {
    expect(isBlockedPiiPath('app/(tabs)/feed.tsx')).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
npx vitest run scripts/__tests__/secret-checks.test.ts
```
Expected: FAIL — `Cannot find module '../_secret-checks.js'`.

- [ ] **Step 3: Write `scripts/_secret-checks.js`** (VAPID + JWT-decode logic ported verbatim from `.claude/hooks/secret-scan.js`; PII-path list from spec AC#4/ADR-0025 §2.1)

```js
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

const PII_PATH_RE = /\.(csv|xlsx?|vcf)$|(^|\/)enrollment[^/]*$|(^|\/)roster[^/]*$|(^|\/)\.env(\.|$)/i;
const ENV_EXAMPLE_RE = /(^|\/)\.env\.example$/;
const SEED_DIR_RE = /^supabase\/seed\//;

function isBlockedPiiPath(path) {
  if (ENV_EXAMPLE_RE.test(path)) return false;
  if (SEED_DIR_RE.test(path)) return false;
  return PII_PATH_RE.test(path);
}

module.exports = { hasVapidPrivateKey, hasServiceRoleKey, isBlockedPiiPath };
```

- [ ] **Step 4: Run to verify it passes**

```bash
npx vitest run scripts/__tests__/secret-checks.test.ts
```
Expected: PASS (9 tests).

- [ ] **Step 5: Write the CLI, `scripts/check-secrets.js`**

```js
#!/usr/bin/env node
// CI secrets-pii job, non-gitleaks half (spec AC#4, ADR-0024): PII/env path denylist +
// VAPID/service-role checks. Fails CLOSED (CI_rules.md §1.1) — any error reading a
// tracked file fails the job, never silently skips it.
const { execFileSync } = require("node:child_process");
const { readFileSync } = require("node:fs");
const { hasVapidPrivateKey, hasServiceRoleKey, isBlockedPiiPath } = require("./_secret-checks.js");

const NON_TEXT_RE = /\.(png|jpg|jpeg|gif|webp|ico|ttf|otf|woff2?|zip|tar|gz|jar|pdf)$/i;

let failed = false;
const files = execFileSync("git", ["ls-files"], { encoding: "utf8" }).trim().split("\n").filter(Boolean);

for (const path of files) {
  if (isBlockedPiiPath(path)) {
    console.error(`✗ blocked PII/env path: ${path}`);
    failed = true;
  }
}

for (const path of files) {
  if (NON_TEXT_RE.test(path)) continue;
  let text;
  try {
    text = readFileSync(path, "utf8");
  } catch (e) {
    console.error(`✗ could not read ${path} (${e.message}) — failing closed`);
    failed = true;
    continue;
  }
  if (hasVapidPrivateKey(text)) {
    console.error(`✗ possible VAPID private key in ${path}`);
    failed = true;
  }
  if (hasServiceRoleKey(text)) {
    console.error(`✗ possible Supabase service-role key in ${path}`);
    failed = true;
  }
}

if (failed) {
  console.error("\nsecrets-pii (VAPID/service-role/PII-path): FAILED — see findings above.");
  process.exit(1);
}
console.log("✓ secrets-pii (VAPID/service-role/PII-path): clean");
```

- [ ] **Step 6: Verify against the real repo state**

```bash
node scripts/check-secrets.js; echo "exit=$?"
```
Expected: `✓ secrets-pii (VAPID/service-role/PII-path): clean` and `exit=0`.

- [ ] **Step 7: Dry-run gitleaks locally** (confirms the other half of `secrets-pii` before it's wired into CI — download once, matches the exact version Task 5 pins)

```bash
curl -sSLO https://github.com/gitleaks/gitleaks/releases/download/v8.30.1/gitleaks_8.30.1_linux_x64.tar.gz   # or _darwin_arm64.tar.gz on macOS
tar -xzf gitleaks_8.30.1_*.tar.gz gitleaks
./gitleaks detect --source . --redact --exit-code 1; echo "exit=$?"
rm -f gitleaks gitleaks_8.30.1_*.tar.gz
```
Expected: `exit=0`, no leaks found. **If it finds something:** confirm it's a false positive (e.g. a synthetic test fixture that merely looks key-shaped), then add a minimal `.gitleaks.toml` with a path- or rule-scoped allowlist entry for that exact finding — do not disable the job or lower `--exit-code`.

- [ ] **Step 8: Commit**

```bash
git add scripts/_secret-checks.js scripts/__tests__/secret-checks.test.ts scripts/check-secrets.js
git commit -m "feat: secrets-pii CI script — VAPID/service-role/PII-path checks (spec AC#4)"
```

---

### Task 4: `CODEOWNERS`

**Files:**
- Create: `.github/CODEOWNERS`

**Interfaces:** none (static file, read by GitHub's branch-protection "Require review from Code Owners" setting — Task 8).

- [ ] **Step 1: Write the file** (paths per ADR-0025 decision #2; placeholder handle per spec's explicit "not this UoW's call")

```
# Security-critical paths require review — no single person (including a maintainer)
# can wave these through (ADR-0025). Enforced via branch protection's "Require review
# from Code Owners" — a one-time human repo-admin step, see cicd-pipeline.plan.md Task 8.
# Replace the placeholder handle below with a real GitHub user or team before this is
# meaningful — inventing a specific handle isn't this UoW's call (ADR-0025 consequence).
/supabase/migrations/ @<maintainer-handle>
/supabase/tests/ @<maintainer-handle>
/netlify/functions/ @<maintainer-handle>
```

- [ ] **Step 2: Verify GitHub recognizes the file's location**

```bash
ls .github/CODEOWNERS
```
Expected: file present at a path GitHub scans (`.github/`, repo root, or `docs/` are the three recognized locations — `.github/` is used here).

- [ ] **Step 3: Commit**

```bash
git add .github/CODEOWNERS
git commit -m "feat: CODEOWNERS for security-critical paths (ADR-0025 item 2, placeholder handle)"
```

---

### Task 5: `.github/workflows/ci.yml` — wire the four required jobs

**Files:**
- Create: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: `scripts/check-trackers.js` (Task 2), `scripts/check-secrets.js` (Task 3), the repo's existing `npm run lint`/`typecheck`/`test` scripts, `npx supabase start`/`db reset`/`test db`, `.nvmrc` (existing, value `22`).

- [ ] **Step 1: Write the workflow**

```yaml
# .github/workflows/ci.yml
name: ci

on:
  pull_request:
    branches: [main, staging]
  push:
    branches: [main, staging]

permissions:
  contents: read

jobs:
  app-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version-file: '.nvmrc'
          cache: npm
      - run: npm ci
      - run: npm run lint
      - run: npm run typecheck
      - run: npm test

  db-and-rls:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version-file: '.nvmrc'
          cache: npm
      - run: npm ci
      - run: npx supabase start
      - run: npx supabase db reset
      - run: npx supabase test db

  secrets-pii:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - name: Install gitleaks v8.30.1 (checksum-verified)
        run: |
          set -euo pipefail
          curl -sSLO https://github.com/gitleaks/gitleaks/releases/download/v8.30.1/gitleaks_8.30.1_linux_x64.tar.gz
          curl -sSLO https://github.com/gitleaks/gitleaks/releases/download/v8.30.1/gitleaks_8.30.1_checksums.txt
          sha256sum --ignore-missing -c gitleaks_8.30.1_checksums.txt
          tar -xzf gitleaks_8.30.1_linux_x64.tar.gz gitleaks
          chmod +x gitleaks
      - name: gitleaks — generic secret patterns (history + working tree)
        run: ./gitleaks detect --source . --redact --exit-code 1
      - uses: actions/setup-node@v4
        with:
          node-version-file: '.nvmrc'
      - name: VAPID / service-role / PII-path scan
        run: node scripts/check-secrets.js

  residency-scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version-file: '.nvmrc'
      - run: node scripts/check-trackers.js
```

> **Deviation from the spec's job table, noted (not architecturally significant):** the spec's design table lists `supabase/setup-cli@v1` for `db-and-rls`. This plan uses `npx supabase ...` instead, resolved by `npm ci` from the repo's already-pinned `devDependency` (`"supabase": "^2.107.0"`). This avoids a second, independently-versioned CLI install and matches the exact `npx supabase test db` convention already established in `core-schema-and-rls.plan.md` and `auth-hook-and-identity.plan.md` — same behavior (`supabase start` → `db reset` → `test db`), one version source instead of two.

- [ ] **Step 2: Validate YAML syntax locally**

```bash
node -e "require('node:fs').readFileSync('.github/workflows/ci.yml','utf8')" && python3 -c "import yaml,sys; yaml.safe_load(open('.github/workflows/ci.yml'))" && echo "valid YAML"
```
Expected: `valid YAML`. (If `python3`/`yaml` isn't available, skip — Task 6/7 exercise the file for real.)

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "feat: .github/workflows/ci.yml — four required CI jobs (ADR-0024 + ADR-0025)"
```

---

### Task 6: Local dry-run of every workflow command end-to-end

**Files:** none (verification only — proves the YAML's commands work before trusting a GitHub-hosted run).

- [ ] **Step 1: `app-tests` job, run verbatim**

```bash
npm ci
npm run lint
npm run typecheck
npm test
```
Expected: all four succeed, `npm test` includes the new `scripts/__tests__/*` and `.claude/hooks/__tests__/tracker-denylist.test.ts` files and reports them passing.

- [ ] **Step 2: `db-and-rls` job, run verbatim** (Docker Desktop must be running)

```bash
npx supabase start
npx supabase db reset
npx supabase test db
```
Expected: containers start, all migrations + seed apply cleanly, the full pgTAP suite (`000`–`999`) reports green.

- [ ] **Step 3: Tear down**

```bash
npx supabase stop
```

- [ ] **Step 4: `secrets-pii` + `residency-scan` jobs** (already verified individually in Tasks 2/3 — rerun together as a final gate)

```bash
node scripts/check-secrets.js; echo "secrets exit=$?"
node scripts/check-trackers.js; echo "residency exit=$?"
```
Expected: both `✓ ... clean` and `exit=0`.

- [ ] **Step 5: No new step needed — commit only if Steps 1–4 surfaced a fix.** If everything passed as written, skip committing (nothing changed).

---

### Task 7: Push the branch, open the PR, watch the workflow run on itself

**Files:** none (this task validates the workflow in the actual GitHub-hosted runner environment, which can differ from local — e.g. `ubuntu-latest`'s pre-installed Docker/tool versions).

- [ ] **Step 1: Push and open the PR**

```bash
git push -u origin ssrinivas90/issue-8-cicd-pipeline
gh pr create --base main --title "feat: CI/CD pipeline — GitHub Actions required status checks (issue #8)" --body "$(cat <<'EOF'
## Summary
- Four required CI jobs: app-tests, db-and-rls, secrets-pii, residency-scan (ADR-0024 + ADR-0025).
- Closes the gap where local .claude/hooks/ checks only fire inside a Claude Code session.

## Test plan
- [ ] All four checks below run and go green on this PR (self-validating — this PR is the first real test of ci.yml).

🤖 Generated with Claude Code
EOF
)"
```
(This is gated by the repo's `pr-guard` hook until `/test`'s local marker is set — expected and correct; this task runs after Task 6's local verification stands in for that gate for this infra-only UoW.)

- [ ] **Step 2: Watch the checks**

```bash
gh pr checks --watch
```
Expected: `app-tests`, `db-and-rls`, `secrets-pii`, `residency-scan` all report `pass`. If any is red, read its log via `gh run view --log-failed`, fix the underlying script/workflow step (not by weakening a check), push a fix commit, and re-run this step.

- [ ] **Step 3: No commit step here** — Steps 1–2 already push/open the PR; any fix found in Step 2 gets its own commit + push before re-checking.

---

### Task 8: One-time human repo-admin handoff — branch protection + CODEOWNERS handle

**Files:**
- Modify: `.github/CODEOWNERS` (replace the placeholder handle — human decides which handle/team)

> **Not executed by Claude Code unattended** (spec Edge cases, ADR-0024/ADR-0025 consequences — no `gh` API scope for repo settings assumed by default, and this changes shared/repo-wide state). The steps below are for **shree.srinivas@outlook.com** (or whichever human has repo-admin) to run, after Task 7's PR has produced at least one run of each check (GitHub's branch-protection UI only lists status checks that have run recently).

- [ ] **Step 1 (human): Fill in the real CODEOWNERS handle**

Edit `.github/CODEOWNERS`, replace every `@<maintainer-handle>` with the real GitHub username/team, commit directly to the PR branch.

- [ ] **Step 2 (human): Configure branch protection** — GitHub UI: repo → Settings → Branches → Add rule, for **both** `main` and `staging`:
  - Require a pull request before merging.
  - Require status checks to pass before merging → select `app-tests`, `db-and-rls`, `secrets-pii`, `residency-scan`.
  - Require branches to be up to date before merging.
  - Require review from Code Owners.
  - Under "Do not allow bypassing the above settings" (or the per-check admin-bypass toggle, depending on GitHub's current UI): ensure `secrets-pii` and `db-and-rls` cannot be bypassed by an administrator.

  Equivalent `gh api` reference (for the human to run, not Claude — repo-admin token required):
  ```bash
  gh api -X PUT repos/cmdfw-bv/CMDFW-BalaVihar-App/branches/main/protection \
    -f required_status_checks='{"strict":true,"contexts":["app-tests","db-and-rls","secrets-pii","residency-scan"]}' \
    -F enforce_admins=false \
    -f required_pull_request_reviews='{"require_code_owner_reviews":true}' \
    -f restrictions=null
  ```
  (Repeat for `staging`. `enforce_admins=false` at the branch level plus GitHub's newer "Rulesets" admin-bypass-per-check UI is where `secrets-pii`/`db-and-rls` specifically get the no-bypass treatment — confirm current GitHub UI naming at handoff time, since this API has evolved.)

- [ ] **Step 3: Verify (Claude Code can run this once the human confirms Steps 1–2 are done)**

```bash
gh api repos/cmdfw-bv/CMDFW-BalaVihar-App/branches/main/protection --jq '.required_status_checks.contexts'
```
Expected: `["app-tests","db-and-rls","secrets-pii","residency-scan"]`.

---

### Task 9: Merge, mark the spec Built

**Files:**
- Modify: `.docs/specs/system/_index.md`
- Modify: `.docs/specs/system/cicd-pipeline.md`

- [ ] **Step 1 (human): Merge the PR** once Task 7's checks are green and Task 8's branch protection is live.

```bash
gh pr merge --squash
```

- [ ] **Step 2: Update the spec's stage line** — in `.docs/specs/system/cicd-pipeline.md`, change:
```
**Stage:** 1 — Design ✓ (this section). `/refine` ✓ → `/architect` ✓ (ADR-0024) → `/design` ✓ (ADR-0025 addendum) → next is `/plan`.
```
to:
```
**Stage:** 1 — Design ✓ (this section). `/refine` ✓ → `/architect` ✓ (ADR-0024) → `/design` ✓ (ADR-0025 addendum) → `/plan` ✓ ([cicd-pipeline.plan.md](cicd-pipeline.plan.md)) → Built. Next is `/test`.
```

- [ ] **Step 3: Update `_index.md`** — change the `cicd-pipeline` row's status column from `Design ✓ — ADR-0024 + ADR-0025 addendum (residency-scan + CODEOWNERS folded in), ready for /plan` to `Built — pending /test`.

- [ ] **Step 4: Commit**

```bash
git add .docs/specs/system/_index.md .docs/specs/system/cicd-pipeline.md
git commit -m "chore: cicd-pipeline built — ready for /test"
```

---

## Self-Review (against the spec)

**Spec coverage:**
- AC#1 trigger (PR to main/staging, opened/synchronize/reopened default + push) → Task 5 ✓
- AC#2 app tests (npm ci/lint/typecheck/test) → Task 5 `app-tests` ✓, dry-run Task 6 ✓
- AC#3 pgTAP via ephemeral local Supabase → Task 5 `db-and-rls` ✓, dry-run Task 6 ✓
- AC#4 secret/PII scan → Task 3 (VAPID/service-role/PII-path) + Task 5 `secrets-pii` gitleaks step ✓
- AC#5 required status check → Task 8 (human branch protection) ✓
- AC#6 no CI secrets → confirmed throughout; no `secrets.*` reference anywhere in `ci.yml` ✓
- AC#7 fast enough → `cache: npm` in setup-node; no extra caching added (spec's "don't over-engineer") ✓
- AC#8 failure legibility → four named jobs (Task 5), no custom summary needed (design decision #1) ✓
- AC#9 converges with, doesn't replace, Promotion → nothing in this plan touches `/deploy-staging`/`/promote` ✓
- ADR-0025 item 1 (residency/tracker-dependency scan, shared denylist) → Tasks 1 + 2 ✓
- ADR-0025 item 2 (CODEOWNERS) → Task 4 + Task 8 ✓
- Edge cases: Docker availability (ubuntu-latest has it, noted Task 5), migration-only PRs (no path filter — Task 5 runs everything always), docs-only (no fast path, Task 5), long-running/flaky pgTAP (`supabase test db` native output, no wrapper), branch-protection lockout (Task 8, explicit human handoff), fork PRs (moot — no secrets in any job), gitleaks install failure (checksum-verified install, Task 5), seed-dir PII exemption (`isBlockedPiiPath`, Task 3 tests), denylist drift (shared module, Task 1) — all covered ✓

**Placeholder scan:** no TBD/TODO/"add error handling" left in any step; the one intentional placeholder (`@<maintainer-handle>` in `CODEOWNERS`) is explicitly spec'd as "not this UoW's call" (ADR-0025) and has its own resolution step (Task 8 Step 1).

**Type/name consistency:** `findTrackerPackageNames`/`findTrackerHostnames` (Task 2) match their only call sites in `check-trackers.js`. `hasVapidPrivateKey`/`hasServiceRoleKey`/`isBlockedPiiPath` (Task 3) match their only call sites in `check-secrets.js`. `TRACKER_PACKAGE_NAME_RE`/`stripComments`/`domainUsageRegex` (Task 1) match their consumers in both `residency-guard.js` and `_tracker-checks.js`. No signature drift found.

**Nothing architecturally significant surfaced** beyond the one noted, non-architectural deviation (Task 5's `npx supabase` vs. `supabase/setup-cli@v1`) — no bounce to `/architect`.

---

## Sign-off
- [ ] **Human sign-off on this plan** (shree.srinivas@outlook.com) → ready for **`/build`** (this plan already sequences `/migration`-equivalent — N/A, no schema — directly into implementation).
