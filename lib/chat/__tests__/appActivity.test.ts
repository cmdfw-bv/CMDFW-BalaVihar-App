import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
// Web: Platform.OS is 'web' in test/mocks/react-native.ts. The native branch is in
// appActivity.native.test.ts, which overrides that alias locally.
import { watchAppActivity } from '../appActivity';

let originalDocument: typeof globalThis.document;
let fakeDocument: EventTarget & { visibilityState: 'visible' | 'hidden' };

beforeEach(() => {
  originalDocument = globalThis.document;
  fakeDocument = Object.assign(new EventTarget(), { visibilityState: 'visible' as 'visible' | 'hidden' });
  // @ts-expect-error test-only global, not a full DOM
  globalThis.document = fakeDocument;
});
afterEach(() => {
  globalThis.document = originalDocument;
});

const becomes = (state: 'visible' | 'hidden') => {
  fakeDocument.visibilityState = state;
  fakeDocument.dispatchEvent(new Event('visibilitychange'));
};

describe('watchAppActivity (web)', () => {
  it('reports active at once when the tab is visible at the start', () => {
    const onActive = vi.fn();
    const onInactive = vi.fn();
    watchAppActivity(onActive, onInactive);

    expect(onActive).toHaveBeenCalledTimes(1);
    expect(onInactive).not.toHaveBeenCalled();
  });

  it('reports nothing at the start in a hidden tab (opened or restored in the background), then active when it is shown', () => {
    fakeDocument.visibilityState = 'hidden';
    const onActive = vi.fn();
    const onInactive = vi.fn();
    watchAppActivity(onActive, onInactive);
    expect(onActive).not.toHaveBeenCalled();
    expect(onInactive).not.toHaveBeenCalled();

    becomes('visible');
    expect(onActive).toHaveBeenCalledTimes(1);
  });

  it('reports inactive when the tab is hidden and active when it is visible again', () => {
    const onActive = vi.fn();
    const onInactive = vi.fn();
    watchAppActivity(onActive, onInactive);
    onActive.mockClear();

    becomes('hidden');
    expect(onInactive).toHaveBeenCalledTimes(1);
    expect(onActive).not.toHaveBeenCalled();

    becomes('visible');
    expect(onActive).toHaveBeenCalledTimes(1);
  });

  it('stops reporting after the returned cleanup runs', () => {
    const onActive = vi.fn();
    const onInactive = vi.fn();
    const stop = watchAppActivity(onActive, onInactive);
    onActive.mockClear();

    stop();
    becomes('hidden');
    becomes('visible');

    expect(onActive).not.toHaveBeenCalled();
    expect(onInactive).not.toHaveBeenCalled();
  });

  it('is a no-op where there is no document (static web export)', () => {
    // @ts-expect-error test-only: simulate a non-browser environment
    globalThis.document = undefined;
    expect(() => watchAppActivity(vi.fn(), vi.fn())()).not.toThrow();
  });
});
