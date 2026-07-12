---
paths: ["netlify/functions/**"]
---

# Serverless function rules (3_ARCHITECTURE §3, §7, §8)

- **This is the only home for privileged secrets:** service-role key, VAPID private key, SES credentials — all from per-context env vars, never hardcoded, never committed.
- **Pin to a US region** (US-East / Ohio in `netlify.toml`) — these handle PII in transit and must stay in the compliance perimeter (§3).
- **Five jobs at POC:** `push-send` (web-push), `email-send` (AWS SES), `csv-import` (enrollment, service role), `user-role-sweep` (auto-activation sweep, service role), `user-role-grant` (tiered manual role grant/revoke, service role — ADR-0024). Don't add functions that duplicate what the client can do directly against RLS-protected Supabase.
- **Keep push payloads PII-free** (§8.1). Validate and minimize anything written with the service role (it bypasses RLS — handle with care).
- New external calls must be US-resident processors under DPA — no marketing/analytics trackers (§3). The residency-guard hook enforces this.
