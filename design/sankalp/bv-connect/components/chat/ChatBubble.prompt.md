**ChatBubble** — one message in the class group chat or a student DM. `own` messages fill terracotta and align right; incoming bubbles show the sender name (group chats) and align left.

```jsx
<ChatBubble author="Aarav M." time="9:42">Is havan at 9 or 9:30?</ChatBubble>
<ChatBubble own time="9:43" read>9:00 sharp 🙏</ChatBubble>
```

`read` is `undefined` (no tick) / `false` (sent) / `true` (read). **RN:** `View` with `alignSelf` flipping on `own`; bubble fill = `theme.colors.chatOut` / `theme.colors.chatIn`. Governance note: student P2P DM is gated behind the chat-governance policy — keep DM bubbles behind that flag.
