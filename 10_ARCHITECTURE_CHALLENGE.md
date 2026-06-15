> ⚠️ **DRAFT — SUPERSEDED.** The authoritative source of truth for this project is **[1_GREENFIELD_POC_PROPOSAL.md](1_GREENFIELD_POC_PROPOSAL.md)**, which explicitly supersedes this document (see its Status line). Retained for history only; do not treat as current.

# 10 — Architecture Challenge (Adversarial Review)

**Date:** 2026-06-13
**Author:** Independent review (adversarial stance)
**Scope:** All 9 ADRs + technology stack + cost/ops assumptions in `04_ARCHITECTURE.md`
**Lenses:** Cost/sustainability · Scale/reliability · Security/COPPA · Bus-factor/maintainability
**Method:** Claims validated against live vendor docs and primary sources via Playwright (Chromium). Sources linked inline.

> This document deliberately argues *against* the architecture. It is not a balanced summary — it is a stress test. A section titled **"What actually holds up"** at the end records where the design is sound, so the criticism here is read in context. Nothing in this doc is a directive; it is input for a decision.

**Severity key:** 🔴 Critical (could break the launch or core use case) · 🟠 Major (real cost/risk, needs a plan) · 🟡 Minor (worth noting).

---

## 1. The headline problem: the auth model collides with the usage pattern

Three findings are individually serious and **compound into one another**. Together they call into question whether magic-link-only auth on an iOS PWA survives contact with a *weekly* (Sunday) usage pattern at ~800 users. They are presented together because fixing one without the others does not help.

