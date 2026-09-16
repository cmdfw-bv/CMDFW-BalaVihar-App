> **DRAFT — not a recorded ADR.** This is the proposed text for
> `ADR-2026-09-15-consent-captured-at-registration`, written for issue
> [#92](https://github.com/cmdfw-bv/CMDFW-BalaVihar-App/issues/92) and awaiting `/architect`.
> It is **not** in `.docs/adr/`, so `scripts/gen-adr-index.mjs` does not see it and the generated
> index does not list it. `/architect` places the final file, stamps Status/Date, and
> `npm run gen:adr-index` then rebuilds the index.
>
> The five doc amendments this decision requires are already applied to the working tree on this
> branch and cite `ADR-2026-09-15`. If `/architect` stamps a different date, those five citations
> must be updated to match.

# ADR-2026-09-15-consent-captured-at-registration: The organization captures consent at registration; the app neither captures nor separately enforces it

**Status:** Closed · **Category:** Privacy/Minors · **Date:** 2026-09-15 · **Deciders:** Maulik (issue [#92](https://github.com/cmdfw-bv/CMDFW-BalaVihar-App/issues/92), decided 2026-09-15 after registration-team discovery)

### Context

Issue #92 raised that the app has no mechanism to capture or enforce parental consent. The verified state of the code (recorded on #92, re-validated against `origin/main` `8297229`):

- the **`consents`** table exists — `(student_id, consent_type ∈ {participation, media}, granted, granted_by, granted_at, revoked_at)`, RLS-on — but is **storage only**;
- **nothing anywhere gates exposure of a child's data on a consent row.** Outside its own policies and `get_consents_for_staff`, the only migrations touching `consents` are the retention placeholders, whose own comment reads *"Inert until a future retention job. No job reads it yet."* §11.2's "enforced before media/feature exposure" was aspirational in full;
- **`ConsentCapture`** (`components/privacy/`) is imported by exactly one file — `app/(dev)/kit-gallery.tsx` — and by nothing in `features/` or `lib/`;
- **`netlify/functions/csv-import.ts` carries no consent column**; it parses `family_ref`, `student_first_name`, `student_last_name`, `grade_band`, `student_external_id`, `student_email`, `session_name`;
- the **only writer of a real row is the synthetic seed** (`supabase/seed/seed.sql:149`, media consent set to `(i % 4 <> 0)`).

#92 was explicit that the consent requirement traced to the initial design docs and had **never been validated against the organization's actual process**, and it gated any `/design` on discovery with the registration team rather than with org leadership.

**Discovery result (2026-09-15): the organization's registration system captures the required waivers.** Consent is therefore already being collected, by an existing process, outside this app.

Two facts about the app decide what follows.

**The POC has no media surface.** Verified, not assumed: no Supabase Storage bucket or `storage.*` reference in any migration; no `expo-image-picker`, `expo-camera`, `expo-media-library`, or equivalent in `package.json`; no photo, image, avatar, or attachment column anywhere in the schema. The only "avatars" in the UI are initial-letter glyphs — a `<Text>` holding one character in a coloured circle (`components/comments/Comment.tsx:41`). The `media` consent type has nothing to gate.

**Registration is upstream of enrollment.** A child cannot be enrolled without having registered, and the waiver is part of registering. Every minors'-data table the POC has — `students`, `attendance`, `messages`, `class_updates`, `comments` — is already scoped by enrollment in RLS. The app therefore already refuses to expose any child's record to anyone outside that child's enrollment scope.

### Options Considered

- **Capture consent in the app** — build the flow `ConsentCapture` was designed for, and become the place a parent grants permission. Rejected: it duplicates a process the organization already runs; it makes a pilot application the system of record for a legal artifact; it pulls the org + legal sign-off of §13.8 onto the POC's critical path; and the media half of it would gate a surface that does not exist.
- **Import consent from registration, then enforce it** — carry a consent column through the CSV and check it before exposing a child's data. Rejected for the POC on two grounds. First, the only consent signal the registration system can supply is *"this family registered and signed the waiver"* — which is exactly what *"this student is enrolled"* already asserts, so the check gates enrollment-derived rows on an enrollment-derived fact. Second, it assumes an export path out of the registration system that has not been confirmed to exist; "captured" is not the same as "exportable."
- **Neither capture nor separately enforce; treat enrollment as the consent signal (chosen).** The organization owns consent; the app owns scope. Smallest surface that is still honest about what protects a child's record.

### Decision

1. **Consent is captured by the organization at registration, outside the app.** The app implements no consent-capture flow for the POC. `ConsentCapture` remains an unwired component in the Sankalp kit, as its own spec already states.
2. **Enrollment is the app's consent signal.** Because registration is upstream of enrollment and RLS already scopes every minors'-data table by enrollment, the app enforces consent transitively. **No separate `consents` check is added in front of minors' data.**
3. **`media` consent gates nothing, because the POC has no media surface.** This is a statement about the current build, not a permanent exemption — see Decision 5(a).
4. **The `consents` table stays, and is marked inert.** Its parent write path closes: `revoke insert, update on consents from authenticated`, keeping the existing read policies and `get_consents_for_staff` intact. This follows the precedent already set by `retention_eligible_at`, which is carried in the schema with a comment declaring it inert. Rationale: dropping the table is a destructive migration with pgTAP churn for no benefit, while leaving it writable would leave an ungoverned write path into a table that nothing reads and no policy constrains.
5. **What reopens this decision.** Any one of these returns consent to scope and requires a superseding ADR *before* the feature ships:
   - **(a)** the app gains any photo, video, or file surface depicting or authored by a child — including avatars, attachments, or a syllabus upload;
   - **(b)** the app becomes a place where consent is granted, changed, or withdrawn, rather than only a consumer of enrollment;
   - **(c)** the pilot ends and the app is deployed beyond the pilot cohort, at which point a real legal review governs rather than this ADR;
   - **(d)** the registration waiver turns out not to cover a data use the app actually makes.
6. **§13.8's consent half is resolved by this ADR.** The retention half of that precondition — retention/deletion policy with org + legal sign-off — stays open and is untouched here.

### Consequences

- **Four written claims become false on the day this lands, and all four are load-bearing.** Two are descriptive and two are *instructions to future contributors*, which makes them the more dangerous pair:
  - `.claude/CLAUDE.md:17` (non-negotiable #6) — "Consent captured, audit_log on access, retention enforced";
  - `.docs/3_ARCHITECTURE.md:443` (§11.2) — "Captured at onboarding; enforced before media/feature exposure";
  - `.claude/rules/supabase-sql.md:12` — "`consents` checked before exposure", a path-scoped rule that loads automatically for anyone writing SQL;
  - `.claude/skills/privacy-rules/SKILL.md:14` — "checked before exposure", which loads automatically whenever minors' data is handled.

  Leaving these unamended is the real risk of this decision: a future contributor reads §11.2, believes consent is enforced, and builds on a guarantee that does not exist. The amendments ship **with** this ADR, not after it.
- **`.docs/2_POC_FEATURE_SCOPE.md` lines 55 and 77 list "parental + media consent capture (timestamped)" as in-scope and ✅.** That is now false for the POC and is amended. `.docs/1_GREENFIELD_POC_PROPOSAL.md` is left unchanged as the historical record of what was originally proposed; this ADR is the record of the divergence.
- **The app's protection of minors' records now rests entirely on enrollment scoping being correct.** There is no second gate behind it. That raises the stakes on the standing adversarial RLS obligation (§11.3) from "a good practice" to "the only thing between a child's record and the wrong viewer." No change to that suite is required by this ADR; the change is in how much weight it carries.
- **The three integrity defects found on #92 become moot rather than fixed** — `granted_by` unconstrained by `consents_parent_insert`, `granted` and `revoked_at` able to contradict each other with no precedence defined, and `unique (student_id, consent_type)` storing current state with no history. Once Decision 4 closes the write path, no real row can be created, so none of them is reachable. **This ADR does not fix them.** If consent returns to scope under Decision 5, they must be fixed before any real row is written.
- **The waiver's coverage of photo/media permission was not separately confirmed.** Registration captures "the required waivers"; whether that includes a distinct media/photo permission, and whether it is per-student or per-family, remains unverified. Decision 3 makes this immaterial for the POC — there is nothing to gate — and trigger 5(a) brings the question back the moment it matters. Recorded here so the gap is visible rather than forgotten.
- **Audit is unaffected.** `audit_log` on access to a minor's record (ADR-0019) stands unchanged; this ADR narrows consent, not auditing.
- **Supersedes nothing.** Complements ADR-0019 (minors'-record read audit) and ADR-0003 (access control enforced at the database layer), which is the mechanism Decision 2 leans on.
