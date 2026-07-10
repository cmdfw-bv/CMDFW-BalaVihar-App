---
name: next-feature
description: Entry point for picking up parallel work — fetches open, unassigned GitHub issues labeled `feature`, lets the human pick one, assigns it, and hands off to /refine. Invoke with /next-feature, or naturally when asked "what feature can I work on next".
---

# /next-feature — pick up the next parallel unit of work

Authoritative: `.docs/3_ARCHITECTURE.md` §12.6 (parallel delivery model), §12.12 (persona → functionality backlog). GitHub issues labeled `feature` are a **pickable-unit-of-work view** onto the persona `_index.md` backlogs — the spec index remains the source of truth for status/owner/consumers/scope; an issue just wraps a "Not started" row so a team member can claim it.

## Method
1. Fetch: `gh issue list --search "is:open is:unassigned label:feature" --json number,title,body,url`.
2. If empty: say so plainly. Check persona `_index.md` files for "Not started" rows with no matching open issue — offer to file issues for those (see "Filing new issues" below) rather than inventing new work.
3. Present the list to the human (title + one-line summary from the body) and **ask which one they want** — this is a human decision, never auto-pick.
4. On pick:
   - `gh issue edit <number> --add-assignee @me` (assign to the current GitHub user; ask whose handle if working on someone else's behalf).
   - `gh issue comment <number> --body "Picked up — moving into /refine."`
   - Invoke `/refine <persona> "<item>"` using the issue's owning persona and functionality name (title format is `<Persona>: <functionality-slug>`).
5. **One issue per call.** Mirrors `/refine`'s one-item-per-call scope (§12.3) — don't assign or refine a second issue in the same pass.

## Filing new issues (when a persona/System backlog grows)
When `/refine` adds a new "Not started" row to any `_index.md`, file a matching issue: `gh issue create --title "<Persona>: <functionality>" --label feature --body "<priority/owner/consumers/scope from the index row, plus a Next step: /refine ... line>"`. Leave it unassigned until someone picks it up here.

## Closing out
When an item's status moves past "Not started" in its `_index.md` (refined, built, or otherwise resolved) but its issue is still open, close the issue with a short comment pointing at the spec — don't leave stale pickable issues around.

## Guardrails
Don't let GitHub issues become a second source of truth — if an issue's body ever disagrees with its `_index.md` row (priority, owner, scope), the `_index.md` wins; fix the issue body to match, don't edit the spec to match a stale issue.
