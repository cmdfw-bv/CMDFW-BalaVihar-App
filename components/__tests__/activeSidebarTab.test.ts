import { describe, it, expect } from 'vitest';
import { activeSidebarTab } from '../activeSidebarTab';

// Pure focused-route-index -> TabKey lookup (Stage 12, F28) for the desktop sidebar's
// highlighted nav item. DesktopSidebar.tsx's JSX render is wiring, verified live via
// playwright-cli at /test (Shared seam).
describe('activeSidebarTab', () => {
  it('resolves the focused route name to its TabKey', () =>
    expect(activeSidebarTab(['feed', 'classes', 'attendance'], 1)).toBe('classes'));
  it('returns null for an out-of-range index (defensive)', () =>
    expect(activeSidebarTab(['feed', 'classes'], 5)).toBeNull());
  it('returns null for a route name that is not a known TabKey (defensive)', () =>
    expect(activeSidebarTab(['feed', 'not-a-tab'], 1)).toBeNull());
});
