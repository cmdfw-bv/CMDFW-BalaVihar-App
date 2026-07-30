export interface CommentRow {
  id: string;
  author_user_id: string;
  author_role: 'student' | 'parent' | 'teacher';
  body: string;
  is_private: boolean;
  target_parent_id: string | null;
  created_at: string;
}

export interface ThreadGroup {
  key: string; // 'public', or the target Parent's user_id for a private thread
  isPrivate: boolean;
  comments: CommentRow[];
}

// Design decision #4 — per-viewer thread stacking. Ordering within a thread is oldest-first
// (decision #5), distinct from the feed's own newest-first ordering.
export function groupCommentsForViewer(
  comments: CommentRow[],
  viewerRole: 'student' | 'parent' | 'teacher',
  viewerUserId: string
): ThreadGroup[] {
  const sorted = [...comments].sort((a, b) => a.created_at.localeCompare(b.created_at));

  if (viewerRole === 'student') {
    return [{ key: 'public', isPrivate: false, comments: sorted.filter((c) => !c.is_private) }];
  }

  if (viewerRole === 'parent') {
    return [{
      key: 'merged',
      isPrivate: false,
      comments: sorted.filter((c) => !c.is_private || c.target_parent_id === viewerUserId),
    }];
  }

  const publicGroup: ThreadGroup = { key: 'public', isPrivate: false, comments: sorted.filter((c) => !c.is_private) };
  const parentIds = Array.from(
    new Set(sorted.filter((c) => c.is_private && c.target_parent_id).map((c) => c.target_parent_id as string))
  );
  const privateGroups: ThreadGroup[] = parentIds.map((parentId) => ({
    key: parentId,
    isPrivate: true,
    comments: sorted.filter((c) => c.is_private && c.target_parent_id === parentId),
  }));
  return [publicGroup, ...privateGroups];
}
