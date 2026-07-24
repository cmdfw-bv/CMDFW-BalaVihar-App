import type { SupabaseClient } from '@supabase/supabase-js';

export interface CommentRow {
  id: string;
  class_update_id: string;
  author_user_id: string;
  author_role: 'student' | 'parent' | 'teacher';
  body: string;
  is_private: boolean;
  target_parent_id: string | null;
  created_at: string;
}

export async function fetchComments(supabase: SupabaseClient, classUpdateId: string): Promise<CommentRow[]> {
  const { data, error } = await supabase
    .from('comments')
    .select('id, class_update_id, author_user_id, author_role, body, is_private, target_parent_id, created_at')
    .eq('class_update_id', classUpdateId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []) as CommentRow[];
}

export async function insertComment(
  supabase: SupabaseClient,
  params: {
    classUpdateId: string;
    authorUserId: string;
    authorRole: 'student' | 'parent' | 'teacher';
    body: string;
    isPrivate: boolean;
    targetParentId: string | null;
  }
): Promise<void> {
  const { error } = await supabase.from('comments').insert({
    class_update_id: params.classUpdateId,
    author_user_id: params.authorUserId,
    author_role: params.authorRole,
    body: params.body,
    is_private: params.isPrivate,
    target_parent_id: params.targetParentId,
  });
  if (error) throw error;
}

// Labels a Teacher's private-thread card with the target Parent/family's own display name
// (M4's resolve_parent_family_label RPC) — reuses the same string_agg(students.first_name)
// convention resolve_my_scope_labels() already established, just for "this other Parent"
// instead of "myself". Returns null (not an error) when unauthorized/no-match — no existence leak.
export async function resolveParentFamilyLabel(
  supabase: SupabaseClient,
  parentUserId: string,
  classId: string
): Promise<string | null> {
  const { data, error } = await supabase.rpc('resolve_parent_family_label', {
    p_parent_user_id: parentUserId,
    p_class_id: classId,
  });
  if (error) throw error;
  return (data as string | null) ?? null;
}
