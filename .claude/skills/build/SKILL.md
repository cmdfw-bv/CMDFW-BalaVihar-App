---
name: build
description: Stage 2c (Development) — implement a feature's client/function code test-first. Invoke with /build <feature>.
disable-model-invocation: true
---

# /build <feature> — Stage 2c (TDD)

Authoritative: `.docs/3_ARCHITECTURE.md` §12.3; uses `superpowers:test-driven-development` (NON-NEGOTIABLE).

1. **Write the unit test first**, confirm it FAILS (Red).
2. Implement the minimum in `features/<persona>/` (and `netlify/functions/` if the plan calls for it) to pass (Green); refactor.
3. Client uses the anon Supabase key only; access is RLS-enforced (never gate in client). Push payloads PII-free.
3b. **Style with Unistyles + `lib/theme.ts` tokens** (never hex) to match the Sankalp prototype; enforce the design DoD — all five states incl. permission-denied-as-designed, role badge + scope, tabular numerics, ≥44px, breakpoints (see `design-system`). Media via expo-image/video/audio/youtube-iframe; animation (future) via Moti, declarative-only (`motion` rule).
4. Keep units small and bounded; shared logic in `lib/` or `features/shared`.
5. When the spec's behavior is covered and tests pass → hand to `/test`.

Guardrails: secret-scan blocks any secret/PII landing in client or Git (§12.1). Follow `stack-conventions`, `client-privacy`.
