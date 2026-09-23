# ADR-2026-09-18-require-up-to-date-branches: Require a branch to be current with `main` before it can merge

**Status:** Closed · **Category:** Infra/Process · **Date:** 2026-09-18 · **Deciders:** Maulik (proposer) + @arunasharad-coder (confirmed on PR #99, 2026-09-18: "turn it on now… I'd rather absorb it here than have #65 be its first encounter"). Part of issue [#56](https://github.com/cmdfw-bv/CMDFW-BalaVihar-App/issues/56) (cross-branch decision integrity).

> **Applied 2026-09-18**, after PR #99 was approved and merged (`82d8ff4`). Verified by re-reading the API rather than trusting the write response:
>
> ```
> branches/main/protection → strict: true
>   contexts: app-tests, db-and-rls, secrets-pii, residency-scan
>   approvals: 1 · dismiss_stale: true · code-owner review: true · enforce_admins: false
> repo → allow_update_branch: true · allow_auto_merge: true
> ```
>
> Unchanged by this ADR: the one-approval requirement, code-owner review, approval dismissal on push, and the admin bypass.

> **Observed in practice 2026-09-22.** The last Consequence below asked for this rather than assuming it; this records what happened, and corrects it. Evidence: PRs #100, #101, #103.
>
> 1. **Auto-merge does not update a branch that is behind.** #100 sat at `BEHIND` with auto-merge armed *and* an approval in place, unchanged for over three minutes and with no event pending that would have moved it. GitHub's auto-merge waits for requirements to be satisfied; it does not satisfy them. `allow_update_branch: true` enables the manual "Update branch" button — it does not automate it. (A merge queue does; this repo has none.)
> 2. **Once the branch is updated manually, auto-merge finishes the job.** `gh pr update-branch 100` → CI re-ran → auto-merge merged on green, with no further human action.
> 3. **The "Update branch" merge commit did not dismiss the approval.** #100's `reviewDecision` stayed `APPROVED` across the update and through to merge, so no second approval was requested. *Scope of this evidence: GitHub's Update-branch operation on a branch whose diff against `main` is otherwise unchanged. A push that also changes content is a different case and was not tested — assume it dismisses.*
>
> **Net effect: the cost falls on whoever merges (one command), not on the reviewer.** The Consequence below expects auto-merge to "absorb part of the manual step **by updating and merging**." It merges; it does not update. Half right, and the wrong half is the one that matters when planning a large PR.
>
> **Forced re-approval cycles to date: zero.** Decision 5's review trigger (three in two weeks) is not near, and the merge-queue lever is not yet warranted on those grounds.

### Context

`main` requires four status checks (`app-tests`, `db-and-rls`, `secrets-pii`, `residency-scan`), one approving review, all review threads resolved, and dismisses approvals on every push. It does **not** require a branch to be up to date before merging (`required_status_checks.strict = false`).

That gap means **CI validates each PR against the `main` it was branched from, never against the `main` it will actually land on.** Two changes can each be correct alone and wrong together, and nothing runs on the combination until after it is merged.

This is not hypothetical. It happened twice in two days:

**1. The silent one (#94 + #97, 2026-09-17).** `.docs/adr/README.md` is generated, and its header carries a decision count. `main` held 41 ADRs. #94 added one and regenerated for **42**. #97 added a different one and regenerated for **42**. Git compares text: both sides had written the identical line, so there was nothing to reconcile and the merge produced **no conflict** — with 43 ADR files and an index claiming 42. `gen-adr-index.mjs --check` — which is already a required check — failed on the merge result. It was caught only because the merge was done by hand and re-checked. Had #97 merged as-is, `main` would have gone red, not the PR.

**2. The visible one (#84 + #94/#97).** Both edited the same `_index.md` rows. Git flagged these as conflicts, and resolving either with `--ours`/`--theirs` would have silently discarded the other PR's shipped work; the correct resolution kept **both** halves. Visible, but still a hand-resolution that had to be got right.

The first case is the one that matters. A required check that cannot see the combination it is meant to protect is not a guarantee; it is a coincidence that has held so far.

### Options Considered

- **Require branches to be up to date before merging (chosen).** Set `required_status_checks.strict = true` on `main`. GitHub then blocks merge whenever `main` has moved since the branch last took it in, until the branch is updated and the checks re-run on the combined tree. Pros: closes the class of defect, not just the ADR-index instance — any two changes that are individually valid and jointly invalid are caught before landing; it needs no new tooling, no CI work, and is one reversible field. Cons: real cost to the reviewer, see Consequences.
- **Write the hazard down and rely on discipline.** Amend §12.6 to name generated/shared files as a second serialized seam and require a regenerate-and-recheck after merging `main`. Pros: free; no workflow change. Cons: depends on the person merging remembering, every time. It is what we did manually for #97, and it worked — but only because someone happened to check. Rejected **as the sole measure**; adopted alongside (see Decision 3), because the documentation is useful whether or not the switch is on.
- **Adopt a merge queue.** GitHub tests each PR merged with `main`, in order, and merges automatically. Strictly better ergonomics: the guarantee without manual refreshes. Rejected **for now**: the org is on the Free plan and availability needs confirming, and it is a larger change to how merges happen. Kept as the first softening lever if the cost bites.

### Decision

1. **`main` requires a branch to be up to date before it can merge.** Applied as `required_status_checks.strict = true` on the classic branch-protection object (the `main-protect` ruleset governs approvals and thread resolution; the status checks live in branch protection).
2. **"Always suggest updating pull request branches" is enabled** (`allow_update_branch = true`) so the Update button is consistently offered rather than appearing only when GitHub decides to surface it.
3. **§12.6 records the underlying hazard** — generated and shared files (`.docs/adr/README.md`, the persona `_index.md` tables) are a **second serialized seam** alongside the database schema, and a clean merge is not evidence of a correct one.
4. **This does not change what is required to merge otherwise:** one approving review, all four checks, all threads resolved. Admins can still bypass (`enforce_admins = false`), unchanged by this ADR.
5. **Review trigger.** If forced re-approval cycles caused by this rule exceed **three in any two-week period**, take a softening lever rather than living with it: either adopt a merge queue (preferred), or stop dismissing approvals on a push that only merges `main` in. Revisit via a superseding ADR, not by silently flipping the setting back.

### Consequences

- **The cost lands on the reviewer, and it is not trivial.** When `main` moves between an approval and a merge, the branch must be updated; that push re-runs CI **and dismisses the approval**, so the reviewer is asked a second time for the same change. With one consistently active reviewer, that is the binding constraint. This ADR was deliberately put to her as a question rather than decided over her; she confirmed on #99.
- **The cost is concentrated in the approval→merge window.** Merging promptly after approval largely avoids it. Where several PRs are open at once, whichever merges last pays the update; that is unavoidable and acceptable at one or two concurrent PRs, and gets worse with five.
- **It was enabled at the cheapest possible moment** — 2026-09-18, with zero open PRs. Enabling it later, once #65 (staging-deploy verification, nine acceptance criteria, migrations + seed + spec + §7 doc edits) is open, would force the rule's first real appearance to be a refresh-and-re-approve on the largest PR of the quarter.
- **Auto-merge is already enabled on the repo** and may absorb part of the manual step by updating and merging once requirements are met. Worth observing in practice rather than assuming; if it does, the practical cost is lower than the worst case above.
- **`main` can still go red** for reasons this does not address — a flaky runner, an external break, a change whose failure only appears after merge for other reasons. This closes one specific class: individually-valid, jointly-invalid changes.
- **Nothing in the repo enforces this**; it is a GitHub setting, so it is invisible in the tree and can be turned off by any admin without leaving a trace. That is precisely why it is recorded here — the ADR log is the only durable evidence that it was a decision rather than a default.
- **Supersedes nothing.** Complements ADR-2026-08-21 (date-based ADR ids, which exists because parallel branches collided over ADR numbers — the same family of problem) and issue #56, whose scope explicitly covers `.claude/` governance, CI and repo settings.
