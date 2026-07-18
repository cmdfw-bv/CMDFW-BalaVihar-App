**AuditEntry** — a single line in the minors'-access audit log: `time · actor · action · target`, mono and dense. Required by the compliance rule that access to minors' records is logged.

```jsx
<AuditEntry time="2026-06-14 09:02" actor="teacher:JR·A" action="view" target="student #3 record" />
<AuditEntry time="2026-06-14 09:05" actor="admin" action="export" target="JR·A roster (CSV)" />
```

Render newest-first inside a scrollable card. These rows are display-only — the source of truth is the append-only `audit_log` table.
