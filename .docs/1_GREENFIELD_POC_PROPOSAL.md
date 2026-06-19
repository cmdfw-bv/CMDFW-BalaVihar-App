# 1 — Greenfield POC Proposal (clean restart)

**Date:** 2026-06-13
**Status:** Authoritative. **Supersedes the exploratory docs 10–12**, which were built on assumptions later corrected (a non-existent codebase, success metrics treated as binding, pre-pilot scale). This document starts from scratch with confirmed inputs only.

---

## 1. Goals

- **G1** Greenfield POC stack derived from business requirements, not from any prior draft/scratch POC.
- **G2** Adversarially review the vibe-coded 00–08 docs/ADRs *against* requirements (challenge, don't adopt).
- **G3** Fit the maintainer reality — **Claude Code + 3 volunteers** → mainstream, AI-legible, one language, few moving parts.
- **G4** Near-$0 POC with a transparent, threshold-based cost model.
- **G5** One codebase → web PWA now + native fast-follow.
- **G6** Cover 6 POC personas end-to-end; defer Substitute & Volunteer.
- **G7** Safe-by-default for children's data.

## 2. Confirmed inputs & locked assumptions

| # | Locked fact |
|---|---|
| 1 | **Greenfield** — no existing code, schema, auth, or data. |
| 2 | **Requirements = the feature-map page ONLY** (features × personas) — a **stakeholder-reviewed, aligned source of truth**. The APP/PORTAL split and BUILT/PLANNED tags were a throwaway board-demo → disregarded. |
| 3 | **00–08 docs + ADRs are drafts to challenge**, not binding (incl. their success metrics). |
| 4 | **Scale = single-center, single-session pilot (~50–150 users).** The smallest real-world slice. Full multi-session/multi-center rollout is a noted *path*, not a POC driver. |
| 5 | **Delivery:** one codebase → web PWA + native built together; **PWA first, native fast-follow.** Native is near-term certain. |
| 6 | **Maintainers:** Claude Code + 3 volunteers. |
| 7 | **Budget:** ~$0 POC; scale on proven value; cost visibility required. |
| 8 | **Backend:** re-evaluated from scratch (below). |
| 9 | **POC personas:** Student, Parent, Teacher, Coordinator (session), BV Coordinator (org), Admin. Defer: Substitute, Volunteer. |

## 3. Constraints (the decisive new dimension) and their stack implications

| Constraint | Implication for the stack |
|---|---|
| **US data residency** | Every PII-touching service must run in a US region. Validated: Supabase lets you pin an **exact US AWS region** (fixed at creation). Email → **AWS SES US region**. Static CDN assets carry no PII (global CDN OK). |
| **No data sold/shared for marketing** (third-party *processors* OK under DPA + US residency) | Avoid ad/marketing trackers and consumer analytics. Managed SaaS **processors** are acceptable when US-resident + under DPA + no marketing use → **Sentry (US region) is acceptable** (self-hosted GlitchTip is an optional alternative, not required); keep PII minimal in any external call. |
| **Consent capture & retention** | Data model must store parental + media consent (timestamped), plus a **retention/deletion policy and delete mechanism**. |
| **Minors' data minimization** | Collect the minimum; **row-level access control**; **auditable access** (audit log) to minors' records. |
| **Integrate with existing member/enrollment system** | The app is **not** the system of record for enrollment. Design an **import/sync seam** (CSV baseline; API if the product supports it). |

> Net effect: these constraints **reinforce a US-region, DB-enforced-access stack** and favor **US-resident processors under DPA** over ad/marketing trackers. They are the strongest argument in the whole analysis for Postgres+RLS and for keeping minors' data control in the database — without forcing self-hosting of everything.

## 4. Requirements — 6 POC personas (from the feature map only, deduped)

> **Status:** big-picture capability set. **Detailed POC features to be refined** in a follow-up pass. Confirmed: **BV Coordinator stays in the POC** (single-session pilot → its "across centers" views are a degenerate one-center rollup, acceptable to prove the role); **multi-persona resolution is a hard POC requirement** — a single account may hold **multiple roles spanning Parent → Teacher → Coordinator (session) → BV Coordinator** simultaneously, with an active-role switch. Each role carries a different access *scope* (own children → own class → own session → org-wide). This drives the auth-hook + RLS design more than any other feature.

- **Student:** home feed (announcements + class updates) · own class info · attendance stats · two-way comments (public/private) · notifications.
- **Parent:** children list + attendance % · feed · comments · notifications · view events.
- **Teacher:** mark/submit attendance · report absence (date/reason/notes) · post class update (+homework) · view roster · moderate comments.
- **Coordinator (session):** compliance dashboard (per-class attendance + update tracking) · absence alerts · center-scoped announcements · roster management · approve/reject users in own session · multi-persona.
- **BV Coordinator (org):** org-wide metrics · per-center breakdown · org-wide absence list · org-wide announcements · cross-session approvals.
- **Admin:** full org dashboard · user/role management · monitoring · sees all announcements.
- **Cross-cutting:** provisioned accounts (no minor self-reg) · enrollment import · push + email notifications · row-level access · multi-persona resolution · consent + audit + retention.
- **Deferred:** Substitute & Volunteer workflows; gamification; HS social feed; AI drafting; polls; syllabus/file management.

## 5. Evaluation criteria (derived from G1–G7 + §3)

AI-legibility · one codebase web+native · DB-enforced per-row access for minors · US residency + data control · low/predictable cost · ops burden suited to volunteers.

## 6. Stack recommendation (re-derived from scratch)

### Frontend — **Expo (React Native + RN-Web), TypeScript**
- *Why not a web meta-framework (Next.js/Vite):* web-only → a later native **rewrite**, contradicting one-codebase + native-soon.
- *Why not Flutter:* Dart fails the #1 constraint (AI-legible, Claude+volunteer-maintainable); Flutter Web is a weak PWA. Flutter's native-rendering edge is irrelevant for a forms/lists app.
- **Expo wins:** one codebase → iOS + Android + Web PWA; TypeScript/React = largest training corpus; native is `eas build`, not a rewrite. *(Validated 2026-06-13: Expo's own docs frame PWA as best for desktop and steer to native for mobile/offline — consistent with the PWA-now/native-fast-follow plan.)*

### Backend — **Supabase Postgres + RLS, pinned to a US region**
Scored against §5 criteria; the two highest-weighted (per-row access for minors, AI-legibility) discriminate. **Facts validated live 2026-06-13** (citations below):

| Criterion (weight) | **Supabase** | Firebase | Convex | Self-host |
|---|---|---|---|---|
| **Per-row access for minors (HIGH)** | ✅ Postgres **RLS** (declarative, DB-enforced, auditable) | ❌ doc-level rules, "rules are not filters," **server SDKs bypass rules** ¹ | ❌ code-based authz in functions | ✅ RLS |
| **AI-legibility (HIGH)** | ✅ Postgres+SQL+TS ubiquitous | ✅ large | ⚠️ TS, newer/smaller corpus ⁴ | ⚠️ |
| US residency (pinned) | ✅ exact US AWS region ² | ✅ US multi-region `nam5` ³ | ✅ selectable region ⁴ | ✅ |
| Cost at pilot (~tied) | ✅ Free | ✅ Free | ✅ Free ⁴ | ⚠️ +infra |
| Ops burden (volunteers) | ✅ managed | ✅ managed | ✅ managed | ❌ self-host ops |

**Supabase wins** — the only backend that takes **both** highest-weighted criteria: RLS gives DB-enforced, auditable per-row access for minors, and Postgres+SQL+TS is maximally AI-legible — while staying managed (volunteer ops) and US-resident. Firebase and Convex both **lose criterion #1**: their access control is rules/code at the app layer, not row-level in the database — the wrong trade for auditable children's data. Self-host matches on access but loses the ops criterion. Multi-persona claim via a **Postgres auth hook (SQL, no Deno)**.

> **Live citations (2026-06-13):**
> ¹ Firebase docs — *"Security Rules allow you to control access to documents and collections… server client libraries bypass all Cloud Firestore Security Rules"*; rules-are-not-filters. (firebase.google.com/docs/firestore/security/rules-structure)
> ² Supabase — exact US AWS region selectable, fixed at creation. (supabase.com/docs/guides/platform/regions)
> ³ Firebase — US multi-region (`nam5`) available, fixed at creation. (firebase.google.com/docs/firestore/locations)
> ⁴ Convex — TypeScript-native, $0 free + pay-as-you-go, **selectable data region**, self-hostable. (convex.dev/pricing)

### Supporting choices (privacy-driven)
| Concern | Choice |
|---|---|
| Auth | Supabase Auth — **magic link (passwordless) as the primary method**; accounts provisioned by coordinator/admin (COPPA). No Google SSO needed (org tooling is the member system, not Workspace). |
| Notifications | **Web Push (VAPID)** for the PWA (POC) + **Expo Push** for native (post-POC); transactional email via **AWS SES (US region, DPA)**. |
| Server functions | A few **US-region Node/TS serverless functions** (Netlify Functions, default region **US-East/Ohio**, configurable) for: push-send (`web-push`), email-send (SES), CSV enrollment import. **No Deno** — keeps one language; the persona claim stays in the Postgres auth hook (SQL). |
| Feed sync | **Poll-on-focus + PWA push** for feeds/announcements (no realtime needed there). **Supabase Realtime is POC-core** for chat (class group + student P2P) per doc 2 §2/§4 — comfortably within Free-tier limits at pilot scale (§8, Appendix A). |
| Error monitoring | **Sentry (US region, under DPA) is acceptable** (per §3 relaxation); self-hosted **GlitchTip** is an optional alternative. PII kept out of error payloads. |
| Analytics | **No ad/marketing trackers.** Product analytics only if US-resident + under DPA + no marketing use; pilot uses in-app/Postgres metrics. |
| AI drafting | **Deferred + privacy-gated.** When built, no minors' PII in prompts; review Anthropic data-handling terms first. $0 and zero exposure during POC. |
| Enrollment integration | **CSV import baseline** (works with any member system); upgrade to API sync once the product is known. App is not the system of record. |
| Web hosting | **Netlify (free)** — static PWA + **dev/staging/prod via deploy contexts** with per-branch env vars (distinct Supabase creds per env); functions default to **US (Ohio)**. *Vercel considered: equivalent multi-env (Custom Environments) + US functions, but **$20/mo** (Hobby is non-commercial for an org) with no residency/feature gain for a static Expo PWA.* Keep PII-touching logic in **US-region services** (Supabase + the functions above). Native via EAS. |

**One-line stack:** **Expo (TypeScript) + Supabase (Postgres/RLS, US region) — one codebase, one language, US-resident, open-source, DB-enforced access.**

## 7. How it satisfies each constraint

| Constraint | Satisfied by |
|---|---|
| US residency | Supabase US AWS region (pinned) + SES US region; no PII to non-US services |
| No data sold/shared for marketing | No ad/marketing trackers; only **US-resident processors under DPA** (Supabase, SES, Sentry, optional AI) touch PII; AI drafting deferred/gated |
| Consent + retention | Consent tables + retention/delete policy in the schema (§10) |
| Minors' minimization | RLS per-row access + audit log + minimal columns |
| Member-system integration | CSV/API import seam; app not the enrollment SoR |

## 8. Cost model (pilot → rollout, with thresholds)

| Stage | Users | Supabase | Web host | Email | Monitoring | Push/Build | **Total/mo** |
|---|---|---|---|---|---|---|---|
| **Pilot (POC)** | 50–150, 1 center / 1 session | Free (US region) | Netlify Free (300 credits — see caveat) | SES (free tier/pennies) | Sentry Free (US, DPA) | Expo/EAS Free, Push Free | **~$0** (insure w/ $9 Personal) |
| **Rollout path** | ~800 multi-center | **Pro $25** | Netlify Free → **Personal $9 / Pro $20** if credits exceed | SES ~$1 | Sentry Free→Team if >5k err | EAS Free/local | **~$25–45** |
| **Chat (POC-core)** | included | Realtime **within Free tier** (200 conn·100 msg/s; Pro 500·500, configurable) | marginal fn credits (push-sender) | — | — | push sends (free) | **$0 at pilot · Supabase-side at rollout** |

**One-time/annual (native):** Apple $99/yr (501(c)(3) waiver) · Google Play $25 once.
**Named cliffs (rollout only):** Supabase Free→Pro (500 MB DB or 7-day pause); EAS OTA free ≤1K MAU; **realtime 500 concurrent / 500 msg-s on Pro — chat is the main driver** (configurable per-project beyond Pro); Netlify credits 300 free → Personal $9 (1k) / Pro $20 (3k). **None bind at pilot scale.**

**Where chat cost lands:** chat (POC-core) rides **Supabase Realtime (WebSocket) — not Netlify** — so its cost pressure is on the Supabase realtime limits above (configurable per project), plus marginal DB writes/storage for the `messages` table. Netlify sees only a small bump in push-sender function invocations. **So "add Netlify Pro" is a general rollout-headroom decision, not chat-driven** — at pilot, chat adds **$0**.

**Setup tasks (effort, not $):**
- **AWS SES** — dollar cost is pennies, but operating it requires **domain verification + DKIM/SPF + bounce/complaint handling**, and a one-time **sandbox-exit request** for production sending. Budget setup time, not money.
- **Apple Developer nonprofit fee waiver** — start early; needs D-U-N-S + 501(c)(3) verification (can take weeks), or it's $99/yr.

**Netlify free-tier credit caveat (validated 2026-06-13):** Free = **300 credits/mo** (20/GB bandwidth · 10/GB-hour compute · 2/10k requests; production deploys also cost credits). **At the limit the site is _paused_ until the next billing cycle** (alerts at 50/75/100%; re-enable only by upgrading). At pilot scale this is **unlikely to trigger** — Netlify serves only the cached static shell while data traffic rides Supabase (not counted) — but the pause is a **full-outage** mechanism. **Mitigations:** keep dev/staging/prod as **one project with deploy contexts** (shared pool, no cross-project pause); enable usage alerts; pre-plan **Netlify Personal ($9/mo, 1,000 credits)** as insurance / for rollout. *Cloudflare Pages (free, unlimited bandwidth, no pause) was considered but rejected: its functions run on global edge (no US-residency pin) and it has only 2 env scopes (breaks clean dev/staging/prod).*

## 9. Thinnest POC slice (one center, one session, all 6 personas)

1. **Admin** provisions users (CSV import) + assigns roles.
2. **Teacher** marks attendance + posts a class update.
3. **Student & Parent** receive a **PWA push notification** ("New update in your class"), open the app, see it, and comment.
4. **Student** posts in the **class group chat** (teacher + enrolled students) and direct-messages another student — both delivered live via **Supabase Realtime**, access gated by **RLS on `realtime.messages`** (chat-governance gate satisfied first).
5. **Coordinator** sees the live compliance view for the session.
6. **BV Coordinator** sees it rolled up (degenerate single-session rollup — validates the role/screens + RLS scoping, not real cross-center aggregation).

**Success =** the loop works with **per-row access enforced per persona**, including **a single account holding multiple roles across the Parent → Teacher → Coordinator → BV Coordinator span** (switching active role, with correctly *scoped* access each time), an **audit entry** on minors'-data access, and a **PWA push delivered to an installed home-screen PWA** (incl. iOS).

**PWA push — in scope, with one hard caveat:** Web Push (VAPID) is a POC goal. On **iOS it works only for a PWA added to the Home Screen, iOS 16.4+** — so the POC must include the "Add to Home Screen" onboarding step, and push won't fire in a plain Safari tab. Implementation adds: a **service worker**, a **`push_subscriptions` table**, and a small **push-sender** (a US-region Node/TS function using the `web-push` library — see the §6 *Server functions* row; **no Deno**; keep payloads **PII-free**).

**Explicit POC non-goals** (so a passing POC isn't mistaken for launch-ready): scale/peak load · **native** builds & native push (FCM/APNs) · member-system **API** sync (POC uses CSV import) · gamification/social/AI features.

## 10. Data-model additions (privacy, multi-role, and push)

Beyond the obvious relational core (centers → sessions → classes → enrollments → attendance → students → families), the constraints add:
- **`user_roles`** (user_id, role, scope_type: org/center/session/class, scope_id) — **many roles per user**, each scoped; supports the Parent→Teacher→Coordinator→BV Coordinator span. The **active role** is set into the JWT by the Postgres auth hook and drives every RLS policy.
- **`consents`** (subject, type: parental/media, granted_by, granted_at, revoked_at).
- **`audit_log`** (actor, action, target_table, target_id, at) — for access to minors' records.
- **`push_subscriptions`** (user_id, endpoint, keys, device, created_at) — for PWA Web Push (§9); RLS-scoped to the owning user; payloads kept PII-free.
- **Retention policy** fields + a scheduled deletion job.
- All tables **RLS-on**; minors' columns minimized and access-scoped.

## 11. Risks / verify before launch (diligence, not assumptions)
1. Sign **Supabase DPA**; confirm exact US region + review subprocessor list for residency.
2. **SES US region + DPA**; confirm no PII egress outside US.
3. **Monitoring DPA:** sign Sentry's DPA + set the **US data region** (acceptable per §3); GlitchTip self-host remains an optional alternative. Keep PII out of error payloads.
4. Review **Anthropic API data terms** (no-training, US processing) before enabling AI drafting.
5. Define **consent + retention policy** with the org (legal sign-off) before finalizing §10.
6. **Verify PWA push on a real iPhone** (home-screen install, iOS 16.4+) — the highest-risk POC item (§9).
7. **RLS adversarial tests per role × scope** — prove the multi-role span (§10) can't leak across scopes, esp. minors' data.
8. **Magic-link is auth-critical (primary login)** — at rollout, verify SES deliverability (DKIM/SPF, not spam-foldered) and Supabase Auth send-rate limits (default ~30 OTP/hr, raisable). Comfortable at pilot volume; a real dependency at ~800 users, especially given iOS PWA session eviction can drive repeat sends.
9. **Netlify credit usage** — enable 50/75/100% alerts; pause-on-exhaustion is a full outage (§8). Keep build caching tuned (static shell only) and dev/staging/prod in one project; pre-plan the $9/mo Personal upgrade.

## 12. Open items (need your input)
1. **Which member/enrollment system?** Determines CSV-only vs API sync, and field mapping.
2. **Email:** confirm AWS SES (most defensible under residency), or a US-region alternative you prefer?
3. Confirm the recommended **Expo + Supabase (US)** direction so I can draft the schema + RLS + auth-hook next.

---

## Appendix A — Real-time chat architecture (Supabase) — POC-core

**Status:** **POC-core** — pulled in per doc 2 §2/§4 and the [3_ARCHITECTURE.md](3_ARCHITECTURE.md) decision (2026-06-16). Supersedes the earlier "post-POC" framing. **Zero new vendors** — builds on the existing Supabase stack, stays US-resident, DB-enforced, auditable. **Hard precondition:** the chat-governance gate (who-can-DM-whom, moderation/report, retention — HS students are minors) must be resolved *before* chat ships (§3, §10, doc 2 §2). *(Announcements need no realtime — they're Postgres tables + RLS + the existing push path.)*

**Verdict:** 1:1 chat, group chat, and **admin visibility** are all feasible on Supabase. Validated against Supabase Realtime docs 2026-06-14.

### Recommended architecture
| Need | Mechanism |
|---|---|
| Live delivery | Realtime **Broadcast**, triggered **from the database** on message insert (`realtime.broadcast_changes()`) |
| Durable history | Own **`messages`** table (Broadcast doesn't persist) + `conversations`, `conversation_participants` |
| 1:1 & group access | **Private channels + RLS on `realtime.messages`** — controls who may broadcast to / receive from / publish presence per channel (`chat:<conversation_id>`) |
| **Admin visibility** | Admin/coordinator **SELECT RLS policy** on `messages` (read any thread) + channel receive-access — declarative, DB-enforced, pairs with `audit_log` (§10). *This is the differentiator vs a 3rd-party chat SDK, which would break US-residency/no-marketing-sharing and make oversight harder.* |
| Typing / online | **Presence** |

**Critical design rule:** use **Broadcast, not Postgres Changes** — Postgres Changes does one read per subscribed user per change (single-threaded, DB bottleneck); Supabase docs recommend re-streaming via Broadcast at scale.

### Limits (validated — Supabase Realtime quotas, 2026-06-14)
Free: **200 concurrent / 100 msg-sec / 100 channel-joins-sec / 256 KB payload.** Pro: **500 / 500 / 500 / 3 MB.** Per-project configurable. **Pilot (50–150) fits Free; rollout (~800) fits Pro.**

### Gates / verify before building
1. **Child-safety governance (policy, not tech):** who-may-chat-whom (default: adult↔adult; **no open student DMs**), moderation/report, retention — expands §3 (minors' minimization) + §10 (audit/consent).
2. **Realtime Authorization (RLS on `realtime.messages`)** is the newer model — confirm GA + run adversarial channel-access tests (per §11 item 7), especially with minors.
3. **iOS PWA:** WebSockets work in-app, but a *closed* PWA needs **Web Push** (already in scope) to notify of new messages.
