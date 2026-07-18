import { Redirect } from "expo-router";

// Web's emailRedirectTo target (Design spec, "Deep-link completion") — by the time this mounts,
// the Supabase client has already consumed the ?code=... param (detectSessionInUrl: true) and
// SessionProvider's context has the session. This is just a landing spot that hands off to "/"
// so the status-aware redirect in app/index.tsx picks the right destination.
export default function AuthCallback() {
  return <Redirect href="/" />;
}
