import type { RoleKey } from '../core/RoleBadge.logic';
export type { RoleKey };

export function conversationRowMeta(kind: 'group' | 'dm', role: RoleKey, unread: number): { hueTokenKey: string; unreadLabel: string | null } {
  return {
    hueTokenKey: kind === 'group' ? 'indigo' : `roles.${role}`,
    unreadLabel: unread > 0 ? String(unread) : null,
  };
}
