import type { RoleKey } from '../core/RoleBadge.logic';

export interface Persona {
  id: string;
  name: string;
  role: RoleKey;
  /** Scope description shown in the sheet, e.g. "JR·A · Brampton". */
  scope?: string;
}

export function resolveActivePersona(roles: Persona[], activeId?: string): Persona | { name: string } {
  return roles.find((r) => r.id === activeId) ?? roles[0] ?? { name: '—' };
}
