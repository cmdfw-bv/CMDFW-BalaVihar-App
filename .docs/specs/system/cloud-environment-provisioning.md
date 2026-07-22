# System — Cloud environment provisioning

> **owner:** System · **consumers:** all (nothing deploys until this lands) · **scope:** cloud Supabase project A/B + staging/prod env wiring · **governing ADR:** [ADR-0006](../../adr/0006-hosting-environments.md) · **covers:** doc 3 §7.1 (environment → infrastructure map), §7.2 (deployment model, per-context env vars), §3 (US residency perimeter)

**Stage:** Partially provisioned — **handoff doc, not a refined spec.** `/refine` was not run: issue #9's body already carried a step-by-step runbook, so provisioning was executed directly against it. This file records **what was actually provisioned, why each setting was chosen, and exactly what remains** — so whoever finishes #9 doesn't have to reconstruct it.

> Written 2026-07-21 by @arunasharad-coder at handoff. The Supabase half is complete and verified; the Netlify half is not started.

---

## 1. What is provisioned (done ✅)

### Supabase — staging (project A)

| Item | Value |
|---|---|
| Organization | `CMDFW Balavihar` — owned by **bvportal@cmdfw.org** (dedicated org, not a personal account) |
| Project name | `cmdfw-bv-staging` |
| Project ref | `ejjvqtleuuamgtlmtxkc` |
| Project URL | `https://ejjvqtleuuamgtlmtxkc.supabase.co` |
| Region | **us-east-1 — US East (N. Virginia)** |
| Status | `ACTIVE_HEALTHY` |
| Migrations | **All 22 applied**, verified — `supabase migration list` shows `local == remote` for every entry |

**Why a dedicated org:** ADR-0006 records Supabase Free = **2 active projects per org**, and this project needs both slots (staging A + prod B). A personal org would not fit, and prod holds minors' data — it should not sit under any individual volunteer's account.

**Region is immutable after project creation.** us-east-1 satisfies the US-residency requirement (non-negotiable #5, doc 3 §3).

### Netlify

- Account created and email-verified under **bvportal@cmdfw.org**. No site imported yet.

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

### 4.1 Netlify — import the repo
Build settings **auto-detect from `netlify.toml`** (`npx expo export --platform web` → `dist`). Do **not** override them in the UI.

> ⚠️ The first build will likely **fail** — env vars aren't set yet. Expected; set them and redeploy.

### 4.2 Pin Functions region to **US-East**
`netlify.toml` documents the intent per function, but the region is set at **site level** in Netlify settings. Required by doc 3 §3/§7.2 — the trusted-server tier must stay inside the compliance perimeter.

### 4.3 Set per-context environment variables
Per §7.2, each deploy context carries its **own** Supabase URL + key.

- **Client (both contexts):** `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`
- **Functions env only:** `SUPABASE_SERVICE_ROLE_KEY`
- **Not yet needed** (arrive with notifications-infra, #5): `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `SES_REGION`, `SES_ACCESS_KEY_ID`, `SES_SECRET_ACCESS_KEY`

### 4.4 Deploy contexts
§7.2 specifies branch `main` → **prod**, branch `staging` → **staging**. **No `staging` branch exists yet** — it needs creating, or the context mapping needs an explicit decision.

### 4.5 Create the prod Supabase project (project B)
Not yet created. Same org, same region (**us-east-1**), name it `cmdfw-bv-prod`. This consumes the org's second and final free slot.

### 4.6 `/deploy-staging` → smoke test → `/promote`
`csv-enrollment-import` has been waiting on this since it was built.

---

## 5. Known gotchas (hit during provisioning)

1. **`supabase db push` prints a red error at the end** — `failed to cache migrations catalog: … pgdelta-target-ca.crt: ENOENT`. This is a **post-push caching step only**; every migration applied cleanly and `migration list` confirms full parity. Appears to be a CLI tooling bug (CLI v2.95.4). **Non-blocking — do not re-run the push in a panic.**

2. **`supabase link` failed with `Your account does not have the necessary privileges`** — the CLI had authorized a *different* Supabase account. That account had access to **two pre-existing, INACTIVE projects** — `cmdfw-balavihar` (2026-03-12) and `cmdfw-staging` (2026-04-29) — in an unrelated org, almost certainly leftovers from the throwaway board-demo POC (2_POC §Framing). **That org is already at 2/2 free projects.** Someone should confirm ownership and clean them up so they aren't mistaken for the real environments. Fix was `supabase logout` + re-login as bvportal@cmdfw.org.

3. **Netlify could not see the repo while it lived under a personal GitHub account.** Netlify connects via its **GitHub App**, and an app installed on a *personal* account is only accessible to that account's **owner** — a collaborator (even with `push`) cannot use it, and the repo being public is not sufficient. This is what drove the move to a **GitHub organization**; once the repo is org-owned, any member can use the org-level installation.

---

## 6. Acceptance (proposed)

- [x] Staging Supabase project exists, US region, all migrations applied and verified
- [ ] Prod Supabase project exists, same region
- [ ] Netlify site imported, building from `netlify.toml`
- [ ] Functions pinned to US-East
- [ ] Per-context env vars set; service-role key **only** in Functions env
- [ ] `/deploy-staging` green, smoke test passes
