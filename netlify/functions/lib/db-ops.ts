import type { SupabaseClient } from '@supabase/supabase-js';

export interface SessionClassResolution {
  sessionMap: Map<string, string>;
  classMap: Map<string, string>;
  errors: Array<{ column: string; reason: string }>;
}

export interface StudentParams {
  family_id: string;
  first_name: string;
  last_name: string;
  grade_level: string;
}

export interface StudentWithExternalIdParams extends StudentParams {
  external_member_id: string;
}

export interface EnrollmentParams {
  student_id: string;
  class_id: string;
  session_id: string;
}

export async function checkAdminRole(
  client: SupabaseClient,
  userId: string
): Promise<boolean> {
  const { data, error } = await client
    .from('user_roles')
    .select('user_id')
    .eq('user_id', userId)
    .eq('role', 'admin')
    .eq('is_active', true)
    .single();
  return !error && data !== null;
}

export async function resolveSessionsAndClasses(
  client: SupabaseClient,
  sessionNames: string[],
  pairs: Array<{ sessionName: string; gradeBand: string }>
): Promise<SessionClassResolution> {
  const errors: Array<{ column: string; reason: string }> = [];
  const sessionMap = new Map<string, string>();
  const classMap = new Map<string, string>();

  const { data: sessions } = await client
    .from('sessions')
    .select('id, name')
    .in('name', sessionNames);

  for (const name of sessionNames) {
    const found = (sessions ?? []).find((s: { id: string; name: string }) => s.name === name);
    if (!found) {
      errors.push({ column: 'session_name', reason: `session "${name}" not found` });
    } else {
      sessionMap.set(name, found.id);
    }
  }

  if (errors.length > 0 || pairs.length === 0) return { sessionMap, classMap, errors };

  const sessionIds = [...sessionMap.values()];
  const { data: classes } = await client
    .from('classes')
    .select('id, session_id, grade_band')
    .in('session_id', sessionIds);

  for (const { sessionName, gradeBand } of pairs) {
    const sessionId = sessionMap.get(sessionName);
    if (!sessionId) continue;
    const matches = (classes ?? []).filter(
      (c: { id: string; session_id: string; grade_band: string }) =>
        c.session_id === sessionId && c.grade_band === gradeBand
    );
    if (matches.length === 0) {
      errors.push({ column: 'grade_band', reason: `no class found for session "${sessionName}" grade_band "${gradeBand}"` });
    } else if (matches.length > 1) {
      errors.push({ column: 'grade_band', reason: `multiple classes for session "${sessionName}" grade_band "${gradeBand}" — add class_name column` });
    } else {
      classMap.set(`${sessionName}:${gradeBand}`, matches[0].id);
    }
  }

  return { sessionMap, classMap, errors };
}

export async function upsertFamily(
  client: SupabaseClient,
  label: string,
  primaryGuardianEmailHash: string
): Promise<string> {
  // Partial unique index (WHERE NOT NULL) can't be used with ON CONFLICT — use SELECT-then-INSERT.
  const { data: existing } = await client
    .from('families')
    .select('id')
    .eq('primary_guardian_email_hash', primaryGuardianEmailHash)
    .maybeSingle();
  if (existing) return existing.id as string;

  const { data, error } = await client
    .from('families')
    .insert({ label, primary_guardian_email_hash: primaryGuardianEmailHash })
    .select('id');
  if (error) throw new Error(`upsertFamily: ${error.message}`);
  return data[0].id as string;
}

export async function upsertStudentWithExternalId(
  client: SupabaseClient,
  params: StudentWithExternalIdParams
): Promise<string> {
  // Partial unique index (WHERE NOT NULL) can't be used with ON CONFLICT — use SELECT-then-INSERT.
  const { data: existing } = await client
    .from('students')
    .select('id')
    .eq('external_member_id', params.external_member_id)
    .maybeSingle();

  if (existing) {
    await client
      .from('students')
      .update({ grade_level: params.grade_level, family_id: params.family_id })
      .eq('id', existing.id);
    return existing.id as string;
  }

  const { data, error } = await client
    .from('students')
    .insert({
      family_id: params.family_id,
      first_name: params.first_name,
      last_name: params.last_name,
      grade_level: params.grade_level,
      external_member_id: params.external_member_id,
    })
    .select('id');
  if (error) throw new Error(`upsertStudentWithExternalId: ${error.message}`);
  return data[0].id as string;
}

export async function upsertStudentByName(
  client: SupabaseClient,
  params: StudentParams
): Promise<string> {
  // Try to find existing student first
  const { data: existing } = await client
    .from('students')
    .select('id')
    .eq('family_id', params.family_id)
    .eq('first_name', params.first_name)
    .eq('last_name', params.last_name)
    .maybeSingle();

  if (existing) {
    // Update grade_level in case it changed
    await client
      .from('students')
      .update({ grade_level: params.grade_level })
      .eq('id', existing.id);
    return existing.id as string;
  }

  const { data, error } = await client
    .from('students')
    .upsert({
      family_id: params.family_id,
      first_name: params.first_name,
      last_name: params.last_name,
      grade_level: params.grade_level,
    })
    .select('id');
  if (error) throw new Error(`upsertStudentByName: ${error.message}`);
  return data[0].id as string;
}

export async function upsertEnrollment(
  client: SupabaseClient,
  params: EnrollmentParams
): Promise<string | null> {
  // Partial unique index (WHERE status='active') can't be used with ON CONFLICT.
  const { data: existing } = await client
    .from('enrollments')
    .select('id')
    .eq('student_id', params.student_id)
    .eq('session_id', params.session_id)
    .eq('status', 'active')
    .maybeSingle();
  if (existing) return null; // already enrolled — caller treats null as skipped

  const { data, error } = await client
    .from('enrollments')
    .insert({ student_id: params.student_id, class_id: params.class_id, session_id: params.session_id, status: 'active' })
    .select('id');
  if (error) throw new Error(`upsertEnrollment: ${error.message}`);
  return data?.[0]?.id ?? null;
}

export async function linkGuardian(
  client: SupabaseClient,
  familyId: string,
  userId: string
): Promise<void> {
  const { error } = await client
    .from('family_members')
    .upsert(
      { family_id: familyId, user_id: userId, relationship: 'guardian' },
      { onConflict: 'family_id,user_id', ignoreDuplicates: true }
    );
  if (error) throw new Error(`linkGuardian: ${error.message}`);
}

export async function linkStudentUser(
  client: SupabaseClient,
  studentId: string,
  userId: string
): Promise<void> {
  const { error } = await client
    .from('students')
    .update({ user_id: userId })
    .eq('id', studentId)
    .is('user_id', null);
  if (error) throw new Error(`linkStudentUser: ${error.message}`);
}
