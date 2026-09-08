# System — Cloud environment provisioning

> **owner:** System · **consumers:** all (nothing deploys until this lands) · **scope:** cloud Supabase project A/B + staging/prod env wiring · **governing ADR:** [ADR-0006](../../adr/0006-hosting-environments.md) · **covers:** doc 3 §7.1 (environment → infrastructure map), §7.2 (deployment model, per-context env vars), §3 (US residency perimeter)

**Stage:** **Staging provisioned & console-verified (2026-09-07).** Handoff doc, not a `/refine` spec — issue #9's body carried the runbook, so provisioning was executed directly against it. This file records what was provisioned, why each setting was chosen, and the one piece that remains (prod project B).

> Written 2026-07-21 by @arunasharad-coder at handoff; **updated 2026-09-07** after logging into both consoles and confirming the live state. **Both halves are done:** Netlify is wired and auto-deploying from `main`; Supabase is healthy with **all 34 migrations applied** (`local == remote`). The only remaining piece is **prod project B (§4.5)**, deferred and gated on **#66**.

---

## 1. What is provisioned (done ✅)

### Supabase — staging (project A)

| Item | Value |
|---|---|
| Organization | `CMDFW Balavihar`, org ID **`omjfyyywlgiziiguebgq`** — owned by **bvportal@cmdfw.org** (dedicated org, not a personal account). ⚠️ Confirm by **org ID** — an unrelated personal org shares the same display name (see §5.2). |
| Project name | `cmdfw-bv-staging` |
| Project ref | `ejjvqtleuuamgtlmtxkc` |
| Project URL | `https://ejjvqtleuuamgtlmtxkc.supabase.co` |
| Region | **us-east-1 — US East (N. Virginia)** |
| Status | `Healthy` (free tier **auto-pauses** after ~1 week idle — resume from the dashboard; data is preserved. Resumed 2026-09-07.) |
| Migrations | **All 34 applied**, verified 2026-09-07 — `supabase migration list` shows `local == remote` for every entry (was 22 at handoff; the 12 `20260724…`–`20260817…` were pushed 2026-09-07) |

**Why a dedicated org:** ADR-0006 records Supabase Free = **2 active projects per org**, and this project needs both slots (staging A + prod B). A personal org would not fit, and prod holds minors' data — it should not sit under any individual volunteer's account.

