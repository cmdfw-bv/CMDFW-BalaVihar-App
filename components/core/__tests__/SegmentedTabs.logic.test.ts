import { describe, it, expect } from 'vitest';
import { normalizeTab } from '../SegmentedTabs.logic';

describe('normalizeTab', () => {
  it('a bare string becomes {id, label} with the same value, no count', () => {
    expect(normalizeTab('Feed')).toEqual({ id: 'Feed', label: 'Feed', count: undefined });
  });
  it('a TabItem object passes id/label/count through unchanged', () => {
    expect(normalizeTab({ id: 'feed', label: 'Feed', count: 3 })).toEqual({ id: 'feed', label: 'Feed', count: 3 });
  });
});
