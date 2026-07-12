import type { SupabaseClient } from '@supabase/supabase-js';

export interface SweepResult {
  granted_parent: number;
  granted_student: number;
}

interface ExistingRoleRow {
  user_id: string;
  role: string;
  scope_type: string;
}

export async function runAutoActivationSweep(client: SupabaseClient): Promise<SweepResult> {
  const { data: familyMembers } = await client
    .from('family_members')
    .select('user_id')
    .not('user_id', 'is', null);

  const { data: hsStudents } = await client
    .from('students')
    .select('user_id')
    .not('user_id', 'is', null);

  const parentSourceIds = [...new Set((familyMembers ?? []).map(r => r.user_id as string))];
  const studentSourceIds = [...new Set((hsStudents ?? []).map(r => r.user_id as string))];
  const candidateUserIds = [...new Set([...parentSourceIds, ...studentSourceIds])];

  let existingRoles: ExistingRoleRow[] = [];
  if (candidateUserIds.length > 0) {
    const { data, error } = await client
      .from('user_roles')
      .select('user_id, role, scope_type')
      .in('user_id', candidateUserIds);
    if (error) throw new Error(`runAutoActivationSweep: existing-roles lookup failed: ${error.message}`);
    existingRoles = (data ?? []) as ExistingRoleRow[];
  }

  const hasAnyRole = new Set(existingRoles.map(r => r.user_id));
  const hasParentOrg = new Set(
    existingRoles.filter(r => r.role === 'parent' && r.scope_type === 'org').map(r => r.user_id)
  );
  const hasStudentOrg = new Set(
    existingRoles.filter(r => r.role === 'student' && r.scope_type === 'org').map(r => r.user_id)
  );

  const parentGrants = parentSourceIds.filter(id => !hasParentOrg.has(id));
  const studentGrants = studentSourceIds.filter(id => !hasStudentOrg.has(id));

  const granted_parent = await insertSweepRole(client, parentGrants, 'parent', hasAnyRole);
  const granted_student = await insertSweepRole(client, studentGrants, 'student', hasAnyRole);

  return { granted_parent, granted_student };
}

async function insertSweepRole(
  client: SupabaseClient,
  userIds: string[],
  role: 'parent' | 'student',
  hasAnyRole: Set<string>
): Promise<number> {
  if (userIds.length === 0) return 0;

  const rows = userIds.map(user_id => ({
    user_id,
    role,
    scope_type: 'org' as const,
    scope_id: null,
    is_active: !hasAnyRole.has(user_id), // decision #9: active only if this is the user's first-ever row
  }));
  for (const row of rows) hasAnyRole.add(row.user_id); // matches the design SQL's per-statement snapshot sequencing

  const { data, error } = await client
    .from('user_roles')
    .insert(rows)
    .select('id, user_id, role, scope_type');
  if (error) throw new Error(`runAutoActivationSweep: ${role} insert failed: ${error.message}`);

  for (const r of data ?? []) {
    console.log(JSON.stringify({ event: 'role_swept', user_roles_id: r.id, role: r.role, scope_type: r.scope_type }));
  }
  return data?.length ?? 0;
}
