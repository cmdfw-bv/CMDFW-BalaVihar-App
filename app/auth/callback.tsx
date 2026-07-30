import { Redirect, useLocalSearchParams } from "expo-router";
import { parseAuthCallbackError } from "../../lib/auth/authCallbackError";

// Web's emailRedirectTo target (Design spec, "Deep-link completion") — by the time this mounts,
// the Supabase client has already consumed the ?code=... param (detectSessionInUrl: true) and
// SessionProvider's context has the session. This is just a landing spot that hands off to "/"
// so the status-aware redirect in app/index.tsx picks the right destination.
//
// A rejected link (expired/already-used/malformed) never reaches the client-side exchange —
// Supabase's auth server redirects here with ?error=/error_code=/error_description= instead of
// a session (issue #44). Hand that off to sign-in as a query param so it's shown, not swallowed.
export default function AuthCallback() {
  const params = useLocalSearchParams<{ error?: string; error_code?: string; error_description?: string }>();
  const message = parseAuthCallbackError(params);
  if (message) return <Redirect href={{ pathname: "/sign-in", params: { authError: message } }} />;
  return <Redirect href="/" />;
}
