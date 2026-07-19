import { describe, it, expect } from 'vitest';
import { feedScopeMeta, feedCardMeta, FEED_SCOPE_KEYS } from '../FeedCard.logic';

describe('FEED_SCOPE_KEYS / feedScopeMeta', () => {
  it('covers org/center/class', () => expect(FEED_SCOPE_KEYS.sort()).toEqual(['center', 'class', 'org'].sort()));
  it('org maps to the Org-wide label and scope.org token', () => {
    expect(feedScopeMeta('org')).toEqual({ label: 'Org-wide', colorTokenKey: 'scope.org' });
  });
});

describe('feedCardMeta', () => {
  it('announcement uses the serif display title font', () => {
    expect(feedCardMeta('announcement', false)).toEqual({ titleFont: 'display', showPin: false });
  });
  it('update uses the sans body title font', () => {
    expect(feedCardMeta('update', false).titleFont).toBe('body');
  });
  it('pin only ever shows on an announcement, even if pinned=true on an update', () => {
    expect(feedCardMeta('announcement', true).showPin).toBe(true);
    expect(feedCardMeta('update', true).showPin).toBe(false);
  });
});
