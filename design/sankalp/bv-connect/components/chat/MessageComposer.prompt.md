**MessageComposer** — the sticky chat input bar (text field + round send button; optional attach). Enter sends, Shift+Enter inserts a newline; the send button activates only with content.

```jsx
<MessageComposer placeholder="Message Junior A…" onSend={post} />
```

**RN:** `TextInput` (multiline) + `Pressable`; pin to bottom with `KeyboardAvoidingView`. Send fill maps to `theme.colors.primary` / `theme.colors.line2` (disabled).
