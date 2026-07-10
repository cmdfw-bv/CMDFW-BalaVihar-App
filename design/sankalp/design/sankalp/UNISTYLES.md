# CMDFW Bala Vihar App — Unistyles 3 theme

The POC is built in Expo + `react-native-unistyles@3`. This extends the base
brand theme (see the root `readme.md` → "React Native / Unistyles 3") with the
app-layer tokens from `tokens/app.css`. Light-only for now; the keys are named
so a `dark` theme slots in later without touching components.

```ts
// unistyles.ts
import { StyleSheet } from 'react-native-unistyles';

const light = {
  fonts: {
    display: 'Marcellus-Regular',
    body: 'Mukta-Regular', medium: 'Mukta-Medium', semibold: 'Mukta-SemiBold', bold: 'Mukta-Bold',
    mono: 'JetBrainsMono-Regular',
  },
  colors: {
    // brand
    ink: '#1c1410', ink2: '#3d2e22', ink3: '#6b574a', ink4: '#9c8773',
    line: '#e6d8bf', line2: '#d6c4a3',
    primary: '#b8531a', primaryPressed: '#8e3d10', primarySoft: '#f3d9b8',
    indigo: '#2d2056', gold: '#b8893f',
    success: '#2f6a3a', warning: '#8a6320', danger: '#b3402e', info: '#2c4a7a',
    // app layer
    canvas: '#f4eee1', surface: '#fffdf8', surface2: '#f7f0e2',
    overlay: 'rgba(28,20,16,0.46)',
    chatOut: '#b8531a', chatOutInk: '#fff6ea', chatIn: '#fffdf8', chatInInk: '#1c1410',
    private: '#6d4bb0', privateSoft: '#efeafa', privateLine: '#ddd2f3',
    scope: { org: '#2c4a7a', center: '#8a6320', class: '#7a5ba8' },
    roles: { student:'#3f6db0', parent:'#4a8a5c', teacher:'#7a5ba8', coordinator:'#c08a3e', bv:'#a4508a', admin:'#5a5566' },
  },
  radius: { control: 10, card: 14, bubble: 18, pill: 999 },
  space:  { 1:4, 2:8, 3:12, 4:16, 5:20, 6:24, 8:32, 10:40 },
  chrome: { header: 56, tabbar: 64, gutter: 16, maxw: 440 },
};

StyleSheet.configure({ themes: { light }, settings: { initialTheme: 'light' } });
```

## Per-component RN mapping (essentials)
- **FeedCard** → `Pressable`/`View`; scope pill → `colors.scope.*`; only the card + comment count are tap targets.
- **Comment / CommentComposer** → public = `colors.surface`; private = `colors.privateSoft` + `colors.private`; the composer toggle is a 2-segment control.
- **ChatBubble** → `alignSelf` flips on `own`; fills `colors.chatOut` / `colors.chatIn`; read tick coloured `colors.info`.
- **ConversationRow / MessageComposer** → list `Pressable` rows; composer pinned with `KeyboardAvoidingView`; unread badge `colors.primary`.
- **NotificationItem** → leading hue by `type`; unread = `colors.surface` bg + `colors.primary` dot.
- **MagicLinkLogin** → `KeyboardAvoidingView`; Supabase `signInWithOtp({ email })`; no sign-up route.
- **UserRoleRow** → multi-persona badges wrap; approve/reject only on `pending`.
- **CsvImport** → dropzone uses `expo-document-picker`; summary figures `colors.success`/`colors.danger`.
- **ConsentCapture** → each toggle persists a `consents` row with the server timestamp (don't infer at submit).
- **AuditEntry** → display-only over the append-only `audit_log`; mono, newest-first.
- **PersonaSwitcher** → pill + bottom-sheet modal; sets the `active_role` claim; RLS does the real scoping.
- **ComplianceBar / CenterRollupRow** → bar tone auto-derives (≥85 success, ≥70 warning); `placeholder` renders `—`.

Because **Marcellus is single-weight**, never pass `fontWeight` to display text;
use `Mukta-Medium`/`-SemiBold` for body emphasis instead.
