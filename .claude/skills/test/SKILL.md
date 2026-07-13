---
name: test
description: Stage 3 (Testing) — run the full suite (pgTAP RLS + app unit/integration). Invoke with /test.
disable-model-invocation: true
allowed-tools: Bash(npm test *) Bash(npm run test*) Bash(npx supabase *) Bash(supabase *) Bash(node .claude/hooks/_migrations-hash.js*) Bash(node .claude/hooks/_tests-hash.js*) Bash(rm -f .claude/.rls-tests-passed) Bash(rm -f .claude/.tests-passed) Bash(gh issue create*) Bash(gh issue list*) Bash(gh issue close*) Read
---

# /test — Stage 3 (Testing; AI-DLC Construction)

Authoritative: `.docs/3_ARCHITECTURE.md` §12.3–§12.4, §11.3. Uses `superpowers:systematic-debugging` on failures.

1. Run app unit/integration tests + pgTAP RLS tests (`supabase/tests/`).
2. For access-control changes, run `/rls-audit` (the `rls-adversarial-tester` subagent) — role × scope, incl. after active-role switch; minors' data must not leak.
3. For PWA push changes, run `/verify-push` (playwright-cli; on iOS verify home-screen install, 16.4+ — highest-risk item, §8.1).
3b. For UI changes, run a **design review** with playwright-cli — render the screen and compare against the Open Design prototype (`design/sankalp/prototypes/<screen>.html`) + the design DoD (`design-system` skill).
3c. **Walk `UAT.md`** (repo root) — the manual, click-through business-user scenarios. Required for any change touching a flow it covers (auth/session/nav, and any future scenario added there); record Pass/Fail per scenario. If a change genuinely doesn't touch any UAT-covered flow, note explicitly why it's being skipped rather than silently omitting it.
4. Report pass/fail with evidence. Do not claim green without the command output. **Failures → log, then fix, don't paper over:** file each distinct failure as a GitHub issue (`gh issue create --label bug --title ... --body ...`) before debugging it with `superpowers:systematic-debugging`; close the issue (`gh issue close`) once the fix re-runs green. Re-run from step 1 until the whole suite is green — a PR cannot open on red or unrecorded tests (§12.1, enforced by the `pr-guard` hook).
5. **Record the gate markers** — only once the suite is fully GREEN:
   - RLS-specific (unblocks remote migration pushes for *exactly these* migrations): `node .claude/hooks/_migrations-hash.js > .claude/.rls-tests-passed`
   - Full-suite (unblocks `gh pr create` for *exactly this* source tree): `node .claude/hooks/_tests-hash.js > .claude/.tests-passed`
   - any failure: `rm -f .claude/.rls-tests-passed .claude/.tests-passed` (so a stale pass can't wave through a remote push or a PR).

A passing suite is the gate the `migration-guard` and `pr-guard` hooks check — before a remote migration push and before opening a PR, respectively. Each marker is tied to the content it covers, so changing that content after testing re-blocks until /test is re-run (§12.1).
