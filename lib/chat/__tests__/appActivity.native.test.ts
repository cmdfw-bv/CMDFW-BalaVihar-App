import { describe, it, expect, vi, beforeEach } from 'vitest';

type AppStateHandler = (next: string) => void;

const remove = vi.fn();
const addEventListener = vi.fn((_event: string, _handler: AppStateHandler) => ({ remove }));
// Closure, not a direct reference: vi.mock is hoisted above these consts (same pattern as
// lib/auth/__tests__/useAutoRefreshOnRegain.native.test.ts).
vi.mock('react-native', () => ({
  Platform: { OS: 'ios' },
  AppState: {
    addEventListener: (event: string, listener: AppStateHandler) => addEventListener(event, listener),
  },
}));

import { watchAppActivity } from '../appActivity';

const handler = (): AppStateHandler => {
  const call = addEventListener.mock.calls.at(-1);
  if (!call) throw new Error('AppState.addEventListener was never called');
  return call[1];
};

beforeEach(() => {
  addEventListener.mockClear();
  remove.mockClear();
});

describe('watchAppActivity (native)', () => {
  it('reports active on "active" and inactive on "background"', () => {
    const onActive = vi.fn();
    const onInactive = vi.fn();
    watchAppActivity(onActive, onInactive);
    expect(addEventListener).toHaveBeenCalledWith('change', expect.any(Function));

    handler()('background');
    expect(onInactive).toHaveBeenCalledTimes(1);

    handler()('active');
    expect(onActive).toHaveBeenCalledTimes(1);
  });

  it('ignores the transient iOS "inactive" state (app switcher, incoming call banner)', () => {
    const onActive = vi.fn();
    const onInactive = vi.fn();
    watchAppActivity(onActive, onInactive);

    handler()('inactive');

    expect(onActive).not.toHaveBeenCalled();
    expect(onInactive).not.toHaveBeenCalled();
  });

  it('removes the AppState subscription on cleanup', () => {
    const stop = watchAppActivity(vi.fn(), vi.fn());
    stop();
    expect(remove).toHaveBeenCalledTimes(1);
  });
});
