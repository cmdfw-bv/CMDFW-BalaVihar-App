# Repository & local-stack bootstrap — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** [repository-bootstrap.md](repository-bootstrap.md) (Design signed off 2026-06-19).

**Goal:** Bring a fresh clone to a complete local loop — Expo/RN-Web shell + local Supabase + Netlify dev — with pinned toolchain, intent-level scripts, a `doctor` check, secret hygiene, and parallel-work conventions.

**Architecture:** Single root `package.json` (npm, no workspaces). Expo Router app pruned to the doc 3 §4 skeleton. One orchestrated `npm run dev` starts the local DB (Supabase CLI/Docker) then the Netlify dev runtime (functions + Expo web proxy). All access control / schema / secrets are *future* UoWs — this item only creates their empty, agreed homes and the boundaries (anon-key-only client, secrets confined to `netlify/functions/`).

**Tech Stack:** Expo SDK (latest stable) · React Native + RN-Web · Expo Router · TypeScript · react-native-unistyles 3 · Supabase CLI (devDep) · Netlify CLI (devDep) · Node 22 LTS (recommended).

## Global Constraints

- **Single root `package.json`; npm; no monorepo tool** (doc 3 §4 — one install, one run).
- **All deps pinned, `package-lock.json` committed.** Version-sensitive installs use `npx expo install` / `create-expo-app` / `npx expo install --fix` so versions are chosen by tooling against the Expo SDK — never hand-typed.
- **`engines.node` enforces a floor only** (`>=20.19.0`); `.npmrc` `engine-strict=true`. `.nvmrc`/`.node-version` pin the recommended LTS (`22`); `doctor` **warns** (not blocks) if the running Node ≠ `.nvmrc`. *(Resolves the design's "Node match = hard" to floor-hard + pin-warn, because a maintainer machine already runs Node 26 — a hard upper bound would lock it out.)*
- **Secret hygiene (non-negotiable §12.1#2):** client-exposed env vars use the `EXPO_PUBLIC_` prefix and carry only anon-safe values. Service-role key, VAPID private key, SES creds are documented **without** that prefix, left as empty placeholders, and read only by `netlify/functions/`. `.env*` (except `.env.example`) is git-ignored.
- **The boundary is the directory:** `app/`,`components/`,`features/`,`lib/` = client (anon key only). `netlify/functions/` = the only home for privileged secrets. `supabase/` = DB source of truth.
- **No hardcoded brand visual values.** Unistyles `theme` is a placeholder on the stable `od-design-tokens/v1` taxonomy until Sankalp imports (ADR-0010/0011).
- **Cross-platform:** all scripts are Node (`scripts/*.mjs`) or tool CLIs — no bash-isms (Mac/Windows/Linux maintainers).
- **Out of scope (do NOT build here):** cloud Supabase A/B + per-context env, CI/CD + promotion gates, any schema/RLS/auth-hook/seed *content* or `lib/auth/` session logic, EAS/native config beyond placeholder, real Sankalp tokens, animation stack.

**Resolved deferred mechanics (from the spec's `/plan` notes):**
1. **`dev` teardown:** `dev` does **not** trap exit to stop the detached Docker DB (cross-platform-fragile). `Ctrl-C` stops app+functions; the DB keeps running; `npm run stop` tears it down. `dev` is idempotent (re-running reuses a running DB).
2. **Port conflicts:** `doctor` checks the three default ports (Supabase 54321, Expo 8081, Netlify 8888) and reports which is occupied + by what; it does not auto-reassign. README documents override env vars.

**Branch / worktree (§12.6):** do this on `shree/greenfield-dev` (current) or a dedicated `system/repo-bootstrap` worktree. This is the **foundational seed** — it merges to `main` before parallel feature UoWs begin, so it is *not* itself parallelized. `supabase/migrations/` (created empty here) is the serialized seam thereafter.

---

### Task 1: Scaffold the Expo Router app into the repo + pin the toolchain

**Files:**
- Create (via tooling): `package.json`, `package-lock.json`, `app.json`, `tsconfig.json`, `app/` (default Expo Router tabs scaffold), `babel.config.js` (if emitted), assorted Expo defaults
- Create: `.nvmrc`, `.node-version`, `.npmrc`
- Modify: `package.json` (add `engines`)

**Interfaces:**
- Produces: a working Expo Router app at repo root; `npm` scripts namespace to extend in later tasks; `engines.node` floor.

- [ ] **Step 1: Scaffold into a temp dir** (keeps the existing `.docs/`, `.claude/`, `.git/` untouched)

```bash
npx create-expo-app@latest /tmp/bv-scaffold
```
Expected: a new Expo app with Expo Router + an example tabs layout under `/tmp/bv-scaffold/app`.

- [ ] **Step 2: Merge the scaffold into the repo root** (do not overwrite `.docs/`, `.claude/`, `.git/`, existing `README` if present)

```bash
cd /tmp/bv-scaffold
# copy everything except VCS + node_modules into the repo, without clobbering governance dirs
rsync -a --exclude='.git' --exclude='node_modules' --exclude='.docs' --exclude='.claude' \
  ./ /Users/shree/Documents/claude-code/CMDFW-BalaVihar---Pilot-App/
```
Expected: `app/`, `package.json`, `app.json`, `tsconfig.json` now exist at repo root.

- [ ] **Step 3: Pin Node** — create the version files and add the `engines` floor

`.nvmrc`:
```
22
```
`.node-version`:
```
22
```
`.npmrc`:
```
engine-strict=true
```
Add to `package.json`:
```json
"engines": { "node": ">=20.19.0" }
```

- [ ] **Step 4: Install deterministically**

```bash
cd /Users/shree/Documents/claude-code/CMDFW-BalaVihar---Pilot-App
npm install
```
Expected: clean install, `package-lock.json` written. (Node 26 passes the `>=20.19.0` floor.)

- [ ] **Step 5: Verify the app boots on web**

```bash
npx expo start --web
```
Expected: Metro builds; a browser opens the default Expo Router app. `Ctrl-C` to stop.

- [ ] **Step 6: Sanity-check the Expo install**

```bash
npx expo-doctor
```
Expected: passes, or prints concrete fixes. If it reports Node 26 incompatibility, the README/doctor (Task 6) directs `nvm use` to 22.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "chore: scaffold Expo Router app + pin Node toolchain"
```

---

### Task 2: Prune the scaffold to the doc 3 §4 directory skeleton

**Files:**
- Modify: `app/` → `app/_layout.tsx`, `app/(auth)/_layout.tsx`, `app/(tabs)/_layout.tsx` + blank tab stub screens
- Create (empty, `.gitkeep`): `components/`, `features/`, `lib/auth/`, `lib/push/`, `netlify/functions/`, `supabase/migrations/`, `supabase/seed/`, `supabase/tests/`, `public/`, `design/sankalp/`

**Interfaces:**
- Produces: the canonical tree every later UoW writes into; a routable five-tab shell (Feed · Classes · Attendance · Chat · Dashboard) with blank screens; an empty `(auth)` group.

- [ ] **Step 1: Reshape `app/` to the §4 route groups**

Replace the example tabs with the project's groups. `app/_layout.tsx`:
```tsx
import { Stack } from "expo-router";
import "../lib/unistyles"; // registers Unistyles themes/breakpoints (Task 4)

export default function RootLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(auth)" />
      <Stack.Screen name="(tabs)" />
    </Stack>
  );
}
```

`app/(auth)/_layout.tsx`:
```tsx
import { Stack } from "expo-router";
// Magic-link sign-in + role selection land here in the auth UoW. Empty for now.
export default function AuthLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
```

`app/(tabs)/_layout.tsx`:
```tsx
import { Tabs } from "expo-router";

export default function TabsLayout() {
  return (
    <Tabs>
      <Tabs.Screen name="feed" options={{ title: "Feed" }} />
      <Tabs.Screen name="classes" options={{ title: "Classes" }} />
      <Tabs.Screen name="attendance" options={{ title: "Attendance" }} />
      <Tabs.Screen name="chat" options={{ title: "Chat" }} />
      <Tabs.Screen name="dashboard" options={{ title: "Dashboard" }} />
    </Tabs>
  );
}
```

- [ ] **Step 2: Add one blank stub per tab** — five files under `app/(tabs)/`, each identical in shape. `app/(tabs)/feed.tsx`:
```tsx
import { View, Text } from "react-native";
export default function FeedScreen() {
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
      <Text>Feed — placeholder</Text>
    </View>
  );
}
```
Repeat verbatim for `classes.tsx`, `attendance.tsx`, `chat.tsx`, `dashboard.tsx`, changing only the component name and the label text.

- [ ] **Step 3: Create the empty homes** (so the tree matches §4 and survives git)

```bash
for d in components features lib/auth lib/push netlify/functions supabase/migrations supabase/seed supabase/tests public design/sankalp; do
  mkdir -p "$d" && touch "$d/.gitkeep"
