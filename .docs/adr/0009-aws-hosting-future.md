# ADR-0009: Org-owned AWS/EC2 self-host is a documented future path, not the POC

**Status:** Closed · **Date:** 2026-06-16 · **Deciders:** Project owner + architect

### Context
CMDFW may want to run the whole stack (web + backend) on its own AWS EC2 for full data ownership. Verified live (Supabase self-hosting docs): self-host = Docker Compose, **single project only**, **no managed backups/PITR**, and the org owns patching/DR/HA/monitoring; EC2 is not $0.

### Options Considered
- **Document as a future alternative (managed stack stays the POC)** — Pros: keeps $0 + volunteer-friendly ops for the pilot (doc 1 G3/G4); option preserved; app code + migrations identical, so adoption is a deployment change not a rewrite. Cons: none for the POC.
- **Adopt EC2 self-host now (primary)** — Cons: hands DB backups/DR/patching to non-technical volunteers; loses managed PITR (risky for minors' data); breaks $0. Rejected for the POC.
- **Hybrid (app on EC2, DB managed)** — Noted as a lower-risk variant if org-owned app hosting is wanted later.

### Decision
The POC ships on the **managed stack** (ADR-0006). The org-owned AWS/EC2 whole-stack path is documented as a **future alternative** in [AWS_HOSTING_PATH.md](../AWS_HOSTING_PATH.md), with adoption preconditions (tested backups/DR, monitoring, hardening) before any minors' data lands on it.

### Consequences
No POC impact. Revisit when the org has ops capacity or a compliance mandate for first-party ownership. See 3_ARCHITECTURE §7.5.
