# Runbook: Reset the staging data to a clean baseline

> Infra/data only — no application code, no schema change. Governs: `.docs/specs/system/staging-deploy-verification.md` AC#9.
> Run this **any time** staging has drifted and you want a known-good starting point — e.g. **before a demo**, or after test churn. It is safe to re-run.
>
> **Status:** the command's config gate + prod-safety rail are live today. The data steps it
> performs (load synthetic data, create accounts) become operational once the synthetic dataset
> from **#19 (`pilot-seed-data`)** has landed and the loader is wired to it at the #65 verification
> walk. Until then, the command fail-closes with a clear "waiting on #19" message.

## What it does

`npm run seed:staging -- --reset` returns the **staging** database to a clean, known baseline:

1. **Refuses to run unless the target is staging** — the built-in guard checks the project ref
   in your `STAGING_SUPABASE_URL`; anything other than `cmdfw-bv-staging` is rejected. It can
   never touch production.
2. **Wipes the synthetic data** — deletes the provisioned persona accounts and truncates the
   synthetic domain tables (center/session/classes/families/students/enrollments).
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
2. **Set the three variables** in your terminal (paste the service-role key at a prompt rather
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
4. **Confirm the output** lists the 7 persona accounts and ends with `seed-staging: done.` If it
   refuses, read the message — a wrong `STAGING_SUPABASE_URL` (not the staging project) or a
   missing key both fail closed on purpose.
5. **Clear the secrets from memory** when finished: `unset STAGING_SUPABASE_SERVICE_ROLE_KEY STAGING_DB_URL` (both carry credentials).

To seed a *fresh* (empty) staging without wiping first, run the same command **without** `--reset`.

## Adding another tester (additive mode)

To let another person sign in as the personas on **their own** inbox — without wiping the existing data or accounts — run the seed **without `--reset`**, pointing `STAGING_SEED_EMAIL_BASE` at their email:

```bash
export STAGING_SEED_EMAIL_BASE='theiremail@gmail.com'   # keep the other three vars as-is
npm run seed:staging
```

Because the domain data already exists, the script prints *"accounts-only (additive) mode"*, skips the data load, and just provisions that person's 7 persona accounts (`theiremail+bv-teacher@…`, etc.) alongside everyone else's. They then sign in with their own inbox. Each tester's **student** persona automatically claims a different (unlinked) student from the pilot class, so testers don't collide — the pilot class has 9 students, enough for several testers. `--reset` remains the full wipe-and-reload for everyone.

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