done
```

- [ ] **Step 4: Verify the tree + routable shell**

```bash
ls -d app/'(auth)' app/'(tabs)' components features lib/auth lib/push netlify/functions supabase/migrations supabase/seed supabase/tests public design/sankalp
npx expo start --web
```
Expected: all paths listed; the web app shows five tabs that navigate to the placeholder screens.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: prune app to §4 skeleton + create empty feature homes"
```

---

### Task 3: Secret hygiene — `.gitignore`, `.env.example`, `env:init`

**Files:**
- Modify: `.gitignore`
- Create: `.env.example`, `scripts/env-init.mjs`
- Modify: `package.json` (`scripts.env:init`)

**Interfaces:**
- Produces: `npm run env:init` (copies `.env.example`→`.env` if absent, never overwrites); the env-var contract.

- [ ] **Step 1: Extend `.gitignore`** (append; keep Expo's defaults)
```
# secrets / local env (keep .env.example)
.env
.env.*
!.env.example

# local supabase
supabase/.branches
supabase/.temp

# netlify
.netlify

# misc
*.log
.DS_Store
```

- [ ] **Step 2: Write `.env.example`** (no real secrets — local defaults + placeholders)
```bash
# ── Client (safe to expose; EXPO_PUBLIC_ is bundled into the app) ──
# Local Supabase defaults printed by `npm run db:start`.
EXPO_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
EXPO_PUBLIC_SUPABASE_ANON_KEY=

# ── Server-only (NEVER EXPO_PUBLIC_; read only in netlify/functions) ──
# Fill from `npm run db:start` output for local; real values live in Netlify env per-context.
SUPABASE_SERVICE_ROLE_KEY=
VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
SES_REGION=us-east-2
SES_ACCESS_KEY_ID=
SES_SECRET_ACCESS_KEY=
```

- [ ] **Step 3: Write `scripts/env-init.mjs`**
```js
import { existsSync, copyFileSync } from "node:fs";
const src = ".env.example";
const dest = ".env";
if (!existsSync(src)) { console.error("✗ .env.example missing"); process.exit(1); }
if (existsSync(dest)) { console.log("• .env already exists — leaving it untouched"); process.exit(0); }
copyFileSync(src, dest);
console.log("✓ created .env from .env.example — fill in the blanks");
```

- [ ] **Step 4: Wire the script** — add to `package.json` `scripts`:
```json
"env:init": "node scripts/env-init.mjs"
```

- [ ] **Step 5: Verify** (idempotent + never clobbers)
```bash
rm -f .env && npm run env:init   # expect: "✓ created .env ..."
npm run env:init                 # expect: "• .env already exists ..."
git check-ignore .env            # expect: ".env" (it is ignored)
git check-ignore -v .env.example || echo "tracked-OK"  # expect: tracked-OK (not ignored)
```

- [ ] **Step 6: Commit**
```bash
git add .gitignore .env.example scripts/env-init.mjs package.json
git commit -m "chore: env contract + .gitignore secret hygiene + env:init"
```

---

### Task 4: Unistyles 3 + placeholder theme + `gen:theme`

**Files:**
- Create: `lib/unistyles.ts`, `lib/theme.ts`, `scripts/gen-theme.mjs`
- Modify: `babel.config.js` (Unistyles plugin), `package.json` (`scripts.gen:theme`)

**Interfaces:**
- Consumes: root `_layout.tsx` imports `../lib/unistyles` (Task 2 Step 1).
- Produces: a registered Unistyles theme on the `od-design-tokens/v1` taxonomy with breakpoints 360/768/1024/1440; `npm run gen:theme` regenerates `lib/theme.ts` (placeholder until Sankalp).

- [ ] **Step 1: Install Unistyles 3** (tooling picks SDK-compatible versions)
```bash
npx expo install react-native-unistyles react-native-nitro-modules react-native-edge-to-edge
```
Expected: three deps added to `package.json` + lockfile.

- [ ] **Step 2: Add the Unistyles babel plugin** — in `babel.config.js`, add to `plugins`:
```js
// babel.config.js
module.exports = function (api) {
  api.cache(true);
  return {
    presets: ["babel-preset-expo"],
    plugins: [["react-native-unistyles/plugin", { root: "app" }]],
  };
};
```

- [ ] **Step 3: Write the placeholder `lib/theme.ts`** (stable taxonomy, neutral values — NO brand hex)
```ts
// GENERATED placeholder (od-design-tokens/v1). Real values arrive via `gen:theme`
// once design/sankalp/design-tokens.json is imported (ADR-0010/0011). Do not hand-tune.
export const lightTheme = {
  colors: {
    bg: "#ffffff",
    accent: "#3f51b5",        // indigo — the single primary action (placeholder)
    brand: "#ff9800",         // saffron — identity-only (placeholder)
    status: { present: "#2e7d32", absent: "#c62828", excused: "#f9a825", info: "#0277bd" },
    role: { student: "#5c6bc0", parent: "#26a69a", teacher: "#7e57c2", coordinator: "#ef6c00", admin: "#455a64" },
  },
  space: { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 },
  radius: { sm: 4, md: 8, lg: 16 },
  type: { body: 16, display: 28 },
  motion: { fast: 120, base: 200 },
} as const;

export const breakpoints = { xs: 0, sm: 360, md: 768, lg: 1024, xl: 1440 } as const;
export type AppTheme = typeof lightTheme;
```

- [ ] **Step 4: Write `lib/unistyles.ts`** (registers themes + breakpoints)
```ts
import { StyleSheet } from "react-native-unistyles";
import { lightTheme, breakpoints } from "./theme";

type AppBreakpoints = typeof breakpoints;
type AppThemes = { light: typeof lightTheme };

declare module "react-native-unistyles" {
  export interface UnistylesThemes extends AppThemes {}
  export interface UnistylesBreakpoints extends AppBreakpoints {}
}

StyleSheet.configure({
  themes: { light: lightTheme },
  breakpoints,
  settings: { initialTheme: "light" },
});
```

- [ ] **Step 5: Write `scripts/gen-theme.mjs`** (no-op-with-notice until tokens exist)
```js
import { existsSync } from "node:fs";
const tokens = "design/sankalp/design-tokens.json";
if (!existsSync(tokens)) {
  console.log("• " + tokens + " not present yet — keeping the placeholder lib/theme.ts (ADR-0010).");
  process.exit(0);
}
// When Sankalp lands: read tokens, pre-resolve color-mix(), and emit lib/theme.ts.
console.log("✓ design-tokens.json found — TODO(impl when Sankalp imports): regenerate lib/theme.ts");
```

- [ ] **Step 6: Wire `gen:theme`** — add to `package.json` `scripts`:
```json
"gen:theme": "node scripts/gen-theme.mjs"
```

- [ ] **Step 7: Verify** (theme registers, app still builds, gen:theme reports placeholder)
```bash
npm run gen:theme        # expect: "• design/sankalp/design-tokens.json not present yet ..."
npx tsc --noEmit         # expect: no type errors
npx expo start --web     # expect: app builds with Unistyles registered; tabs still render
```

- [ ] **Step 8: Commit**
```bash
git add lib/unistyles.ts lib/theme.ts scripts/gen-theme.mjs babel.config.js package.json package-lock.json
git commit -m "feat: wire Unistyles 3 + placeholder theme (od-design-tokens/v1) + gen:theme"
```

---

### Task 5: `lib/supabase.ts` — anon-key-only client

**Files:**
- Create: `lib/supabase.ts`
- Modify: `package.json` (add `@supabase/supabase-js`)

**Interfaces:**
- Consumes: `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY` (Task 3).
- Produces: a single exported `supabase` client (anon key only) that every feature UoW imports for data access.

- [ ] **Step 1: Install the client**
```bash
npx expo install @supabase/supabase-js
```

- [ ] **Step 2: Write `lib/supabase.ts`** (anon key only — never service role; §12.1#2, `stack-conventions`)
```ts
import { createClient } from "@supabase/supabase-js";

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  // Fail loud in dev so a missing .env is obvious, not a silent 401 later.
  console.warn("[supabase] EXPO_PUBLIC_SUPABASE_URL / _ANON_KEY missing — run `npm run env:init` and fill .env");
}

// The ONLY Supabase client in client code. Service-role access lives in netlify/functions/ only.
export const supabase = createClient(url ?? "", anonKey ?? "");
```

- [ ] **Step 3: Verify** (typechecks; guard against a service-role leak)
```bash
npx tsc --noEmit                                  # expect: no errors
grep -rn "SERVICE_ROLE" lib app features components 2>/dev/null && echo "LEAK!" || echo "clean"
```
Expected: `clean` (no service-role reference anywhere in client code).

- [ ] **Step 4: Commit**
```bash
git add lib/supabase.ts package.json package-lock.json
git commit -m "feat: anon-key-only Supabase client (lib/supabase.ts)"
```

---

### Task 6: `doctor` — cross-platform prerequisite check

**Files:**
- Create: `scripts/doctor.mjs`
- Modify: `package.json` (`scripts.doctor`)

**Interfaces:**
- Produces: `npm run doctor` — ✓/✗ checklist; **exits non-zero if any hard check fails**. Hard: Node floor, npm, Supabase CLI, Netlify CLI. Hard-for-`dev`: Docker running. Warn: `.nvmrc` match, `.env`, git, port availability.

- [ ] **Step 1: Write `scripts/doctor.mjs`**
```js
import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { createServer } from "node:net";

let hardFail = false;
const ok = (m) => console.log("  ✓ " + m);
const warn = (m) => console.log("  ⚠ " + m);
const bad = (m) => { console.log("  ✗ " + m); hardFail = true; };
const has = (cmd) => { try { execSync(cmd, { stdio: "ignore" }); return true; } catch { return false; } };

console.log("\nBala Vihar — environment doctor\n");

// Node floor
const major = Number(process.versions.node.split(".")[0]);
major >= 20 ? ok(`Node ${process.versions.node} (>= 20.19 floor)`) : bad(`Node ${process.versions.node} too old — need >= 20.19; run "nvm use"`);

// .nvmrc recommended match (warn only)
if (existsSync(".nvmrc")) {
  const want = readFileSync(".nvmrc", "utf8").trim();
  major === Number(want) ? ok(`Node matches .nvmrc (${want})`) : warn(`Node ${major} ≠ recommended ${want} (.nvmrc) — fine to proceed; "nvm use" for the tested version`);
}

has("npm -v") ? ok("npm present") : bad("npm missing");
has("git --version") ? ok("git present") : warn("git missing");

// CLIs (resolved via the project's devDeps → npx)
has("npx --no-install supabase --version") ? ok("Supabase CLI resolvable") : bad('Supabase CLI missing — run "npm install"');
has("npx --no-install netlify --version") ? ok("Netlify CLI resolvable") : bad('Netlify CLI missing — run "npm install"');

// Docker (hard for `dev`, not for app-only `start`)
has("docker info") ? ok("Docker running (local DB available)") : warn('Docker not running — `npm run start` (app-only) works; `npm run dev` needs Docker Desktop');

// .env present
existsSync(".env") ? ok(".env present") : warn('.env missing — run "npm run env:init"');

// Ports (warn if occupied)
const checkPort = (p, who) => new Promise((res) => {
  const s = createServer().once("error", () => { warn(`port ${p} in use (${who}) — stop the other process or override`); res(); })
    .once("listening", () => s.close(() => { ok(`port ${p} free (${who})`); res(); })).listen(p, "127.0.0.1");
});
await checkPort(54321, "Supabase");
await checkPort(8081, "Expo");
await checkPort(8888, "Netlify");

console.log("");
if (hardFail) { console.log("✗ doctor failed — fix the ✗ items above.\n"); process.exit(1); }
console.log("✓ doctor passed.\n");
```

- [ ] **Step 2: Wire `doctor`** — add to `package.json` `scripts`:
```json
"doctor": "node scripts/doctor.mjs"
```

- [ ] **Step 3: Verify**
```bash
npm run doctor; echo "exit=$?"
```
Expected on this machine: ✓ Node/npm/git/CLIs, ⚠ Docker not running, ⚠ `.nvmrc` (Node 26 ≠ 22), ports free → **exit=0** (no hard failures). Hard-fail path only triggers if a CLI or npm is genuinely missing.

- [ ] **Step 4: Commit**
```bash
git add scripts/doctor.mjs package.json
git commit -m "feat: cross-platform environment doctor"
```

---

### Task 7: Local Supabase — `init` + `db:*` scripts

> **Requires Docker Desktop installed and running.** If Docker is absent, this task's verification is deferred until it's installed; the files/scripts are still created and committed.

**Files:**
- Create (via tooling): `supabase/config.toml`
- Modify: `package.json` (`scripts.db:start`,`db:stop`,`db:reset`,`stop`)

**Interfaces:**
- Produces: `npm run db:start|db:stop|db:reset|stop`; a running local Postgres + Studio; the local anon/service keys printed for `.env`.

- [ ] **Step 1: Initialize Supabase locally**
```bash
npx supabase init
```
Expected: `supabase/config.toml` created (alongside the empty `migrations/`,`seed/`,`tests/` from Task 2).

- [ ] **Step 2: Add the scripts** — `package.json` `scripts`:
```json
"db:start": "supabase start",
"db:stop": "supabase stop",
"db:reset": "supabase db reset",
"stop": "supabase stop"
```

- [ ] **Step 3: Verify (Docker required)**
```bash
npm run db:start    # expect: containers boot; prints API URL (http://127.0.0.1:54321) + anon/service keys
```
Copy the printed **anon** key into `.env` `EXPO_PUBLIC_SUPABASE_ANON_KEY` and the **service_role** key into `.env` `SUPABASE_SERVICE_ROLE_KEY`.
```bash
npm run db:reset    # expect: re-applies (currently empty) migrations + seed cleanly
npm run db:stop     # expect: containers stop
```

- [ ] **Step 4: Commit**
```bash
git add supabase/config.toml package.json
git commit -m "feat: local Supabase init + db lifecycle scripts"
```

---

### Task 8: Netlify dev + placeholder function + `netlify.toml`

**Files:**
- Create: `netlify.toml`, `netlify/functions/health.ts`
- Modify: `package.json` (add `@netlify/functions` devDep if needed)

**Interfaces:**
- Consumes: Expo web dev server on port 8081.
- Produces: `netlify dev` serving functions at `/.netlify/functions/*` + proxying the Expo web app; US-region pin for deployed functions.

- [ ] **Step 1: Write `netlify.toml`** (dev command proxies Expo web; functions dir + US region)
```toml
[build]
  command = "npx expo export --platform web"
  publish = "dist"

[functions]
  directory = "netlify/functions"
  node_bundler = "esbuild"

# Deployed functions run in US-East (compliance perimeter, §3/§7.2).
[functions.health]
  # region pinned at the account/site level; documented here as the intended region
  # (Netlify region config is set in site settings — see README).

[dev]
  framework = "#custom"
  command = "npx expo start --web"
  targetPort = 8081
  port = 8888
```

- [ ] **Step 2: Write a placeholder function** `netlify/functions/health.ts`
```ts
import type { Handler } from "@netlify/functions";

// Proves the trusted-server tier runs locally. Privileged secrets (service-role/VAPID/SES)
// will be read from process.env HERE — never in client code (§12.1#2).
export const handler: Handler = async () => ({
  statusCode: 200,
  body: JSON.stringify({ status: "ok", tier: "netlify-functions" }),
});
```

- [ ] **Step 3: Install function types**
```bash
npm install --save-dev @netlify/functions
```

- [ ] **Step 4: Verify (Docker not required for this task)**
```bash
npx netlify dev &     # starts on http://localhost:8888, proxying Expo web + functions
sleep 25
curl -s http://localhost:8888/.netlify/functions/health   # expect: {"status":"ok","tier":"netlify-functions"}
kill %1
```

- [ ] **Step 5: Commit**
```bash
git add netlify.toml netlify/functions/health.ts package.json package-lock.json
git commit -m "feat: netlify dev runtime + health function + US-region intent"
```

---

### Task 9: `npm run dev` orchestration

**Files:**
- Modify: `package.json` (`scripts.predev`, `scripts.dev`, `scripts.start`, `scripts.lint`, `scripts.typecheck`, `scripts.test`)

**Interfaces:**
- Consumes: `doctor` (Task 6), `db:start` (Task 7), `netlify dev` + netlify.toml `[dev]` (Task 8).
- Produces: one command (`dev`) that brings up the whole local loop; granular scripts beneath.

- [ ] **Step 1: Finalize the script catalog** — `package.json` `scripts` (merge with entries from earlier tasks):
```json
"start": "expo start",
"predev": "npm run doctor && npm run db:start",
"dev": "netlify dev",
"typecheck": "tsc --noEmit",
"lint": "expo lint",
"test": "echo \"no tests yet — feature UoWs add unit + pgTAP suites\" && exit 0"
```
(`predev` runs `doctor` then `db:start`; if `doctor` hard-fails or Docker is down, `dev` aborts before starting. `start` has no `predev`, so app-only work needs no Docker.)

- [ ] **Step 2: Verify the full loop (Docker required)**
```bash
npm run dev
```
Expected: doctor prints ✓, local DB starts, Netlify dev serves on `http://localhost:8888` with the five-tab app and `/.netlify/functions/health` reachable. `Ctrl-C` stops app+functions; then:
```bash
npm run stop   # expect: DB containers stop
```

- [ ] **Step 3: Verify app-only path (no Docker)**
```bash
npm run start   # expect: Expo dev server; choose web; app loads without Docker
```

- [ ] **Step 4: Commit**
```bash
git add package.json
git commit -m "feat: npm run dev orchestrates the local loop (doctor → db → netlify+expo)"
```

---

### Task 10: Contributor / worktree note (README)

**Files:**
- Create or modify: `README.md`

**Interfaces:** none (docs).

- [ ] **Step 1: Write the README quickstart + conventions**
```markdown
# CMDFW Bala Vihar — Pilot App

Expo (RN + RN-Web) · Supabase (Postgres/RLS) · Netlify (PWA + US-region functions).
Governance & architecture live in `.docs/` and `.claude/`.

## First-time setup
1. `nvm use`            # Node 22 (recommended; see .nvmrc)
2. `npm install`
3. `npm run env:init`   # creates .env from .env.example
4. `npm run doctor`     # checks your machine; fix any ✗
5. `npm run dev`        # whole local loop — needs Docker Desktop running

Copy the **anon** and **service_role** keys printed by the first `npm run db:start`
into `.env`. Never commit `.env`. Secrets (service-role/VAPID/SES) belong only in
`netlify/functions/` and Netlify env — never with the `EXPO_PUBLIC_` prefix.

## Daily commands
| Command | Does |
|---|---|
| `npm run dev` | DB + functions + app (one URL: http://localhost:8888) |
| `npm run start` | app only (no DB/Docker needed) |
| `npm run stop` | stop the local DB |
| `npm run db:reset` | re-apply migrations + seed |
| `npm run doctor` | prerequisite check |
| `npm run typecheck` / `npm run lint` | TS + lint |

`Ctrl-C` stops the app/functions but **not** the detached DB — run `npm run stop`.
Override ports via env if 54321/8081/8888 are taken (see `supabase/config.toml`, netlify.toml).

## Working in parallel (3 maintainers + Claude)
- One feature = one **Unit of Work** = (persona, functionality) → its own branch/worktree.
- Feature code parallelizes; the **database schema is the serialized seam** — migrations in
  `supabase/migrations/` apply in order. Coordinate schema changes; convergence is a PR to `main`.
- **Lockfile conflicts:** never hand-edit `package-lock.json`. Resolve by taking the merged
  `package.json`, then `rm package-lock.json && npm install` and commit the regenerated lock.
- The pipeline per item: `/refine` → `/architect` → `/design` → `/plan` → `/migration` → `/build` → `/test` → `/deploy-staging` → `/promote`.
```

- [ ] **Step 2: Commit**
```bash
git add README.md
git commit -m "docs: contributor quickstart + parallel-work conventions"
```

---

### Task 11: Final clean-clone verification

**Files:** none (verification only).

- [ ] **Step 1: Simulate a fresh maintainer** (clean install + checks)
```bash
rm -rf node_modules && npm install      # expect: clean install from lockfile
npm run typecheck                        # expect: no errors
npm run lint                             # expect: clean (or only intentional warnings)
npm run doctor; echo "exit=$?"           # expect: exit=0 on a configured machine
```

- [ ] **Step 2: Full loop smoke (Docker required)**
```bash
npm run env:init
npm run dev        # doctor ✓ → DB up → app on :8888 with 5 tabs → /health returns ok
# Ctrl-C
npm run stop
```

- [ ] **Step 3: Secret-leak backstop**
```bash
grep -rn "SERVICE_ROLE\|VAPID_PRIVATE\|SES_SECRET" app features components lib 2>/dev/null && echo "LEAK!" || echo "clean"
git status --porcelain   # expect: clean; .env NOT listed
```
Expected: `clean`, and `.env` absent from git status.

- [ ] **Step 4: Mark the spec done** — in `.docs/specs/system/_index.md`, set status to `Built — pending /test`. Commit.
```bash
git add .docs/specs/system/_index.md
git commit -m "chore: repository-bootstrap built — ready for /test"
```

---

## Self-Review (against the spec)

**Spec coverage:**
- One `npm run dev` orchestration → Task 9 ✓ · Expo Router shell pruned to §4 → Task 2 ✓
- Pinned deps + lockfile + Node pin → Task 1 ✓ · §4 skeleton homes → Task 2 ✓
- Intent scripts catalog → Tasks 3–9 (assembled), final in Task 9 ✓ · `doctor` → Task 6 ✓
- `.env.example` + EXPO_PUBLIC boundary + `.gitignore` → Task 3 ✓ · anon-only client → Task 5 ✓
- Unistyles placeholder theme (no brand hex) + `gen:theme` → Task 4 ✓ · local Supabase + `db:reset` → Task 7 ✓
- Netlify dev + functions boundary + US region → Task 8 ✓ · worktree/branch + lockfile convention → Task 10 ✓
- Governance live on clone → inherent (`.claude/` already committed); verified indirectly by Task 11 clean clone ✓
- Edge cases (Docker down, wrong Node, ports, Win/Mac, lockfile churn) → doctor (Task 6) + README (Task 10) ✓

**Deferred mechanics resolved:** `dev` teardown (explicit `stop`, Task 9) · port conflicts (doctor reports, Task 6) ✓

**Out-of-scope respected:** no cloud provisioning, no CI/CD, no schema/RLS/auth/seed content, no EAS, no real Sankalp tokens, no animation libs ✓

**Nothing architecturally significant surfaced** → no bounce to `/architect`.

---

## Sign-off
- [x] **Human sign-off on this plan** (2026-06-19, shree.srinivas@outlook.com) → `/migration` (no-op: no schema here) → ready for `/build`.

## Build outcome (2026-06-19)
All 11 tasks implemented subagent-driven (fresh implementer + task review per task; final whole-branch review on opus). **Final review: Ready to merge · secret-hygiene PASS · 0 Critical/Important.** Commits `f3d7a99..73c0e2c` (12).

**Verified (no Docker):** clean `npm install` from lockfile · `npm run start` / web export · `typecheck` · `lint` · `doctor` (exit 0) · function responds via `netlify functions:serve` · secret-leak backstop clean · `.env` untracked · §4 tree at root.

**Verified (Docker, 2026-06-19):** `npm run db:start` brings up all 12 Supabase containers (REST 200) · `npm run db:reset` clean · **full `npm run dev` loop** — netlify proxy on `:8888`, health function 200 through the proxy, all 5 tab routes 200 · `npm run stop` tears down to 0 containers. Two fixes the live run surfaced (committed): root `app/index.tsx` redirect so `/` resolves (was 404); `deno.lock` (supabase edge-runtime artifact) git-ignored.
- *Note for whoever fills `.env`:* this Supabase CLI prints the new `sb_publishable_…` / `sb_secret_…` key format (replaces anon/service_role JWTs) — the **publishable** key fills `EXPO_PUBLIC_SUPABASE_ANON_KEY`, the **secret** key fills `SUPABASE_SERVICE_ROLE_KEY` (functions only).

**Tracked Minor follow-ups (none merge-blocking):**
- M1 `scripts/doctor.mjs` Node-floor check is major-only (`>=20`) — should be `>=20.19` to match `engines`. Trivial.
- M3 `package.json` `name` still `bv-scaffold` (private pkg; cosmetic). App identity correct in `app.json`.
- M4 Unistyles babel `root:"app"` — revisit when the first `components/`/`features/` UI UoW lands.
- M5 Netlify US-region is intent-comment only — bind in the cloud-provisioning System item.
- M6 `npm run db:reset` logs cosmetic warnings ("Skipping migration .gitkeep", "no files matched supabase/seed.sql") — harmless with empty migrations/seed; clears once the first real migration/seed lands.
```
