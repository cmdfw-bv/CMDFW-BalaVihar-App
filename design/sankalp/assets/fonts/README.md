# Fonts — Sankalp / Chinmaya Mission

Three families, all free Google Fonts (OFL-licensed) that ship `.ttf`. **The six
`.ttf` files are already in this folder** — no download needed. Native registers
them with `expo-font`.

> Note: `JetBrainsMono-Regular.ttf` is Google Fonts' variable file saved under the
> Regular name; it renders as regular weight at its default axis. Swap in a static
> instance later if you need multiple mono weights.

| Role | Family | Files to bundle |
|---|---|---|
| Display / identity | **Marcellus** (single weight) | `Marcellus-Regular.ttf` |
| UI / body / Devanagari | **Mukta** | `Mukta-Regular.ttf` `Mukta-Medium.ttf` `Mukta-SemiBold.ttf` `Mukta-Bold.ttf` |
| Tabular numerics / IDs | **JetBrains Mono** | `JetBrainsMono-Regular.ttf` |

Sources (for reference / updates):
- https://fonts.google.com/specimen/Marcellus
- https://fonts.google.com/specimen/Mukta
- https://fonts.google.com/specimen/JetBrains+Mono

The theme's `fonts.*` keys use these
exact family names (Android matches the file name; iOS matches the PostScript
name — keep them consistent):

`Marcellus-Regular` · `Mukta-Regular` · `Mukta-Medium` · `Mukta-SemiBold` ·
`Mukta-Bold` · `JetBrainsMono-Regular`

## Register at app entry (`app/_layout.tsx`)

```tsx
import { useFonts } from "expo-font";
import * as SplashScreen from "expo-splash-screen";
import { useEffect } from "react";

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [loaded] = useFonts({
    "Marcellus-Regular": require("../assets/fonts/Marcellus-Regular.ttf"),
    "Mukta-Regular": require("../assets/fonts/Mukta-Regular.ttf"),
    "Mukta-Medium": require("../assets/fonts/Mukta-Medium.ttf"),
    "Mukta-SemiBold": require("../assets/fonts/Mukta-SemiBold.ttf"),
    "Mukta-Bold": require("../assets/fonts/Mukta-Bold.ttf"),
    "JetBrainsMono-Regular": require("../assets/fonts/JetBrainsMono-Regular.ttf"),
  });
  useEffect(() => { if (loaded) SplashScreen.hideAsync(); }, [loaded]);
  if (!loaded) return null;
  // ...render Stack
}
```

> **Marcellus is single-weight.** Never pass `fontWeight` to display text — size
> and color carry hierarchy. For body emphasis switch the Mukta family
> (`Mukta-Medium` / `Mukta-SemiBold`).

The two brand images (`chinmaya-om.png`, `gurudev.jpg`) are in `assets/images/`.
