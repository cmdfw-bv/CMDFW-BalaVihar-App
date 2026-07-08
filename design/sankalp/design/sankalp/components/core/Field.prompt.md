**Field** — a labelled control (input / textarea / select) with an always-reserved inline validation slot. Validation is a *state*, not a tooltip: pass `error` and the border + message turn `--danger` without the layout jumping.

```jsx
<Field label="Full name" required placeholder="Your full name"
       value={name} onChange={e => setName(e.target.value)} />

<Field label="Absence reason" required
       error="A reason is required when marking a student absent." />
```

`as="textarea"` or `as="select"` (pass `<option>` children). `hint` fills the slot when there's no error. Focus shows the terracotta ring.
