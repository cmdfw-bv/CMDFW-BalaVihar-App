**FeedCard** — one item in the home feed: an org/center **announcement** or a single-**class update**. Header pairs the author's `RoleBadge` with a scope pill and optional pin; footer carries time, reach, and comment count.

```jsx
<FeedCard
  kind="announcement" scope="org" pinned
  author={{ role: "bv", name: "BV Coordinator" }}
  title="Hanuman Chalisa Havan — 14 Jun"
  body="Registration is open. Families, please RSVP so we can honour seating limits."
  time="2h ago" reach="240 families" comments={4}
/>

<FeedCard
  kind="update" scope="class" tag="Homework"
  author={{ role: "teacher", scope: "JR·A" }}
  title="This week in Junior A"
  body="We learned the first two verses of the Chalisa."
  homework="Revise chant #1 at home." time="Yesterday" comments={4}
/>
```

`scope` is `org | center | class`; announcements use the serif title, updates use the sans title. **RN/Unistyles:** render as `Pressable` → `View`; map the scope pill colors to `theme.colors.scope.*`; the comment count is the only tap target besides the whole card (`onOpen`).
