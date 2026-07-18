**MagicLinkLogin** — passwordless sign-in: one email field → "send magic link" → "check your email". There is deliberately **no sign-up path** — accounts are provisioned by coordinators/admins and minors never self-register.

```jsx
<MagicLinkLogin logoSrc="../../assets/chinmaya-om.png"
  sent={sent} email={email} onSend={sendLink} />
```

Drive `sent` from your auth call. **Supabase note:** maps to `signInWithOtp({ email })`; the link returns to a `/auth/callback` route. **RN:** wrap in `KeyboardAvoidingView`; the OM logo uses the shared `Logo` component.
