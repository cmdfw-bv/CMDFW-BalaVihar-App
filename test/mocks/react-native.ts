// Vitest test-only stub — react-native's real source uses Flow syntax vitest's Node/Vite
// parser can't handle, and pure-logic unit tests never need the native runtime (Shared
// seam: platform-branched wiring is verified by hand at /build, not unit-tested here).
export const Platform = { OS: 'web' as const };
