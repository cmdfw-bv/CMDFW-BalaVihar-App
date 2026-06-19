# ADR-0008: Delivery — Claude Code skills + enforcing hooks; SDD + AI-DLC through our own tree

**Status:** Closed · **Date:** 2026-06-16 · **Deciders:** Project owner + architect

### Context
Three non-technical volunteers + Claude Code build and operate an app handling minors' data. We need guidance Claude follows **and** guarantees it can't bypass. Researched: GitHub Spec Kit / SDD (113.9k★), AWS AI-DLC (2,987★), official Anthropic skills + Supabase AI prompts/MCP.

### Options Considered
- **Skills + enforcing hooks, methodology via our own tree** — Pros: CLAUDE.md/rules guide; hooks (secret-scan, migration-guard, schema-guard, residency-guard) hard-block dangerous paths; one artifact tree (.docs/ + .claude/); no external CLI dependency. Cons: we author the skills ourselves.
- **Skills only (advisory)** — Cons: one missed step can leak minors' data. Rejected.
- **Adopt Spec Kit CLI wholesale (`.specify/`)** — Cons: second artifact tree alongside .docs/ + ADRs; CLI/Python dependency. Rejected for this team.

### Decision
**Skills + enforcing hooks.** Four pillars — govern (hooks) · guide (reference skills) · deliver (staged Design→Development→Testing→Promotion) · test (RLS adversarial subagent). Adopt **SDD** (spec as source of truth) + **AI-DLC** (plan→ask→human-validate; Units of Work) expressed through `.docs/` + `.claude/`. Constitution = CLAUDE.md + rules + hooks. `/architect` drives ADR-based breakdown; docs organized persona → functionality (incl. System).

### Consequences
`.claude/` ships in-repo (tracked) so a clone is the setup. Skills sourced official-first. See 3_ARCHITECTURE §12.
