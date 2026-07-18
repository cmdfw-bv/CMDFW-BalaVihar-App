**UserRoleRow** — the admin/coordinator row for managing a person: avatar, name, email + scope, their role badges (multi-persona — one account can hold several), and inline actions. `status="pending"` swaps the manage button for approve/reject.

```jsx
<UserRoleRow name="Priya N." email="priya@…" scope="JR·A"
  roles={[{role:"teacher",scope:"JR·A"},{role:"parent"}]} onManage={open} />
<UserRoleRow name="New parent" email="new@…" status="pending"
  roles={["parent"]} onApprove={ok} onReject={no} />
```

Approval scope is itself RLS-gated — a coordinator only sees pending users in their own session.
