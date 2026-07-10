---
name: persona-scope
description: Use when deciding what a persona may see or do, or where a feature/spec belongs — the 7-persona role × scope model for the CMDFW Bala Vihar app.
---

# Persona & scope model

Authoritative detail: `.docs/3_ARCHITECTURE.md` §5.4 and §12.12.

## Seven personas
Student · Parent · Teacher · Coordinator (session) · BV Coordinator (org) · Admin · **System** (non-human: auth/RLS engine, consent/audit/retention, notifications infra, CI/CD, monitoring, hooks). Deferred: Substitute, Volunteer.

## Scope (drives every RLS policy)
| Persona | scope | sees |
|---|---|---|
| Parent | own-children | own children's records |
| Student | self | own class/attendance/comments/chat |
| Teacher | class | own class roster/attendance/updates/moderation |
| Coordinator | session | classes in own session; approvals in session |
| BV Coordinator | org | org-wide rollups (degenerate single-session at pilot) |
| Admin | org | full org; user/role mgmt |
| System | engine | cross-cutting infra |

## Docs taxonomy (§12.12) — persona → functionality
- Specs live at `.docs/specs/<persona>/<functionality>.md`, defined **once** under the **owning persona** (the initiator); ownerless infra → `system/`.
- Mandatory header: `owner · consumers · scope · governing ADR · covers`. Consumers cross-reference, never duplicate.
- A single account may hold multiple roles (Parent→Teacher→Coordinator→BV Coordinator) with an active-role switch — each carries a different scope.
