# Runbook: SES as Supabase Auth's SMTP provider

> Infra/config only — no application code. Governs: `.docs/specs/system/notifications-infra.md` AC#8.
> Run this at `/deploy-staging` once, before the first real magic-link send at volume.

## Steps

1. **Verify the sending domain in SES (US-East / `us-east-1`)** and add the SPF/DKIM DNS
   records SES generates at the domain registrar.
2. **Create an IAM SMTP user** scoped to `ses:SendRawEmail` only; generate SMTP credentials
   from it. Do not reuse the app's own AWS credentials for this.
3. **Supabase Dashboard → Auth → SMTP Settings**: enable custom SMTP —
   - Host: `email-smtp.us-east-1.amazonaws.com`
   - Port: `587`
   - Username/Password: the SMTP credentials from step 2
   - Sender: the verified domain address from step 1
4. **Submit the one-time SES sandbox-exit request** (production sending access) — SES starts
   every new account in a sandbox that only sends to verified addresses.
5. **Send a real magic-link** (`/sign-in` on staging) and confirm delivery with
   `DKIM=pass` / `SPF=pass` in the received message's headers.

## Notes

- No new Netlify function and no new secret in this repo — the SMTP credentials live only in
  the SES/Supabase dashboards, never committed here (constitution rule #2).
- This does not touch magic-link's application code path — `signInWithOtp` (built in
  `client-auth-session-and-nav`, #17) is unchanged; this only repoints where Supabase Auth's
  outbound mail is routed.
