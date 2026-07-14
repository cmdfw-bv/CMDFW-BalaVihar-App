**ConsentCapture** — explicit, timestamped parental + media consent. Each item is an opt-in checkbox; once checked it shows the captured timestamp, because consent has to be auditable on a minors' platform.

```jsx
<ConsentCapture
  items={[
    { id:"parental", required:true, label:"Parental consent", help:"I am the parent/guardian and consent to enrollment." },
    { id:"media", label:"Media consent", help:"Photos taken during class may be shared in family updates." },
  ]}
  values={vals} timestamps={{ parental: "2026-06-14 09:02" }} onToggle={toggle} />
```

Persist each toggle to a `consents` row with the timestamp — don't infer it client-side at submit.
