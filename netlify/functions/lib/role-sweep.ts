import type { SupabaseClient } from '@supabase/supabase-js';

export interface SweepResult {
  granted_parent: number;
  granted_student: number;
  // Present (non-empty) only when a source-table read failed; lets a caller distinguish
  // "genuinely nothing pending" from "a read failed so this table wasn't actually checked".
  source_errors?: string[];
}

interface ExistingRoleRow {
  user_id: string;
  role: string;
  scope_type: string;
}

export async function runAutoActivationSweep(client: SupabaseClient): Promise<SweepResult> {
  const sourceErrors: string[] = [];

  const { data: familyMembers, error: familyMembersError } = await client
    .from('family_members')
    .select('user_id')
    .not('user_id', 'is', null);
  if (familyMembersError) {
    console.log(JSON.stringify({ event: 'role_sweep_partial_failure', source: 'family_members', message: familyMembersError.message }));
    sourceErrors.push(`family_members: ${familyMembersError.message}`);
  }

  const { data: hsStudents, error: hsStudentsError } = await client
    .from('students')
    .select('user_id')
    .not('user_id', 'is', null);
  if (hsStudentsError) {
    console.log(JSON.stringify({ event: 'role_sweep_partial_failure', source: 'students', message: hsStudentsError.message }));
    sourceErrors.push(`students: ${hsStudentsError.message}`);
  }

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

  return sourceErrors.length > 0
    ? { granted_parent, granted_student, source_errors: sourceErrors }
    : { granted_parent, granted_student };
}

async function insertSweepRole(
  client: SupabaseClient,
  userIds: string[],
  role: 'parent' | 'student',
  hasAnyRole: Set<string>
): Promise<number> {
  if (userIds.length === 0) return 0;

  // Per-row via the atomic insert_user_role_grant RPC (on-conflict-do-nothing on the
  // grant-identity index), not a batch .insert(): a batch insert can't safely target the
  // coalesce(scope_id, ...) unique index (same PostgREST limitation documented on the RPC
  // itself), so a race with a concurrent sweep/manual grant would throw a unique-violation
  // and lose the *entire* batch, not just the colliding row.
  let granted = 0;
  for (const user_id of userIds) {
    const is_active = !hasAnyRole.has(user_id); // decision #9: active only if this is the user's first-ever row
    hasAnyRole.add(user_id); // matches the design SQL's per-statement snapshot sequencing

    const { data: newId, error } = await client.rpc('insert_user_role_grant', {
      p_user_id: user_id,
      p_role: role,
      p_scope_type: 'org',
      p_scope_id: null,
      p_is_active: is_active,
    });
    if (error) throw new Error(`runAutoActivationSweep: ${role} insert failed: ${error.message}`);
    if (!newId) continue; // conflict: a concurrent sweep/manual grant already inserted this identity

    granted += 1;
    console.log(JSON.stringify({ event: 'role_swept', user_roles_id: newId, role, scope_type: 'org' }));
  }
  return granted;
}