**Region is immutable after project creation.** us-east-1 satisfies the US-residency requirement (non-negotiable #5, doc 3 §3).

### Netlify — done ✅ (verified 2026-09-07)

- Account under **bvportal@cmdfw.org**; site **`balavihar-connect`** (`0dee8cfc-dc87-49bb-9739-c25b5024fed2`), connected to `cmdfw-bv/CMDFW-BalaVihar-App`.
- Production context builds from **`main`** (per [ADR-2026-07-30-staging-builds-from-main](../../adr/2026-07-30-staging-builds-from-main.md)); build `npx expo export --platform web` → `dist`.
- **Functions region `us-east-2`** (US-East — doc 3 §3). All three env vars set (`EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`).
- **Auto-deploy proven:** last deploy `ready`, from `main`, at 2026-09-07 03:01 (the #54 merge). Secret-leak check (#65 AC#4) run against the published bundle by @mehtamaulik-creator — **clean**, no `service_role`/secret in the client.

---

## 2. Project-creation settings — decisions and rationale

These were deliberate. Please don't "tidy" them without reading the reasoning.

| Setting | Chosen | Why |
|---|---|---|
| **GitHub integration** (Supabase-side) | ❌ **Not connected** | Supabase's GitHub auto-deploy would create a *second* schema-deployment path that bypasses `/migration` and the `migration-guard` hook (non-negotiable #3). Migrations go up via the CLI only. |
| **Enable Data API** | ✅ On | The client uses `supabase-js`. |
| **Automatically expose new tables** | ✅ **Left ON** (despite Supabase's inline advice to disable) | **5 of our 15 tables — `centers`, `classes`, `sessions`, `families`, `family_members` — have no explicit `grant` in any migration** and rely on Supabase's default privileges. Local (where all pgTAP tests pass) has those defaults. Turning this off in cloud would leave those 5 ungranted and break reads that work locally. RLS remains the real gate (non-negotiable #1) — exposure without a policy returns zero rows. See **#28**, which already tracks hardening these over-broad defaults (incl. `TRUNCATE`). |
| **Enable automatic RLS** | ❌ **Left OFF** | Every migration already runs `enable row level security` explicitly, and local has no such event trigger. Keeping it off means staging behaves *identically* to what the pgTAP suite validated. If the team later wants it as defence-in-depth, add it as a reviewed migration (rule #3), not as a dashboard toggle. |

---

## 3. Secrets — where they live

**No key values are recorded in this repo, by design** (non-negotiable #2). Fetch them from the Supabase dashboard → **Project Settings → API Keys**.

| Value | Where it goes | Notes |
|---|---|---|
| Project URL | `EXPO_PUBLIC_SUPABASE_URL` (client env, per Netlify context) | Use the **base** URL — `https://<ref>.supabase.co`, **not** the `/rest/v1/` endpoint the dashboard shows. |
| Publishable key (`sb_publishable_…`) | `EXPO_PUBLIC_SUPABASE_ANON_KEY` (client env) | New-format key. `@supabase/supabase-js ^2.108.2` supports it — no need for the "Legacy anon" tab. |
| Secret key / `service_role` | `SUPABASE_SERVICE_ROLE_KEY` — **Netlify Functions env only** | 🔴 Never in the client build, never in git. Copy it straight from the Supabase screen into Netlify. |
| Database password | Password manager | Set at project creation. Resettable via Settings → Database if lost. |

`.env` is git-ignored (`.gitignore:53`). Local dev keeps pointing at local Supabase (`127.0.0.1:54321`) — the cloud values are for Netlify, not for anyone's local `.env`.

---

## 4. What remains to finish #9

**Done since handoff (verified 2026-09-07):** 4.1 Netlify import ✅ · 4.2 Functions pinned US-East (`us-east-2`) ✅ · 4.3 per-context env vars set ✅ · 4.6 staging deploy proven (the smoke-test/`/promote` walk is **#65**, not this issue) ✅. The original §4.4 ("create a `staging` branch") is **superseded** — see below.

### ~~4.4 Deploy contexts~~ → superseded by ADR-2026-07-30
The handoff draft said branch `main` → prod, branch `staging` → staging, and that a `staging` branch "needs creating." **That decision was reversed:** [ADR-2026-07-30-staging-builds-from-main](../../adr/2026-07-30-staging-builds-from-main.md) — **there is no `staging` branch, ever**; the Netlify production context builds from `main`, and prod (project B) gets its own controlled promotion later. **Do not create a `staging` branch.**

### 4.5 Create the prod Supabase project (project B) — the one remaining piece
Not yet created. Same org, same region (**us-east-1**), name it `cmdfw-bv-prod`. Consumes the org's second and final free slot.

> 🔴 **Gated on #66 — ping @mehtamaulik-creator BEFORE creating project B.** #66 removes the `tests.create_supabase_user` auth-user factory from the cloud migration path; it must land *before* a database that will hold real minors' records exists. Once prod holds real data there is no clean second chance (Maulik ji's note on this issue, 2026-09-07).

### Hardening (small, non-blocking)
`SUPABASE_SERVICE_ROLE_KEY` on Netlify is scoped **Builds, Functions, Runtime** — broader than the "Functions-only" intent. The published-bundle secret scan (#65 AC#4) came back **clean**, so there's no active leak (Expo only inlines `EXPO_PUBLIC_*`), but the scope should still be tightened to Functions-only as hygiene.

---

## 5. Known gotchas (hit during provisioning)

1. **`supabase db push` prints a red error at the end** — `failed to cache migrations catalog: … pgdelta-target-ca.crt: ENOENT`. This is a **post-push caching step only**; every migration applied cleanly and `migration list` confirms full parity. Appears to be a CLI tooling bug (CLI v2.95.4). **Non-blocking — do not re-run the push in a panic.**

2. **`supabase link` failed with `Your account does not have the necessary privileges`** — the CLI had authorized a **different Supabase account** (a maintainer's personal one) rather than the `bvportal@cmdfw.org` account that owns this project. Two things make this easy to misdiagnose:
   - The failure surfaces at the **API level, before** the database-password prompt matters — so a wrong-account error **looks like a wrong-password error**. Don't go resetting the database password chasing it.
   - A personal org happened to carry the **same display name — "CMDFW Balavihar"** — as the project org. **Verify by org ID, never by name:** this project's org is **`omjfyyywlgiziiguebgq`**. (The personal projects have since been renamed with a `-sandbox` suffix to reduce the ambiguity, but the org display names still match.)

   Fix: `supabase logout` → sign out of supabase.com in the browser if needed → `supabase login` as `bvportal@cmdfw.org` → verify with `supabase projects list` that **`cmdfw-bv-staging` appears** before retrying `link`.

3. **Netlify could not see the repo while it lived under a personal GitHub account.** Netlify connects via its **GitHub App**, and an app installed on a *personal* account is only accessible to that account's **owner** — a collaborator (even with `push`) cannot use it, and the repo being public is not sufficient. This is what drove the move to a **GitHub organization**; once the repo is org-owned, any member can use the org-level installation.

---

## 6. Acceptance (status 2026-09-07)

- [x] Staging Supabase project exists, US region, **all 34 migrations** applied and verified (`local == remote`)
- [ ] Prod Supabase project exists, same region — **deferred, gated on #66** (§4.5)
- [x] Netlify site imported, building from `netlify.toml`
- [x] Functions pinned to US-East (`us-east-2`)
- [x] Per-context env vars set — service-role key scope to be tightened to Functions-only (§4 Hardening); no client leak, verified via #65 AC#4 scan
- [x] Staging deploy proven (`main`→staging auto-deploy `ready`); the full smoke-test/`/promote` walk is **#65**

**Net:** #9's staging half is complete. The single open item is prod project B, deferred + gated on #66.
