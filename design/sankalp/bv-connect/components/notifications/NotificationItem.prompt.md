**NotificationItem** — one row in the notifications center. `type` sets the icon + hue: `update` / `announce` / `absence` / `approval` / `chat`. Unread rows get a surface fill + terracotta dot.

```jsx
<NotificationItem type="update" unread title="New update in Junior A"
  body="Mrs. Rao posted this week's lesson." time="2h" />
<NotificationItem type="absence" title="Absence reported"
  body="Kabir S. marked absent — reason attached." time="Yesterday" />
```
