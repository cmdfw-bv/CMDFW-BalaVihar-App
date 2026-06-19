---
name: promote
description: Stage 4b (Promotion) — promote validated staging to production via PR to main. Invoke with /promote.
disable-model-invocation: true
allowed-tools: Bash(git *) Bash(gh *) Read
---

# /promote — Stage 4b (Operations, the convergence gate)

Authoritative: `.docs/3_ARCHITECTURE.md` §7.2, §12.1, §12.6.

1. Confirm staging was validated and `/test` (incl. RLS audit) is green.
2. Open a PR from the feature/staging branch → `main`. Summarize the spec, the governing ADR(s), and test evidence.
3. Prod migration applies **only after the RLS test suite passes** — enforced by the **migration-guard hook** (§12.1). Do not bypass.
4. Promotion is the single convergence funnel — all parallel Units of Work merge here in migration order.
5. **Get explicit human approval before merging/deploying to prod.** This is real users + minors' data.

Never commit/push or merge without the maintainer's go-ahead.
