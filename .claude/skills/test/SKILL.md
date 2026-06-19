---
name: test
description: Stage 3 (Testing) — run the full suite (pgTAP RLS + app unit/integration). Invoke with /test.
disable-model-invocation: true
allowed-tools: Bash(npm test *) Bash(npm run test*) Bash(npx supabase *) Bash(supabase *) Read
---

# /test — Stage 3 (Testing; AI-DLC Construction)

Authoritative: `.docs/3_ARCHITECTURE.md` §12.3–§12.4, §11.3. Uses `superpowers:systematic-debugging` on failures.

1. Run app unit/integration tests + pgTAP RLS tests (`supabase/tests/`).
2. For access-control changes, run `/rls-audit` (the `rls-adversarial-tester` subagent) — role × scope, incl. after active-role switch; minors' data must not leak.
3. For PWA push changes, run `/verify-push` (playwright-cli; on iOS verify home-screen install, 16.4+ — highest-risk item, §8.1).
3b. For UI changes, run a **design review** with playwright-cli — render the screen and compare against the Open Design prototype (`design/sankalp/prototypes/<screen>.html`) + the design DoD (`design-system` skill).
4. Report pass/fail with evidence. Do not claim green without the command output. Failures → debug, don't paper over.

A passing RLS suite is the gate the migration-guard hook checks before any prod migration (§12.1).
