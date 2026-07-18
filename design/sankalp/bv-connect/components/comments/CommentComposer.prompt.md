**CommentComposer** — the input row for adding a comment, with a **public/private** segmented toggle so the author commits to an audience before sending. The well tints violet in private mode.

```jsx
<CommentComposer onSend={({ body, isPrivate }) => post(body, isPrivate)} />
```

Set `canPrivate={false}` where every comment is public. **RN:** `TextInput` + send `Pressable`; the toggle is a 2-segment control mapping to `theme.colors.ink` (public) / `theme.colors.private` (private).
