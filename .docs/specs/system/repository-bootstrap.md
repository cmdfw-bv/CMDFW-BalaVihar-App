# System — Repository & local-stack bootstrap

> **owner:** System · **consumers:** all 6 personas + every later System item (universal dependency) · **scope:** infra / pre-data — no rows, no RLS · **governing ADR:** none new — covered by ADR-0001 (Expo), ADR-0002 (Supabase), ADR-0006 (environments), ADR-0011 (Unistyles) + doc 3 §4 · **covers:** doc 2 §2 Cross-cutting, §5 thinnest-slice prerequisites; doc 3 §4 (repo structure), §7.1 (local env), §12.6 (parallel delivery)

**Stage:** Built — review-clean (2026-06-19), manually verified end-to-end (Docker + no-Docker paths). `/refine` ✓ → `/architect` ✓ (signed off, no ADR) → `/design` ✓ → `/plan` ✓ → `/build` ✓ → next is `/test` (formal stage not yet run; build-outcome verification already covers most of it).

---

## Requirements (refined)

### User story
**As the** System, **I want** the repository initialized with the full pinned toolchain and a one-command local stack, plus lightweight collaboration conventions, **so that** three non-technical maintainers + Claude Code can clone once and start delivering feature units **in parallel** without environment drift.

### Decisions captured during refine
- **UoW boundary = "full local stack up":** this single item delivers the toolchain foundation **and** a working end-to-end local loop (Expo dev server + local Supabase via CLI/Docker + Netlify dev). It is intentionally the largest of the bootstrap options — chosen so every maintainer has the complete local loop on first clone.
- **Collaboration conventions = included (lightweight):** the worktree/branch model (§12.6), a committed `.env.example` (no secrets), and an onboarding "doctor" check ship with this item — the minimum that lets the distributed team work in parallel without colliding. Full CI/CD remains a **separate, later** System item.

