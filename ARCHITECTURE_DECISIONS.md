> ⚠️ **DRAFT — NOT BINDING.** The authoritative source of truth for this project is **[1_GREENFIELD_POC_PROPOSAL.md](1_GREENFIELD_POC_PROPOSAL.md)**. This is an earlier vibe-coded draft to be challenged against requirements, not adopted (per doc 1 §2–§3). Retained for reference only.

# Architecture Decision Records
### CMDFW Bala Vihar App

**Version:** 1.0  
**Date:** 2026-06-10  
**Status:** Living document — append new ADRs as decisions are made. Never edit a closed ADR; supersede it with a new one.

---

## Index

| ID | Decision | Status | Date |
|---|---|---|---|
| [ADR-001](#adr-001-frontend-framework) | Frontend framework: Expo / React Native over Flutter | Closed | 2026-06-10 |
| [ADR-002](#adr-002-deployment-model) | Deployment model: PWA-first with app store as Phase 2 | Closed | 2026-06-10 |
| [ADR-003](#adr-003-backend-platform) | Backend platform: Supabase (PostgreSQL + Auth + Realtime + Storage) | Closed | 2026-06-10 |
| [ADR-004](#adr-004-multi-persona-rls-resolution) | Multi-persona RLS resolution: JWT custom claims via Edge Function | Closed | 2026-06-10 |
| [ADR-005](#adr-005-access-control-location) | Access control location: database-layer RLS as authoritative | Closed | 2026-06-10 |
| [ADR-006](#adr-006-academic-year-as-text-label) | Academic year storage: text label FK, not UUID | Closed | 2026-06-10 |
| [ADR-007](#adr-007-no-self-registration-at-launch) | No self-registration at Phase 1 launch | Closed | 2026-06-10 |
| [ADR-008](#adr-008-authentication-method) | Authentication method: magic link (passwordless email) over email/password | Closed | 2026-06-10 |
| [ADR-009](#adr-009-backend-platform-supabase-vs-firebase) | Backend platform: Supabase vs Firebase | Open | 2026-06-10 |

---

## How to Read an ADR

Each record has five sections:

- **Context** — the situation and constraints that made this a decision worth documenting
- **Options considered** — every serious option evaluated, with honest tradeoffs
- **Decision** — what was chosen and the primary reason
- **Consequences** — what becomes easier, harder, or constrained as a result
- **Revisit when** — the specific conditions under which this decision should be reopened

---

## ADR-001: Frontend Framework

**Status:** Closed  
**Date:** 2026-06-10  
**Deciders:** Project owner  

### Context

The app is being rebuilt from scratch. The prototype was built in Expo (React Native). The project owner wants to eventually distribute on the iOS App Store and Google Play Store in addition to the current PWA deployment. The question was whether to continue with Expo/React Native or switch to Flutter.

The app's core UI is forms, lists, and dashboards — attendance grids, feeds, status cards. It is not animation-heavy or graphics-intensive.

### Options Considered

#### Option A: Expo / React Native (TypeScript)
The existing framework. React Native renders using native iOS and Android components. Expo adds a managed build and deployment layer on top.

**Pros:**
- PWA is a first-class deployment target — same codebase builds for web, iOS, and Android
- Expo EAS (Expo Application Services) handles App Store and Play Store builds without a native code rewrite
- Supabase's JavaScript/TypeScript SDK is mature, well-documented, and has official Supabase team support
- TypeScript ecosystem is large — tooling (ESLint, Prettier, type generation) is well-developed
- The existing prototype, design system, and institutional knowledge are directly reusable
- Wider developer talent pool (TypeScript >> Dart)

**Cons:**
- JavaScript/TypeScript requires discipline to keep type-safe; the prototype demonstrated what happens without it (widespread `any` usage)
- React Native uses bridge communication between JS and native layers — theoretically slower than Flutter's direct rendering
- Slightly inconsistent appearance across iOS and Android (native components differ per platform)

#### Option B: Flutter (Dart)
Google's cross-platform framework. Renders using its own engine (Skia/Impeller) rather than native components.

**Pros:**
- Pixel-perfect consistency across iOS and Android — Flutter renders identically on both platforms
- Dart is a stricter language than TypeScript by default — some of the type discipline problems in the prototype would have been caught at compile time
- Excellent native performance — Flutter's rendering engine outperforms React Native for animation-heavy UIs
- Strong Google backing and growing community

**Cons:**
- **PWA support is weak.** Flutter Web exists but is a canvas-rendered application, not a real PWA. It has poor accessibility, poor SEO, slower initial load, and does not behave like a browser-native experience. Maintaining a good PWA alongside Flutter native apps requires a separate codebase.
- The PWA deployment model is a significant advantage for community app rollout — asking 800 users to install from a link is meaningfully easier than directing them to an app store
- Dart has a much smaller talent pool than TypeScript
- Supabase's Flutter/Dart SDK (`supabase-flutter`) is good but less mature than the JS SDK — some features lag
- The entire existing codebase, design system, and components would need to be rewritten from scratch in Dart

### Decision

**Expo / React Native (TypeScript).**

The deciding factor is the PWA requirement. The app currently runs as an installable PWA on Netlify, and this is not a limitation to work around — it is a genuine user experience advantage for a community rollout. Sending users a link they install in one tap has meaningfully lower friction than directing them through an app store. Flutter cannot provide a quality PWA alongside its native apps without a separate web codebase.

The path to app store distribution with Expo is already built: Expo EAS builds iOS and Android binaries from the same codebase, same source, with no native code rewrite required.

The type discipline problems observed in the prototype are not a React Native problem — they are a developer practice problem, and they are fully solvable: `"strict": true` in tsconfig, Supabase TypeScript type generation from day one, and ESLint rules enforcing no-explicit-any.

### Consequences

- **Easier:** App store distribution in Phase 2 is a build-target addition, not a rewrite. PWA and native apps share one codebase.
- **Easier:** Supabase JS SDK features (Realtime, Storage, Edge Functions) are available immediately and fully typed.
- **Requires discipline:** TypeScript strict mode and Supabase type generation must be enforced from the first line of the rebuild. Linting rules should fail the build on `any` usage in production code.
- **Constrained:** Flutter's performance advantages (animations, complex custom rendering) are not available. Acceptable given the app's UI profile (forms and lists).

### Revisit When

- The app requires complex animation or custom rendering that React Native cannot deliver at acceptable performance
- The team shifts to Flutter expertise and no longer has TypeScript expertise
- Supabase deprecates or significantly degrades the JS SDK in favor of the Dart SDK
- PWA is explicitly dropped as a deployment target in favor of app-store-only distribution

---

## ADR-002: Deployment Model

**Status:** Closed  
**Date:** 2026-06-10  
**Deciders:** Project owner  

### Context

The app needs to reach approximately 800 users across 3 centers. Users range from tech-comfortable coordinators to parents and elderly volunteers who may have limited experience with app stores. The question was whether to launch as a PWA (browser-installable), as native app store apps, or both.

### Options Considered

#### Option A: PWA-first, app store in Phase 2
Deploy to Netlify as a PWA immediately. Add App Store and Play Store distribution in Phase 2 using Expo EAS, same codebase.

**Pros:**
- Fastest time to first real users — no app store review process (which can take days to weeks)
- Install friction is minimal: send a link, user taps "Add to Home Screen"
- Instant updates — deploy to Netlify, every user gets the new version on next open, no app store review cycle
- Works on all devices and desktop browsers without installation

**Cons:**
- Some PWA features (push notifications, camera access) have slightly more limited APIs than native
- iOS Safari PWA support has historically lagged Android Chrome — improving but not identical
- Users must know to install from the browser — less familiar than the App Store paradigm for some

#### Option B: App store native only
Build and submit to the iOS App Store and Google Play Store before launch. No PWA.

**Pros:**
- Familiar install flow for users who expect apps in the app store
- Full native API access (richer push notifications, background processing)

**Cons:**
- App Store review process adds weeks to initial launch and every significant update
- Forces users to find and install the app — higher friction for a community rollout
- Apple's 30% commission applies to any in-app purchases (not relevant now, but constraining later)
- Requires Apple Developer Program ($99/yr) and Google Play Console ($25 one-time) accounts to be active before launch

#### Option C: PWA and native simultaneously from day one
Build and deploy both at once.

**Cons:** Doubles deployment surface, doubles testing matrix, adds no user-facing benefit at launch scale. Rejected without further consideration.

### Decision

**PWA-first (Phase 1), native app store builds in Phase 2.**

For a community rollout of ~800 users, the install-from-a-link path has a meaningfully lower drop-off rate than the app-store path. The coordinator can text a URL to every parent and teacher; asking them to search an app store is an additional step many will not complete.

App store presence adds legitimacy and accessibility for users who prefer it — but it does not need to exist on day one. Expo EAS makes Phase 2 a build configuration change, not an architectural one.

### Consequences

- **Easier:** Launch timeline is not blocked by app store review
- **Easier:** Bug fixes and updates reach users immediately
- **Requires action in Phase 2:** Apple Developer Program enrollment, Expo EAS configuration, app store assets (icons, screenshots, descriptions)
- **Constrained:** Push notification APIs on iOS Safari PWA are more limited than native. Acceptable for Phase 1; revisit before Phase 2.

### Revisit When

- A majority of users express strong preference for app store install
- A Phase 2 feature requires native APIs not available in PWA (e.g., background sync, advanced camera)
- Apple significantly degrades PWA support in Safari (monitor annually)

---

## ADR-003: Backend Platform

**Status:** Closed  
**Date:** 2026-06-10  
**Deciders:** Project owner  

### Context

The app needs a backend providing: a relational database with complex access control, user authentication, real-time data push to clients, and file storage. The team is small (effectively one developer) and the annual budget is ~$315/yr.

### Options Considered

#### Option A: Supabase
Managed PostgreSQL with a JavaScript client SDK. Provides: Auth (email, phone OTP), Row Level Security, Realtime (Postgres Changes), Storage, and Edge Functions.

**Pros:**
- Single platform covers all backend needs: auth, database, real-time, storage
- Row Level Security is a PostgreSQL native feature — access control lives at the data layer, not in application code
- No backend server required — the React Native app queries Supabase directly, eliminating an entire infrastructure tier
- Free tier for development; Pro tier ($25/month) provides daily backups and point-in-time recovery
- Open source — self-hostable if pricing or vendor becomes a concern in the future

**Cons:**
- Vendor dependency — if Supabase raises prices significantly or deprecates features, migration is costly
- Edge Functions are Deno-based (not Node.js) — minor ecosystem friction
- RLS policies require PostgreSQL expertise to write correctly; mistakes create security vulnerabilities

#### Option B: Firebase (Google)
Real-time NoSQL database with Auth.

**Pros:** Mature, well-documented, strong mobile SDKs.

**Cons:** NoSQL makes the relational data model (classes → enrollments → attendance → students → families) significantly more complex to query correctly. Firebase's access rules are less expressive than PostgreSQL RLS. Pricing scales poorly with read-heavy workloads. Rejected early.

#### Option C: Custom backend (Node.js + PostgreSQL)
Build a REST or GraphQL API layer on top of PostgreSQL.

**Pros:** Full control.

**Cons:** Adds an entire infrastructure tier to build, secure, deploy, and maintain. A one-developer team building a community app does not need this complexity. Rejected.

### Decision

**Supabase.**

The combination of PostgreSQL RLS for access control and the Realtime subscription system for the live feed is precisely suited to this app's requirements. No backend server means no server to secure, no server to scale, no server to go down. The entire security model lives in the database layer — auditable, testable, and independent of application code.

### Consequences

- **Easier:** No backend server tier to build or operate
- **Easier:** RLS policies are the single source of access control truth — no risk of application-layer bypass
- **Requires discipline:** RLS policies must be written correctly from the start. A misconfigured policy is a security vulnerability, not just a bug. Every policy must be tested (see `01_SECURITY_AND_COMPLIANCE.md` Section 11).
- **Constrained:** Complex server-side business logic must either live in PostgreSQL functions or Supabase Edge Functions (Deno). This is acceptable for this app's complexity level.
- **Cost:** Must upgrade to Pro ($25/month) before any real user data is collected. Free tier has no automated backups.

### Revisit When

- Supabase pricing becomes prohibitive at scale
- A feature requires server-side processing that cannot be expressed in a PostgreSQL function or Edge Function
- The team gains dedicated backend engineering capacity and the cost/benefit of a custom API layer changes

---

## ADR-004: Multi-Persona RLS Resolution

**Status:** Closed  
**Date:** 2026-06-10  
**Deciders:** Project owner  

### Context

A single user account can hold multiple personas (e.g. a parent who is also a volunteer). The app's persona picker lets users select an active persona at login and switch personas without re-authenticating.

The problem: `my_role()` reads `profiles.role` — the user's primary role. For a parent+volunteer, `my_role()` always returns `parent` regardless of which persona is active in the UI. This means:
- Volunteer-only RLS policies would never grant this user access, even when they have selected their Volunteer persona
- The "active persona" concept only existed in client-side state — the database had no knowledge of it

Three options were evaluated.

### Options Considered

#### Option A: JWT Custom Claims via Edge Function *(Chosen)*
On persona switch (or login with a single persona), a Supabase Edge Function sets `app_metadata.active_role` on the user's JWT. `my_role()` is rewritten to read from the JWT claim.

```
User selects persona in app
  → app calls Edge Function: set_active_persona(role, center_id)
  → Edge Function updates app_metadata.active_role + app_metadata.active_center_id
  → app calls supabase.auth.refreshSession()
  → new JWT contains the active persona claims
  → my_role() returns the active persona role
  → RLS policies enforce based on active persona
```

**Pros:**
- The active persona is a real server-side concept — not just client-side state
- RLS policies stay simple and readable (no compound OR conditions)
- `my_role()`, `my_center_id()` continue to work as single-value lookups
- Token refresh on persona switch takes ~500ms — imperceptible to users
- Security: the active role is in the JWT, signed by Supabase — it cannot be spoofed by client-side manipulation

**Cons:**
- Requires one Edge Function (`set_active_persona`)
- Persona switch requires a `refreshSession()` call — adds ~500ms latency to the switch interaction
- `app_metadata` is write-protected from the client (only writable via service role or Edge Function) — this is a feature, not a limitation, but requires the Edge Function infrastructure

#### Option B: Re-issue Session on Switch
Persona switch calls `supabase.auth.signOut()` + `supabase.auth.signInWithPassword()` with the user's credentials.

**Pros:** No Edge Function needed. Conceptually simple.

**Cons:** Full re-login round-trip on every persona switch. Requires storing the user's password client-side to re-submit it, which is a security anti-pattern. Noticeable lag (2–5 seconds). Disqualifying UX for a feature used multiple times per session.

#### Option C: RLS Checks All User Roles
Every policy is expanded to accept any of the user's roles from `user_roles`, not just the primary role:

```sql
-- Example: volunteer-only policy
USING (
  my_role() = 'volunteer'
  OR EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = auth.uid() AND role = 'volunteer'
  )
)
```

**Pros:** No Edge Function. No token refresh. Works immediately.

**Cons:**
- Every RLS policy becomes a compound condition — harder to read, harder to audit, harder to test
- Performance: every policy evaluation now potentially queries `user_roles` — adds a subquery to every data access operation
- **Breaks the "active persona" design principle.** A parent+volunteer would simultaneously see parent data AND volunteer data regardless of which persona they selected. The app's core promise — "each hat gets a focused experience" — cannot be enforced at the data layer. The application layer would have to filter data by persona, which means RLS is no longer the authoritative access control mechanism.

### Decision

**Option A: JWT Custom Claims via Edge Function.**

The active persona must be a real server-side concept, not just UI state. Option C breaks this by making every user simultaneously all of their personas — the data layer cannot enforce the focused experience that is central to the product design. Option B is disqualifying UX. Option A adds one Edge Function and a ~500ms token refresh, both of which are acceptable costs for the security and correctness guarantees it provides.

### Consequences

- **Easier:** RLS policies remain simple, single-condition expressions. Auditing policies is straightforward.
- **Easier:** `my_role()` and `my_center_id()` remain single-value lookups — no changes to the helper function pattern.
- **Requires:** One Edge Function (`set_active_persona`) must be built before the persona picker is functional.
- **Requires:** The persona switch UI must call `refreshSession()` after setting the claim and show a brief loading state (~500ms).
- **Constrained:** `app_metadata` can only be written server-side (Edge Function or service role). This is intentional — it prevents clients from escalating their own privileges.

### Implementation Notes

```typescript
// Edge Function: set_active_persona
// Called by the app when user selects a persona

import { createClient } from '@supabase/supabase-js'

Deno.serve(async (req) => {
  const { role, center_id } = await req.json()
  const authHeader = req.headers.get('Authorization')
  
  // Validate role is one the user actually holds (check user_roles table)
  // Then update app_metadata:
  const adminClient = createClient(
    Deno.env.get('SUPABASE_URL'),
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  )
  
  const jwt = authHeader.replace('Bearer ', '')
  const { data: { user } } = await adminClient.auth.getUser(jwt)
  
  await adminClient.auth.admin.updateUserById(user.id, {
    app_metadata: { active_role: role, active_center_id: center_id }
  })
  
  return new Response(JSON.stringify({ success: true }))
})
```

```sql
-- Updated helper functions reading from JWT claims
CREATE OR REPLACE FUNCTION my_role()
RETURNS text LANGUAGE sql SECURITY DEFINER AS $$
  SELECT COALESCE(
    auth.jwt() -> 'app_metadata' ->> 'active_role',
    (SELECT role FROM profiles WHERE id = auth.uid())
  );
$$;

CREATE OR REPLACE FUNCTION my_center_id()
RETURNS uuid LANGUAGE sql SECURITY DEFINER AS $$
  SELECT COALESCE(
    (auth.jwt() -> 'app_metadata' ->> 'active_center_id')::uuid,
    (SELECT center_id FROM profiles WHERE id = auth.uid())
  );
$$;
```

The `COALESCE` fallback ensures that users with a single persona (no `app_metadata` set) continue to work correctly using `profiles` as the source.

### Revisit When

- Supabase changes how `app_metadata` is written or how JWT claims are structured
- A future persona type requires the user to hold two active roles simultaneously (not anticipated)
- Edge Function latency becomes a problem at scale (unlikely — this is a single lightweight call)

---

## ADR-005: Access Control Location

**Status:** Closed  
**Date:** 2026-06-10  
**Deciders:** Project owner  

### Context

Where should access control be enforced — in the React Native application layer, or in the database via Row Level Security?

### Decision

**Database layer (RLS) is authoritative. Application layer is UX only.**

The application layer (tab visibility, button visibility, navigation guards) provides a good user experience by hiding irrelevant options. It is not a security control. A user who bypasses the application entirely and queries Supabase directly must be limited by RLS alone to exactly what they are authorized to see.

This decision means:
- Every feature's security must be verified by directly querying Supabase as different users, not just by testing the UI
- RLS tests are required for every feature before it ships (see `01_SECURITY_AND_COMPLIANCE.md` Section 11)
- The service role key must never appear in client application code

### Revisit When

This is a foundational constraint and should not be revisited. If Supabase RLS becomes unavailable or inadequate, the entire backend architecture (ADR-003) would need to change first.

---

## ADR-006: Academic Year as Text Label

**Status:** Closed  
**Date:** 2026-06-10  
**Deciders:** Project owner  

### Context

Every operational record (attendance, class updates, announcements, enrollments, class-teacher assignments) must be stamped with the academic year it belongs to, enabling year-over-year comparison and clean data archiving. The question was whether to use a UUID foreign key into an `academic_years` table, or store the year as a human-readable text label.

### Options Considered

#### Option A: UUID foreign key
`academic_year_id UUID REFERENCES academic_years(id)`

Every year-filtered query requires a JOIN to `academic_years`. Human-readable only after the JOIN.

#### Option B: Text label *(Chosen)*
`academic_year TEXT` — stored as `"2025-26"`, `"2024-25"` etc.

The `current_academic_year()` helper function returns the current label. All inserts stamp this value directly.

### Decision

**Text label.** The label is human-readable in direct SQL queries and exports without a JOIN. The format (`YYYY-YY`) is stable and unambiguous. Referential integrity is maintained by the application stamping only valid labels from `academic_years` at insert time, enforced by a trigger that validates the label exists.

### Consequences

- All year-filtered queries use `WHERE academic_year = '2025-26'` — simple, indexed, readable
- No JOIN required to display the year label
- A typo in the year label would create an orphaned string — mitigated by the validation trigger and the `current_academic_year()` function being the only source of truth for inserts

---

## ADR-007: No Self-Registration at Phase 1 Launch

**Status:** Closed  
**Date:** 2026-06-10  
**Deciders:** Project owner  

### Context

COPPA requires that no child under 13 can directly provide personal information to an online service without verifiable parental consent. The app serves students who may be under 13. Self-registration creates a path for minors to create accounts directly.

Additionally, the program is invite-only by nature — families enroll through the organization's registration process, not through the app.

### Decision

**No self-registration in Phase 1.** All accounts are provisioned by coordinators or admins. The login screen shows only email/password and a "Forgot password" link.

This is the primary COPPA control: by making account creation an administrative act, no minor can directly submit personal information to the app.

Self-registration with coordinator approval is added in Phase 2 for adult roles (parent, teacher, volunteer) only. Student accounts remain admin-provisioned permanently.

### Consequences

- **Easier:** COPPA compliance for Phase 1 is straightforward — no minor can self-register
- **Operational overhead:** Coordinators must provision accounts before the pilot. For ~800 users, a bulk CSV import tool is required to make this practical
- **Constrained:** Phase 2 self-registration must explicitly exclude student role from the available options in the registration form

### Revisit When

- Phase 2 self-registration is built — revisit to ensure the student exclusion is enforced both in the UI and at the database layer

---

## ADR-008: Authentication Method

**Status:** Closed  
**Date:** 2026-06-10  
**Deciders:** Project owner  

### Context

The prototype used email and password authentication. The question was whether to keep passwords or move to a passwordless flow. The app serves a community of parents, teachers, and volunteers who log in infrequently (weekly at most) and are unlikely to remember passwords they set months ago. Password resets and "forgot password" flows add support burden on coordinators.

### Options Considered

#### Option A: Email and password
Standard Supabase Auth email/password flow. User sets a password at account creation; coordinator sends a password-reset email for provisioning.

**Pros:** Familiar to most users. Works without email access at login time (after initial setup).

**Cons:**
- Password resets are the most common user support request in community apps — coordinators become the de facto IT help desk
- The recovery path for a forgotten password is… email. So email access is required anyway.
- Password storage introduces a credential database that can be breached
- Weak password choices (birthday, "password123") are common in non-tech community users
- First login experience after admin provisioning requires an extra "set your password" step

#### Option B: Magic link (passwordless email) *(Chosen)*
User enters email; Supabase sends a one-time login link; tapping the link establishes a session. No password is ever set, stored, or managed.

**Pros:**
- Eliminates the entire password surface — no weak passwords, no credential database, no password reset flow
- Simpler provisioning: coordinator creates the account; user just needs their email to log in
- The one credential is email access — which is already required for account recovery in any system
- Links expire in 1 hour and are single-use — a stolen or forwarded link cannot be reused
- Users who log in weekly will always have a fresh link rather than struggling to remember a months-old password

**Cons:**
- Requires inbox access at every login — if a user's email is unavailable, they cannot log in
- Slightly more steps than password login for users who are already logged in on a device (rare — sessions persist via refresh token for 7 days)
- Email deliverability: if Supabase's email is marked spam, the user never receives the link. Mitigated by using a custom SMTP sender (Supabase supports this) and instructing users to whitelist the sender address during onboarding.

#### Option C: Phone OTP (SMS)
User enters phone number; Supabase (via Twilio) sends a 6-digit code.

**Pros:** Works without email access. More familiar to non-tech users who use SMS-based banking apps.

**Cons:** Requires Twilio integration, DPA, and ongoing SMS cost (~$100/yr). Phone numbers must be collected and validated. Phase 2 addition, not a Phase 1 replacement — adding it as an alternative login method is planned but not as the sole method.

### Decision

**Magic link (passwordless email).**

The decisive factors: email is already the recovery path for passwords, so email dependency is not a new constraint. The support burden of password resets in a community app serving non-technical users is real and disproportionate. Magic links are simpler to provision, simpler to use, and eliminate an entire attack surface.

Phone OTP (Option C) is retained as a Phase 2 optional addition — users who prefer SMS can use it when implemented. It is not a replacement for magic link.

### Consequences

- **Easier:** Account provisioning — coordinator creates account, no password setup step needed
- **Easier:** No "forgot password" flow to build or support
- **Eliminated:** Password complexity requirements, credential storage, brute-force lockout logic
- **Requires:** Supabase Auth configured with magic link enabled, email confirmations disabled, all redirect URLs registered
- **Requires:** Custom SMTP sender configured in Supabase to improve email deliverability and avoid spam folders
- **Requires:** Deep link handling for Phase 2 native app builds (`com.cmdfw.balvihar://auth/callback`)
- **Edge case to handle:** If a user enters an email that is not provisioned in `profiles`, Supabase still sends a magic link (it does not reveal whether the email exists — a security feature). The app must detect the missing profile after session establishment and sign the user out with a clear "not registered" message.

### Revisit When

- A significant portion of users report email deliverability problems (magic links going to spam)
- Phase 2 phone OTP is implemented — the login screen gains a second path but magic link remains the primary
- Offline-first features require credentials that work without network access (magic link requires network to receive the email — passwords could theoretically work offline, though sessions still require network for Supabase queries)

---

---

## ADR-009: Backend Platform — Supabase vs Firebase

**Status:** Open  
**Date:** 2026-06-10  
**Deciders:** Project owner  

### Context

The prototype was built on Supabase. Before committing the full rebuild to Supabase, this ADR captures a structured comparison against Firebase — Google's competing Backend-as-a-Service platform — to ensure the choice is deliberate.

Both platforms provide: authentication, a database, file storage, serverless functions, and real-time data subscriptions. The comparison below focuses on how each platform handles the specific requirements of this app: structured relational data with complex access rules, COPPA compliance, a mixed persona model, and a small-team operational profile.

### Options Considered

#### Option A: Supabase

An open-source BaaS built on PostgreSQL. Provides Auth, a full relational database, Storage, Realtime (Postgres Changes), and Edge Functions (Deno).

**Pros:**

- **Relational data model is a natural fit.** The app's schema has 18 tables with meaningful foreign key relationships, join queries, and complex filtering (e.g. attendance by class + academic year + teacher). PostgreSQL handles this natively; no ORM workarounds or denormalization needed.
- **Row Level Security (RLS) is purpose-built for this use case.** Fine-grained, declarative, database-enforced access control per table per role. The 9-persona model maps directly to RLS policies — no application-layer permission logic required. Firebase has no equivalent.
- **Magic link authentication is built in.** `supabase.auth.signInWithOtp()` with email is a first-class feature.
- **Multi-persona JWT claims** (ADR-004) are achievable via Edge Functions and `app_metadata`. Firebase's custom claims system could theoretically do the same, but Firebase has no native multi-role session concept.
- **SQL is universally known.** Migrations, one-off queries, data inspection, and incident response all use standard SQL. No proprietary query language to learn.
- **Supabase TypeScript SDK** is mature, fully typed, and has official type generation from the database schema (`supabase gen types`).
- **Open source and self-hostable.** Not locked into a single vendor; can self-host on any Postgres-compatible platform if needed.
- **PITR and daily backups** are included on the Pro tier.

**Cons:**

- Supabase is a younger company than Google. Long-term platform continuity is a real (if small) consideration.
- The free tier has usage limits (500MB database, 5GB bandwidth, 50MB file storage) that could be hit if the app grows significantly beyond initial scope.
- Supabase Realtime uses Postgres Changes (logical replication), which is more operationally complex than Firebase's real-time document sync. For this app's feed use case it is adequate, but it is not Firebase's effortless real-time.
- Edge Functions (Deno) are not Node.js — minor ecosystem differences for developers used to Node.

---

#### Option B: Firebase (Google)

Google's NoSQL BaaS. Provides Auth, Firestore (document database), Firebase Storage, Cloud Functions (Node.js), and real-time document subscriptions.

**Pros:**

- **Real-time document sync is effortless.** Firestore's `onSnapshot` listener is simpler to set up than Supabase Realtime for document-level changes. If the app were primarily a real-time chat or live-updating feed, Firebase would have a strong edge here.
- **Google's infrastructure.** Firebase is backed by Google's global CDN and has an extremely strong uptime track record.
- **Generous free tier (Spark plan).** Firestore reads/writes are free up to 50,000 reads and 20,000 writes per day — likely sufficient at launch scale.
- **Cloud Functions use Node.js.** More familiar to most JavaScript developers than Deno.
- **Very large community** and extensive documentation.
- **Firebase Auth** supports magic link (email link sign-in) natively.

**Cons:**

- **NoSQL is a poor fit for this data model.** Firestore is a document database. The app's attendance, enrollment, class assignment, and compliance queries are inherently relational (JOINs across 3–4 tables). In Firestore, these must be denormalized (duplicated data across documents) or executed as multiple sequential reads, both of which introduce complexity and consistency risks.
- **No equivalent to Row Level Security.** Firebase Security Rules are Firestore's access control mechanism. They work at the document level, not the row level of a table. Implementing the 9-persona model with per-role, per-center, per-class access control in Firebase Security Rules would require significant application-layer logic — and application-layer access control is easier to bypass.
- **No SQL.** Schema migrations, ad-hoc queries, and incident response all require Firestore SDK calls or the Firebase console's limited query UI. Debugging a data issue in production means writing code, not a SELECT statement.
- **Vendor lock-in is real.** Firestore's data model, query API, and Security Rules are proprietary to Google. Migrating off Firebase is significantly harder than migrating off Supabase (which is standard PostgreSQL).
- **The multi-persona JWT claims approach (ADR-004) would need to be rebuilt.** Firebase custom claims exist but the Edge Function pattern would become Cloud Functions in a different architecture.
- **Schema changes have no migration concept.** Firestore is schemaless — there is no migration file to apply, but there is also no enforcement. Data inconsistency across documents accumulates silently over time.

### Tradeoffs Summary

| Criterion | Supabase | Firebase |
|---|---|---|
| Data model fit (relational schema) | ✅ Strong | ⚠️ Requires denormalization |
| Access control (9 personas, per-center) | ✅ RLS — database-enforced | ⚠️ App-layer + Security Rules |
| Real-time feed updates | ✅ Adequate (Postgres Changes) | ✅ Excellent (onSnapshot) |
| Magic link auth | ✅ Native | ✅ Native |
| SQL for ops/debugging | ✅ Standard SQL | ❌ No SQL |
| Schema migrations | ✅ Migration files | ❌ No concept |
| Vendor lock-in | Low (open-source PostgreSQL) | High (proprietary) |
| Platform maturity | ⚠️ Younger company | ✅ Google-backed |
| Free tier | ⚠️ Tighter limits | ✅ More generous |
| TypeScript SDK maturity | ✅ Strong | ✅ Strong |
| Multi-persona JWT pattern (ADR-004) | ✅ Already designed | ⚠️ Needs redesign |

### Decision

**Open.** The current prototype is on Supabase and the full documentation set was written assuming Supabase. The technical case for Supabase is strong given the relational schema and the 9-persona RLS requirement. Firebase's primary advantage (real-time document sync) is not a decisive factor for this app's use case.

**Before closing this ADR, evaluate:**
1. Does the Firebase free tier's cost advantage materially change the operational budget? (Supabase Pro is $25/month per project × 2 projects = $50/month for staging + production.)
2. Is any team member significantly more experienced with Firebase than Supabase? Developer familiarity can outweigh platform fit for a small team.

### Consequences

*If Supabase is confirmed:*
- All 8 documents and 9 ADRs remain valid as written
- ADR-003 (backend platform) covers the same ground and should be updated to reference this ADR

*If Firebase is chosen:*
- `02_DATA_MODEL.md` must be rewritten as a Firestore document/collection schema
- All RLS policies in `01_SECURITY_AND_COMPLIANCE.md` must be rewritten as Firebase Security Rules
- ADR-004 (multi-persona RLS) must be revisited for a Firebase custom claims equivalent
- `04_ARCHITECTURE.md` must be updated throughout
- `06_DEVELOPMENT_SLICES.md` Slice 0-02 (schema) is a full rewrite
- The compliance dashboard's `lastSundayISO()` pattern still applies, but the query is SDK calls not SQL

### Revisit When

- Cost projections for Supabase Pro ($50/month) become a constraint
- A team member with strong Firebase experience joins the project
- The real-time feed requirements grow significantly beyond what Postgres Changes handles well
- This ADR is revisited and a final platform decision is made — at that point, close this ADR and update ADR-003

---

*When a new architectural decision is made, append a new ADR to this document following the format above. Assign the next sequential ID. Never edit a closed ADR — if a decision changes, add a new ADR that supersedes the old one and update the index.*
