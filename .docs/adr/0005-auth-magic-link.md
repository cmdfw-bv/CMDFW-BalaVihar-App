# ADR-0005: Auth — magic link (passwordless), provisioned accounts

**Status:** Closed · **Date:** 2026-06-16 · **Deciders:** Project owner + architect

### Context
COPPA: no minor self-registration. Non-technical users; org tooling is the member system (not Workspace).

### Options Considered
- **Magic link (passwordless) + coordinator/admin provisioning** — Pros: no passwords to manage; provisioning enforces "no minor self-reg"; no SSO dependency. Cons: deliverability is auth-critical at scale.
- **Email/password** — Cons: password management burden; weaker UX for this audience.
- **Google SSO** — Cons: assumes Workspace; unnecessary dependency; doesn't fit the member-system model.

### Decision
**Magic link** as the primary login; accounts **provisioned** by coordinator/admin via CSV import.

### Consequences
SES deliverability (DKIM/SPF) + Supabase send-rate limits must be verified at rollout (3_ARCHITECTURE §8.2, §13). See §5.1.
