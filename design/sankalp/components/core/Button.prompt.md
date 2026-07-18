**Button** — the capsule action control; use for any tap/click action. One `primary` (terracotta) button per view; demote the rest to `secondary` / `ghost`.

```jsx
<Button variant="primary" size="lg" iconRight={<Arrow />} onClick={register}>
  Register now
</Button>
```

Variants: `primary` (the single CTA), `secondary` & `ghost` (supporting), `outline` (on indigo/poster surfaces), `gold` (festival highlight on dark), `danger` (destructive), `dark` (ink submit used in registration forms). Sizes `sm | md | lg | xl`. Pass `href` to render as a link, `fullWidth` to fill its column, `icon` / `iconRight` for inline SVG glyphs.
