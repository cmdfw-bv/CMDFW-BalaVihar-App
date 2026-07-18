**PersonaSwitcher** — the multi-persona control. A compact pill shows the current role; tapping opens a bottom sheet to switch. Switching **re-scopes the whole app** (own children → class → session → org), which the sheet states outright.

```jsx
<PersonaSwitcher activeId={role} onChange={setRole} roles={[
  { id:"teacher", name:"Teacher", role:"teacher", scope:"JR·A · Brampton" },
  { id:"parent", name:"Parent", role:"parent", scope:"2 children" },
]} />
```

This is the visual half of the multi-role model — the access scope is enforced server-side by RLS on the `active_role` claim. **RN:** the sheet is a bottom-sheet modal; pill maps to a `Pressable`.
