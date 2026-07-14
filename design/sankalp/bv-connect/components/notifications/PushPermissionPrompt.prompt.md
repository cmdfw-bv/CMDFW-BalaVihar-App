**PushPermissionPrompt** — the soft-ask card shown before the native Web Push (VAPID) permission dialog, so a denial isn't permanent. Honest about what's sent; always offers "Not now".

```jsx
<PushPermissionPrompt onEnable={requestPush} onDismiss={snooze} />
```

Show once, near the first meaningful action (after opening a class update). **PWA note:** on iOS 16.4+ push only works once the PWA is installed to the home screen — pair with an install hint when `display-mode` isn't standalone.
