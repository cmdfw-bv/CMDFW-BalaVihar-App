# CMDFW Bala Vihar — project rules (constitution)

Authoritative architecture: @.docs/3_ARCHITECTURE.md
Requirements (what/why + per-persona scope): @.docs/1_GREENFIELD_POC_PROPOSAL.md · @.docs/2_POC_FEATURE_SCOPE.md
Future hosting option: @.docs/AWS_HOSTING_PATH.md

> This file is **context, not enforcement**. Hard blocks live in `.claude/settings.json` hooks (3_ARCHITECTURE §12.1).
> Maintainers are three non-technical volunteers + Claude Code — favor intent-level commands and the staged pipeline.

## Non-negotiables (§12.1)

1. **Access control is RLS in the database.** Never gate access in client code only. Every table is RLS-on; policies key off the `active_role` + scope claims set by the auth hook (§5).
2. **No secrets or PII in the client or Git.** The service-role key, VAPID private key, and SES creds live **only** in `netlify/functions/` env. Client code (`app/`, `features/`, `lib/`) uses the **anon** key only.
3. **Schema is code.** All schema/RLS/auth-hook changes are timestamped SQL migrations in `supabase/migrations/`. Never edit prod via Studio (§6).
4. **Test-Driven Development is non-negotiable.** Write the test first, confirm it fails (Red), then implement. RLS gets adversarial role × scope tests (§11.3) before any prod migration.
5. **US data residency.** Every PII-touching service is US-region under DPA. No marketing/analytics trackers (§3).
6. **Minors' data is minimized + audited.** Consent captured, audit_log on access, retention enforced (§11).

## How we work — the staged pipeline (§12.3)

Every feature flows (sequential, per item): **`/refine` → `/architect` (review) → `/design` → `/plan` → `/migration` → `/build` → `/test` → `/deploy-staging` → `/promote`.**

- **Picking up parallel work:** ask "what feature can I work on next" (or run `/next-feature`) — fetches open, unassigned GitHub issues labeled `feature`, lets you pick one, assigns it to you, and hands off into `/refine`. Issues are a pickable view onto the persona `_index.md` backlogs (§12.12); the `_index.md` row is always the source of truth if the two ever disagree.

- **Plan → ask → human-validate (AI-DLC):** propose, ask clarifying questions, and act **only after human validation**. Defer critical decisions to humans. Do not assume.
- **Spec is the source of truth (SDD):** features are specced under `.docs/specs/<persona>/<functionality>.md` before they are built.
- **Docs are organized persona → functionality** (7 personas incl. **System**); each spec carries `owner · consumers · scope · governing ADR · covers` (§12.12).
- **`/refine` elaborates one item per call; `/architect` reviews every item** and records an ADR only when the decision is architecturally significant (§12.10). Never edit a Closed ADR — supersede it.

## Stack

Expo (RN + RN-Web, TypeScript) · Supabase (Postgres/RLS, Auth magic-link, Realtime) · Netlify (static PWA + US-region functions) · AWS SES · Sentry (US). See @.docs/3_ARCHITECTURE.md for the full topology.

Path-scoped rules apply automatically when working in `supabase/**`, `netlify/functions/**`, and client code — see `.claude/rules/`.
