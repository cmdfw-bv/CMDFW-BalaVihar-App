# System — persona backlog

Non-human persona owning cross-cutting/infra concerns: the auth/RLS engine, consent/audit/retention, notifications infra, **CI/CD + repo/toolchain**, monitoring, and the governance hooks (§12.12).

| functionality | priority | owner | consumers | scope | status |
|---|---|---|---|---|---|
| [repository-bootstrap](repository-bootstrap.md) | POC-core (foundational) | System | all 6 personas + every later System item | infra / pre-data (no RLS) | Plan signed off — ready for `/build` ([plan](repository-bootstrap.plan.md)) |
