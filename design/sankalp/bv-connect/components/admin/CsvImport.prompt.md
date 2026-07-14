**CsvImport** — the admin enrollment importer. Before a file: a dropzone naming the expected columns. After parsing: a ready/flagged summary + confirm. CSV is the POC baseline (the doc's open question #3) — this is the seam an API sync would replace.

```jsx
<CsvImport onChoose={pick} />                      // empty
<CsvImport fileName="jr-a.csv" total={52} ready={50} flagged={2}
  onChoose={pick} onConfirm={runImport} />         // parsed
```