### 🔴 C1 — iOS Safari deletes the session after 7 days, forcing weekly re-login
- **What the doc says:** §5.2 stores the web session token in `localStorage` (`Platform.OS === 'web' → localStorage`). ADR-002 (PWA-first) lists only *push notifications* as an iOS limitation.
- **Challenge:** WebKit deletes **all** script-writable storage — explicitly including `LocalStorage`, `IndexedDB`, `SessionStorage` — **"after seven days of Safari use without user interaction on the site."**
  Source: [WebKit, "Full Third-Party Cookie Blocking and More"](https://webkit.org/blog/10218/full-third-party-cookie-blocking-and-more/) — section *"7-Day Cap on All Script-Writeable Storage."*
- **Why it bites *this* app specifically:** Bala Vihar is a **weekly** program. A parent who opens the app on Sunday and not again until the next Sunday is at or past the 7-day boundary. When the timer fires, the Supabase session in `localStorage` is wiped → the user is logged out → they need a **brand-new magic link** just to see this week's update. This turns magic-link email from a one-time onboarding cost into a **recurring weekly cost for a large fraction of users.**
- **Caveat (fair reading):** the 7-day clock is "Safari use without interaction *on this site*," and *installed* (home-screen) PWAs may be treated more leniently on some iOS versions — Apple has not clearly exempted them. **This must be validated by real device testing**, but it is a well-documented, high-probability failure, not a hypothetical.
- **Lens:** Scale, Cost, UX.

### 🔴 C2 — Supabase Auth caps magic links at 30/hour, project-wide (undocumented in ADR-008)
- **What the doc says:** ADR-008 requires "custom SMTP for deliverability." It says **nothing** about Supabase's own auth send cap.
- **Challenge:** Supabase Auth rate-limits OTP/magic-link sends to **"Defaults to 30 OTPs per hour"**, counted as the **sum of combined requests project-wide** (raisable via Management API, but it is a real ceiling that interacts with the SMTP provider's own limits).
  Source: [Supabase Auth Rate Limits](https://supabase.com/docs/guides/auth/rate-limits).
- **Consequences:**
  - **Onboarding:** provisioning ~800 accounts where everyone requests a first link → at the 30/hr default, ~**27 hours** of continuous sending. Must be raised *and* paired with an SMTP provider that can absorb the burst.
  - **Stacks with C1:** if a large fraction re-authenticates *every week* (because of C1), this is not a one-time onboarding spike — it is a permanent Sunday-morning load against the cap.
- **Lens:** Scale, Cost, Ops.

### 🟠 C3 — Realtime concurrency ceiling (500 on Pro) vs an ~800-user Sunday peak
- **What the doc says:** §7.2 — *all users* subscribe to the `announcements` feed; Teachers/Parents/Students also subscribe to `class_updates`. The doc correctly notes "each active subscription holds a WebSocket connection."
- **Challenge:** Supabase **Pro Realtime includes 500 Concurrent Peak Connections** (then **$10 per 1,000**) and 5M messages/mo.
  Source: [Supabase Pricing](https://supabase.com/pricing) (Realtime row, captured 2026-06-13).
- **Math:** ~800 enrolled users. A Sunday-morning peak where >500 are simultaneously connected (plausible during/after class) **exceeds the included ceiling** → either refused connections or overage billing. This directly contradicts the PRFAQ claim that the app *"scales to the full CMDFW Bala Vihar enrollment without a cost increase."*
- **Lens:** Scale, Cost.

**Compound effect:** C1 manufactures weekly re-auth demand → C2 throttles the email needed to satisfy it → C3 caps the realtime connections those same users open on the same Sunday morning. The single busiest hour of the week is exactly when all three limits are hit simultaneously.

---

## 2. ADR-by-ADR challenges

### ADR-001 — Frontend: Expo / React Native (over Flutter) 🟠
- **Challenge:** The decision optimizes for a *native* future, but Phase 1 ships a **web PWA**, where React-Native-Web is a second-class target. **Expo's own docs** say: *"We recommend building native apps whenever possible as they have the best offline support, but PWAs are a great option for **desktop users**."* Source: [Expo — Progressive Web Apps](https://docs.expo.dev/guides/progressive-web-apps/). For a **phone-first** parent audience, you are shipping on the exact target the framework author steers away from, and offline/service-worker support is manual/limited.
- **Counter-question:** if Phase 1 is web-only, was a plain web stack (e.g., Vite + React, or Next.js) — which treats the browser as a first-class target with mature PWA tooling — ever weighed against RN-Web? ADR-001 only compared Expo vs Flutter, never Expo vs a web-native stack.

### ADR-002 — PWA-first, app store in Phase 2 🔴 (see C1)
- **Challenge:** ADR-002's *only* stated iOS constraint is push. The far more damaging iOS constraint is **storage eviction (C1)**, which is unaddressed. Push being "Phase 2" also collides with the **success metrics**: "attendance compliance ≥90%" and "teacher absence reporting ≥90%" depend on timely action, but the primary nudge mechanism (push) is deferred. The architecture defers the very feature its success criteria implicitly require.

### ADR-003 / ADR-009 — Backend: Supabase 🟠 (and ADR-009 is still **Open**)
- **Process flaw:** ADR-009 is still **Open** and its "Revisit When" still cites the **stale $50/mo (2 projects)** figure. A foundational platform decision cannot be left open while the whole doc set assumes Supabase. **Recommendation: close ADR-009 in favor of Supabase** — the relational + 9-persona-RLS fit genuinely dominates Firebase here — but close it explicitly and fix the cost figure.
- **Cost realism:** Pro's included compute is a **Micro instance: 1 GB RAM / 2-core ARM / 60 direct + 200 pooler connections** ([pricing](https://supabase.com/pricing)). The "$50/mo scales without increase" claim ignores connection ceilings (C3) and the likelihood of a compute upgrade as concurrency grows.
- **Lock-in nuance:** the PRFAQ's "just export the Postgres" portability story is half-true. The **data** is portable; **Supabase Auth, RLS policies, Edge Functions, and the JWT-claims persona model (ADR-004) are not** — they would all be rebuilt on migration. The lock-in is lower than Firebase, not absent.

### ADR-004 — Multi-persona via JWT claims + Edge Function 🟠
- **Challenge (bus-factor):** This is the most specialized component in the system — a Deno **Edge Function** (`set_active_persona`) writing `app_metadata`, plus `refreshSession()`, plus RLS helpers reading the claim. It directly contradicts the PRFAQ claim that *"any React Native or web developer can continue the work."* Few RN developers know Deno edge functions + Postgres RLS + Supabase JWT internals. This is the single biggest **maintainability** liability.
- **Reliability:** the ~500 ms `refreshSession()` on every persona switch assumes reliable network; behavior on flaky mobile networks (partial switch, stale claim) is unspecified.

### ADR-005 — Access control = database-layer RLS as authoritative 🟡 (mostly sound, one risk)
- **Endorsed direction**, but RLS as *sole* enforcement has two footguns the doc should pre-empt: (a) RLS is silent on misconfiguration — a wrong policy **fails open or hides data with no error**, so it demands automated policy tests (does the 44-item DoD include adversarial RLS tests per persona?); (b) complex RLS with `SECURITY DEFINER` helpers can carry a **performance cost** on large tables — fine at 800 users, worth a note.

### ADR-006 — Academic year as text label (not FK) 🟠
- **Challenge:** A free-text academic-year stamp invites **data-integrity drift**: `"2025-2026"` vs `"2025-26"` vs `"2025–2026"` (en-dash) become distinct values, silently fragmenting every year-scoped query and compliance metric. The "simplicity" gain is small; the integrity loss is permanent and only discovered when a dashboard quietly under-counts. At minimum it needs a `CHECK` constraint or enum-like guard.

### ADR-007 — No self-registration at launch 🟢 (correct) / 🟡 (ops cost)
- **Endorsed** — it is the cleanest COPPA posture. The only challenge is operational: bulk-provisioning ~800 users via CSV is a real, error-prone task with PII; the runbook should cover validation, dedupe, and re-invite flows. (Note C1/C2 make the *first-login* experience for those 800 a rate-limit event, not just a data-import event.)

### ADR-008 — Magic-link-only auth 🔴 (see C1, C2)
- **Challenge beyond the rate limits:** magic-link-*only* means **email is a hard single point of failure** for the entire system. No password fallback, no phone OTP until Phase 2. If a user's email is delayed, filtered, or the link expires (1 hr), they have **no other way in** — and the coordinator becomes the manual recovery path the ADR claimed to eliminate. The ADR removed password-reset support load but may have replaced it with magic-link-delivery support load, which is **less** within the team's control (it depends on the recipient's mail provider).

---

## 3. Stack & cost challenges (validated 2026-06-13)

| Claim in docs | Reality (sourced) | Severity |
|---|---|---|
| "~$50/mo, scales to full enrollment without cost increase" | Realtime overage past 500 conns (C3); Micro-instance connection ceilings; email now a real line item — see below | 🟠 |
| Email "deliverability" is the only email concern | Provider caps bite the Sunday burst: **Resend Free = 100/day**, **SES sandbox = 200/day until production access** ([Resend](https://resend.com/pricing), [SES](https://aws.amazon.com/ses/pricing/)) | 🟠 |
| Netlify hosting (per §8.2) | Netlify free moved to an opaque **"300 credits/month"** model — less predictable than assumed ([Netlify pricing](https://www.netlify.com/pricing/)) | 🟡 |
| (Considered) Vercel for multi-env | Vercel **Hobby is "personal, non-commercial use"** — a nonprofit app needs **Pro $20/mo** ([Vercel pricing FAQ](https://vercel.com/pricing)) | 🟡 |
| (Considered) Cloudflare Pages | Only **Production + Preview** env-var scopes — cannot give dev/staging/prod distinct Supabase creds in one project; needs project-per-env workaround | 🟡 |

**Honest revised cost floor:** ~$25/mo (1 Supabase Pro + branching) **+ email** (SES ~$0.50/mo, or Resend Pro $20/mo) **+ probable Realtime/compute overage at peak.** The "$50 forever" framing is optimistic.

---

## 4. Cross-cutting: bus-factor / sustainability 🟠

The PRFAQ's "any RN or web developer can continue this" is the least defensible claim in the doc. The system requires fluency in an **uncommon combination**: React-Native-Web (PWA quirks) + Postgres **RLS** + **Deno** Edge Functions + Supabase **JWT-claims** persona model + Supabase realtime tuning. Each is learnable; the *intersection* is rare in the volunteer/contractor pool a DFW nonprofit can realistically draw on. The documentation set mitigates this but does not eliminate it.

---

## 5. What actually holds up (where the architecture is right)

In fairness — these decisions survive scrutiny:
- **RLS as defense-in-depth** (ADR-005): correct and genuinely safer than app-layer-only checks for children's data.
- **Realtime scope discipline** (§7.2): explicitly limiting realtime to 4 tables and polling the rest is exactly the right instinct (and is what keeps C3 *merely* a peak risk rather than a constant one).
- **No self-registration** (ADR-007): the right COPPA call.
- **Supabase over Firebase** (ADR-003): the relational + multi-persona-RLS fit is real; the technical reasoning is sound. (Just *close the ADR.*)
- **Postgres portability** (ADR-003): lower lock-in than Firebase, even if overstated.

---

## 6. Open questions for the team (need answers before these can be resolved)

1. **C1 validation:** Will you commit to a real-device test of iOS PWA session persistence across a 7–10 day gap *before* launch? If sessions don't survive, magic-link-only auth is not viable as designed.
2. **Auth fallback:** Are you willing to add password or phone-OTP as a fallback in Phase 1, given magic-link is a single point of failure (C2/ADR-008)?
3. **Realtime peak:** What is the realistic *concurrent* (not enrolled) user count on a Sunday morning? This determines whether C3 is a cost line or a non-issue.
4. **Email provider:** SES (cheapest, more setup, sandbox gate) vs Resend Pro ($20/mo, zero-ops)? This is now a required decision, not optional.
5. **ADR-009:** Close it. Supabase or not — pick, and update the stale $50 figure.
6. **Web-native reconsideration (ADR-001):** Given Phase 1 is web-only, is RN-Web still the right call vs a browser-first stack, or is the native Phase 2 certain enough to justify carrying RN now?
```
```

**Validation method note:** vendor limits captured live via Playwright/Chromium on 2026-06-13 from the primary sources linked above; subject to change — re-verify before acting.
