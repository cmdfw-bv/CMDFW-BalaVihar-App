---
name: plan
description: Stage 2a (Planning) — turn an approved spec into an implementation plan with tasks. Invoke with /plan <feature>.
disable-model-invocation: true
---

# /plan <feature> — Stage 2a (SDD plan + tasks; AI-DLC Construction)

Authoritative: `.docs/3_ARCHITECTURE.md` §12.3. Uses `superpowers:writing-plans`.

1. Read the approved `.docs/specs/<persona>/<functionality>.md`.
2. Produce an ordered task list covering: migration(s) + RLS + pgTAP tests, client `features/<persona>/` code, any `netlify/functions/` work, unit tests (TDD — tests first).
3. Identify the **shared seam**: schema/migrations are serialized; app code parallelizes (§12.6). Note worktree/branch.
4. Flag anything still architecturally significant → bounce back to `/architect`.
5. Save the plan alongside the spec; get sign-off → hand to `/migration` then `/build`.
