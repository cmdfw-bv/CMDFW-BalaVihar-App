import { describe, it, expect, vi, beforeEach } from 'vitest';

type AppStateHandler = (next: string) => void;

const remove = vi.fn();
const addEventListener = vi.fn((_event: string, _handler: AppStateHandler) => ({ remove }));
const appState = { current: 'active' as string | null };
// Closure, not a direct reference: vi.mock is hoisted above these consts (same pattern as
// lib/auth/__tests__/useAutoRefreshOnRegain.native.test.ts).
vi.mock('react-native', () => ({
  Platform: { OS: 'ios' },
  AppState: {
    get currentState() {
      return appState.current;
    },
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
  appState.current = 'active';
});

describe('watchAppActivity (native)', () => {
  it('reports active at once when the app is in the foreground at the start', () => {
    const onActive = vi.fn();
    watchAppActivity(onActive, vi.fn());
    expect(onActive).toHaveBeenCalledTimes(1);
  });

  it('reports active at the start when the state is not known yet (null early in launch)', () => {
    appState.current = null;
    const onActive = vi.fn();
    watchAppActivity(onActive, vi.fn());
    expect(onActive).toHaveBeenCalledTimes(1);
  });

  it('reports nothing at the start when the app is in the background, then active when it returns', () => {
    appState.current = 'background';
    const onActive = vi.fn();
    const onInactive = vi.fn();
    watchAppActivity(onActive, onInactive);
    expect(onActive).not.toHaveBeenCalled();
    expect(onInactive).not.toHaveBeenCalled();

    handler()('active');
    expect(onActive).toHaveBeenCalledTimes(1);
  });

  it('reports active on "active" and inactive on "background"', () => {
    const onActive = vi.fn();
    const onInactive = vi.fn();
    watchAppActivity(onActive, onInactive);
    onActive.mockClear();
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
    onActive.mockClear();

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
