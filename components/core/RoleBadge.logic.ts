export type RoleKey = "student" | "parent" | "teacher" | "coordinator" | "bv" | "admin";
export const ROLE_KEYS: RoleKey[] = ['student', 'parent', 'teacher', 'coordinator', 'bv', 'admin'];

const LABELS: Record<RoleKey, string> = {
  student: 'Student', parent: 'Parent', teacher: 'Teacher',
  coordinator: 'Coordinator', bv: 'BV Coordinator', admin: 'Admin',
};

export function roleBadgeMeta(role: RoleKey): { label: string; colorTokenKey: string } {
  return { label: LABELS[role], colorTokenKey: `roles.${role}` }; // always the plural map — see token-mapping gotcha
}
