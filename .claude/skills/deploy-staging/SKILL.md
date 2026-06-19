---
name: deploy-staging
description: Stage 4a (Promotion) — apply migrations + deploy to the staging environment. Invoke with /deploy-staging.
disable-model-invocation: true
allowed-tools: Bash(git *) Bash(npx supabase *) Bash(supabase *) Bash(npx netlify *) Bash(netlify *) Read
---

# /deploy-staging — Stage 4a (Operations)

Authoritative: `.docs/3_ARCHITECTURE.md` §7, §12.3.

1. Confirm `/test` is green (incl. RLS audit). If not, stop.
2. Push the branch → Netlify `staging` deploy context (Supabase cloud project A).
3. Apply migrations to **staging** via the Supabase CLI (staging project ref). Never the local-dev or prod ref here.
4. Smoke-check the staging build; verify on-device PWA push if relevant (§8.1).
5. Report the staging URL + what to validate. Promotion to prod is a separate, human-approved step (`/promote`).

Reminder: per-context env vars — staging uses its own Supabase URL + anon key; secrets live on Functions env only (§7.2).
