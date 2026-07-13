export type Role = 'student' | 'parent' | 'teacher' | 'coordinator' | 'bv_coordinator' | 'admin';
export type TabKey = 'feed' | 'classes' | 'attendance' | 'chat' | 'dashboard' | 'approvals' | 'admin';

// Decision #2: every tab is always registered as a Tabs.Screen; ALL_TABS drives that
// registration, ROLE_TABS drives which ones get href:null (hidden-but-routable) per role.
export const ALL_TABS: TabKey[] = ['feed', 'classes', 'attendance', 'chat', 'dashboard', 'approvals', 'admin'];

// Sourced directly from the Requirements nav-mapping table.
export const ROLE_TABS: Record<Role, TabKey[]> = {
  student: ['feed', 'classes', 'attendance', 'chat'],
  parent: ['feed', 'attendance', 'chat'],
  teacher: ['feed', 'classes', 'attendance', 'chat'],
  coordinator: ['feed', 'classes', 'chat', 'dashboard', 'approvals'],
  bv_coordinator: ['feed', 'chat', 'dashboard', 'approvals'],
  admin: ['feed', 'chat', 'dashboard', 'admin'],
};

function isKnownRole(role: string | null): role is Role {
  return role !== null && role in ROLE_TABS;
}

export function tabsForRole(role: string | null): TabKey[] {
  return isKnownRole(role) ? ROLE_TABS[role] : [];
}

// useRoleGuard's route-membership check (AC#9) — pure, so it's unit-testable without
// expo-router. The hook wrapper (Stage 7) just adds the router.replace side effect.
export function isRouteInScope(route: TabKey, role: string | null): boolean {
  return tabsForRole(role).includes(route);
}
