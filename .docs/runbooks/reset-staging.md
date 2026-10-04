# Runbook: Reset the staging data to a clean baseline

> Infra/data only — no application code, no schema change. Governs: `.docs/specs/system/staging-deploy-verification.md` AC#9.
> Run this **any time** staging has drifted and you want a known-good starting point — e.g. **before a demo**, or after test churn. It is safe to re-run.
>
> **Status:** the plain seed + additive mode are verified live against cloud staging (2026-09-25
> walk). The command loads #19's synthetic dataset and provisions the sign-in accounts; `--reset`
> wipes and reseeds. The `--reset` path's idempotency + safety hardening (#108) is unit-tested and
> pending a fresh live re-verification — treat a `--reset` run as still being confirmed in the field.

## What it does

`npm run seed:staging -- --reset` returns the **staging** database to a clean, known baseline:

1. **Refuses to run unless the target is staging** — the built-in guard checks the project ref
   in your `STAGING_SUPABASE_URL` **and** `STAGING_DB_URL` (and refuses if they disagree). It also
   hardens the DB URL so a prod host can't ride in past the ref check: it rejects any query param
   other than `sslmode`, an `sslmode` that isn't an encrypting mode (`require`/`verify-ca`/`verify-full`),
   a `#` fragment, and a comma-separated multi-host. Anything other than `cmdfw-bv-staging` is
   rejected. It can never touch production.
2. **Wipes the synthetic data** — truncates the synthetic domain tables
   (center/session/classes/families/students/enrollments). `TRUNCATE … CASCADE` also clears
   everything that references them: attendance, class_meetings, class_updates, comments, consents,
   and **audit_log**. (A row-level *delete* of a student would instead keep the audit row and null
   its `target_student_id` — `ON DELETE SET NULL`, constitution #6's minors'-audit retention — but
   `TRUNCATE … CASCADE` does not honor that and truncates audit_log wholesale. Acceptable here **only**
   because staging is synthetic and reloaded; the staging-only guard keeps `--reset` off prod, where
   retention must hold.) Then it deletes **all** provisioned persona accounts (every tester's
   `+bv-<persona>` logins — matched by our exact persona tags, so a bystander account that merely
   contains `+bv-` is never swept). It leaves conversations/messages with stale scope_ids — harmless
   on synthetic staging, which gets reloaded.
