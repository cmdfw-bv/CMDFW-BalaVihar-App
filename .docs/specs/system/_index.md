# System — persona backlog

Non-human persona owning cross-cutting/infra concerns: the auth/RLS engine, consent/audit/retention, notifications infra, **CI/CD + repo/toolchain**, monitoring, and the governance hooks (§12.12).

| functionality | priority | owner | consumers | scope | status |
|---|---|---|---|---|---|
| [repository-bootstrap](repository-bootstrap.md) | POC-core (foundational) | System | all 6 personas + every later System item | infra / pre-data (no RLS) | Built — review-clean, ready for `/test` ([plan](repository-bootstrap.plan.md)) |
| [core-schema-and-rls](core-schema-and-rls.md) | POC-core (foundational) | System | all 6 personas + auth-hook/notifications/chat/CSV-import System items | infra / data-layer (RLS-on, no auth-hook wiring) | Built — ADR-0021 attendance-write RPC landed; full suite green (73/73) ([plan](core-schema-and-rls.plan.md)) |
| [auth-hook-and-identity](auth-hook-and-identity.md) | POC-core (foundational) | System | all 6 personas | identity / JWT claims (plugs into `user_roles`) | Built — ADR-0022 hook/switch/auto-activation landed; full suite green (100/100); live `/test` AC#7 sign-in pass still blocking before `/promote` ([plan](auth-hook-and-identity.plan.md)) |
| csv-enrollment-import | POC-core (thinnest-slice prerequisite) | System | Admin; all personas indirectly (provisioned via import) | enrollment import (CSV baseline) | Not started |
| notifications-infra | POC-core (thinnest-slice prerequisite) | System | Student, Parent, Teacher (push/email recipients) | Web Push (VAPID) + SES email delivery (plugs into `push_subscriptions`) | Not started |
| realtime-chat-delivery | POC-core (ADR-0007) | System | Student, Teacher, Parent | Supabase Realtime broadcast wiring on durable chat tables | Not started |
| user-role-approval | POC-core (doc 2: Coordinator/BV Coordinator/Admin approval flows) | System | Admin, Coordinator, BV Coordinator | privileged role/scope-assignment function (writes `user_roles`) | Not started |
| retention-deletion-job | Defer — pending real org/legal sign-off on policy value | System | n/a (infra) | scheduled deletion job against the provisional retention fields | Not started |
| cicd-pipeline | POC-core (foundational — doc 3 §6.3 migration-guard gate) | System | all (delivery pipeline) | CI/CD + migration-guard/promotion gates | Not started |
| cloud-environment-provisioning | POC-core (needed before staging/prod deploy, doc 3 §7.1) | System | all | cloud Supabase project A/B + staging/prod env wiring | Not started |
| error-monitoring-infra | POC-core (doc 2: Admin "error monitoring") | System | Admin | Sentry setup (US region) + PII scrubbing before capture | Not started |
