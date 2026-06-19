---
name: migration
description: Stage 2b — create a timestamped Supabase migration (schema + RLS) with a matching pgTAP test. Invoke with /migration <name>.
disable-model-invocation: true
allowed-tools: Bash(npx supabase *) Bash(supabase *) Read Write Edit
---

# /migration <name> — Stage 2b (schema as code)

Authoritative: `.docs/3_ARCHITECTURE.md` §6; skill `rls-patterns`. Follow Supabase's official "Create migration" + "Create RLS policies" prompts.

1. Create `supabase/migrations/<timestamp>_<name>.sql` — DDL + RLS policies (default-deny, scope-keyed) + any auth-hook change (hardened per §5.5).
2. Create the **matching pgTAP test** in `supabase/tests/<name>_rls_test.sql` — adversarial role × scope (prove no cross-scope leak, esp. minors').
3. Apply locally: `supabase db reset` (re-seeds synthetic data). Never point at staging/prod from here.
4. Run `/test`; iterate until green. Migration is NOT done without its passing RLS test.

Guardrail: edits to consent/audit/RLS/auth-hook migrations trigger schema-guard (review required). Prod apply is gated by migration-guard (§12.1).
