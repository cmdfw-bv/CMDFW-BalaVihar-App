**CommentThread** — wraps a feed item's discussion: a count header, the list of `Comment`s, and a composer passed as children.

```jsx
<CommentThread comments={[
  { author:{name:"Priya N.",role:"parent"}, time:"1h", body:"Thank you!" },
  { author:{name:"Mrs. Rao",role:"teacher"}, time:"40m", isPrivate:true, body:"Privately — well done today." },
]}>
  <CommentComposer onSend={post} />
</CommentThread>
```
