# ADR-0015: Chat access model — grade-band membership, participant ladder, mentions

**Status:** Closed · **Date:** 2026-06-20 · **Deciders:** Project owner + architect
**Extends:** ADR-0007 (chat is POC-core via Broadcast-from-DB — transport unchanged). **Supersedes** the chat *membership* described in 2_POC_FEATURE_SCOPE §2 ("class group chat = teacher + all enrolled students" + "student-to-student DMs") and the §9.2 *read-only* oversight framing. **Partially resolves** the §9.4 / doc 2 §6 governance gate (who-may-chat-whom).

### Context
The authored scope put students at the centre of chat (teacher + all enrolled students, plus student–student DMs) and never included parents. The real operating model (today on WhatsApp) is grade-aware and parent-facing: only high-schoolers have phones; younger children are represented by parents; coordinators and program leadership are active participants in threads, not passive readers. ADR-0007 fixes the *transport*; this ADR fixes *who is in which channel and what they can do*.

### Options Considered
- **Grade-band membership + participant ladder** (chosen) — Pros: matches how the program actually communicates; keeps minors' chat bounded (no open student DMs); parents reachable where it matters. Cons: membership is derived (grade-dependent), and oversight roles need write access, widening RLS.
- **Adult-only chat (students deferred)** — Cons: HS students have phones and belong in their class chat; rejected.
- **Teacher + students only (authored model)** — Cons: excludes parents (the audience for KG–Gr 8) and implies phones for young children; rejected.

### Decision
**Channels & membership:**
- **Class chat · KG–Gr 8:** Teacher(s) ↔ **Parents** (parents represent the children).
- **Class chat · HS (Gr 9+):** Teacher(s) **+ Students + Parents** in one channel, with **`@Parents` / `@Students` / `@individual` mentions** to target a subset.
- **Session staff:** Coordinator + all teachers in the session; **plus 1:1 Coordinator–Teacher** threads.
- **Leadership:** BV Coordinator / Admin + Coordinators; **plus 1:1** to any teacher or coordinator.

**Participant ladder (can post, not merely read):**
- **Teacher** — own class chat(s) · session staff · 1:1 with their coordinator.
- **Coordinator** — **participant in every class chat in their session** · session staff · 1:1 teachers.
- **BV Coordinator / Admin** — **participant in any thread org-wide** · leadership group.

**No open student–student DMs** (resolves the who-may-chat-whom default). **Announcements stay in the feed + push** (ADR-0007 context), never a broadcast into chat.

### Consequences
Supersedes §9.2's "oversight roles **read** any thread" — oversight roles are **participants** (write) on in-scope threads, scope-bound, still paired with `audit_log`. Schema (§6.2/§10): `conversations` scoped to class/session/org; `conversation_participants` carries the member's role and a membership derived from the **grade band**; mentions need storage/parsing. RLS write-policies per role × scope replace the SELECT-only oversight policy; adversarial tests (§11.3) extend to **role × scope × grade**. **Still open** (the remaining governance-gate items): message **moderation/report** mechanism and **retention** policy. Notification behaviour is ADR-0016.
