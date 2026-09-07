/**
 * What `supabase.auth.signOut()` resolves with — the only part of it this module needs.
 *
 * `unknown`, not `unknown | null`: the union collapses to `unknown` anyway, so the `| null` read
 * as if it conveyed something it did not (PR #54 review round 3). The shape is deliberately not
 * `AuthError | null` — nothing here inspects the error beyond its truthiness, and keeping it
 * opaque is what lets the tests pass plain objects. `signOut()`'s real
 * `{ error: AuthError | null }` is assignable to it.
 */
export type SignOutFn = () => Promise<{ error: unknown }>;

/**
 * Run a sign-out and report whether the session was actually cleared.
 *
 * Exists because a failed sign-out is invisible otherwise. auth-js `_signOut`
 * (`GoTrueClient.js`, verified against 2.108.2) returns the error **without** calling
 * `_removeSession()` for any failure that isn't a 401/403/404 `AuthApiError` or
 * `AuthSessionMissingError` — so a GoTrue 5xx or an offline `AuthRetryableFetchError` leaves the
 * local session intact, fires no `SIGNED_OUT` event, and leaves `status` at `zero-role`. On
 * `/no-role`, where sign-out is the only affordance on the screen, that reproduces exactly the
 * dead end issue #46 exists to close (PR #54 review, @ssrinivas90).
 *
 * Note the shape: `signOut()` **resolves** with `{ error }` rather than rejecting, so a bare
 * `.catch()` at the call site would never fire for that failure class. The error has to be
 * inspected. The `try` also covers a rejection or a synchronous throw, neither of which is
 * reachable in auth-js 2.108.2 but both of which are cheap to be correct about.
 *
 * Extracted rather than inlined in the screen so it is testable at all: vitest mocks
 * react-native wholesale in this repo, so no component has a render test — the same reason
 * `setupAutoRefreshOnRegain` was extracted from its hook.
 *
 * @returns `true` only when the session is genuinely gone.
 */
export async function performSignOut(signOut: SignOutFn): Promise<boolean> {
  try {
    const { error } = await signOut();
    return !error;
  } catch {
    return false;
  }
}
