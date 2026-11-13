// On sign-out every Realtime channel goes, whichever screen was open (spec, Lifecycle table).
// A free function so the rule is testable: SessionProvider cannot be rendered in this repo's
// test setup. It must never throw into the auth listener.
export function removeChannelsOnSignOut(event: string, removeAllChannels: () => unknown): void {
  if (event !== 'SIGNED_OUT') return;
  try {
    void Promise.resolve(removeAllChannels()).catch(() => {});
  } catch {
    // Nothing to remove, or the socket is already gone.
  }
}
