> ⚠️ **DRAFT — SUPERSEDED.** The authoritative source of truth for this project is **[1_GREENFIELD_POC_PROPOSAL.md](1_GREENFIELD_POC_PROPOSAL.md)**, which explicitly supersedes this document (see its Status line). Retained for history only; do not treat as current.

# 11 — Stack Proposal (Business-Goal Driven)

**Date:** 2026-06-13 (rev. 2 — native-inclusive)
**Basis:** Findings in `10_ARCHITECTURE_CHALLENGE.md` + business research (Playwright) + owner decisions.
**Decisions captured from project owner:**
- **Native is a near-term certainty** (peer center Chinmaya Toronto is already building native; DFW expects the same, sooner rather than later). → A web-only stack that requires a later rewrite is rejected.
- **Delivery:** **One codebase → web PWA + native, built together.** Release the **PWA first**; keep **native build-ready for a fast-follow.**
- **Budget:** Minimal for POC; scale spend only once value is proven; **cost visibility with named thresholds required up front.**
- **Maintainers:** **Claude Code + 3 volunteers** → stack must be maximally AI-legible and mainstream.
- **Backend:** **Re-evaluated from scratch** in this revision (see §3).

> **Revision note:** Rev. 1 of this doc recommended a web-only Next.js stack. That rested on the assumption that native was deferred. The owner has overturned that assumption, so the recommendation has changed to Expo. This also means the original `ARCHITECTURE_DECISIONS.md` **ADR-001 (Expo) and ADR-002 (PWA-first → native fast-follow) were correct** for this goal; doc 10's critique of them was valid only under a web-as-end-state reading. The still-valid findings from doc 10 are the *limits* (C1/C2/C3) and the *Deno bus-factor* — both addressed below.

---

## 1. Business context (validated)