### Acceptance criteria
1. **One-command clean install.** A fresh `git clone` reaches a known-good toolchain via a single documented install command; dependencies are **pinned** and a **lockfile is committed**, so every maintainer's install is byte-identical (no drift).
2. **Doctor check.** A single `npm run doctor` (intent-level) reports every prerequisite green, or names exactly what is missing/mismatched (Node/npm engine, Docker, Supabase CLI, Netlify CLI) — non-technical maintainers never have to diagnose by hand.
3. **§4 skeleton exists.** The canonical directory tree from doc 3 §4 (`app/`, `components/`, `features/`, `lib/`, `netlify/functions/`, `supabase/{migrations,seed,tests}/`, `public/`, `.docs/specs/`, `design/`) is present so every future UoW has a predetermined home.
4. **App shell runs.** `npm run start` serves the Expo / RN-Web PWA shell locally in a browser (blank but routable; Unistyles theme wired per ADR-0011).
5. **Local database runs.** `supabase start` (CLI/Docker) brings up a local Postgres that the app can reach; a `db reset` re-applies migrations + seed cleanly and repeatably (§7.1: throwaway, instant reset).
6. **Trusted-server tier runs locally.** The Netlify dev runtime serves `netlify/functions/` locally, establishing the client ↔ functions boundary before any function is written.
7. **Intent-level scripts.** `npm run` wraps raw Expo / Supabase-CLI / Netlify commands so maintainers invoke intent (`start`, `test`, `db reset`, `doctor`, …), not raw tooling (§4 convention 5).
8. **Secret hygiene (non-negotiable §12.1#2).** A `.env.example` is committed documenting required vars with **no real secrets/PII**; the client uses the **anon** key only; service-role / VAPID / SES creds are never referenced from `app/`/`features/`/`lib/` or committed to Git. `.gitignore` excludes `.env*` (except `.env.example`), build artifacts, and local Supabase volumes.
9. **Parallel-work conventions documented.** A short contributor note records the branch/worktree model (§12.6): feature units on their own branch/worktree, the **schema (`supabase/migrations/`) is the serialized seam**, convergence is a PR to `main`.
10. **Governance is live on clone.** The in-repo `.claude/` layer (hooks, rules, skills) is active immediately after clone — verified by confirming the enforcing hooks load (§12.4/§12.8); governance is not a per-person setup step.

### Edge cases
- **Docker absent / not running** → doctor reports it clearly; non-DB app work (`npm run start`) still functions so a maintainer isn't fully blocked.
- **Node/npm version mismatch** → engine is pinned; doctor flags the mismatch rather than allowing a silently-different install.
- **Missing CLI tool** (Supabase or Netlify CLI) → doctor enumerates exactly what to install and how.
- **Native toolchain absent** (Xcode/Android SDK) → acceptable; native is fast-follow (§7.3) and **not required** by this UoW.
- **Lockfile churn across parallel branches** → the contributor note states the convention for resolving lockfile conflicts so parallel installs stay reproducible.
- **Cloud Supabase / Netlify linking** → **out of scope** here; this item is local-only. Cloud project A/B provisioning + per-context env wiring (§7.1–§7.2) is a later System item.

### Priority
**POC-core, foundational.** This is the root dependency: no persona feature unit, migration, or test can begin until it is done. Highest sequencing priority.

### Consumers (cross-persona)
**All six POC personas'** feature units and **every subsequent System item** depend on this. It is the universal prerequisite — the reason it is refined first.

### Access scope (§5.4)
**N/A — pre-data infrastructure.** No tables, rows, or RLS policies are created here. The UoW instead establishes the *boundaries* later RLS/secret work relies on: anon-key-only client code, privileged secrets confined to `netlify/functions/`, and the schema directory as the single source of truth.

### Explicitly out of scope (so a later item picks them up)
- Cloud Supabase project A/B provisioning + per-context (staging/prod) env wiring (§7.1–§7.2).
- CI/CD pipeline + the migration-guard/promotion gates (separate System item).
- Any schema, RLS policy, auth hook, or seed *content* (own UoWs via `/migration`).
- EAS / native build configuration beyond a placeholder (§7.3, post-POC).

---

## Architect review — sign-off (2026-06-19)

**Outcome: signed off, no ADR.** This item *executes* already-settled architecture; it carries no architecturally-significant decision. Checked clean against all triggers: no cross-scope access (pre-data), no new external processor (Expo/Supabase/Netlify already decided), no schema/RLS shape (deferred), no realtime/perf, and no minors'-data/residency exposure (local-only; cloud provisioning where residency binds is correctly held out). Scope, owner, consumers, and N/A access-scope are sound. **Governing ADRs: ADR-0001, ADR-0002, ADR-0006, ADR-0011 + doc 3 §4** (none new).

Resolutions to the refine open questions:
1. **No dedicated bootstrap ADR** — fully governed by the existing ADRs above + §4 (single root `package.json`, one install / one run).
2. **Node-engine / toolchain pin strategy → `/design`** — an implementation detail (engines field, `.nvmrc`/`.node-version`, lockfile policy), not architecture.
3. **`doctor` check stays in this UoW** — already affirmed at refine (conventions included); it is the maintainer-facing onboarding gate, not a follow-up.

**Hand-off → `/design`:** produce the detailed spec (exact toolchain versions/pins, script catalog, `doctor` mechanics, `.env.example` contents, `.gitignore` set, the contributor/worktree note, and the install/verify steps) in this same file.

---

## Design (detailed spec)

> **Stage:** 1 — Design ✓ (this section). `/refine` ✓ → `/architect` ✓ (no ADR) → `/design` ✓ → next is `/plan`.
> **Design decisions captured:** (1) **one orchestrated `npm run dev`** brings the whole local loop up; (2) **Expo Router template pruned to §4** — a blank-but-routable tab shell + `(auth)` stub + Unistyles wired.

### Toolchain & versions
- **Package manager: npm.** Single root `package.json`; no workspaces/monorepo tool (§4 — one install, one run). Lockfile (`package-lock.json`) committed.
- **Node: pinned LTS.** `.nvmrc` + `.node-version` carry the exact version; `package.json` `engines.node` declares the same range; `.npmrc` sets `engine-strict=true` so a wrong Node **hard-fails install** with a clear message. Target the **active Expo-supported LTS (Node 22.x)** — `/plan`/`/build` confirms the exact patch against the chosen Expo SDK and pins it.
- **Expo SDK:** latest stable at build time, pinned exactly (no `^`). RN + RN-Web via Expo Router (ADR-0001).
- **CLIs as devDependencies where possible** (Supabase CLI, Netlify CLI) so versions are pinned in the lockfile and `npx`-invokable, rather than relying on each maintainer's global install. `doctor` still checks for a working Docker engine (not installable via npm).
- **Styling:** Unistyles 3 (ADR-0011). **Animation libs are NOT installed here** (Reanimated/Moti are future-gamification, ADR-0012) — out of scope.

### Behavior — the maintainer-facing surface

**Install & verify flow (first clone):**
1. `nvm use` (reads `.nvmrc`) → correct Node.
2. `npm install` → deterministic install from lockfile; `engine-strict` blocks a wrong Node with a readable error.
3. `cp .env.example .env` (or `npm run env:init` helper that copies if absent and never overwrites).
4. `npm run doctor` → prerequisite checklist (below).
5. `npm run dev` → whole local loop up; open the printed local URL → blank-but-routable app shell talking to the local DB.

**`npm run` script catalog (intent, not raw tooling — §4 conv 5):**

| Script | Intent |
|---|---|
| `dev` | **Orchestrator** — ensures local Supabase is up, then runs the Netlify dev runtime (serving `netlify/functions/` + proxying the Expo web dev server) on one local URL. Runs `doctor` first via `predev`. |
| `start` | Expo dev server only (app-only work; no DB/functions). Works without Docker. |
| `doctor` | Cross-platform prerequisite check (Node script, Mac/Windows/Linux). |
| `db:start` / `db:stop` | Start/stop local Supabase (Docker). `dev` calls `db:start`. |
| `db:reset` | Re-apply migrations + seed to the local DB cleanly and repeatably (§7.1). |
| `env:init` | Copy `.env.example` → `.env` if absent (never overwrites). |
| `gen:theme` | Regenerate `lib/theme.ts` from `design/sankalp/design-tokens.json` (ADR-0011). **Placeholder until Sankalp imports** — see UI. |
| `test` | Test runner entry point (placeholder wiring now; real suites land with feature UoWs / pgTAP). |
| `lint` / `typecheck` | ESLint + `tsc --noEmit` over the tree. |

> **Teardown note (design constraint):** `supabase start` runs Docker **detached**, so `Ctrl-C` on `dev` stops the app/functions but **not** the DB. The contributor note documents `npm run db:stop` (and `dev` is idempotent — re-running reuses the running DB). `/plan` decides whether `dev` traps exit to auto-`db:stop` or leaves teardown explicit.

**`doctor` mechanics:** a single cross-platform Node script (`scripts/doctor.mjs`) that prints a ✓/✗ checklist and **exits non-zero if any hard prerequisite fails**, naming the exact remediation:

| Check | Severity | On failure |
|---|---|---|
| Node matches `.nvmrc`/`engines` | **hard** | name expected vs found; point to `nvm use` |
| npm present | **hard** | — |
| Docker installed **and** daemon running | **hard for `dev`** | app-only `start` still allowed; message says so |
| Supabase CLI resolvable (`npx supabase`) | hard | install hint |
| Netlify CLI resolvable | hard | install hint |
| `.env` exists | warn | offer `npm run env:init` |
| git present | warn | — |

### Data & RLS impact
**None — pre-data.** No tables, rows, migrations, RLS, or auth hook are created here (those are their own UoWs). What this UoW *establishes* are the boundaries later data work depends on:
- **`.env.example`** (committed, **no real secrets/PII**) documents the variable contract. **Client-exposed vars use the `EXPO_PUBLIC_` prefix and carry only anon-safe values** (local Supabase URL + the well-known local **anon** key — not a secret). **Service-role key, VAPID private key, SES creds are documented WITHOUT the `EXPO_PUBLIC_` prefix, left as empty placeholders, and read only by `netlify/functions/`** (§12.1#2; `stack-conventions`).
- **`lib/supabase.ts`** — a minimal **anon-key-only** typed client proving local connectivity. Session/active-role logic (`lib/auth/`) is deferred to the auth UoW; the folder exists empty (`.gitkeep`).
- **`.gitignore`** excludes `.env*` (except `.env.example`), `node_modules/`, `.expo/`, `dist/`/`web-build/`, `.netlify/`, Supabase local volumes/temp (`supabase/.branches`, `supabase/.temp`), logs, `.DS_Store` — so no secret or build artifact is ever committed.
- **`supabase/migrations/`** is created empty as the declared single source of truth (the schema seam, §12.6).

### UI
Scope is the **scaffold only** — no feature screens.
- **`app/` skeleton (§4):** root `_layout.tsx` (Unistyles provider + theme), `(auth)/` route group (empty, ready for magic-link sign-in), `(tabs)/` with a blank-but-routable tab shell (Feed · Classes · Attendance · Chat · Dashboard placeholders — tabs navigate; screens are empty stubs).
- **Unistyles + theme (ADR-0011, `design-system`):** `StyleSheet.configure` set up with the **breakpoints 360/768/1024/1440** and a **placeholder `lib/theme.ts` on the stable `od-design-tokens/v1` token taxonomy** (`bg/accent/brand/status{…}/role{…}`, `space/radius/type/motion`). **No hardcoded brand hex.** `gen:theme` is wired but emits the placeholder until `design/sankalp/design-tokens.json` is imported (ADR-0010), at which point it regenerates with real values — no code change needed downstream.
- **Design DoD:** not exercised here (no real screens). The DoD (compose from tokens never hex · one primary action · five states incl. permission-denied-as-designed · ≥44px · role badge + scope · tabular numerics) is **inherited by every feature UoW** that adds screens into this shell; this UoW only guarantees the token plumbing is present so those screens *can* satisfy it.

### Edge cases
- **Docker absent / daemon down** → `doctor` flags hard-for-`dev`, but `npm run start` (app-only) still runs so a maintainer isn't fully blocked.
- **Wrong Node version** → `engine-strict` hard-fails `npm install`; `doctor` names expected vs found.
- **Missing Supabase/Netlify CLI** → pinned as devDeps + `npx`-invoked, so a clean `npm install` provides them; `doctor` still verifies resolvability.
- **`dev` partial bring-up** (DB up, app crashes) → DB stays running (detached); re-running `dev` is idempotent; `db:stop` tears down.
- **Port conflicts** (Supabase 54321-ish / Expo 8081 / Netlify 8888) → `doctor`/`dev` surface the conflict with the port and offending tool rather than failing opaquely (`/plan` decides exact handling).
- **Native toolchain (Xcode/Android SDK) absent** → fine; native is fast-follow (§7.3), not required.
- **Windows vs macOS maintainer** → `doctor` and all scripts are cross-platform (Node script, no bash-isms); paths are POSIX-style via Node `path`.
- **Lockfile conflicts on parallel branches** → contributor note states the resolution convention (regenerate from the merged `package.json`, never hand-edit the lock) so parallel installs stay reproducible.
- **`.env` accidentally staged** → covered by `.gitignore`; the secret-scan GOVERN hook is the backstop (§12.1).

### Out of scope (own later UoWs)
- Cloud Supabase project A/B provisioning + per-context (staging/prod) env wiring (§7.1–§7.2).
- CI/CD pipeline + migration-guard/promotion gates.
- Any schema, RLS policy, auth hook, seed *content*, or `lib/auth/` session logic.
- EAS/native build config beyond a placeholder (§7.3).
- Sankalp artifact import + real `theme.ts` values (ADR-0010 — pending team design refinement).
- Animation stack (Reanimated/Moti — ADR-0012, future gamification).

### Consumers (cross-reference, not duplicated — §12.12)
Every persona feature UoW builds **into** this scaffold (drops screens into `(tabs)`/`(auth)`, logic into `features/<persona>/`, data hooks onto `lib/supabase.ts`). The auth UoW fills `lib/auth/`; `/migration` UoWs fill `supabase/migrations/`; the notifications UoW fills `lib/push/` + `netlify/functions/`. This item creates their empty, agreed homes.

---

## Sign-off
- [x] **Human sign-off on this design** (2026-06-19, shree.srinivas@outlook.com) → ready for **`/plan`**.
