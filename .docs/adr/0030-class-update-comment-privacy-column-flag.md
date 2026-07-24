# ADR-0030: Class-update comment privacy — column-flag RLS with scope-derived oversight

**Status:** Closed · **Date:** 2026-07-24 · **Deciders:** Project owner + architect
**Governs:** Teacher → `class-update-and-home-feed` (`.docs/specs/teacher/class-update-and-home-feed.md`), issue #21.
**Extends:** ADR-0015 (chat access model) — reuses its Teacher↔Parent private-channel *access* precedent, but deliberately diverges on *implementation shape* (see Decision). Does not touch ADR-0015's chat schema.

### Context

The refined brief for #21 needs public/private comments on class updates: a public comment is visible to the Teacher and everyone with class scope; a private comment is a side thread between the posting Teacher and one Parent, invisible to the Student and other Parents. During this review the human additionally decided **Coordinator/BV Coordinator/Admin get read (not act) access into private threads**, mirroring the oversight posture ADR-0015 already gives those roles in chat — unlike comment *moderation*, which stays explicitly deferred to a future item.

ADR-0015 solved a structurally similar Teacher↔Parent privacy problem for chat, but via a **participant/membership table** (`conversation_participants`) with a role ladder — because chat membership itself is derived (grade-band-dependent), evolves, and needs a queryable roster for `@mention` resolution and realtime presence. None of that applies here: a class-update comment thread is either public (visible to the whole class) or a single, fixed Teacher↔one-Parent pair — no mentions, no realtime broadcast, no multi-party roster that grows or changes membership over time. The already-built `Comment`/`CommentComposer` kit components (`sankalp-component-kit`) already model this as a flat `isPrivate` prop, not a participant list.

The question: reuse ADR-0015's participant-table shape for consistency, or use a lighter column-based model suited to what this channel actually needs — and does adding oversight visibility change that answer?

### Options Considered

- **Column-flag + scope-derived OR conditions (chosen)** — `comments` carries `is_private boolean`, `target_parent_id uuid` (null unless private). RLS SELECT policy grants a row if: `is_private = false` (and viewer already has class scope on the parent `class_update`), OR viewer = `target_parent_id`, OR viewer = the parent `class_update`'s posting teacher, OR viewer's `active_role = 'coordinator'` and their session scope covers the class, OR viewer's `active_role` in (`bv_coordinator`, `admin`). Pros: no new table; oversight eligibility is fully computable from claims already in every JWT (role + scope) — the same mechanism every other scope check in this codebase already uses, including ADR-0015's own "Coordinator is participant in every class chat in their session" rule, which is itself scope-derived, not curated. Cons: none of ADR-0015's participant-table machinery (roster queries, mention resolution) is available if a future item needs it here — acceptable, since nothing in #21's scope needs it.
- **Participant/membership table mirroring ADR-0015** — a `comment_participants` (or similar) table, with rows inserted per comment for the parent, teacher, and applicable oversight roles at write time. Pros: structural consistency with chat's precedent. Cons: buys curation and mention-resolution machinery this channel doesn't use; oversight rows would just re-derive the same role+scope check the column-flag approach does directly, at the cost of an extra table and extra insert-time logic on every comment. Rejected as unnecessary weight for a two-party, ladder-free (except scope-derived oversight) channel.

### Decision

Comments use the **column-flag model**: `is_private boolean not null default false`, `target_parent_id uuid null` (set only when `is_private = true`), FK'd to `class_updates`. RLS SELECT policy per the OR-list above. No participant/membership table.

**No `audit_log` entry on reading a comment** — same reasoning the refine brief already applied to reading a class update itself: this is conversational content addressed to specific parties, not an individual minor's *record* in the ADR-0019 sense (which governs `students`/`attendance`/`consents`). Consistent with chat messages also being unaudited for in-scope participants.

**Oversight read access is new and explicit**: Coordinator (own session), BV Coordinator/Admin (org-wide) can read private Teacher↔Parent comment threads within their scope. This is read-only — comment moderation (hide/delete/report) remains out of scope for #21, deferred to a future item exactly as the refine brief already stated.

### Consequences

- `/design` for `class-update-and-home-feed` specifies the exact RLS policy SQL for `comments` (and confirms `class_updates`/`comments` don't need ADR-0021's SECURITY DEFINER RPC pattern — they're not "minors' record" tables under ADR-0019's audit trigger, so plain RLS insert/select is sufficient, same conclusion the refine brief already drew for reading a class update).
- Adversarial RLS tests (§11.3) must additionally prove: a Student never sees a private comment; a Parent never sees another Parent's private thread on the same class update; a Teacher outside the class sees nothing; a Coordinator sees private threads only within their own session, never another session; BV Coordinator/Admin sees org-wide; a role switch changes what's visible atomically, same as every other scope check.
- Deliberately diverges from ADR-0015's table shape — this is a considered choice for a structurally different problem (fixed two/four-party visibility vs. evolving multi-party membership + mentions), not an inconsistency to reconcile later.
- If a future item needs to *curate* who sees a private thread beyond scope-derived oversight (e.g. adding a specific counselor), that's a new ADR extending this one, not assumed here.
