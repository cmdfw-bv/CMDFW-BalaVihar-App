**SegmentedTabs** — a capsule tab group (Upcoming / Past / All, verify-by Family-ID / Email, etc). The active tab fills with ink; the rest stay quiet.

```jsx
<SegmentedTabs
  value={tab} onChange={setTab}
  tabs={[{id:"upcoming",label:"Upcoming",count:2},{id:"past",label:"Past",count:1}]}
/>
```

Pass plain strings for label-only tabs, or `{id,label,count}` objects to show tabular count badges.
