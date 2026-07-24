import { describe, it, expect } from 'vitest';
import { chatBubbleMeta } from '../ChatBubble.logic';

describe('chatBubbleMeta', () => {
  it('own bubble: right-aligned, chatOut fill, tick hidden by default (read undefined)', () => {
    expect(chatBubbleMeta(true)).toEqual({ align: 'flex-end', fillTokenKey: 'chatOut', inkTokenKey: 'chatOutInk', tick: 'none', showName: false });
  });
  it('own bubble, read=false: sent (single) tick', () => {
    expect(chatBubbleMeta(true, false).tick).toBe('sent');
  });
  it('own bubble, read=true: read (double) tick', () => {
    expect(chatBubbleMeta(true, true).tick).toBe('read');
  });
  it('incoming bubble: left-aligned, chatIn fill, name shown by default, no tick ever', () => {
    expect(chatBubbleMeta(false)).toEqual({ align: 'flex-start', fillTokenKey: 'chatIn', inkTokenKey: 'chatInInk', tick: 'none', showName: true });
    expect(chatBubbleMeta(false, true).tick).toBe('none'); // read is meaningless on incoming bubbles
  });
  it('showName can be forced either way regardless of own', () => {
    expect(chatBubbleMeta(true, undefined, true).showName).toBe(true);
    expect(chatBubbleMeta(false, undefined, false).showName).toBe(false);
  });
});
