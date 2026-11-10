# System — staging-deploy-verification — plan

> `/plan` 2026-09-08. Turns the Design section of [staging-deploy-verification.md](staging-deploy-verification.md) into ordered tasks.
> **Stage:** `/refine` ✓ `/architect` ✓ `/design` ✓ `/plan` (this; amended 2026-09-14 for the #19 data-ownership split) → **`/migration` N/A** (no schema change — cloud is at 35/35 after #89) → `/build` (the script) → the operational verification walk.

## Shared seam (§12.6)
**None on the schema side** — #65 adds **no migrations** (the design is explicit: no schema change). The buildable artifact is a **new** `scripts/seed-staging.*` (pure module + wrapper + tests) plus a docs edit (doc 3 §7); nothing serializes against other in-flight work.
**Interplay, not conflict:** #86 (merged 2026-09-09) moved the *local* test-fixture surface into `supabase/seed/`; #65's script is a **separate cloud-safe seed** that uses **no `tests.*`** regardless — the two don't collide. Branch: `arunasharad-coder/issue-65-staging-deploy-verification`.
**Data-ownership split (agreed 2026-09-14, on #65):** the synthetic *dataset* itself is **#19 `pilot-seed-data`'s** subject, authored once in #19 and reused by local dev, CI, and staging. #65 owns the **cloud-safe loader** that applies it to staging + the **sign-in accounts** (Auth Admin API) + reset + the verification walk — it *consumes* #19's dataset, it does not re-author it. The only cross-issue dependency is T3's data-load step (waits on #19's file); everything else in #65 (T1, the account-provisioning + guard + reset shell of T3) is independent and buildable now.

---

## Build tasks (TDD — tests first)

### T1 — `scripts/_seed-staging.mjs` (pure module) + `scripts/__tests__/seed-staging.test.ts`
Pure, no I/O (repo pattern, like `_adr-index.mjs`):
- **Persona set** — the 6 personas + one multi-role account, each `{ role, scope_type, scope_ref, emailTag }` (student→self, parent→own-children, teacher→class, coordinator→session, bv_coordinator→org, admin→org).
- **Email resolution** — `resolvePersonaEmail(base, tag)` → `<base>+bv-<tag>@domain` from `STAGING_SEED_EMAIL_BASE`.
- **Target guard (pure predicate)** — `isStagingTarget(projectRef)`: only the staging ref `ejjvqtleuuamgtlmtxkc` passes; anything else (esp. a future prod ref) is refused. This is the safety rail that keeps the script off prod.
- **Config validation** — refuse without an email base + a cloud target.
- **Tests (red first):** persona mapping, email resolution, target-guard rejects a non-staging ref, config validation errors.

### T2 — synthetic domain dataset → **authored in #19, consumed here** (split agreed 2026-09-14)
The dataset (Frisco center · F3 session · Shishu Vihaar/KG–Gr12 (13 classes) + families/students/enrollments, incl. the first center/session/class for ADR-0038's hand-crank) is **#19 `pilot-seed-data`'s** subject, not #65's — authoring it in both would duplicate it and risk drift. Per the split, **authored in #19** as a **reusable, idempotent SQL file with no `tests.*`**; #65's loader (T3) *applies* that same file. #65 does **not** write the dataset.
- **Agreed form:** one reusable `.sql` that *both* the local seed and #65's cloud loader include — authored once (#19), loaded identically in both places.
- **Sanctioned path (#87):** #65's loader applies the SQL via a **service-role script**, not `db push --include-seed` or `db reset --linked` — so it sidesteps the two mechanisms #87's hook will gate.
- **Dependency:** only T3's data-load step waits on #19's file. Build T1 and the rest of T3 (accounts + guard + reset) against the *existing* seed meanwhile, then point the loader at #19's file when it lands.

### T3 — `scripts/seed-staging.mjs` (thin I/O wrapper) + `npm run seed:staging`
Uses the cloud URL + service-role key from env (never committed). Orchestrates:
1. **Target guard** (T1) — refuse unless the target is the staging ref.
2. Apply the domain SQL (**#19's reusable dataset file**, per T2 — not authored here).
3. **Provision accounts** — `auth.admin.createUser({ email, email_confirm: true })` per persona (idempotent: reuse if the user exists), set `students.user_id` / `family_members`, insert `user_roles` (+ `is_active`).
4. **`--reset` mode** — truncate the synthetic domain tables + delete the provisioned auth users, then re-seed.
Fail-closed on any step; print a summary (persona → email; **no secret values**).

### T4 — reset runbook (AC#9) ✅
[`.docs/runbooks/reset-staging.md`](../../runbooks/reset-staging.md) — env vars, one command (`npm run seed:staging -- --reset`), what it does + does not, and the auto-pause/secret-handling notes, for a non-technical maintainer. Matches the `ses-auth-smtp.md` runbook style.

---

## Verification walk (operational — the actual #65 proof; after build, against cloud staging)

- **T5** — run `seed:staging` against cloud staging (email base = the tester's Gmail) → data + persona accounts loaded.
- **T6 (AC#3/#6/#7)** — sign in as each persona via magic-link (built-in email, **paced**) on `balavihar-connect.netlify.app`: confirm an authenticated read (AC#3), each persona lands on the right home (AC#6), and the multi-role account switches + web-reload keeps the session (AC#7). **Record the built-in email rate limit observed** (AC#8 note).
- **T7 (AC#12 + AC#4)** — fail-closed guard check on the cloud DB (no-scope → zero rows + `audit_log` denied; in-scope read works); confirm `/.netlify/functions/health`; re-confirm the client-bundle secret scan (the prior client-bundle scan was clean).
- **T8 (AC#10)** — correct doc 3 §7 (§7.1 table + §7.2 text + §7.1 mermaid) to build-from-`main`, per `ADR-2026-07-30-staging-builds-from-main`.
- **T9 (AC#11)** — write the smoke-test record (what walked, as which persona, result); any failure → its own GitHub issue.

---

## Not in this plan
- **The dataset's shape** — **#19**; this plan consumes it (see T2).
- **SES setup** (via the IT/AWS admin) — parallel track for a *bigger/self-serve* demo; the walk here uses built-in email.
- **#86 fixture-removal applied to staging (#89)** — ✅ **done 2026-09-10** (drop migration applied to `cmdfw-bv-staging`, absence check PASS). **Prod project B** — later, gated (before prod).

## Handoff
No `/migration` (no schema change). → **`/build`** the seed-staging script (T1–T4), then run the verification walk (T5–T9). `/test` records the marker after the unit tests (T1) are green.
**Build order given the #19 split:** **T1 first** (fully independent — config module + target guard + tests, TDD). Then the account/guard/reset shell of **T3**. Wire T3's **data-load step to #19's dataset file once it lands** (buildable against the existing seed meanwhile). **T4** runbook anytime. Then the verification walk (T5–T9), which needs both #19's data and the accounts in place.