**Bala Vihar:** children **aged 5–18 meet weekly** to learn Hindu culture, customs, and philosophy (some centers add *Sishu Vihar*, ages 2–4). Chinmaya Mission is a global, **volunteer-run** Vedanta organization founded 1953. Source: [Wikipedia — Chinmaya Mission](https://en.wikipedia.org/wiki/Chinmaya_Mission).

**Design drivers:** weekly cadence · volunteer/AI-maintained · children's data (COPPA) · multi-center ~800 users · replaces WhatsApp + Sheets + email · **users expect a real mobile app.**

---

## 2. Guiding principle: an *AI-legible* architecture

Maintainer = **Claude Code + 3 volunteers**, so the top non-functional requirement is *how safely an LLM and a non-expert can change the code*:
1. **One language end-to-end** (TypeScript) — no Dart, minimal/zero Deno.
2. **Most mainstream stack possible** — maximal training-data coverage.
3. **One codebase for all platforms** — fewer repos than "web now + native rewrite later."
4. **Declarative, DB-enforced access control** — safer for children's data than hand-written checks.
5. **Generated types** — schema is the source of truth.

---

## 3. Backend re-evaluation (done fresh, not rubber-stamped)

Scored against this app's *actual* shape: relational data (classes→enrollments→attendance→students→families), **per-row per-persona access for minors**, weekly low scale, AI/volunteer maintenance.

| Criterion (weighted) | **Supabase** (Postgres) | Firebase (Firestore) | Convex | Self-host (Pocketbase/custom) |
|---|---|---|---|---|
| Relational model fit | ✅ native SQL joins | ❌ NoSQL → denormalize/multi-read | ⚠️ doc-relational | ✅ (custom) |
| **Per-row access control for COPPA** | ✅ **RLS (declarative, DB-enforced, auditable)** | ❌ Security Rules (doc-level, easy to get wrong) | ❌ code-based authz (per ADR-005, easier to bypass) | ⚠️ you build it |
| AI-legibility (training data) | ✅ Postgres/SQL/TS huge | ✅ large | ❌ newer, smaller corpus | ❌/⚠️ |
| Native/Expo SDK | ✅ good | ✅ best (FCM) | ⚠️ ok | ⚠️ |
| Ops burden (volunteers) | ✅ managed | ✅ managed | ✅ managed | ❌ self-host = ops |
| Lock-in / portability | ✅ plain Postgres | ❌ proprietary | ❌ proprietary | ✅ |
| Cost at this scale | ✅ $0→$25 | ✅ generous free | ✅ free tier | ✅ cheap, +ops |

**Decision: Supabase — reaffirmed after genuine reconsideration.** The deciding factor is **children's data**: Postgres **RLS** gives declarative, database-enforced, auditable per-row access control. Firestore Security Rules and Convex's code-based authorization both push access control into app/function code — exactly the "easier to bypass" risk `ADR-005` warned about. For a minors' app maintained by an AI + volunteers, *the access-control model must fail safe in the database*, and only Postgres RLS does that here. Firebase's real edge (native push, Node functions) is neutralized because **Expo Push** handles notifications regardless of backend, and the Deno concern is now removed (below).

### The Deno bus-factor finding (doc 10, ADR-004) is now *resolved*, not just contained
**Validated 2026-06-13:** Supabase's [Custom Access Token Hook](https://supabase.com/docs/guides/auth/auth-hooks/custom-access-token-hook) is defined as a **Postgres (plpgsql) function** that edits JWT claims as jsonb. So the multi-persona `active_role` claim is injected **in SQL** — the `set_active_persona` **Deno Edge Function is eliminated entirely.** The stack becomes **Postgres + TypeScript, zero Deno.**

---

## 4. Recommended stack

| Layer | Recommendation | Rationale |
|---|---|---|
| **App (all platforms)** | **Expo (React Native + Expo Router), TypeScript** | One codebase → **iOS + Android + Web (PWA)**. Native is a `eas build`, not a rewrite — true fast-follow. TS/React = most AI-legible cross-platform option (vs Dart/Flutter). |
| **Database** | **Supabase Postgres + RLS** | Relational fit + DB-enforced per-row access for minors. |
| **Persona / server logic** | **Postgres functions + Custom Access Token Hook** | SQL, no Deno (validated). Keep any remaining server surface minimal. |
| **Auth** | **Password primary + magic-link recovery** | Password re-login costs **no email** → defuses C1/C2 during the PWA phase; magic link for first-login/forgot-password. |
| **Notifications** | **Expo Push (free)** | Native push serves the attendance/compliance success metrics — the thing PWA push can't do well. |
| **Realtime** | **None in v1 — poll on focus (web) + push (native)** | Eliminates C3 (500-conn cap). A weekly app doesn't need live sockets; push covers timeliness. |
| **Web hosting (PWA)** | **Netlify (free)** | Native multi-env (dev→test→staging→prod) free, no commercial-use restriction. |
| **Native build/distribution** | **EAS Build (free) + app stores** | 15 iOS + 15 Android builds/mo free, or unlimited `eas build --local`. |
| **Email** | **Resend (free) → Pro/SES at scale** | Password-primary keeps volume low; free tier covers POC. |
| **Storage** | **Supabase Storage** (deferred until needed) | — |
| **Monitoring** | **Sentry (free, Expo/RN SDK)** | — |
| **CI/CD + tests** | **GitHub Actions + EAS; Playwright (web), Maestro (native, optional)** | — |
| **Types** | **TS strict + `supabase gen types`** | One language, generated types. |

### One-line summary: **Expo (TypeScript) + Supabase (Postgres/RLS) — one codebase for web + native, zero Deno, one language.**

---

## 5. How this answers each challenge finding (doc 10)

| Finding | Resolution |
|---|---|
| 🔴 **C1** iOS web session eviction | **Temporary** — only affects the PWA bridge phase; native (fast-follow) has reliable storage. Password auth makes any PWA-phase re-login free. |
| 🔴 **C2** 30/hr magic-link cap | Password-primary takes routine logins off the email path. |
| 🟠 **C3** 500 realtime connections | Eliminated — no realtime; push + poll instead. |
| 🟠 **ADR-004** Deno bus-factor | **Eliminated** — persona claim moves to a Postgres auth hook (validated). |
| 🟠 **ADR-001 / 002** Expo / PWA-first | **Now the correct call** given native-soon; one codebase, native fast-follow. |
| 🟠 **ADR-009** open/stale | Closed here: Supabase, deliberately, after fresh re-evaluation. |
| 🟡 **ADR-006** free-text year | Add `CHECK` constraint / enum guard. |
| 🟢 **ADR-005 / 007** RLS + no self-reg | Kept (and RLS is now the *decisive* backend reason). |

---

## 6. Cost model with scale thresholds (validated 2026-06-13)

**Recurring:**

| Stage | Users | Supabase | Web host | Email | Push/Build | **Total/mo** | Trigger to move up |
|---|---|---|---|---|---|---|---|
| **POC** | <50 | Free | Netlify Free | Resend Free | EAS Free / Expo Push Free | **$0** | DB >500 MB or 7-day inactivity pause |
| **Launch** | ~800 | **Pro $25** | Netlify Free | Resend Free | EAS Free / Push Free | **~$25** | >100 emails/day; **OTA >1K MAU → +$19** |
| **Growth** | 2–3× | Pro $25 | Netlify Free | Resend Pro $20 *or* SES ~$1 | EAS Free/local | **~$26–45** | sustained email burst; frequent native builds |
| **Scale** | 5×+ | Pro + compute (~$25–60) | Netlify Free→Pro $20 | SES (pennies) | EAS Starter $19 if cloud builds exceed | **~$50–100** | heavy compute/teams |

**One-time / annual (native):** Apple Developer **$99/yr** (waivable for 501(c)(3)) · Google Play **$25 once**.

**Cost cliffs to watch (no surprises):**
- Supabase **Free→Pro $25**: 500 MB DB limit *or* 7-day-inactivity pause — a real launch needs Pro.
- **EAS Update OTA free ≤ 1K MAU** — ~800 is *near* the cap; crossing 1K = **$19/mo** (or keep updates via store releases).
- **Resend 100/day** — only bites at bulk onboarding; stagger invites per center or one month of Pro.
- **Nonprofit offsets:** Apple fee waiver, AWS credits (zero SES), TechSoup → GitHub/Google/Microsoft programs.

**Bottom line:** **$0 POC → ~$25/mo at ~800-user launch**, native adds ≈ $0–8/mo, transparent climb with named triggers thereafter.

---

## 7. Build & release plan

1. **One Expo repo**, TypeScript, web + native targets from day one.
2. **POC (free):** Supabase Free; password+magic-link auth; attendance + class-update + compliance-dashboard happy paths; 3–5 real users in one center. Prove "less fragmented than WhatsApp."
3. **Harden:** RLS policy tests per persona (doc 10 open question), Playwright web E2E, Sentry, `academic_year` CHECK constraint.
4. **Release PWA first** (Netlify), upgrade Supabase to Pro, stagger onboarding by center.
5. **Native fast-follow:** `eas build` iOS + Android (already developed in the same repo), submit to stores, enable Expo Push. C1 disappears at this point.

---

## 8. Open questions / what still needs your input

1. **Auth stance:** confirm **password primary + magic-link recovery** (best reliability for the weekly/iOS-PWA phase), or keep magic-link primary and accept C1/C2 cost during the PWA window?
2. **Native timing:** how soon is "fast-follow" — weeks after PWA, or same quarter? (Affects how much to invest hardening the PWA bridge vs rushing to stores.)
3. **POC scope:** which single center and which 1–2 features prove value first?
4. **Push provider on native:** Expo Push (simplest, recommended) vs raw FCM/APNs (more control, more ops)?
5. **User validation:** worth a 2-question survey confirming DFW families actually prefer a native app before store investment? (Prior probability high given Toronto, but cheap to confirm.)

> All vendor limits and the program description are linked inline and in `10_ARCHITECTURE_CHALLENGE.md`. Re-verify pricing before committing spend.
