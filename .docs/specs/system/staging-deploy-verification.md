# System — staging-deploy-verification (prove main → staging works, end to end)

> **owner:** System · **consumers:** all 6 personas (every built feature is verified here) · **scope:** infra / delivery — prove `main` → staging deploys, cloud Supabase attached, dev-equivalent synthetic data, every persona can sign in · **governing ADR:** [ADR-2026-07-30-staging-builds-from-main](../../adr/2026-07-30-staging-builds-from-main.md) + [ADR-2026-07-30-synthetic-staging-seed-and-accounts](../../adr/2026-07-30-synthetic-staging-seed-and-accounts.md) (both decided at the 2026-07-30 architect review, formally recorded as date-based ADRs on 2026-09-06; the originally-intended "ADR-0037/0038" numbers were never written and later collided — see [ADR-2026-08-21-adr-identifier-scheme](../../adr/2026-08-21-adr-identifier-scheme.md)) · **covers:** GitHub #65; doc 3 §7 (hosting/deploy); the first cloud/deployed run of six Built/Merged items

**Stage:** `/refine` ✓ → `/architect` ✓ → `/design` ✓ → `/plan` ✓ → `/build` ✓ (the `seed-staging` tooling) → verified live against cloud staging (see the Verification walk results at the end). Remaining ACs tracked as follow-ups (see that section).

**Related:** starts where **#9** (Netlify + cloud Supabase provisioning) ends. Consumes **#19** (pilot-seed-data — the realistic synthetic seed). Security-hardening sibling **#66** (keep pgTAP `tests.*` helpers out of cloud DBs) and **#73** (fail-open staff RPC guards) both intersect the seed + guard ACs below.

---

## Requirements (refined)

### User story
As the **System** (on behalf of the volunteer maintainers), I want to **prove that a merge to `main` deploys a working app to the staging URL** — cloud database attached, realistic *synthetic* data loaded, and **every persona able to actually sign in and use it** — so that features marked "Built" are verified on real infrastructure (not just a local reset) and we have a **loginable, demoable staging environment** (the leadership demo) plus a repeatable way to reset it.

### Decisions already made (2026-07-30 architect review — now recorded as date-based ADRs)
- **Staging builds from `main`** (Netlify production context ← `main`); **no `staging` branch**; the prod context waits for a second Supabase project; prod promotion will be *controlled* (manual/tag), not auto-on-merge — trigger deferred. _(→ [ADR-2026-07-30-staging-builds-from-main](../../adr/2026-07-30-staging-builds-from-main.md).)_
- **Cloud data = synthetic domain seed** (no `tests.*` calls) **+** sign-in-able accounts provisioned via the **Auth Admin API** on **team-controlled mailboxes**. **No real program-member data in staging, ever.** _(→ [ADR-2026-07-30-synthetic-staging-seed-and-accounts](../../adr/2026-07-30-synthetic-staging-seed-and-accounts.md).)_

### Status since the issue was written (2026-07-31)
- ✅ **Blockers #61 / #53 are CLOSED** (fixed by #67) — the "fix these first" line is satisfied; the Student persona is now walkable.
- ✅ Staging **site is live** (`balavihar-connect.netlify.app`, HTTP 200) and the cloud project (`cmdfw-bv-staging`, `ejjvqtleuuamgtlmtxkc`, us-east-1) is **linked** — but currently **paused/INACTIVE** (free-tier auto-pause) and **behind on migrations** (local 29 vs cloud ~22).
- ✅ The two governing ADRs (referenced as the never-written "0037/0038") are **now written** as date-based ADRs dated 2026-07-30, and every reference is repointed.

