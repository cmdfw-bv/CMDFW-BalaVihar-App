import { describe, it, expect } from 'vitest';
import { mergeClassUpdateRecipients, CLASS_UPDATE_PUSH_TITLE } from '../lib/class-update-dispatch';

describe('mergeClassUpdateRecipients', () => {
  it('drops the posting teacher even if present in the input (self-notification exclusion)', () => {
    expect(mergeClassUpdateRecipients(['a', 'teacher-1', 'b'], 'teacher-1')).toEqual(['a', 'b']);
  });
  it('de-dupes ids appearing in both the student and parent sets', () => {
    expect(mergeClassUpdateRecipients(['a', 'a', 'b'], 'poster')).toEqual(['a', 'b']);
  });
  it('drops null ids (students with no login, core-schema-and-rls convention)', () => {
    expect(mergeClassUpdateRecipients(['a', null, 'b'], 'poster')).toEqual(['a', 'b']);
  });
  it('returns [] for empty input (zero-enrollment class, edge case)', () => {
    expect(mergeClassUpdateRecipients([], 'poster')).toEqual([]);
  });
});

describe('CLASS_UPDATE_PUSH_TITLE', () => {
  it('is the exact, PII-free copy string from /design', () => {
    expect(CLASS_UPDATE_PUSH_TITLE).toBe('New update posted in your class');
  });
});
