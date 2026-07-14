# CMDFW Bala Vihar App — POC design system

A **branch** of the Chinmaya Mission DFW design system for the *CMDFW Bala Vihar
App* — the native-first PWA described in the POC Feature Scope (a
community-engagement + operations platform for the weekly children's program,
not just an attendance app). It **inherits** the brand (warm paper, terracotta,
indigo, gold, Marcellus + Mukta) and adds an **app-native layer**: denser
spacing, tighter radii, lighter elevation, and feed/chat/privacy semantics.

This folder is **self-contained and liftable**. To split it into its own project:
1. Copy `bv-connect/` plus the brand `tokens/` and `assets/` it imports.
2. Move `bv-connect/app.css` to the new root and rename it `styles.css`; fix the
   two `../tokens` import paths.
3. Recompile — the namespace changes, so update `window.<Namespace>` in the
   card HTML.

## Entry point
`app.css` — brand foundations (`../tokens/*`) + the app layer (`tokens/app.css`).
Cards and screens in this folder link **this** file (not the root `styles.css`).
See `tokens/app.css` for the `--app-*` tokens (canvas/surfaces, chrome heights,
radii, elevation, scope/chat/privacy colors, z-index).

## Components (`window.ChinmayaMissionDesignSystem_52eae1`)
Built on the base primitives (`Button`, `RoleBadge`, `StatusChip`, `Field`,
`StatTile`, `Logo`) — these add the POC surfaces:

| Group | Components | Covers |
|---|---|---|
| **Feed** | `FeedCard` | announcements + class updates, scope pills, pins |
| **Comments** | `Comment`, `CommentThread`, `CommentComposer` | two-way comments, public **and private** |
| **Chat** | `ConversationRow`, `ChatBubble`, `MessageComposer` | class group chat + student DM |
| **Notifications** | `NotificationItem`, `PushPermissionPrompt` | notifications center + Web Push soft-ask |
| **Auth** | `MagicLinkLogin` | passwordless sign-in, no self-registration |
| **Admin** | `UserRoleRow`, `CsvImport` | multi-persona role mgmt + approvals + CSV enrollment |
| **Privacy** | `ConsentCapture`, `AuditEntry` | timestamped consent + minors'-access audit log |
| **Navigation** | `PersonaSwitcher` | multi-persona active-role switch (re-scopes the app) |
| **Dashboard** | `ComplianceBar`, `CenterRollupRow` | session compliance + org per-center rollup |

Each component has `<Name>.jsx` + `.d.ts` + `.prompt.md`; each directory has one
`@dsCard`-tagged `*.card.html` (group `BV · <Area>`) for the Design System tab.

## Personas (6)
Student · Parent · Teacher · Coordinator (session) · BV Coordinator (org) · Admin.
The same account can hold several scoped roles — `PersonaSwitcher` switches the
active one and the access scope follows (own children → class → session → org).

## What's NOT here yet
- **Screens** (next pass, per "components first"): the §5 thinnest end-to-end
  slice on a phone + a desktop/tablet dashboard. Components are screen-ready.
- Deferred per the brief: gamification/karma, BV Connect HS social feed, daily
  inspiration, AI announcement drafting, syllabus upload, substitute/volunteer.

## React Native / Unistyles 3
See `UNISTYLES.md` for the extended theme (brand + `--app-*` tokens) and the
per-component RN notes (also in each `.prompt.md`).

## Provenance
Scope from the POC Feature Scope + Greenfield POC Proposal in the Chinmaya
Mission DFW source codebase. These are design recreations — no real student data.

---
Mirrored from the **Chinmaya Mission Design System** project on claude.ai/design
(project id `52eae132-de66-4053-8861-a39b2ea05305`) via the `DesignSync` tool.
Re-pull with the same tool if this drifts from the live project.
