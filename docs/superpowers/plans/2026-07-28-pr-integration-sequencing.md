# PR integration sequencing — #48 → #54 → #51 → #50

**Date:** 2026-07-28 · **Governing ADR:** [ADR-0036](../../../.docs/adr/0036-class-updates-shape-reconciliation.md) · **Owner:** architect + project owner

Resolves the cross-PR integration issues found by the `/architect` review of the four open PRs, by pushing fixes to each branch so that merging in the stated order leaves `main` correct at every step.

**Ground rule:** never merge a stage until the stage before it is on `main`. Every stage's first action is "merge `main`" — rebasing early means resolving the same conflict twice.

---

## Merge order and why

| Stage | PR | State today | Reason for this slot |
|---|---|---|---|
| 1 | **#48** Teacher class update & home feed | `MERGEABLE`, 4/4 checks green, 0 conflicts, 8 ahead / 0 behind | Only conflict-free, CI-green PR, and the largest (45 files, +4425). Landing anything ahead of it forces a re-merge of the biggest PR for no benefit. Establishes the canonical `class_updates`. |
| 2 | **#54** `/no-role` dead end | `CONFLICTING`, 3 behind, 2 doc conflicts | No schema, no migrations. Smallest change; clears the shared-doc conflict baseline. |
| 3 | **#51** Parent children & attendance | `CONFLICTING`, 3 behind, 1 real conflict | Client-only, but its one conflict silently deletes shipped teacher code (below). |
| 4 | **#50** Coordinator compliance dashboard | `CONFLICTING`, 3 behind, 11 conflicts + 4 non-conflict blockers | Carries all of ADR-0036's reconciliation work. Must adapt to #48's schema and to `main`'s ADR-0031. |

**Number allocations, fixed up front** so the stages don't collide: ADRs `0032`/`0033` → #48 (already taken); `0034`/`0035` → #50's renumbered pair; `0036` → the reconciliation ADR. pgTAP `170`/`171` → #48 (already taken); `180`/`181` → #50.

---

## Stage 1 — PR #48 (merge first, no code changes)

**Blocker:** `REVIEW_REQUIRED` only. `mergeStateStatus: BLOCKED` is branch protection, not a conflict or a failing check.

**Actions**
1. Obtain an approving review.
2. Merge to `main`.

**No commits are pushed to this branch.** ADR-0036 assigns every reconciliation task to #50, including the composer picker — #48 stays exactly as reviewed.

**Verify after merge:** `supabase db reset && supabase test db` green on `main`; `class_updates` exists with `body`/`homework` and 7 policies.

---

## Stage 2 — PR #54 (`/no-role`)

**Conflicts:** `.docs/specs/system/_index.md`, `UAT.md` — both additive index/checklist entries, mechanical.

