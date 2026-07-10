import { createClient } from "@supabase/supabase-js";

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  // Fail loud in dev so a missing .env is obvious, not a silent 401 later.
  console.warn("[supabase] EXPO_PUBLIC_SUPABASE_URL / _ANON_KEY missing — run `npm run env:init` and fill .env");
}

// The ONLY Supabase client in client code. Service-role access lives in netlify/functions/ only.
export const supabase = createClient(url ?? "", anonKey ?? "");
