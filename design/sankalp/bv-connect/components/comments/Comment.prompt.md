**Comment** — one comment in a thread. Public comments are flat; a `isPrivate` comment (teacher ↔ a single parent) is tinted violet with a lock so visibility is never ambiguous — a hard requirement for a minors' platform.

```jsx
<Comment author={{ name: "Priya N.", role: "parent" }} time="1h" body="Thank you!" />
<Comment author={{ name: "Mrs. Rao", role: "teacher" }} time="40m" isPrivate
         body="Aarav did wonderfully today — wanted you to know privately." />
```

**RN/Unistyles:** `View` row; the avatar initial uses `theme.fonts.display`; private styling = `theme.colors.privateSoft` bg + `theme.colors.private` accent.
