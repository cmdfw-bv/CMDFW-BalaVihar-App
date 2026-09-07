import { performSignOut, type SignOutFn } from './performSignOut';

/** The two pieces of screen state a sign-out drives. Setters, so `useState` plugs straight in. */
type SignOutStateSetters = {
  busy: (value: boolean) => void;
  failed: (value: boolean) => void;
};

/**
 * Drive the whole `/no-role` sign-out interaction: busy on, previous failure cleared, sign out,
 * failure raised only if the session survived, busy off either way.
 *
 * Exists one level above `performSignOut` because that function, while well tested, is a free
 * function nothing obliged the screen to call — the pre-fix handler (`void
 * supabase.auth.signOut(); setBusy(false);`) could be restored verbatim with the whole suite
 * green. `vitest.config.ts` does not include `app/**` and the repo has no renderer or
 * testing-library dependency, so the only way to put a regression guard under the bug issue #46
 * exists to close is to move the state machine into a module the suite can reach. That leaves
 * exactly one untested line in the screen — the wiring of the two `useState` setters into this
 * call (PR #54 review round 3, @ssrinivas90).
 */
export async function runSignOut(
  signOut: SignOutFn,
  set: SignOutStateSetters,
): Promise<void> {
  set.busy(true);
  set.failed(false);
  const ok = await performSignOut(signOut);
  // On success `Stack.Protected` unmounts the screen, so only the failure path is ever seen.
  if (!ok) set.failed(true);
  set.busy(false);
}
