export function createFetchCoalescer<T>(fetcher: () => Promise<T>) {
  let inFlight: Promise<T> | null = null;
  return function trigger(): Promise<T> | null {
    if (inFlight) return null;
    inFlight = fetcher().finally(() => { inFlight = null; });
    return inFlight;
  };
}
