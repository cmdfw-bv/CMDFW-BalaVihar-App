// Supabase's own auth server appends these as query params to `redirect_to` when a magic
// link is rejected (expired, already used, malformed) — it never fails silently on its own.
// `/auth/callback` must read them, or a rejected link just dumps the user back on a blank
// sign-in screen with no explanation (issue #44).
type Param = string | string[] | undefined;

export interface AuthCallbackErrorParams {
  error?: Param;
  error_code?: Param;
  error_description?: Param;
}

function first(value: Param): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export function parseAuthCallbackError(params: AuthCallbackErrorParams): string | null {
  const error = first(params.error);
  if (!error) return null;

  const errorCode = first(params.error_code);
  if (errorCode === 'otp_expired') {
    return 'This sign-in link has expired or was already used. Request a new one below.';
  }

  const description = first(params.error_description);
  if (description) {
    return `Sign-in failed: ${decodeURIComponent(description.replace(/\+/g, ' '))}.`;
  }

  return 'Something went wrong signing you in. Please request a new link.';
}
