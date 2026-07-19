import type { RoleKey } from '../core/RoleBadge.logic';
export type { RoleKey };

export function commentStyleMeta(role: RoleKey, isPrivate: boolean): { hueTokenKey: string; bgTokenKey: string; borderTokenKey: string | null } {
  return {
    hueTokenKey: `roles.${role}`,
    bgTokenKey: isPrivate ? 'privateSoft' : 'transparent',
    borderTokenKey: isPrivate ? 'privateLine' : null,
  };
}
