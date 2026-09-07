// scripts/_signout-delegation-checks.js
// Pure helper guarding issue #46's root cause against regression (PR #54 review round 3).
//
// A failed `supabase.auth.signOut()` is invisible: auth-js `_signOut` returns the error without
// clearing the local session for anything that isn't a 401/403/404 or session-missing, so a
// GoTrue 5xx or an offline client leaves the user on `/no-role` with the screen's only affordance
// silently doing nothing — exactly the dead end issue #46 exists to close. `lib/auth/runSignOut.ts`
// is the checked path; calling `supabase.auth.signOut()` outside it reintroduces the bug.
//
// This is a source scan because the bug lives in a screen and the repo cannot render one: no
// testing-library/jsdom/react-test-renderer dependency, `react-native` aliased to a stub, and
// `vitest.config.ts` does not include `app/**`. Same reasoning as _unistyles-config-checks.js.

// `lib/auth/**` owns the sign-out primitives: performSignOut and runSignOut wrap it, and
// SessionProvider.signOut is the pre-existing silent one still tracked in issue #64.
const EXEMPT_PREFIX = "lib/auth/";

const SIGN_OUT_CALL = /supabase\s*\.\s*auth\s*\.\s*signOut\s*\(/;
const GUARDED_BY = /\brunSignOut\b/;

// Strips line and block comments so a prose mention of the call is not read as one. Good enough
// for this purpose: it does not track strings or regex literals, which only ever costs a false
// positive (a loud failure), never a false negative (a silent miss).
function stripComments(sourceText) {
  return sourceText.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");
}

// Returns true when `filePath` calls supabase.auth.signOut() without routing it through runSignOut.
function findUnguardedSignOut(filePath, sourceText) {
  if (filePath.startsWith(EXEMPT_PREFIX)) return false;
  const code = stripComments(sourceText);
  if (!SIGN_OUT_CALL.test(code)) return false;
  return !GUARDED_BY.test(code);
}

module.exports = { findUnguardedSignOut };
