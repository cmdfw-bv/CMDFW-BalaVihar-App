import { describe, it, expect } from 'vitest';
import { groupCommentsForViewer, type CommentRow } from '../threadAssembly';

function comment(overrides: Partial<CommentRow>): CommentRow {
  return {
    id: 'c1', author_user_id: 'u1', author_role: 'student', body: 'hi',
    is_private: false, target_parent_id: null, created_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('groupCommentsForViewer', () => {
  it('Student: one public thread, oldest-first, never a private row', () => {
    const rows = [
      comment({ id: 'a', created_at: '2026-01-02T00:00:00Z' }),
      comment({ id: 'b', created_at: '2026-01-01T00:00:00Z' }),
      comment({ id: 'p', is_private: true, target_parent_id: 'parent-1', created_at: '2026-01-01T12:00:00Z' }),
    ];
    const groups = groupCommentsForViewer(rows, 'student', 'student-1');
    expect(groups).toHaveLength(1);
    expect(groups[0].comments.map((c) => c.id)).toEqual(['b', 'a']);
  });

  it("Parent: one merged thread with their own private comments, not another parent's", () => {
    const rows = [
      comment({ id: 'pub', created_at: '2026-01-01T00:00:00Z' }),
      comment({ id: 'mine', is_private: true, target_parent_id: 'parent-1', created_at: '2026-01-02T00:00:00Z' }),
      comment({ id: 'other', is_private: true, target_parent_id: 'parent-2', created_at: '2026-01-03T00:00:00Z' }),
    ];
    const groups = groupCommentsForViewer(rows, 'parent', 'parent-1');
    expect(groups).toHaveLength(1);
    expect(groups[0].comments.map((c) => c.id)).toEqual(['pub', 'mine']);
  });

  it('Teacher: one public thread plus one thread per Parent with an active private thread', () => {
    const rows = [
      comment({ id: 'pub', created_at: '2026-01-01T00:00:00Z' }),
      comment({ id: 'p1a', is_private: true, target_parent_id: 'parent-1', created_at: '2026-01-02T00:00:00Z' }),
      comment({ id: 'p1b', is_private: true, target_parent_id: 'parent-1', created_at: '2026-01-03T00:00:00Z' }),
      comment({ id: 'p2a', is_private: true, target_parent_id: 'parent-2', created_at: '2026-01-04T00:00:00Z' }),
    ];
    const groups = groupCommentsForViewer(rows, 'teacher', 'teacher-1');
    expect(groups).toHaveLength(3);
    expect(groups[0]).toMatchObject({ key: 'public', isPrivate: false });
    expect(groups[0].comments.map((c) => c.id)).toEqual(['pub']);
    const p1 = groups.find((g) => g.key === 'parent-1')!;
    expect(p1.comments.map((c) => c.id)).toEqual(['p1a', 'p1b']);
    const p2 = groups.find((g) => g.key === 'parent-2')!;
    expect(p2.comments.map((c) => c.id)).toEqual(['p2a']);
  });

  it('zero comments -> a single empty group, not an error (empty-state edge case)', () => {
    expect(groupCommentsForViewer([], 'student', 'student-1')).toEqual([{ key: 'public', isPrivate: false, comments: [] }]);
  });
});
