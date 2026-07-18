**CenterRollupRow** — one center in the BV Coordinator org rollup: name, region, attendance %, marked/enrolled, and a mini bar. `placeholder` renders an honest `—` for centers with no data — the POC rollup is a degenerate single-center case and shouldn't fake cross-center figures.

```jsx
<CenterRollupRow name="Brampton" region="Session · JR + SR" attendance={94} marked={47} enrolled={50} />
<CenterRollupRow name="Mississauga" region="Not in pilot" placeholder />
```
