# ADR-0006: Hosting — Netlify + 2 free Supabase projects; local + staging + prod

**Status:** Closed · **Date:** 2026-06-16 · **Deciders:** Project owner + architect

### Context
Near-$0 POC, US residency, three environments, low ops. Verified live: Supabase Free = **2 active projects/org**; Netlify Free = 300 credits with full-outage pause at exhaustion.

### Options Considered
- **Local (Supabase CLI) + staging + prod (2 free cloud)** — Pros: $0; full isolation; destructive RLS tests never touch shared/real data. Cons: maintainers need Docker (Claude drives it).
- **Two cloud: prod + shared nonprod** — Pros: no Docker. Cons: dev/staging not isolated.
- **Three cloud projects** — Cons: needs Pro (~$25–35/mo); breaks $0.
- Web host: **Netlify** (free, deploy contexts, US functions) chosen over Vercel ($20/mo Hobby non-commercial; no residency gain) and Cloudflare Pages (edge functions = no US pin; only 2 env scopes).

### Decision
**Local dev via Supabase CLI + two free cloud projects (staging, prod)**, all same US region; **Netlify** single project with prod/staging deploy contexts, functions pinned US-East/Ohio.

### Consequences
Per-context env vars; secrets only on Functions env; PWA-first, native via EAS (ADR-0001). Netlify pause mitigations + $9 Personal insurance pre-planned. See 3_ARCHITECTURE §7.
