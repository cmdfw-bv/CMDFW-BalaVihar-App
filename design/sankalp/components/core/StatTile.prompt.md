**StatTile** — one figure with an uppercase label. Mono-tabular by default so figures align across a dashboard row; pass `display` to render it in the large serif for hero/mission stats.

```jsx
<StatTile label="Attendance today" value="94.2%" accent />
<StatTile label="Member families" value="2,400+" display />
```

`accent` colors the figure terracotta. Always feed it a real value or a labelled `—`, never invented filler.