**Actions**
1. `git merge origin/main` (with #48 in it). Expect the `UAT.md` conflict to differ from today's, since #48 also edits `UAT.md`.
2. Resolve both by keeping **both sides'** entries — no logic in either file.
3. Obtain a review (none recorded on this PR yet).

**Verify:** `npx vitest run`, `npx tsc --noEmit`, all 4 checks green.

---

## Stage 3 — PR #51 (parent attendance)

### ⚠️ The one conflict must not be resolved with `--ours` or `--theirs`

`app/(tabs)/attendance.tsx`. This branch predates #49, so its version is:

```tsx
return <View …><Text>Attendance — placeholder</Text></View>;
```

while `main` now has the full teacher roster (`useAttendanceRoster`, `AttendanceRosterRow`, `DateNav`, submit/retry, `RoleBadge`). Either whole-side resolution compiles, and this PR's tests only cover `lib/attendance/parent/**` — **nothing catches the deletion of the teacher screen.**

**Actions**
1. `git merge origin/main` (with #48, #54 in it).
2. Resolve `attendance.tsx` by keeping **both** behind the role switch: `activeRole === "parent"` → `<ParentAttendanceScreen />`; otherwise `main`'s teacher roster body verbatim. Retain `main`'s `import "../../lib/unistyles";` side-effect import — `scripts/check-unistyles-config.js` enforces it and the parent branch's version drops it.
3. Re-request review — `CHANGES_REQUESTED` from @ssrinivas90 appears already addressed by `debc102` (error handling around `mapEnrollmentRow`, `_index.md`/plan-checklist staleness). This needs a re-review, not more code.

**Verify:** `npx vitest run`; `node scripts/check-unistyles-config.js`; **manually confirm a teacher account still sees a working roster** — this is the regression the conflict invites, and no automated check covers it.

---

## Stage 4 — PR #50 (coordinator dashboard) — all reconciliation work

Merge `origin/main` (with #48, #54, #51 in it) first, then work through the following. Tasks 2–4 are independent; 5–7 depend on 2.

### T1 — Renumber ADRs before they enter the record
- `.docs/adr/0030-class-updates-system-owned.md` → `0034-class-updates-system-owned.md`
- `.docs/adr/0031-class-meeting-calendar.md` → `0035-class-meeting-calendar.md`
- Add ADR-0036 (drafted at `.docs/adr/0036-class-updates-shape-reconciliation.md`).
- Amend ADR-0034's "minimum shape" paragraph and ADR-0035's weekday text to point at ADR-0036. Legitimate: both are unmerged drafts that have never been in the record.
- Update `.docs/adr/README.md` (resolve its conflict, then append 0034/0035/0036 in order) and the `governing ADR` line in `.docs/specs/coordinator/compliance-dashboard.md` + its `_index.md` row.

### T2 — Drop the duplicate `class_updates` (ADR-0036 §1)
In `class_meetings_schema.sql`, delete the entire `class_updates` block: `create table if not exists class_updates (…)`, `alter table class_updates enable row level security`, `grant select on class_updates to authenticated`, `revoke insert, update, delete on class_updates …`. `main`'s version (from #48) is canonical.

### T3 — Drop `sessions.meeting_weekday` (ADR-0036 §5)
- Delete the three `alter table sessions …` statements from `class_meetings_schema.sql`.
- `generate_class_meetings_for_session`: `v_session.meeting_weekday` → `v_session.day_of_week`.
- **Revert this branch's edits to `supabase/tests/010, 040, 060, 100, 150, 999`** — take `main`'s version wholesale. Those edits existed only to backfill the now-deleted `not null` column. *This resolves 6 of the 11 conflicts.*
- `supabase/seed/seed.sql`: take `main`'s session inserts (`day_of_week`/`start_time`/`end_time`, all 8 rows per doc 1 §9a). Do **not** carry `meeting_weekday`, and do not reintroduce F3 as weekday 2 — F3 is Sunday (`0`).

### T4 — Re-stamp migrations after #48's `20260728150000`
| Current | New |
|---|---|
| `20260724201631_class_meetings_schema.sql` | `20260729090000_class_meetings_schema.sql` |
| *(new, T5)* | `20260729091000_class_updates_meeting_date.sql` |
| `20260724202154_session_compliance_rpc.sql` | `20260729092000_session_compliance_rpc.sql` |

### T5 — Add `class_updates.meeting_date` (ADR-0036 §2)
New migration `20260729091000_class_updates_meeting_date.sql`, following ADR-0031's add → backfill → not-null shape:

```sql
alter table class_updates add column meeting_date date;
-- No rows exist pre-pilot; the backfill exists so the sequence is safe to replay.
update class_updates set meeting_date = created_at::date where meeting_date is null;
alter table class_updates alter column meeting_date set not null;
```

No unique constraint on `(class_id, meeting_date)` — several updates per meeting are permitted, and the metric only asks `exists`. No RLS change: a plain column on an already-policied table, same reasoning as ADR-0031.

### T6 — Composer meeting-date picker (ADR-0036 §3)
Against `main`'s (post-#48) files:
- `features/teacher/class-update-and-home-feed/components/ComposeClassUpdateScreen.tsx` — add a meeting-date selector reading `class_meetings` for the teacher's `scope_id` (`status = 'scheduled'`, `meeting_date <= today`, most recent first), defaulting to the first entry. Read is already permitted by `class_meetings_teacher_select`.
- `logic/classUpdatePayload.ts` — add `meeting_date` to `ClassUpdatePayload`; reject a payload with no meeting date.
- Extend `logic/__tests__/classUpdatePayload.test.ts`. **Write the failing test first** (constitution §4).

### T7 — RPC and its tests
- Confirm `get_session_compliance_for_staff` reads `cu.meeting_date = w.meeting_date` against the canonical table — no `coalesce` needed once T5 lands.
- Rename `160_class_meetings_schema.sql` → `180_class_meetings_schema.sql`, `165_session_compliance_rpc.sql` → `181_session_compliance_rpc.sql` (`main` owns 160/165; #48 owns 170/171).
- **Rework `180_`, don't just rename it** — two assertions break against the canonical table:
  - line 86 `insert into class_updates (class_id, meeting_date, posted_by)` omits `body`, which is `not null` → add `body`.
  - line 88 asserts `class_updates has zero read policies`; `class_updates_org_select` now exists → rewrite to assert #48's actual policy set, and adjust `plan(12)`.
- Same audit for `181_`'s fixtures wherever they insert `class_updates`.

### T8 — Remaining doc conflicts (mechanical)
`.docs/specs/system/_index.md`, `.docs/specs/system/core-schema-and-rls.md` (add `class_updates`/`class_meetings` to the canonical schema table as the ADR-0034/0035/0036 addendum), `UAT.md`.

### T9 — Re-review
`CHANGES_REQUESTED` from @ssrinivas90 appears addressed by `94f9fb3` + `0ca3abd`. The four blockers above are new and independent of that round — re-request review after T1–T8.

**Verify:** `supabase db reset && supabase test db` (expect the suite to grow past `main`'s 20 files / 178 assertions); `npx vitest run`; `npx tsc --noEmit`; all 4 checks green; **manually open the Coordinator dashboard against the seed** and confirm it no longer renders every class as `—` / `0%` — that symptom was the Tuesday/Sunday split and should be gone.

---

## Post-merge verification (after all four are on `main`)

1. `supabase db reset && supabase test db` — full suite green from scratch.
2. `rls-adversarial-tester` across role × scope on `class_updates`, `comments`, `class_meetings` — required by §11.3 / non-negotiable #4 before `/deploy-staging`, and `class_updates` now has 7 policies over minors'-adjacent content that no single PR's review examined against the final merged shape.
3. Walk one teacher, one parent, and one coordinator account end-to-end: post a class update for a chosen past meeting → confirm it appears in the parent feed → confirm the coordinator's update rate moves for that meeting date.
4. Update `.docs/specs/*/\_index.md` stage rows for all four items.

## Rollback

Each stage is one merge commit. If a stage fails verification on `main`, `git revert -m 1 <merge-sha>` restores the prior state without disturbing earlier stages, since no stage depends on a later one. The only ordering-sensitive artefacts are #50's migration timestamps (T4) — reverting #50 leaves `class_updates.meeting_date` applied in any environment already migrated, so re-landing it must reuse the same filenames rather than re-stamping.
