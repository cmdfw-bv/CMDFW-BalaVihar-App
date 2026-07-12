export type AppRole = 'student' | 'parent' | 'teacher' | 'coordinator' | 'bv_coordinator' | 'admin';
export type AppScopeType = 'org' | 'center' | 'session' | 'class';

export const TIER: Partial<Record<AppRole, number>> = {
  coordinator: 1,
  bv_coordinator: 2,
  admin: 3,
};

export const ROLE_SCOPE_TYPE: Record<AppRole, AppScopeType> = {
  student: 'org',
  parent: 'org',
  teacher: 'class',
  coordinator: 'session',
  bv_coordinator: 'org',
  admin: 'org',
};

export function tierOf(role: AppRole): number {
  return TIER[role] ?? 0;
}

export function isGrantAllowed(
  callerRole: AppRole,
  callerTier: number,
  _callerScopeId: string | null,
  targetRole: AppRole,
  targetUserId: string,
  callerUserId: string
): boolean {
  const targetTier = tierOf(targetRole);
  if (targetUserId === callerUserId) return targetTier < callerTier; // decision #1, literal formula
  if (callerRole === 'admin') return true; // admin: any role, for others
  return targetTier < callerTier; // bv_coordinator/coordinator: strict
}
