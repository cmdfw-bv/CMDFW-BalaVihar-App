# Architecture Document
### CMDFW Bala Vihar App — Document 4 of 8

**Version:** 1.0  
**Date:** 2026-06-10  
**Status:** Approved — governs all infrastructure and implementation decisions  

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Technology Stack](#2-technology-stack)
3. [Environment Topology](#3-environment-topology)
4. [Application Architecture](#4-application-architecture)
5. [Authentication & Session Flow](#5-authentication--session-flow)
6. [Data Flow](#6-data-flow)
7. [Real-time Architecture](#7-real-time-architecture)
8. [Deployment Pipeline](#8-deployment-pipeline)
9. [Phase 2: App Store Distribution](#9-phase-2-app-store-distribution)
10. [Folder Structure](#10-folder-structure)
11. [Key Technical Patterns](#11-key-technical-patterns)
12. [Infrastructure Costs](#12-infrastructure-costs)
13. [Constraints & Boundaries](#13-constraints--boundaries)

---

## 1. System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        USERS                                     │
│  BV Coordinator · Coordinator · Teacher · Parent · Student        │
│  Board Member · Acharya  [Volunteer · Substitute — Phase 2]      │
└──────────────────────────┬──────────────────────────────────────┘
                           │  HTTPS
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                    NETLIFY CDN                                    │
│              Static PWA (Expo web export)                        │
│         dist/ served globally from Netlify edge                  │
└──────────────────────────┬──────────────────────────────────────┘
                           │  HTTPS / WebSocket
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                       SUPABASE                                   │
│                                                                  │
│  ┌─────────────┐  ┌──────────────┐  ┌───────────────────────┐  │
│  │  Auth        │  │  PostgreSQL  │  │  Realtime             │  │
│  │  (JWT)       │  │  + RLS       │  │  (Postgres Changes)   │  │
│  └─────────────┘  └──────────────┘  └───────────────────────┘  │
│                                                                  │
│  ┌─────────────┐  ┌──────────────┐                             │
│  │  Storage     │  │  Edge        │                             │
│  │  (files)     │  │  Functions   │                             │
│  └─────────────┘  └──────────────┘                             │
└─────────────────────────────────────────────────────────────────┘
```

There is no application server. The React Native PWA communicates directly with Supabase from the client. All business logic that requires elevated privileges runs in Supabase Edge Functions (Deno). All access control is enforced by PostgreSQL Row Level Security.

---

## 2. Technology Stack

| Layer | Technology | Version | Purpose |
|---|---|---|---|
| **Frontend** | React Native (Expo) | SDK 52+ | Cross-platform UI |
| **Language** | TypeScript | 5.x, strict mode | Type safety |
| **Navigation** | Expo Router | v4+ | File-based routing |
| **Styling** | StyleSheet + theme tokens | — | Design system |
| **Backend** | Supabase | Latest | Auth, DB, Realtime, Storage |
| **Database** | PostgreSQL | 15+ (Supabase managed) | Relational data + RLS |
| **Auth** | Supabase Auth | — | JWT, email/password, OTP (Phase 2) |
| **Real-time** | Supabase Realtime | — | Postgres Changes subscriptions |
| **Storage** | Supabase Storage | — | File uploads (Phase 3) |
| **Edge Functions** | Supabase Edge Functions (Deno) | — | `set_active_persona`, push triggers |
| **PWA Hosting** | Netlify | — | Static site hosting + CDN |
| **CI/CD** | GitHub Actions + Netlify | — | Automated build + deploy |
| **Error Monitoring** | Sentry | — | Runtime error capture |
| **Token Storage** | expo-secure-store | — | Native; localStorage fallback for web |
| **App Store Builds** | Expo EAS | — | Phase 2: iOS + Android binaries |

### TypeScript Configuration

`tsconfig.json` must include:

```json
{
  "extends": "expo/tsconfig.base",
  "compilerOptions": {
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "noUncheckedIndexedAccess": true
  }
}
```

`"strict": true` is non-negotiable. The prototype's widespread `any` usage was directly caused by the absence of this flag. ESLint rule `@typescript-eslint/no-explicit-any: error` must also be active — failing the build on any `any` in production code.

### Supabase Type Generation

Run after every schema change:

```bash
npx supabase gen types typescript \
  --project-id $SUPABASE_PROJECT_ID \
  > src/types/database.types.ts
```

This produces fully-typed table interfaces from the live schema. All Supabase client calls must use these generated types. No manual type definitions for database rows.

---

## 3. Environment Topology

Three fully isolated environments are required before any real user data is collected.

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   DEVELOPMENT   │    │    STAGING      │    │   PRODUCTION    │
│                 │    │                 │    │                 │
│ Expo dev server │    │ Netlify          │    │ Netlify          │
│ (localhost)     │    │ staging branch  │    │ main branch     │
│                 │    │                 │    │                 │
│ Supabase:       │    │ Supabase:       │    │ Supabase:       │
│ balvihar-dev    │    │ balvihar-stage  │    │ balvihar-prod   │
│ (free tier ok)  │    │ (Pro tier)      │    │ (Pro tier)      │
│                 │    │                 │    │                 │
│ Seed data:      │    │ Seed data:      │    │ Seed data:      │
│ Full synthetic  │    │ Minimal synth.  │    │ NONE — real     │
│ dataset         │    │ dataset         │    │ users only      │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

### Environment Rules

| Rule | Development | Staging | Production |
|---|---|---|---|
| Real user data | ❌ Never | ❌ Never | ✅ Only here |
| Seed data | ✅ Full dataset | ✅ Minimal dataset | ❌ Never |
| Schema experiments | ✅ Free | ❌ Migration files only | ❌ Migration files only |
| Automated backups | ❌ Not required | ✅ Required (Pro) | ✅ Required (Pro) |
| Supabase tier | Free | Pro | Pro |

### Environment Variables

Each environment has its own `.env.local` (never committed to git):

```bash
# .env.local (development)
EXPO_PUBLIC_SUPABASE_URL=https://[dev-project-ref].supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=[dev-anon-key]
EXPO_PUBLIC_SENTRY_DSN=[sentry-dsn]
EXPO_PUBLIC_ENV=development

# .env.staging (loaded by Netlify for staging branch)
EXPO_PUBLIC_SUPABASE_URL=https://[stage-project-ref].supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=[stage-anon-key]
EXPO_PUBLIC_SENTRY_DSN=[sentry-dsn]
EXPO_PUBLIC_ENV=staging

# Production env vars set in Netlify dashboard (not in repo)
EXPO_PUBLIC_SUPABASE_URL=https://[prod-project-ref].supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=[prod-anon-key]
EXPO_PUBLIC_SENTRY_DSN=[sentry-dsn]
EXPO_PUBLIC_ENV=production
```

**`.gitignore` must include:** `.env.local`, `.env.staging`, `.env.production`

The `EXPO_PUBLIC_` prefix makes variables available at build time in the Expo bundle. These are safe to expose (anon key + project URL) — data access is gated by RLS, not by keeping these values secret (see `ARCHITECTURE_DECISIONS.md` ADR-003).

---

## 4. Application Architecture

### 4.1 Folder Structure

```
mobile/
├── app/                          # Expo Router — file-based routing
│   ├── _layout.tsx               # Root layout: auth gate, Sentry init, theme
│   ├── +html.tsx                 # PWA HTML shell
│   ├── (auth)/                   # Unauthenticated screens
│   │   ├── _layout.tsx
│   │   ├── login.tsx
│   │   └── persona-picker.tsx
│   └── (app)/                    # Authenticated screens (role-gated)
│       ├── _layout.tsx           # Tab navigator with role-aware tab set
│       ├── feed/
│       │   └── index.tsx
│       ├── my-class/
│       │   ├── index.tsx
│       │   ├── attendance.tsx
│       │   └── update.tsx
│       ├── my-children/
│       │   └── index.tsx
│       ├── dashboard/
│       │   └── index.tsx
│       ├── events/
│       │   └── index.tsx
│       ├── opportunities/
│       │   └── index.tsx
│       ├── notifications/
│       │   └── index.tsx
│       └── profile/
│           └── index.tsx
│
├── src/
│   ├── components/               # Reusable UI components
│   │   ├── ui/                   # Primitives: Button, Card, Input, Badge, etc.
│   │   ├── feed/                 # AnnouncementCard, ClassUpdateCard, SubRequestCard
│   │   ├── attendance/           # AttendanceRow, AttendanceGrid, SubmitBanner
│   │   ├── comments/             # CommentThread, CommentInput, CommentItem
│   │   ├── substitute/           # SubRequestCard, VolunteerList, AssignModal
│   │   └── persona/              # PersonaPicker, PersonaTile
│   │
│   ├── hooks/                    # Custom React hooks
│   │   ├── useAuth.ts            # Auth context consumer
│   │   ├── useFeed.ts            # Feed data + realtime subscription
│   │   ├── useAttendance.ts      # Attendance load + submit
│   │   ├── useClassUpdates.ts    # Class updates CRUD
│   │   ├── useSubstitute.ts      # Sub request workflow
│   │   └── useAcademicYear.ts    # Current year + year selector
│   │
│   ├── lib/
│   │   ├── supabase.ts           # Supabase client (SecureStore adapter)
│   │   ├── sentry.ts             # Sentry init + error capture helpers
│   │   └── dates.ts             # formatDate, lastSunday, academicYearFor
│   │
│   ├── context/
│   │   └── AuthContext.tsx       # Auth state: user, profile, activePersona
│   │
│   ├── types/
│   │   ├── database.types.ts     # Generated by Supabase CLI — do not edit
│   │   └── app.types.ts          # App-level types: Persona, TabConfig, etc.
│   │
│   └── theme/
│       └── index.ts              # Colors, spacing, typography, shadows
│
├── assets/                       # Fonts, icons, splash screen
├── app.json                      # Expo config
├── eas.json                      # EAS build profiles (Phase 2)
├── netlify.toml                  # Netlify build config
├── .env.local                    # Local env vars (gitignored)
└── tsconfig.json                 # strict: true
```

### 4.2 Key Architecture Rules

1. **No business logic in screen files.** Screens are thin — they call hooks, render components, handle navigation. Business logic lives in hooks or Supabase functions.
2. **No Supabase calls in components.** Only hooks and screen files call Supabase. Components receive data as props.
3. **No inline styles.** All styles use the theme system or StyleSheet.create(). No `style={{ color: '#b8531a' }}`.
4. **No `any` types.** ESLint enforces this. Use generated database types for all Supabase responses.
5. **One screen file per persona view.** The prototype's 1,306-line `classes.tsx` that handled 6 separate flows is explicitly prohibited. Each distinct view is its own file.
6. **Shared utilities are in `src/lib/`.** `formatDate`, `lastSunday`, and any other shared helpers live here — not redefined in each screen file.

---

## 5. Authentication & Session Flow

### 5.1 Login Flow

Magic link (passwordless email) is the authentication method. See `ARCHITECTURE_DECISIONS.md` ADR-008 for the rationale.

```
User enters email address → taps "Send Magic Link"
  │
  ▼
supabase.auth.signInWithOtp({
  email,
  options: { emailRedirectTo: redirectUri }
})
  │
  ▼
App navigates to "Check your email" screen
  │
  ▼
User taps link in email
  │
  ├── PWA: browser opens redirect URL with token in hash fragment
  │         supabase client detects token (detectSessionInUrl: true)
  │         session established automatically
  │
  └── Native (Phase 2): deep link opens app via universal link
        app calls supabase.auth.exchangeCodeForSession(url)
        session established
  │
  ▼
onAuthStateChange fires with event: 'SIGNED_IN'
  │
  ▼
App loads profile row for auth.uid()
  │
  ├── No profile row found → email not provisioned
  │   show: "This email is not registered. Contact your coordinator."
  │   call supabase.auth.signOut() to clean up the session
  │
  └── Profile found → JWT issued
        │
        ▼
        Does user have > 1 row in user_roles?
        │
        ├── Yes → navigate to /(auth)/persona-picker
        │           User selects persona
        │             │
        │             ▼
        │           call set_active_persona Edge Function
        │             │
        │             ▼
        │           supabase.auth.refreshSession()
        │             │
        │             ▼
        │           JWT now contains app_metadata.active_role
        │             │
        │             ▼
        │           navigate to /(app) with active persona
        │
        └── No → call set_active_persona with single role
                   (ensures app_metadata is always set)
                     │
                     ▼
                   navigate to /(app)
```

**Redirect URI configuration:**

```typescript
// src/lib/supabase.ts
import * as Linking from 'expo-linking'
import { Platform } from 'react-native'

function getRedirectUri(): string {
  if (Platform.OS === 'web') {
    // PWA: redirect back to the same origin
    return window.location.origin
  }
  // Native (Phase 2): deep link back into the app
  return Linking.createURL('auth/callback')
}

// In the login screen:
await supabase.auth.signInWithOtp({
  email,
  options: { emailRedirectTo: getRedirectUri() },
})
```

**Supabase Auth settings required:**
- Email OTP / Magic Link: **enabled**
- Email confirmations: **disabled** (magic link is the confirmation)
- Add all environment redirect URLs to the Supabase Auth allowed redirect URLs list:
  - `https://[staging].netlify.app`
  - `https://[production].netlify.app`
  - `http://localhost:8081` (development)
  - `com.cmdfw.balvihar://auth/callback` (Phase 2 native deep link scheme)

### 5.2 Token Storage

```typescript
// src/lib/supabase.ts
import * as SecureStore from 'expo-secure-store'
import { Platform } from 'react-native'
import { createClient } from '@supabase/supabase-js'

const storage = {
  getItem: (key: string): Promise<string | null> =>
    Platform.OS === 'web'
      ? Promise.resolve(localStorage.getItem(key))
      : SecureStore.getItemAsync(key),

  setItem: (key: string, value: string): Promise<void> =>
    Platform.OS === 'web'
      ? Promise.resolve(localStorage.setItem(key, value))
      : SecureStore.setItemAsync(key, value),

  removeItem: (key: string): Promise<void> =>
    Platform.OS === 'web'
      ? Promise.resolve(localStorage.removeItem(key))
      : SecureStore.deleteItemAsync(key),
}

export const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL!,
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!,
  {
    auth: {
      storage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  }
)
```

### 5.3 Auth Context

`AuthContext` is the single source of truth for auth state across the app:

```typescript
// src/context/AuthContext.tsx
interface AuthState {
  user: User | null              // Supabase auth user
  profile: Profile | null        // profiles row
  activePersona: PersonaConfig   // { role, center_id, label }
  personas: PersonaConfig[]      // all user_roles rows
  isLoading: boolean
  signOut: () => Promise<void>
  switchPersona: (persona: PersonaConfig) => Promise<void>
}
```

`switchPersona` calls the Edge Function, refreshes the session, and updates `activePersona` in context — without navigating to the login screen.

### 5.4 Route Protection

`app/_layout.tsx` subscribes to `supabase.auth.onAuthStateChange`. Any session expiry or sign-out redirects to `/(auth)/login`. No screen in `/(app)` is reachable without a valid session.

```typescript
// app/_layout.tsx (simplified)
supabase.auth.onAuthStateChange((event, session) => {
  if (event === 'SIGNED_OUT' || !session) {
    router.replace('/(auth)/login')
  }
  if (event === 'TOKEN_REFRESHED') {
    // update AuthContext with new session
  }
})
```

---

## 6. Data Flow

### 6.1 Standard Read (e.g. load feed)

```
Screen mounts
  │
  ▼
useFeed() hook called
  │
  ▼
supabase.from('announcements')
  .select('*, poster:profiles(full_name)')
  .eq('org_id', profile.org_id)
  .order('created_at', { ascending: false })
  .range(0, 19)                         ← pagination: first page
  │
  ├── Supabase evaluates RLS policies
  │   (using my_role() from JWT claim)
  │
  ├── Returns only rows this user is authorized to see
  │
  └── TypeScript response typed via database.types.ts
        │
        ▼
      setFeedItems(data)
        │
        ▼
      Component renders
```

### 6.2 Standard Write (e.g. submit attendance)

```
Teacher taps "Submit Attendance"
  │
  ▼
useAttendance.submit(records) hook
  │
  ▼
supabase.from('attendance')
  .upsert(records.map(r => ({
    class_id: r.class_id,
    student_id: r.student_id,
    session_date: r.session_date,
    academic_year: currentAcademicYear,   ← stamped from current_academic_year()
    status: r.status,
    recorded_by: user.id,
  })))
  │
  ├── RLS WITH CHECK policy evaluated:
  │   class_id must be in teacher's class_teachers
  │
  ├── Success → show "✓ Submitted" banner
  │             Sentry breadcrumb logged
  │
  └── Error → show error toast
              Sentry.captureException(error, { user, context })
```

### 6.3 Error Handling Pattern

Every hook follows this pattern — no silent failures:

```typescript
async function loadData() {
  setLoading(true)
  setError(null)

  const { data, error } = await supabase
    .from('table')
    .select('...')

  if (error) {
    setError(error.message)
    Sentry.captureException(error, {
      extra: { userId: user?.id, persona: activePersona.role }
    })
    setLoading(false)
    return
  }

  setData(data)
  setLoading(false)
}
```

The screen renders:
- `loading === true` → skeleton component
- `error !== null` → error banner with retry button
- `data.length === 0` → empty state component
- `data.length > 0` → content

---

## 7. Real-time Architecture

### 7.1 Feed Subscription

The home feed subscribes to Postgres Changes on `announcements` and `class_updates`. When a new row is inserted, the subscription fires and the hook re-fetches the first page of the feed (not the single new item — a full re-fetch ensures correct ordering and RLS filtering).

```typescript
// src/hooks/useFeed.ts
useEffect(() => {
  const channel = supabase
    .channel('feed-changes')
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'announcements' },
      () => loadFeed()        // re-fetch, not append
    )
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'class_updates' },
      () => loadFeed()
    )
    .subscribe()

  return () => { supabase.removeChannel(channel) }   // cleanup on unmount
}, [])
```

**Why re-fetch instead of append:** Appending the single new item bypasses RLS — the client would be adding an item to the UI without verifying the user is actually authorized to see it. Re-fetching lets RLS filter correctly and keeps the feed in the right sort order.

### 7.2 Realtime Scope

Only the following tables have realtime subscriptions. Subscriptions are expensive (each active subscription holds a WebSocket connection).

| Table | Who Subscribes | Trigger |
|---|---|---|
| `announcements` | All users (feed) | New announcement → reload feed |
| `class_updates` | Teachers, Parents, Students (feed) | New update → reload feed |
| `substitute_assignments` | Coordinators, Substitutes | Status change → reload dashboard/opportunities |
| `teacher_absences` | Coordinators | New absence → reload dashboard |

All other tables are polled on screen focus, not subscribed.

---

## 8. Deployment Pipeline

### 8.1 Git Branch Strategy

```
main          ← production branch; every merge auto-deploys to production Netlify
  │
  └── staging ← integration branch; auto-deploys to staging Netlify
        │
        └── feature/[name] ← feature branches; no auto-deploy
```

**Rules:**
- No direct commits to `main`. All changes go through a PR.
- `staging` is merged into `main` only after manual QA sign-off on the staging deployment.
- Feature branches are cut from `staging`, not `main`.

### 8.2 Netlify Configuration

```toml
# netlify.toml
[build]
  command   = "npx expo export --platform web --clear"
  publish   = "dist"
  base      = "mobile"

[context.staging]
  command   = "npx expo export --platform web --clear"
  publish   = "dist"

[[redirects]]
  from   = "/*"
  to     = "/index.html"
  status = 200
```

The `[[redirects]]` rule is required for Expo Router's client-side routing to work — all paths must serve `index.html` and let the client handle routing.

### 8.3 CI/CD Pipeline (GitHub Actions)

```yaml
# .github/workflows/ci.yml
name: CI

on:
  push:
    branches: [staging, main]
  pull_request:
    branches: [staging]

jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20' }

      - name: Install dependencies
        run: npm ci
        working-directory: mobile

      - name: TypeScript check
        run: npx tsc --noEmit
        working-directory: mobile

      - name: Lint
        run: npx eslint src --max-warnings 0
        working-directory: mobile

      - name: Run tests
        run: npm test -- --watchAll=false
        working-directory: mobile
```

**Pipeline gates:** TypeScript compilation errors, lint errors (including `no-explicit-any`), and failing tests all block the merge. Netlify deployment is triggered by Netlify's GitHub integration after the CI workflow passes.

### 8.4 Schema Migration Deployment

Database migrations are not automated in CI — they are applied manually. This is intentional: an automated migration that runs against production without review is a high-risk pattern for a database with RLS policies.

**Migration procedure:**
1. Write migration file: `/database/migrations/NNN_description.sql`
2. Apply to development — verify the app works
3. Open a PR; migration file is reviewed alongside code changes
4. After PR is merged to `staging`: apply migration to staging Supabase project manually
5. Verify staging deployment works end-to-end
6. After staging sign-off: apply migration to production Supabase project manually
7. Monitor for errors in Sentry for 30 minutes post-deploy

---

## 9. Phase 2: App Store Distribution

This section documents the Expo EAS configuration for iOS App Store and Google Play Store distribution. No code changes are required to the app itself — this is a build configuration addition.

### 9.1 Prerequisites

Before Phase 2 begins:

- [ ] Apple Developer Program enrollment ($99/year) — `developer.apple.com`
- [ ] Google Play Console account ($25 one-time) — `play.google.com/console`
- [ ] Expo EAS account — `expo.dev`
- [ ] App icons at all required sizes (generated from a single 1024×1024 source)
- [ ] App Store screenshots (6.7" iPhone, 12.9" iPad, Android)
- [ ] App Store description, keywords, privacy policy URL

### 9.2 EAS Configuration

```json
// eas.json
{
  "cli": { "version": ">= 10.0.0" },
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal"
    },
    "staging": {
      "distribution": "internal",
      "env": {
        "EXPO_PUBLIC_ENV": "staging"
      }
    },
    "production": {
      "distribution": "store",
      "env": {
        "EXPO_PUBLIC_ENV": "production"
      }
    }
  },
  "submit": {
    "production": {
      "ios": {
        "appleId": "[apple-id-email]",
        "ascAppId": "[app-store-connect-app-id]",
        "appleTeamId": "[apple-team-id]"
      },
      "android": {
        "serviceAccountKeyPath": "./google-play-key.json",
        "track": "production"
      }
    }
  }
}
```

### 9.3 Build Commands

```bash
# Build for internal testing (TestFlight / Play internal track)
eas build --platform all --profile staging

# Build for production app store submission
eas build --platform all --profile production

# Submit to App Store + Play Store after build
eas submit --platform all --profile production
```

### 9.4 PWA and Native Coexistence

After Phase 2, three deployment targets exist from one codebase:

| Target | Build Command | Distribution |
|---|---|---|
| PWA | `expo export --platform web` | Netlify |
| iOS | `eas build --platform ios` | App Store |
| Android | `eas build --platform android` | Play Store |

**Token storage:** `expo-secure-store` works on iOS and Android native builds. The `Platform.OS === 'web'` fallback to `localStorage` in `src/lib/supabase.ts` handles the PWA case. No changes needed for native builds.

**Push notifications:** Web Push (VAPID) works for PWA. For native builds, Expo Notifications (`expo-notifications`) provides richer native push. Phase 2 should implement both — the push token registration code will detect platform and register the appropriate token type.

---

## 10. Folder Structure

*(See Section 4.1 for the full annotated tree.)*

Key rules about the structure:

| Directory | Rule |
|---|---|
| `app/` | Expo Router screens only. No business logic. |
| `src/components/` | Pure UI components. No Supabase calls. Props-driven. |
| `src/hooks/` | All Supabase calls live here. One hook per data domain. |
| `src/lib/` | Singleton clients (Supabase, Sentry) and pure utility functions. |
| `src/context/` | React Context providers. Currently only AuthContext. |
| `src/types/` | `database.types.ts` is generated — never hand-edit. `app.types.ts` for app-specific types. |
| `src/theme/` | One file. All design tokens. No color literals anywhere else in the codebase. |
| `database/` | SQL files only. `schema.sql`, `migrations/`, `seeds/`. |
| `docs/` | All project documentation. |

---

## 11. Key Technical Patterns

### 11.1 Pagination Pattern

All list screens paginate. Page size is 20 items. Load-more is triggered by scroll-to-bottom.

```typescript
const PAGE_SIZE = 20

async function loadPage(page: number) {
  const from = page * PAGE_SIZE
  const to = from + PAGE_SIZE - 1

  const { data, error } = await supabase
    .from('announcements')
    .select('...')
    .order('created_at', { ascending: false })
    .range(from, to)

  if (error) { /* handle */ return }
  setItems(prev => page === 0 ? data : [...prev, ...data])
  setHasMore(data.length === PAGE_SIZE)
}
```

### 11.2 Academic Year Stamping Pattern

All inserts to `attendance`, `class_updates`, `announcements`, `enrollments`, `class_teachers` must stamp `academic_year`. The value comes from `useAcademicYear()` hook, which reads the current year from the `academic_years` table on app load and caches it in context.

```typescript
// src/hooks/useAcademicYear.ts
export function useAcademicYear() {
  const [currentYear, setCurrentYear] = useState<string | null>(null)

  useEffect(() => {
    supabase
      .from('academic_years')
      .select('label')
      .eq('is_current', true)
      .single()
      .then(({ data }) => setCurrentYear(data?.label ?? null))
  }, [])

  return currentYear
}

// Usage in attendance hook:
const academicYear = useAcademicYear()

await supabase.from('attendance').upsert({
  ...record,
  academic_year: academicYear,   // always from hook, never hardcoded
})
```

### 11.3 Compliance Date Pattern

The compliance dashboard must calculate the most recent Sunday programmatically. This value is never derived from the database.

```typescript
// src/lib/dates.ts
export function lastSunday(from: Date = new Date()): Date {
  const d = new Date(from)
  const dayOfWeek = d.getDay()   // 0 = Sunday
  d.setDate(d.getDate() - dayOfWeek)
  d.setHours(0, 0, 0, 0)
  return d
}

export function lastSundayISO(): string {
  return lastSunday().toISOString().split('T')[0]
}
```

The coordinator dashboard compliance query filters `WHERE session_date = lastSundayISO()`. This is correct regardless of whether any data exists for that date.

### 11.4 Multi-Teacher Query Pattern

All queries that previously used `.single()` on `class_teachers` must be updated to handle arrays. The teacher assigned to a class is now a list, not a scalar.

```typescript
// Before (prototype — WRONG for multi-teacher):
const { data: ct } = await supabase
  .from('class_teachers')
  .select('teacher_id')
  .eq('class_id', classId)
  .single()                      // breaks with multiple teachers

// After (rebuild — correct):
const { data: teachers } = await supabase
  .from('class_teachers')
  .select('teacher_id, profiles(full_name)')
  .eq('class_id', classId)
  .eq('academic_year', currentYear)
```

### 11.5 Sentry Error Pattern

Every caught error must include user context. No anonymous error reports.

```typescript
// src/lib/sentry.ts
import * as Sentry from '@sentry/react-native'

export function captureError(
  error: unknown,
  context: { screen: string; action: string; extra?: Record<string, unknown> }
) {
  Sentry.withScope(scope => {
    scope.setTag('screen', context.screen)
    scope.setTag('action', context.action)
    if (context.extra) scope.setExtras(context.extra)
    Sentry.captureException(error)
  })
}
```

Usage:
```typescript
captureError(error, {
  screen: 'attendance',
  action: 'submit',
  extra: { classId, sessionDate, studentCount: records.length }
})
```

PII rule: `extra` must never include student names, parent names, phone numbers, or any fields from the data inventory's High Sensitivity tier.

---

## 12. Infrastructure Costs

### Development Phase

| Item | Cost |
|---|---|
| Supabase Free (dev project) | $0 |
| Supabase Free (staging project) | $0 |
| Netlify Free (staging site) | $0 |
| GitHub (public or private repo) | $0 |
| **Total** | **$0/month** |

*Upgrade staging to Pro before the first real user-acceptance testing session — that is when synthetic data quality matters and backups become important.*

### Production (Pre-Launch)

| Item | Cost |
|---|---|
| Supabase Pro (production) | $25/month ($300/yr) |
| Supabase Pro (staging) | $25/month ($300/yr) |
| Netlify Free (production PWA) | $0 |
| Custom domain | ~$15/yr |
| Sentry (free tier, <5K errors/month) | $0 |
| **Total** | **~$615/yr** |

*Staging can drop back to Free tier once the production system is stable and staging is used only for migration testing (infrequent). Reduces to ~$315/yr.*

### Phase 2 (App Store)

| Item | Added Cost |
|---|---|
| Apple Developer Program | $99/yr |
| Google Play Console | $25 one-time |
| Expo EAS Production builds (if > free tier) | ~$99/yr |
| Twilio SMS OTP (if implemented) | ~$100/yr |
| **Added total** | **~$200–$325/yr** |

---

## 13. Constraints & Boundaries

These are hard limits that the architecture imposes. Features or implementations that violate these require an Architecture Decision Record (see `ARCHITECTURE_DECISIONS.md`) before proceeding.

| Constraint | Rule | Reason |
|---|---|---|
| No backend server | All logic in Supabase (RLS, Edge Functions, DB functions) or client | ADR-003 |
| No service role key in client | Service role bypasses RLS entirely | Security — `01_SECURITY_AND_COMPLIANCE.md` §8 |
| No `any` in TypeScript | ESLint `no-explicit-any: error` fails the build | ADR-001; prototype lesson |
| No `AsyncStorage` for tokens | `expo-secure-store` required on native | `01_SECURITY_AND_COMPLIANCE.md` §4.2 |
| No direct SQL in migration editor | All schema changes are migration files in `/database/migrations/` | `02_DATA_MODEL.md` §7 |
| No seed data on staging/production | Synthetic data in dev only | `01_SECURITY_AND_COMPLIANCE.md` §8.1 |
| No compliance date from `MAX(session_date)` | `lastSundayISO()` function only | `03_PRD.md` F11-03 |
| No single-value `.single()` on `class_teachers` | Must handle multiple teachers per class | `02_DATA_MODEL.md` §3.8 |
| RLS is the access control authority | App layer is UX only | ADR-005 |
| Realtime subscriptions must be cleaned up on unmount | Prevent WebSocket leak | Performance |

---

*Next document: [05_DEFINITION_OF_DONE.md](05_DEFINITION_OF_DONE.md) — The explicit checklist that every feature must pass before it is considered complete and shippable.*
