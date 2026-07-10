---
name: refine
description: Stage 1 step 1 (Inception/elaboration) — refine ONE high-level POC item for ONE persona into a feature brief. Invoke with /refine <persona> "<poc item>".
disable-model-invocation: true
---

# /refine <persona> "<one POC item>" — per-item feature refinement (AI-DLC Inception)

Authoritative: `.docs/3_ARCHITECTURE.md` §12.3, §12.10–§12.13. Uses `superpowers:brainstorming`.
**First step of the sequence: `/refine` → `/architect` (review) → `/design`.**

## Scope — one persona, one item, per call
Refine a **single** capability from `.docs/2_POC_FEATURE_SCOPE.md` (e.g. Teacher → "mark & submit attendance"). **Never refine a whole persona in one session.** The persona backlog grows one item at a time → small, parallelizable sessions.

## Inputs
The doc 2 entry for the item · `.docs/1_GREENFIELD_POC_PROPOSAL.md` · `.docs/3_ARCHITECTURE.md` · `persona-scope` + `privacy-rules` skills · existing `.docs/specs/<persona>/_index.md`.

## Method (plan → ask → human-validate — do not assume)
1. Restate the one item and its persona.
2. Elaborate into a **feature brief**: user story ("As a <persona>, I want … so that …") · acceptance criteria · edge cases · priority (POC-core / defer) · consumers (other personas) · access scope (§5.4).
3. **Ask the human** to confirm priority + any ambiguous business rules (1–2 questions, focused).
4. Write the brief to `.docs/specs/<persona>/<functionality>.md` under `## Requirements (refined)`, and add/update one row in the persona backlog `.docs/specs/<persona>/_index.md` (`functionality · priority · owner · consumers · scope · status`).

## Handoff — sequential
Always hand the brief to **`/architect` (review)** next — not `/design` directly. Architect reviews it, records an ADR if there's a significant decision, then passes to `/design`.

## Guardrails
Requirements only — no design/implementation. Shared cross-persona capabilities are owned by ONE persona (don't duplicate — §12.12); cross-cutting/infra belongs to the **System** persona. RLS/scope, US residency, minors'-data minimization frame every story.
