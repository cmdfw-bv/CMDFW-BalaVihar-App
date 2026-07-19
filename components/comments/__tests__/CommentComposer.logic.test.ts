import { describe, it, expect } from 'vitest';
import { buildCommentPayload } from '../CommentComposer.logic';

describe('buildCommentPayload', () => {
  it('builds a payload for non-empty trimmed body', () => {
    expect(buildCommentPayload('  hello  ', true)).toEqual({ body: 'hello', isPrivate: true });
  });
  it('returns null for an empty or whitespace-only body (nothing to send)', () => {
    expect(buildCommentPayload('   ', false)).toBeNull();
    expect(buildCommentPayload('', false)).toBeNull();
  });
});
