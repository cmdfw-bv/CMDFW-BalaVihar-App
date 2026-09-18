# ADR-2026-07-30-synthetic-staging-seed-and-accounts: Staging is synthetic data + Auth-Admin-API sign-in accounts

**Status:** Closed · **Category:** Infra/Process · **Date:** 2026-07-30 · **Deciders:** #65 architect review (2026-07-30); formally recorded as an ADR on 2026-09-06 (its originally-intended number "ADR-0038" was never written and the number later collided — see [ADR-2026-08-21-adr-identifier-scheme](2026-08-21-adr-identifier-scheme.md))

### Context
Staging must be **sign-in-able** to verify built features end-to-end, but it must **never hold real children's data** (non-negotiable #6). Two concrete facts block that today:
1. **`supabase db push` applies migrations only — never `supabase/seed/seed.sql`.** So the cloud project has schema and **zero rows**; seeding a cloud DB is a separate, explicit act.
2. **The local seed's accounts can't sign in.** All user-creating calls in `seed.sql` go through `tests.create_supabase_user()` — a pgTAP fixture that inserts straight into `auth.users` with a fake password hash on the non-routable domain `@bv-seed.test.local`. Magic-link (ADR-0005) is the only way in, so no seeded identity can ever receive one.

### Options Considered
- **Synthetic domain seed + Auth-Admin-API accounts (chosen)** — fabricated families/students/enrollments (no real members) loaded by a cloud-safe path with **no `tests.*` calls**, plus sign-in-able accounts provisioned via the **Supabase Auth Admin API** on **team-controlled mailboxes** (`bvportal+<persona>@cmdfw.org`-style).
  - *Pros:* real magic-link sign-in works; **zero real minors' data**; keeps the pgTAP fixture surface out of the cloud path.
  - *Cons:* needs a provisioning path beyond `db push`; team mailboxes to manage; email transport must actually deliver (open — #65 AC#8).
- **Reuse `seed.sql` as-is in the cloud.**
  - *Cons:* drags the `tests.*` helpers into cloud DBs (a standing escalation primitive — sibling #66); the accounts still can't receive a magic link, so staging isn't sign-in-able.
- **Import real member data (CSV) into staging.**
  - *Cons:* puts **real minors' data** into a synthetic environment shared by preview-deploys — violates non-negotiable #6. Never.

### Decision
1. **Staging data is synthetic only** — no real program-member data, ever.
2. The domain seed is loaded into cloud by a **cloud-safe path with no `tests.*` calls**.
3. Sign-in-able accounts are provisioned via the **Auth Admin API** on **team-controlled mailboxes**, with `user_roles` attached, so each persona receives a real magic link.
4. The exact **cloud-safe seed mechanism** and the **magic-link email transport** (built-in vs SES vs a delivery service) are **`/design` decisions** (#65 AC#5 and AC#8).

### Consequences
- Requires **removing or segregating the pgTAP `tests.*` helper surface** from cloud databases — tracked as sibling **#66** (must land before prod project B exists).
- A **documented, repeatable reset** (#65 AC#9) re-seeds staging from empty using this path.
- The chosen email transport must survive **six persona sign-ins** without throttling (the built-in Supabase sender is heavily rate-limited) — carried into `/design`.
- Complements [ADR-2026-07-30-staging-builds-from-main](2026-07-30-staging-builds-from-main.md) (its preview-shares-the-staging-DB safety rests on this "synthetic only" rule). Strengthens the minors'-data posture; no app schema/RLS change.
