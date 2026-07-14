**StatusChip** — tiny uppercase capsule that marks the state of an event or an attendance row. Each status maps to exactly one meaning; never use a status color as a background wash.

```jsx
<StatusChip status="open">Registration open</StatusChip>
<StatusChip status="present">Present</StatusChip>
<StatusChip status="featured">Featured</StatusChip>
```

Statuses: `open` / `soon` / `past` / `featured` (marketing) and `present` / `absent` / `excused` / `info` (app). `open` and `present` show a pulsing-style leading dot; override with `dot`.
