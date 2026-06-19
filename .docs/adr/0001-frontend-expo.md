# ADR-0001: Frontend — Expo (React Native + RN-Web), TypeScript

**Status:** Closed · **Date:** 2026-06-16 · **Deciders:** Project owner + architect

### Context
One codebase must serve a web PWA now and native (iOS/Android) fast-follow, maintained by 3 non-technical volunteers + Claude Code. Verified live: Expo SDK 56 (RN 0.85, React 19.2, RN-Web 0.21).

### Options Considered
- **Expo (RN + RN-Web), TS** — Pros: one codebase → web + iOS + Android; native is `eas build`, not a rewrite; largest TS/React training corpus (AI-legible); mature Supabase JS SDK. Cons: TS discipline needed.
- **Web meta-framework (Next.js/Vite)** — Pros: great web. Cons: web-only → later native **rewrite** (contradicts one-codebase + native-soon).
- **Flutter (Dart)** — Pros: strong native rendering. Cons: Dart fails AI-legibility for Claude+volunteers; weak PWA; native-rendering edge irrelevant for a forms/lists app.

### Decision
Adopt **Expo (React Native + RN-Web) with TypeScript**.

### Consequences
PWA-first now, native via EAS later with no rewrite (ADR-0006). One language family (TS + SQL). See 3_ARCHITECTURE §2, §4.
