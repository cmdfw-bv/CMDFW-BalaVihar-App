import { describe, it, expect, vi } from 'vitest';
import { createFetchCoalescer } from '../fetchCoalescer';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

describe('createFetchCoalescer', () => {
  it('calls the underlying fetcher on the first trigger', () => {
    const fetcher = vi.fn().mockResolvedValue(undefined);
    const trigger = createFetchCoalescer(fetcher);
    trigger();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('coalesces a second trigger that arrives while the first is still in flight (visibilitychange + focus firing together)', async () => {
    const d = deferred<void>();
    const fetcher = vi.fn().mockReturnValue(d.promise);
    const trigger = createFetchCoalescer(fetcher);

    trigger();
    trigger();

    expect(fetcher).toHaveBeenCalledTimes(1);
    d.resolve();
    await d.promise;
  });

  it('allows a new fetch once the prior one has resolved', async () => {
    const first = deferred<void>();
    const fetcher = vi.fn().mockReturnValueOnce(first.promise).mockResolvedValueOnce(undefined);
    const trigger = createFetchCoalescer(fetcher);

    const inFlight = trigger();
    first.resolve();
    await inFlight;

    trigger();
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('allows a new fetch once the prior one has rejected (does not get stuck coalescing forever)', async () => {
    const first = deferred<void>();
    const fetcher = vi.fn().mockReturnValueOnce(first.promise).mockResolvedValueOnce(undefined);
    const trigger = createFetchCoalescer(fetcher);

    const inFlight = trigger();
    first.reject(new Error('boom'));
    await inFlight!.catch(() => {});

    trigger();
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