3. **Reloads** the synthetic dataset (#19) and **recreates the 7 sign-in accounts** on your
   configured email base, then prints them.

It writes **only synthetic rows** — staging holds no real family data, ever. It runs **no
migrations** and **no pgTAP**; it is a data reset, not a schema change.

## Prerequisites — four environment variables

Set these in your terminal for the run (they are **not** committed anywhere):

| Variable | What it is | Where to get it |
|---|---|---|
| `STAGING_SEED_EMAIL_BASE` | your full email; all persona logins fan out from it via `+` addressing (`you+bv-teacher@…`) | your own Gmail (e.g. `you@gmail.com`) |
| `STAGING_SUPABASE_URL` | the staging project's API URL | Supabase dashboard → **cmdfw-bv-staging** → Connect (or Project Settings → API) → `https://ejjvqtleuuamgtlmtxkc.supabase.co` |
| `STAGING_SUPABASE_SERVICE_ROLE_KEY` | the service-role secret (bypasses RLS — powerful; used for the Auth Admin account creation) | Supabase dashboard → **cmdfw-bv-staging** → Project Settings → API → **`service_role` secret** |
| `STAGING_DB_URL` | the Postgres connection string (carries the DB password); used by `psql` to load the synthetic `domain.sql` and, on `--reset`, to truncate | Supabase dashboard → **cmdfw-bv-staging** → **Connect** → the pooler URI (`postgresql://postgres.ejjvqtleuuamgtlmtxkc:…@…pooler.supabase.com:6543/postgres`). Must be the **staging** project — the script refuses any other ref, and refuses if it disagrees with `STAGING_SUPABASE_URL`. |

> **`psql` must be installed and on your PATH** (it ships with the Postgres client tools / the Supabase CLI). The script shells out to it to apply `domain.sql`.

## Steps

1. **If the project is paused** (free tier pauses after ~1 week idle), open the Supabase
   dashboard and **resume** `cmdfw-bv-staging` first; wait until it shows *Healthy*.
2. **Set the four variables** in your terminal (paste the secrets at a prompt rather
   than into a shared file):
   ```bash
   export STAGING_SEED_EMAIL_BASE='you@gmail.com'
   export STAGING_SUPABASE_URL='https://ejjvqtleuuamgtlmtxkc.supabase.co'
   read -rs "STAGING_SUPABASE_SERVICE_ROLE_KEY?service_role key: "; export STAGING_SUPABASE_SERVICE_ROLE_KEY   # zsh
   read -rs "STAGING_DB_URL?staging Postgres connection URI: "; export STAGING_DB_URL                          # zsh
   ```
3. **Run the reset:**
   ```bash
   npm run seed:staging -- --reset
   ```
   Because `--reset` is destructive, it first prints what it will wipe and asks you to type
   `reset ejjvqtleuuamgtlmtxkc` to confirm. (For a non-interactive/CI run with no prompt available,
   add `--yes` to skip the confirmation: `npm run seed:staging -- --reset --yes`.)
4. **Confirm the output** lists the 7 persona accounts and ends with `seed-staging: done.` If it
   refuses, read the message — a wrong `STAGING_SUPABASE_URL` (not the staging project), a missing
   key, or an unconfirmed `--reset` all fail closed on purpose.
5. **Clear the secrets from memory** when finished: `unset STAGING_SUPABASE_SERVICE_ROLE_KEY STAGING_DB_URL` (both carry credentials).

To seed a *fresh* (empty) staging without wiping first, run the same command **without** `--reset`.

## Adding another tester (additive mode)

To let another person sign in as the personas on **their own** inbox — without wiping the existing data or accounts — run the seed **without `--reset`**, pointing `STAGING_SEED_EMAIL_BASE` at their email:

```bash
export STAGING_SEED_EMAIL_BASE='theiremail@gmail.com'   # keep the other three vars as-is
npm run seed:staging
```

Because the domain data already exists, the script prints *"accounts-only (additive) mode"*, skips the data load, and just provisions that person's 7 persona accounts (`theiremail+bv-teacher@…`, etc.) alongside everyone else's. They then sign in with their own inbox. Each tester's **student** persona automatically claims a different (unlinked) student from the pilot class, so testers don't collide — the pilot class has 9 students, enough for several testers.

> **Note on `--reset` vs. multiple testers:** `--reset` wipes **everyone's** accounts but only rebuilds the accounts for the `STAGING_SEED_EMAIL_BASE` that ran it. So after a reset, any *other* testers must re-run the additive seed on their own email base to get their logins back. It is a full wipe, but a reload only for the runner — not a reload "for everyone".

> **If a run is interrupted part-way,** just re-run the same command — provisioning is idempotent (it reuses the base's existing student/family and skips roles already granted), so a re-run finishes the job rather than creating a second family for that tester. (Only a crash *between* claiming an unlinked student and linking its guardian could leave a half-provisioned base; the re-run reuses that same student, so it does not fork a second family.)

## Notes

- **Never point seeding at production.** The guard enforces this, but also never set
  `STAGING_SUPABASE_URL` to a prod project ref. `supabase db push --include-seed` and
  `supabase db reset --linked` are separately forbidden against any cloud project (they load the
  test-fixture surface and fabricate auth users) — this script deliberately uses neither
  (ADR-2026-09-07 Decision 5; hook enforcement tracked as #87).
- **No secret is committed** — the service-role key lives only in your shell for the run, never
  in the repo (constitution rule #2).
- **Sign-in after a reset:** request a magic link for any persona email (e.g.
  `you+bv-teacher@gmail.com`) on `balavihar-connect.netlify.app`; it lands in your one inbox.
