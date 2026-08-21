# ADR-2026-08-21-adr-identifier-scheme: Date-based ADR ids + a generated, categorized index

**Status:** Closed · **Category:** Infra/Process · **Date:** 2026-08-21 · **Deciders:** Aruna (lazy-consensus — Option A/B posted on #79 with an end-of-day deadline; no objections from the team)

### Context
ADR ids were sequential (`ADR-00NN`), assigned by hand from whatever the author's **branch** showed. With several branches open at once, two people each compute "next = 00NN" and collide — **silently, at merge**: `ADR-0030`, `ADR-0031`, and `ADR-0038` are each claimed by more than one branch, some with contradictory content (see #56, #79). The two files have different slugs (`0038-foo.md` vs `0038-bar.md`), so git sees no conflict and both land — leaving two `ADR-0038`s on `main`. GitHub *issues* never collide because GitHub assigns their numbers centrally; ADR numbers collide because humans assign them from stale, branch-local views.

Separately, the index (`.docs/adr/README.md`) is **hand-maintained** (the `/architect` skill edits it when it writes an ADR), so an ADR's id, status, and category can drift from the file itself; and there was **no category dimension** at all, so a reader could not tell a usability decision from a technical one.

### Options Considered
- **Date-based ids + generated index (chosen)** — new ADRs get `ADR-YYYY-MM-DD-<slug>`; existing `0001–0033` keep their numbers; a script regenerates the categorized index from the files. Pros: two branches **structurally cannot** collide (no shared counter); the id is stamped at authoring and never depends on merge order/date; the index **cannot drift** (derived from the files); adding a Category is free. Cons: two id conventions coexist (numbered past, dated future) — softened because the generated index lists them uniformly.
- **Keep `ADR-00NN` + a CI guard** — a CI check that rejects a PR whose number already exists on `main` or another open PR, plus a "next free number" helper. Pros: keeps the familiar shorthand. Cons: more machinery; *catches* collisions rather than *preventing* them; un-PR'd branches stay invisible until their PR opens. Rejected in favor of preventing the class of bug outright.
- **Renumber all existing ADRs to the new scheme** — Cons: `ADR-00NN` is referenced across ~31 docs, the specs, the `_index.md` "governing ADR" columns, and cross-ADR links; renaming breaks every one, and you do not rewrite a decision *log*. Rejected.

### Decision
1. **New ADRs use a date-based id:** `ADR-YYYY-MM-DD-<slug>`, file `.docs/adr/YYYY-MM-DD-<slug>.md`. The date is the **authoring date**, stamped at creation and **immutable** after — it never becomes the merge date, so an id can be referenced the moment the ADR is written. `<slug>` is a short kebab-case topic phrase (the same slug style the numbered ADRs already use). A same-day **and** same-slug pair can only mean the *same decision* — and it surfaces as a loud git `add/add` conflict at merge, never a silent clash.
2. **Existing `ADR-0001…0033` keep their numbers** (a hybrid: numbered past, dated future). The `ADR-00NN` shorthand stays load-bearing for the ~31 docs that reference it; the generated index lists numbered and dated ADRs uniformly, so the split is invisible at the reading level.
3. **Every ADR header carries a `Category:` field** — one of **UX · Auth/Access · Data · Privacy/Minors · Chat/Notifications · Infra/Process** — so the index can group by decision type.
4. **The index (`.docs/adr/README.md`) is GENERATED from the ADR files** by `scripts/gen-adr-index.mjs` (`npm run gen:adr-index`), grouped by Category, reading each ADR's id/title/status/date/category from its header. A CI check fails if the committed index is out of sync with the files, so it cannot drift. `/architect` **regenerates** the index rather than hand-editing it, and stamps the authoring date + Category on new ADRs rather than hand-picking a number.

### Consequences
- The `/architect` skill (`.claude/skills/architect/SKILL.md`) is updated to: stamp the authoring date, require a Category, and run the generator — no hand-picked number, no hand-edited README. Ships with this ADR.
- Existing ADR headers gain a `Category:` field (backfilled from the categorisation in #79); the generator relies on that field being present.
- The existing duplicate collisions (`0030`/`0031`/`0038` across `main`/#48/#50) are a **separate, one-time cleanup** coordinated with those in-flight PRs — tracked as Track B on #79, not resolved here.
- This ADR is itself the **first date-based id** — dogfooding the scheme on its own first use.
- Governance-only: no app schema, RLS, auth-hook, or PII surface. Supersedes nothing; complements #56's cross-branch-integrity analysis.
