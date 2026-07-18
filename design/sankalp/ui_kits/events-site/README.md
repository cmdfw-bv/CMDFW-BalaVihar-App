# Events Site — UI kit

A faithful, **mobile-first** recreation of the live Chinmaya Mission DFW events &
registration home (source: the Chinmaya Mission DFW source codebase). It composes
the design-system primitives — never re-implements them.

## Run
Open `index.html`. It links the root `styles.css` (tokens + fonts) and `kit.css`
(mobile-first layout), loads the compiled `_ds_bundle.js`, then mounts the app.

## Files
- `index.html` — entry; loads React + bundle + scripts.
- `kit.css` — layout only, mobile-first (base = phone, `@media (min-width)` enhances up).
- `icons.jsx` — shared inline icon set (`window.I`).
- `data.jsx` — event fixtures (`window.EVENTS`).
- `EventsApp.jsx` — the app: Nav, Hero + featured poster, events list, Gurudev welcome note, notify band, footer, registration drawer.

## DS components used
`Button`, `StatusChip`, `Logo`, `EventDateBlock`, `StatTile`, `SegmentedTabs`
from `window.ChinmayaMissionDesignSystem_52eae1`.

## Interactions
- Upcoming / Past / All tabs filter the list.
- "Register" (nav, hero, rows) opens the right-side registration drawer.
- Notify form fires a toast.

## Notes
The live product is branded "Chinmaya Mission Toronto (CMT)". This kit uses the
chapter-neutral "Chinmaya Mission" so it reads for any chapter — swap the
wordmark/contact in `EventsApp.jsx` for a specific chapter. Posters are the
token-built placeholder treatment (no real event art shipped).
