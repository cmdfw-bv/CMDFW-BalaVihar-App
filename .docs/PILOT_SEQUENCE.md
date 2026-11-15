# Sequence to a demonstrable app, and then a pilot

> **Status: proposal, open for feedback. Nothing in this document is decided.**
> Written 2026-11-13 by Claude Code at Maulik ji's request, from the state of the repo at `dcfffe2`.
> It is a reading of the backlog, not a commitment, and it is deliberately held open pending
> @arunasharad-coder's review — see [For review](#for-review) at the end for the specific places
> where a second opinion changes the order.
>
> **Not authoritative.** The persona `_index.md` backlogs remain the source of truth for status
> (§12.12). Where this document and an `_index.md` row disagree, the row wins.
>
> **Revised 2026-11-15** from @arunasharad-coder's review, re-baselined on `main` at `e929d09`:
> - #119 is done (#133 merged).
> - #124 is down to tests (#144).
> - A thin all-roles smoke walk now runs early, ahead of the full #111 walk.
> - #60 is re-checked on staging before it closes.
> - The two import defects and the sessions/classes gap are filed (#140, #141, #142).
> - "Staging" is the only deployed environment.
>
> Items 1 and 4 under [For review](#for-review) are settled. The rest remain open.

## Environments

**Staging is the only deployed environment.** It is `cmdfw-bv-staging` on Supabase, plus Netlify auto-deploying from `main`. It holds invented families only (ADR-2026-07-30). Production (project B, #9) has not been created. Anywhere this plan says "walk" or "deployed", it means staging. The pilot is the first thing that needs production.

## The goal this is sequenced around

Reach something **demonstrable with its full intended capabilities**, and demo it, *before* opening
the conversation with the organisation's IT/AWS administrator about email. Arriving with a working
app makes that a smaller ask than arriving with a description of one.

A plain-language companion to this document — written for a non-technical reader rather than for us —
is published separately as the pilot-readiness page.

## Two corrections to earlier framing

Worth stating up front, because both change the shape of the plan:

1. **The email transport is already chosen.** `.docs/specs/system/staging-deploy-verification.md:79`
   records AWS SES as Supabase Auth Custom SMTP, with `.docs/runbooks/ses-auth-smtp.md` holding the
   five setup steps. The IT conversation is a **request**, not a decision.
2. **The remaining staging walk (#111) never depended on SES.** The same spec's design section calls
   for "built-in Supabase email, paced" as the deliberate interim. It can be walked today.

## Decisions that gate the sequence

The first three are the critical path, because they change the CSV file itself and therefore what we
can hand the CRM team.

| # | Decision | Gates | Comes out of |
|---|---|---|---|
| D1 | Grade vocabulary — confirm **PreK, KG, 1–12** (14 levels) against today's `Shishu Vihaar, Gr1…Gr12` | #93, the CRM file spec | `/refine 120` |
| D2 | How a child is placed in a **combined** class. A row naming grade `1` cannot resolve to a class whose `grade_band` is `KG, 1, 2`. *Suggested: carry both grade and `class_name` — grade is a fact about the child, combining is a decision the program remakes each year* | #93, the CRM file spec | `/refine 120` |
| D3 | Which children get **their own login**. Today `Gr9`–`Gr12`; the pilot's combined 7-8-9 class breaks that rule | #93, the CRM file spec | `/refine 120` |
| D4 | Do the **younger classes have students in chat**? ADR-0015 currently says KG–Gr8 class chats have no student participants | #24 | `/architect` |
| D5 | How **sessions and classes** get created in a real environment — a second CSV, or an Admin screen | step 6 below | `/refine 120` |
| D6 | Which **error-reporting** service | #10 | later; no rush |

## Phase 1 — start now, no external dependency

1. **`/refine 120`** — the data setup workflow. First because the longest external lead time hangs
   off it: once D1–D3 land, the CRM team can start while we build. It also defines what #93
   implements, so building #93 first risks implementing a vocabulary we then change.
2. **Send the CRM team the file-format spec.** Does not wait for working code. Runs in parallel from
   here. The posture is already recorded in `csv-enrollment-import.md`: *we* define the template, the
   member system stays the system of record, nothing couples to a CRM export that may change.
   `public/enrollment-template.csv` (14 columns, served at `/enrollment-template.csv`) is the
   starting point.
3. ~~**`/refine 119`**~~ — **done.** #133 merged 2026-11-15 as `e929d09`: class-chat membership is
   now recounted on every enrollment, guardian-link and student-login change, so families linked
   *after* enrollment join their class chat. The same recount also closes the removal direction —
   see #124 in phase 3. **What's left is its `/deploy-staging` walk**: run the membership preview,
   then apply the repair. Never `db push`.
3a. **A thin all-roles smoke walk on staging**, straight after #133's staging walk. *(New, from
   review.)* Sign in once as each persona and confirm the home screen loads in scope. Re-walk
   **UAT-15** (live role switch re-scopes the feed) to settle #60. Spot-check that a chat membership
   is present for a linked family. This is not the full #111 walk (step 13). Its purpose is to
   surface an unknown on the deployed DB/RLS while it is still cheap, rather than at the end. Needs
   the test inboxes and fresh keys, paced under the built-in email limit. It does not wait on SES.

## Phase 2 — make the import demonstrable

4. ~~**File the two import defects as their own issues.**~~ — **done** (filed by @arunasharad-coder; #120 links all three):
   - **#140**: Phase 2 of `netlify/functions/csv-import.ts` is **not all-or-nothing**, despite
     AC#9 requiring it. A failure midway leaves earlier rows saved while the response reports
     nothing committed. Normal priority.
   - **#141**: a base64-encoded upload is **decoded as Latin-1, not UTF-8**, so a name with an
     accent or a Devanagari character breaks. Filed as **LOW**, because no non-ASCII name has
     appeared in the registration data in years. The fix recipe is in the issue.
   - **#142**: no way to create sessions/classes in a cloud environment. This is step 6 below,
     blocked by #87.
5. **#93 — grade vocabulary + combined-class placement.** Implements D1–D3 across
   `netlify/functions/lib/csv-parse.ts`, `csv-import.ts` and `lib/db-ops.ts` (the last is the hard
   part: class resolution stops being one-grade-one-class). Fold step 4's two defects in — same
   files, same pass. Also de-duplicates `HS_GRADE_BANDS`, currently defined twice.
6. **A way to create sessions and classes** (D5, **#142**). A hard prerequisite, not a nicety: the enrollment
   import *requires* that sessions and classes already exist, and today they only ever come from
   `supabase/seed/domain.sql`, which is forbidden from ever reaching a cloud project (#87).
   So right now there is **no way at all** to create this year's F3 session and its five classes in a
   real environment.
7. **The Admin upload screen.** Out of scope in `csv-enrollment-import.md` by design ("Admin persona
   UoW"), so it is genuinely unbuilt. Without it, demoing the import means a command line.

## Phase 3 — the chat screen

8. **`/architect` on D4** before the screen is built, since it determines what the screen does.
9. **#113 — teacher message removal.** ADR-0017 named this the interim safeguard for minors' chats
   and it was always meant to land *before* families are let into chat. **In review as PR #143.**
   Before it, `authenticated` held `select, insert` on `messages` only, with no removal path at all.
10. ~~**#124 — membership is not revoked**~~ — **fixed by #133, tests in #144.** The recount handles
    all four cases #124 lists: transfer (both classes recounted), enrollment delete, guardian
    removal and student unlink. #144 adds the adversarial coverage #124 asked for. Each case now
    proves 0 messages read, 0 realtime signals received, and post refused with `42501`. Each test
    was shown Red by sabotaging the matching path. #124 closes when #144 merges, so it is no longer
    a phase-3 item.
11. **#24 — the screen itself.**

## Phase 4 — polish, then the walk

12. **#127** (class badge reads `F3 · F3 3rd & 4th` — and combined-class naming is precisely what a
    demo points at) and **#123** (no CMDFW/Chinmaya branding yet). Both cheap; both among the first
    things an audience notices.
13. **#111 — the full staging walk, last.** AC#6 (every persona signing in), AC#7 (live role switch +
    web reload), AC#4 (`/.netlify/functions/health`, US region, `dist` key-prefix grep), AC#12
    (fail-closed staff-RPC guards on the deployed DB). Needs the four staging env vars and fresh
    Netlify access; paced because of the built-in email rate limit — roughly an evening.

    **Why the full walk is still last:** #93 and #24 change the app underneath it, so the
    documented walk should cover the app we actually demo. Walking last on its own, though, only
    saves effort; it does not reduce risk. That is why the thin smoke walk (step 3a) now runs
    early. AC#8's observed rate limit is worth recording while we are in there.

    **#60** is not left for this walk. The fix is on `main`: `HomeFeedScreen` and
    `ClassUpdateDetailScreen` reload when `activeRole`/`scopeId` change. UAT-15 passed live on
    2026-07-29 and 2026-10-03, but no automated test covers it. Step 3a re-walks UAT-15 on staging,
    and #60 closes with that evidence.

    Run `npm run seed:staging -- --reset` first (`.docs/runbooks/reset-staging.md`) — and **coordinate
    it**, since a reset wipes every tester's accounts but rebuilds only the runner's.

## Phase 5 — the IT/AWS conversation

14. Hand over **`.docs/runbooks/ses-auth-smtp.md`**. Three asks: verify a sender for `cmdfw.org` in
    SES `us-east-1`, create an IAM user scoped to `ses:SendRawEmail` only, return the SMTP
    credentials. **Staging can stay in the SES sandbox**, so no production-access request is needed
    yet — a materially smaller ask than it first sounds.

    Worth saying in the room: drive the demo from one screen rather than having everyone sign in. A
    few emails an hour is the limit, and that constraint *is* the ask.

## Phase 6 — what an actual pilot needs beyond the demo

15. **#9 — the production environment.** A second Supabase project and a Netlify prod context, set up
    with SES from the start rather than retrofitted. Required before any real family data exists
    anywhere: ADR-2026-07-30 is absolute that staging holds **no real program-member data, ever**.
16. **notifications-infra** — at `/plan`, designed but not built, and the VAPID/SES keys are not on
    the host (3 env vars configured today). Without it people find updates by opening the app.
17. **#10 / #64 — error reporting.** For a pilot whose purpose is finding problems, this is worth
    more than it sounds: a parent's failure on their own phone currently leaves no trace anywhere.
18. **#118** — the two cloud measurements, the last thing gating **#6** closing.

## Housekeeping, any time

- ~~**PR #131**~~ merged (`4ce43e7`).
- **PR #116** — the requested paragraph landed 2026-11-10. It is waiting on re-review.
- **#122** (one-line `coalesce` fix — NULL return is a guardianship oracle) and **#28** (default
  TRUNCATE privilege) are small security items that can slot in anywhere.

## For review

Held open deliberately. The places where a second opinion most changes this:

1. ~~**Is #111 genuinely better last?**~~ **Settled 2026-11-15: split it.** A thin all-roles smoke
   walk runs early (step 3a) to de-risk the deployed DB/RLS. The full documented walk stays last
   (step 13). This is @arunasharad-coder's proposal, agreed by Maulik ji.
2. **D2 — grade plus `class_name`, or something else?** `csv-enrollment-import.md` already
   anticipated a `class_name` override column "deferred until needed". It is now needed; the question
   is whether that is the right shape, given the CRM team has to produce it.
3. **Is phase 2 step 6 one item or two?** Creating sessions/classes and the Admin upload screen might
   be one coherent Admin unit of work rather than two, which would change where they sit.
4. ~~**Does #124 belong in phase 3, or with #119 in phase 1?**~~ **Settled 2026-11-15: neither.**
   #133's recount fixed both directions at once, and #144 adds the tests (see step 10).
5. **Anything here that should not be in the demo at all.** The list is shaped by "full
   capabilities"; a shorter demo may make the IT conversation happen sooner.
