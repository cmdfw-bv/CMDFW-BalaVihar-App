// Resolves the Teacher's private-thread card labels, one per target Parent.
//
// A failed lookup degrades that single card to the caller's own fallback copy ("Private thread")
// rather than rejecting: these labels are decoration on a thread whose comments have already
// loaded, so one bad RPC must not take out the surrounding UI or leave an unhandled rejection.
export async function resolveLabelsForKeys(
  keys: string[],
  resolve: (key: string) => Promise<string | null>
): Promise<Array<readonly [string, string | null]>> {
  return Promise.all(
    keys.map(async (key) => {
      try {
        return [key, await resolve(key)] as const;
      } catch {
        return [key, null] as const;
      }
    })
  );
}
