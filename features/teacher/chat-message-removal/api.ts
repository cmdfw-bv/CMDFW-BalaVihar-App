import type { SupabaseClient } from '@supabase/supabase-js';
import type { Role } from '@/lib/auth/navMap';

export const REVIEW_PAGE_SIZE = 20;

export interface RemovedMessageRow {
  messageId: string;
  className: string;
  senderLabel: string;
  senderRole: Role | null;
  createdAt: string;
  body: string;
  removerLabel: string;
  removedByRole: Role;
  removedAt: string;
}

export interface RemovedMessagesCursor {
  removedAt: string;
  id: string;
}

interface DbRow {
  message_id: string;
  class_name: string;
  sender_label: string;
  sender_role: Role | null;
  created_at: string;
  body: string;
  remover_label: string;
  removed_by_role: Role;
  removed_at: string;
}

// Who may read this is decided by the function in the database (it raises 42501 on a refusal);
// nothing here gates access. A half cursor is rejected by the function, so both params go together.
export async function fetchRemovedMessages(
  client: Pick<SupabaseClient, 'rpc'>,
  cursor?: RemovedMessagesCursor,
): Promise<RemovedMessageRow[]> {
  const { data, error } = await client.rpc('get_removed_messages_for_oversight', {
    ...(cursor ? { p_before_removed_at: cursor.removedAt, p_before_id: cursor.id } : {}),
    p_limit: REVIEW_PAGE_SIZE,
  });
  if (error) throw new Error(error.message);
  return ((data ?? []) as DbRow[]).map((r) => ({
    messageId: r.message_id,
    className: r.class_name,
    senderLabel: r.sender_label,
    senderRole: r.sender_role,
    createdAt: r.created_at,
    body: r.body,
    removerLabel: r.remover_label,
    removedByRole: r.removed_by_role,
    removedAt: r.removed_at,
  }));
}
