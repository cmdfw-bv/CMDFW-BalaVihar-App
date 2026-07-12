---
paths: ["app/**", "features/**", "lib/**", "components/**"]
---

# Client-code privacy & security rules (3_ARCHITECTURE §3, §11)

- **Anon key only.** Client code uses the Supabase **anon** key. The service-role key, VAPID private key, and SES creds must NEVER appear here — they live in `netlify/functions/` env.
- **No access logic in the client.** The UI may hide/show, but access is enforced by RLS in the DB (§5). Never treat client-side role checks as security.
- **PII-free where it leaves the device:** push payloads carry no names/PII ("New update in your class"); nothing PII goes to Sentry (scrub before capture).
- **Active-role switch** = write the chosen role to the user's own row, then `refreshSession()` so the new JWT carries the new scope (§5.3). Don't branch access on a local variable.
- **Trusted-server work goes through `netlify/functions/`** (push-send, email-send, csv-import, user-role-sweep, user-role-grant) — never call privileged operations from the client.
- Organize features by **owner persona → functionality** (§12.12); shared logic in `lib/` or `features/shared`.
