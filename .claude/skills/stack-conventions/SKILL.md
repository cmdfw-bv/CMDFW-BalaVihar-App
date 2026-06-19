---
name: stack-conventions
description: Use when writing or organizing any code in this repo — the Expo/Supabase/Netlify layout, key-handling rules, and TS/SQL idioms for the CMDFW Bala Vihar app.
---

# Stack conventions

Authoritative detail: `.docs/3_ARCHITECTURE.md` §4 (repo) and §2–§3 (topology).

## Where things live (the boundary is the directory)
- `app/` — Expo Router screens/routes (web + native, one tree). `components/` — shared UI. `features/<persona>/` — per-domain logic grouped by owner persona (§12.12).
- `lib/` — `supabase.ts` (anon-key client only), `auth/` (session + active-role switch), `push/`.
- `netlify/functions/` — the ONLY home for privileged secrets (service-role, VAPID private, SES).
- `supabase/migrations/` — schema/RLS/auth-hook (source of truth). `supabase/tests/` — pgTAP. `supabase/seed/` — synthetic data only.
- `.docs/` — requirements, architecture, `adr/`, `specs/<persona>/`. `.claude/` — this governance layer.

## Idioms
- TypeScript everywhere on the client; SQL for all DB logic (no Deno — the multi-role claim is a Postgres auth hook, §5).
- Invoke intent via `npm run` scripts (start / test / deploy-staging), not raw tooling.
- One Supabase client, anon key. Never import the service-role key into client code.
- Keep `features/` units small and bounded; when a folder sprawls, split it.

## Non-negotiables (enforced by hooks — §12.1)
RLS-in-DB · no secrets/PII in client or Git · schema-as-migrations · TDD · US residency · minors' data minimized + audited. See `.claude/CLAUDE.md`.