### Acceptance criteria
*(faithful to #65; annotations mark what changed during refine.)*
1. **`main` → staging is automatic** — a merge to `main` produces a staging deploy; no manual step, no `staging` branch.
2. **Deployed app reachable, build green** — served from `netlify.toml`'s `expo export --platform web` → `dist` (not overridden in the Netlify UI).
3. **Supabase attached — proven from the browser** — a real authenticated read succeeds in the deployed app against `ejjvqtleuuamgtlmtxkc`. Matching env vars are not evidence.
4. **Functions live + US-pinned** — `/.netlify/functions/health` responds; region = US-East; `SUPABASE_SERVICE_ROLE_KEY` in **Functions env only** (grep published `dist`, confirm the key prefix is absent).
5. **Dev-equivalent synthetic data in staging** — Frisco center · F3 session · Shishu Vihaar/KG–Gr12 + families/students/enrollments, loaded by a **cloud-safe path with no `tests.*` calls**.
6. **Every persona can actually sign in** — all 6 personas provisioned via Auth Admin API on team mailboxes with `user_roles` attached; **proof = receiving a real magic link and completing sign-in on the staging URL for each** (not a row count).
7. **Role-derived nav + role switcher work deployed** — ≥1 multi-role account; live switch re-scopes the UI; web reload preserves session.
8. **Magic-link delivery works in staging.** ⚠️ **OPEN — the key `/design` decision:** transport is undecided (Supabase built-in email vs SES-as-Auth-SMTP vs a service like Mailtrap). The free built-in sender is heavily throttled and **may not survive six persona sign-ins** — `/design` picks the transport and records rate limits. Reused/expired links surface an error (#45).
9. **A documented, *repeatable* reset** a non-technical maintainer can run to re-seed staging from empty — **run any time** (not one-off): staging is shared/synthetic and drifts, so this is the "reset to a known baseline" button (e.g. before a demo).
10. **Doc 3 §7 corrected** — the §7.1 table, §7.2 text, and §7.1 mermaid diagram still describe a `staging` branch → bring them in line with the *staging-builds-from-`main`* decision. **(Reference repointed:** was "ADR-0037", which was never written; points at the real date-based ADR `/architect` will author.) The stale doc is wrong today regardless of the ADR file — this fixes it.
11. **Written smoke-test record** — what was walked, as which persona, result. Failures become their own issues (§12.3).
12. **Authorization guards fail closed on the deployed DB** *(added — proposed by a teammate 2026-08-17; #65 is the first real deployed-Postgres run, so assert it here).* For each `SECURITY DEFINER` staff RPC, a call with a valid session whose active grant carries **no scope claim** returns **zero rows AND writes an `audit_log` row with `action='denied'`** (assert the denied row, not just the count); and an **in-scope** staff member still reads their own roster (assert the positive too). Ties to #73.

### Edge cases / gotchas (carry into /design + execution)
- **Auth hook must be *registered*** in the staging project's Auth settings, not merely present as a migration — else everyone signs in with no `active_role` and lands on `/no-role`.
- **Cloud default-privilege drift** — `centers`/`classes`/`sessions`/`families`/`family_members` rely on Supabase defaults ("expose new tables" left ON deliberately); first thing to check if a read works locally but returns empty deployed (#28).
- `supabase db push` may end with a red `pgdelta-target-ca.crt: ENOENT` — **cache step only, migrations applied; don't re-run in a panic.**
- **Verify the Supabase org by ID `omjfyyywlgiziiguebgq`**, never by display name (a personal org shares the name).
- **Preview-deploys share the staging DB** — a destructive action in a preview hits staging (fine only because it's synthetic).
- **Netlify credits** — build per merge + per-PR previews; configure 50/75/100% usage alerts.
- **Cloud project auto-pauses** (free tier) — must be un-paused/warmed before a demo; also catch up migrations (29 vs ~22).

### Priority
**POC-core (blocking).** `/promote` is unreachable for six Built/Merged items until staging is proven. Highest current forward-motion item — it produces the loginable, demoable app.

### Consumers
All 6 personas — every built feature is first verified against real infra here. Direct operator: the maintainers (deploy + reset).

### Access scope
Org / infra. Staging holds **synthetic data only** — no real minors' PII, ever (non-negotiable #5/#6). Service-role key stays in Functions env, never in the client bundle (AC#4). Destructive/adversarial pgTAP stays **local**, never run against staging (ADR-0006).

### Out of scope
- Netlify site import + env wiring → **#9** (this starts where #9 ends).
- Prod Supabase project B + prod deploy context → deliberately later.
- Removing the pgTAP `tests.*` helper surface from cloud DBs → **#66** (its own issue).
- Running the pgTAP/adversarial suite against staging → **never** (ADR-0006).
- Populating staging via CSV import → the better *second* test, not the bootstrap.
- Repairing `main`'s branch-protection ruleset → separate human repo-admin task.
- **Realistic *combined-grade* classes** (F3's actual 5 combined classes, per the combined-class story) → the 13-grade layout in AC#5 is enough to *prove staging*; realistic combining is **#19 (pilot-seed-data) / the class-config sibling**, not needed here. *(Noted so it isn't silently dropped.)*

### Open questions
1. ✅ **`/architect` (done):** the two governing ADRs are written (date-based, dated 2026-07-30) and the references repointed — [staging-builds-from-main](../../adr/2026-07-30-staging-builds-from-main.md) + [synthetic-staging-seed-and-accounts](../../adr/2026-07-30-synthetic-staging-seed-and-accounts.md). The **prod-promotion trigger** is recorded there as explicitly deferred to project-B time.
2. ✅ **`/design` (AC#8) — resolved:** transport = **SES** (via the org's AWS account), with **built-in Supabase email (paced)** as the interim for the verification. See Design §A.
3. ✅ **`/design` (AC#5/#6) — resolved:** a cloud-safe `seed-staging` script (no `tests.*`) loads synthetic domain data + provisions accounts via the Auth Admin API on configurable emails. See Design §B. Ties to #66 (helper-removal) but is independent of it.

---

## Design (detailed spec)

> `/design` 2026-09-08. **Non-UI infra/verification item** — no new screen, so the Open-Design/UI step is N/A (stated, not skipped). Design covers the two open decisions (email transport, seed mechanism) + the repeatable reset.

### A. Email transport (AC#8) — SES, with a built-in-email interim
- **Chosen: AWS SES as Supabase Auth Custom SMTP.** Right for the demo + prod — reliable, US-region (matches residency + the EC2/Supabase region), and the org already runs an AWS account (managed by the senior IT/AWS admin) with `cmdfw.org` DNS in Route 53, so sender verification is easy (DKIM/SPF records in the same account).
- **Setup is a cross-team request to the org's IT/AWS admin** (⚠️ a different person from the app-team reviewer): verify a sender for `cmdfw.org`, hand over SMTP creds → set them in the staging project's Auth → SMTP settings. For staging we can stay in SES **sandbox** and just verify the tester recipient addresses (no production-access request needed); prod exits sandbox later.
- **Interim for the #65 verification: built-in Supabase email, paced.** The cloud project's default auth email works today but is rate-limited (~a few/hour). Fine to prove the sign-ins if spaced out — **record the observed limit during the walk.** A simultaneous multi-tester demo is where SES becomes required.

### B. Seed + accounts (AC#5, AC#6) — one cloud-safe `seed-staging` script
A single maintainer-run script (Node; uses the cloud URL + service-role key; **no `tests.*` calls**, so it never pulls the pgTAP auth-user factory into cloud — independent of #66):
1. **Synthetic domain data** — Frisco center · F3 session · Shishu Vihaar/KG–Gr12 (13 classes) + families/students/enrollments, incl. the first center/session/class (covering ADR-0038's "no shipped path to create a session/class" hand-crank). **The dataset itself is authored in #19 (`pilot-seed-data`) as a reusable, idempotent SQL file (no `tests.*`); this script *applies* that file rather than re-authoring it** (data-ownership split agreed 2026-09-14 — see the plan's Shared-seam note). Applied via the service-role script, not `db push --include-seed`/`db reset --linked`, so it stays on a path #87's hook won't gate.
2. **Persona accounts via the Auth Admin API** (`auth.admin.createUser`, service-role) — the 6 personas + one multi-role account (for AC#7's switcher). Emails come from a **configurable base** (`STAGING_SEED_EMAIL_BASE`) using `+`-addressing (`<base>+bv-teacher`, `<base>+bv-parent`, …):
   - **#65 verification:** base = the tester's own Gmail (a personal Gmail account), so every magic-link lands in the tester's own inbox — fully self-serve, no dependency on the `bvportal` group or the IT/AWS admin.
   - **Demo/prod:** base points at team mailboxes (`bvportal`/dedicated) — the SES + team-mailbox path.
3. **Roles** — insert `user_roles` (+ `students.user_id` / `family_members` links) via the `insert_user_role_grant` RPC (idempotent on re-run), mirroring the local seed pattern. **`is_active` is left false** — the auth hook auto-activates a role on first sign-in, so the seed does not pre-activate.
- **Provision-a-tester (hands-on for invited people):** because emails are configurable, onboarding a tester (e.g. a stakeholder or the registration team) = add their email + persona and re-run the seed → they sign in with their **own** Gmail and use the app as that persona (multi-role account or `+tags` for several personas). The app is **provision-only** (ADR-0005), so an *un-provisioned* email lands on the no-role screen — a stranger can't get in.

### C. Repeatable reset (AC#9)
The same script with a **`--reset` (wipe-then-reseed)** mode: truncate the synthetic domain tables + delete the provisioned auth users, then re-seed. One documented command a non-technical maintainer runs to return staging to a clean, known baseline (before a demo, or after test churn). Destructive/adversarial pgTAP is **never** run against staging (ADR-0006) — this is just data reset. **Runbook:** [`.docs/runbooks/reset-staging.md`](../../runbooks/reset-staging.md) (T4).

### Data & RLS impact
Writes only synthetic rows (no real member data); inserts as service-role. **No schema/migration change** (cloud at 35/35 after #89). RLS unchanged — runtime access stays gated by the existing policies (a provisioned persona sees only its own scope; the fail-closed-guard check is AC#12).

### UI
N/A — no new screen. The features being *verified* (feed, dashboard, etc.) are already built + merged; #65 only exercises them on staging.

### Edge cases
- **Rate-limited email** (built-in interim) — space out sign-ins; record the limit; escalate to SES if the walk needs volume.
- **Auto-pause** — the free-tier project pauses after ~1 week idle; resume + re-run `--reset` before a demo if it sat idle.
- **`+`-addressing on a Google *Group*** (`bvportal`) may not route — hence the verification uses a personal-Gmail base, which does support `+`.
- **Preview-deploys share the staging DB** — a destructive preview action hits staging; tolerable only because it's synthetic (a reset restores it).

### Out of scope (design)
- SES production-access (sandbox suffices for staging) → with prod.
- Team-mailbox / `bvportal` provisioning for a broad self-serve demo → after SES lands (via the IT/AWS admin).
- CSV-import-based seeding → the better *second* test; this bootstraps with the script.

### Next
`/plan` — turn the `seed-staging` script (domain SQL + Auth-Admin provisioning + `--reset`) into tasks; run the SES request to the IT/AWS admin as a parallel track for the demo.

---

## Verification walk — results (2026-09-25, re-confirmed 2026-09-28)

Run against cloud staging (`balavihar-connect.netlify.app` / project `ejjvqtleuuamgtlmtxkc`).

**Setup performed (the one-time cloud config the walk surfaced):**
- Pushed migrations #91 + #95 → staging at **37**, matches `main` (AC — env current).
- Ran `npm run seed:staging`: domain loaded + **all 7 personas provisioned** (verified: 3 centers · 6 classes · 33 students · 33 enrollments · 10 roles). AC#5 ✓.
- **Auth hook registered** (`custom_access_token_hook`) — was present as a migration but *not registered* (the documented gotcha; without it everyone lands on `/no-role`). Now enabled.
- **Site URL + redirect allowlist** set to `https://balavihar-connect.netlify.app` (were `localhost`/empty).
- Additive multi-tester mode used to provision two more testers on their own email bases (each claims a distinct unlinked pilot-class student).

**Walked (AC#3/#6/#7):**
- ✅ **Sign-in** — teacher persona via magic link → landed on Teacher home with the correct **role + scope badge** (Teacher · Frisco · F3 · 7-8-9), i.e. the auth hook + JWT scope claims + RLS all work on real cloud infra. Magic-link email delivered to the tester's inbox (built-in sender; rate-limited — space sign-ins out, AC#8 note).
- ✅ **Attendance** — real roster (the nine 7-8-9 students), present/absent, submit; ADR-0038 auto-generated meetings present.
- ⏳ **Feed** — **fails on cloud** with a Postgres statement timeout (57014). Root cause: an RLS-cascade / un-wrapped-`auth.jwt()` perf issue in the `class_updates` read that only bites on the free-tier DB (instant locally). Filed as **[#105](https://github.com/cmdfw-bv/CMDFW-BalaVihar-App/issues/105)** with root-cause + fix direction; it's a follow-up, not a blocker for landing this tooling. (Classes/Chat are unbuilt placeholders — expected.)

**Net:** `main` → staging deploys, cloud Supabase attached, synthetic data + sign-in-able accounts, a persona signs in and uses the app. AC#1/#2/#3/#5 verified; AC#8 (email) confirmed via built-in-paced; the feed's cloud read is #105.

**Deviation from ADR-2026-07-30-synthetic-staging-seed-and-accounts:** that (Closed) ADR specifies **team-controlled mailboxes**; this verification used testers' **personal Gmail** via `+`-addressing (the ADR's own "configurable base" path), which is self-serve and needs no `bvportal`/IT-admin dependency. The team-mailbox/SES path remains the demo/prod route.

**ACs not yet fully walked — tracked as follow-ups (not blockers for landing the tooling):**
- **AC#6** — magic-link sign-in was walked for the **teacher** persona only; the other personas' sign-ins are owed. → follow-up.
- **AC#7** — role-switch (multirole) + web-reload-keeps-session not walked. → follow-up.
- **AC#4** — `/.netlify/functions/health`, US-region check, and the `dist` key-prefix grep not recorded. → follow-up.
- **AC#12** — fail-closed staff-RPC guards (no-scope → zero rows + `audit_log` `denied`) on the deployed DB not recorded (plan T7). → follow-up.

Because of these, this item stays **open**: the PR that lands the tooling says **Refs #65** (not Closes), and each unwalked AC is filed as its own issue.
