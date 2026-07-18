**ComplianceBar** — a labelled progress bar for one dashboard metric. Tone derives from the value (≥85 success, ≥70 warning, else danger) unless you set `status`; the figure is mono-tabular so stacked bars align.

```jsx
<ComplianceBar label="Update compliance" value={83} note="5 of 6 classes posted." />
<ComplianceBar label="Marked / enrolled" value={94} display="47/50" status="success" />
```
