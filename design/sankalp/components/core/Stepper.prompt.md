**Stepper** — a labelled +/- number control for attendee counts and quantities. Round 40px capsule buttons; the value is set in the display serif so it reads like a figure.

```jsx
<Stepper label="Parents" hint="BV-enrolled parents"
         value={adults} onChange={setAdults} min={0} max={20} />
```

Clamps to `min`/`max` and disables the relevant button at the bounds.
