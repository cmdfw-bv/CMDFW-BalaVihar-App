import { describe, it, expect } from 'vitest';
import { conversationRowMeta } from '../ConversationRow.logic';

describe('conversationRowMeta', () => {
  it('group kind uses the indigo hue regardless of role', () => {
    expect(conversationRowMeta('group', 'student', 0).hueTokenKey).toBe('indigo');
  });
  it('dm kind uses the role hue (plural roles map)', () => {
    expect(conversationRowMeta('dm', 'bv', 0).hueTokenKey).toBe('roles.bv');
  });
  it('unread=0 hides the badge (null label)', () => {
    expect(conversationRowMeta('dm', 'student', 0).unreadLabel).toBeNull();
  });
  it('unread>0 shows the count as its own label', () => {
    expect(conversationRowMeta('dm', 'student', 4).unreadLabel).toBe('4');
  });
});
