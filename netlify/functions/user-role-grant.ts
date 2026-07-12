import type { Handler, HandlerEvent, HandlerContext } from '@netlify/functions';
import { createClient } from '@supabase/supabase-js';
import { getOrCreateAuthUser, getUserByEmail } from './lib/auth-provisioning';
import { ROLE_SCOPE_TYPE, tierOf, isGrantAllowed, type AppRole, type AppScopeType } from './lib/role-tiering';

function json(statusCode: number, body: unknown) {
  return { statusCode, body: JSON.stringify(body) };
}

const VALID_ROLES = new Set<AppRole>(['student', 'parent', 'teacher', 'coordinator', 'bv_coordinator', 'admin']);
const VALID_SCOPE_TYPES = new Set<AppScopeType>(['org', 'center', 'session', 'class']);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface GrantRequestBody {
  action?: string;
  role?: string;
  scope_type?: string;
  scope_id?: string | null;
  target_email?: string;
  target_user_id?: string;
  user_roles_id?: string;
}

export const handler: Handler = async (event: HandlerEvent, _ctx: HandlerContext) => {
  const supabaseUrl = process.env['EXPO_PUBLIC_SUPABASE_URL'] ?? '';
  const serviceRoleKey = process.env['SUPABASE_SERVICE_ROLE_KEY'] ?? '';
  const client = createClient(supabaseUrl, serviceRoleKey);

  // ── Phase 0: Auth + tiering lookup ──────────────────────────────────────────
  const authHeader = event.headers['authorization'] ?? event.headers['Authorization'] ?? '';
  if (!authHeader.startsWith('Bearer ')) return json(401, { reason: 'missing Authorization header' });

  const token = authHeader.slice(7);
  const { data: authData, error: authError } = await client.auth.getUser(token);
  if (authError || !authData?.user) return json(401, { reason: 'invalid or expired token' });
  const callerUserId = authData.user.id;

  const { data: callerRoleRow, error: callerRoleError } = await client
    .from('user_roles')
    .select('role, scope_type, scope_id')
    .eq('user_id', callerUserId)
    .eq('is_active', true)
    .maybeSingle();
  if (callerRoleError || !callerRoleRow) return json(403, { reason: 'caller holds no active role' });

  const callerRole = callerRoleRow.role as AppRole;
  const callerScopeId = callerRoleRow.scope_id as string | null;
  const callerTier = tierOf(callerRole);
  if (callerTier === 0) return json(403, { reason: "caller's active role cannot grant/revoke" });

  // ── Phase 1: Parse + validate request (no writes) ────────────────────────────
  let body: GrantRequestBody;
  try {
    body = JSON.parse(event.body ?? '{}') as GrantRequestBody;
  } catch {
    return json(422, { reason: 'malformed JSON body' });
  }
  const { action, role, scope_type, scope_id, target_email, target_user_id, user_roles_id } = body;

  if (action !== 'grant' && action !== 'revoke') return json(422, { reason: "action must be 'grant' or 'revoke'" });
  if (!role || !VALID_ROLES.has(role as AppRole)) return json(422, { reason: 'invalid or missing role' });
  if (!scope_type || !VALID_SCOPE_TYPES.has(scope_type as AppScopeType)) return json(422, { reason: 'invalid or missing scope_type' });

  const targetRole = role as AppRole;
  const targetScopeType = scope_type as AppScopeType;

  if (targetScopeType !== ROLE_SCOPE_TYPE[targetRole]) {
    return json(422, { reason: `role "${targetRole}" requires scope_type "${ROLE_SCOPE_TYPE[targetRole]}"` });
  }
  if (targetScopeType === 'org') {
    if (scope_id != null) return json(422, { reason: 'scope_id must be absent/null when scope_type is "org"' });
  } else if (!scope_id || !UUID_RE.test(scope_id)) {
    return json(422, { reason: 'scope_id must be a valid UUID when scope_type is not "org"' });
  }

  if (action === 'grant') {
    if (!!target_email === !!target_user_id) return json(422, { reason: 'grant requires exactly one of target_email or target_user_id' });
  } else {
    const hasRowId = !!user_roles_id;
    const hasTuple = !!(target_email || target_user_id);
    if (hasRowId === hasTuple) return json(422, { reason: 'revoke requires exactly one of user_roles_id, or a target (email/user_id)' });
    if (hasTuple && !!target_email === !!target_user_id) return json(422, { reason: 'revoke by tuple requires exactly one of target_email or target_user_id' });
  }

  // ── Phase 2: Resolve target user + target row (no writes yet) ────────────────
  let targetUserId: string;
  let resolvedRowId: string | null = null;

  if (action === 'grant') {
    targetUserId = target_user_id
      ? target_user_id
      : await getOrCreateAuthUser(supabaseUrl, serviceRoleKey, target_email!, '', '');
  } else if (user_roles_id) {
    const { data: row } = await client
      .from('user_roles')
      .select('id, user_id, role, scope_type, scope_id')
      .eq('id', user_roles_id)
      .maybeSingle();
    if (!row) return json(200, { status: 'noop' });
    resolvedRowId = row.id as string;
    targetUserId = row.user_id as string;
  } else {
    const lookedUpId = target_user_id ?? (await getUserByEmail(supabaseUrl, serviceRoleKey, target_email!));
    if (!lookedUpId) return json(200, { status: 'noop' });
    targetUserId = lookedUpId;

    let query = client
      .from('user_roles')
      .select('id')
      .eq('user_id', targetUserId)
      .eq('role', targetRole)
      .eq('scope_type', targetScopeType);
    query = targetScopeType === 'org' ? query.is('scope_id', null) : query.eq('scope_id', scope_id!);
    const { data: row } = await query.maybeSingle();
    if (!row) return json(200, { status: 'noop' });
    resolvedRowId = row.id as string;
  }

  // ── Phase 3: Tiering + scope containment ──────────────────────────────────────
  if (!isGrantAllowed(callerRole, callerTier, callerScopeId, targetRole, targetUserId, callerUserId)) {
    return json(403, { reason: 'tiering violation' });
  }
  if (callerRole === 'coordinator' && targetRole === 'teacher') {
    const { data: classRow } = await client.from('classes').select('session_id').eq('id', scope_id!).maybeSingle();
    if (!classRow || classRow.session_id !== callerScopeId) {
      return json(403, { reason: "target class is outside the coordinator's own active session" });
    }
  }

  // ── Phase 4: Execute ───────────────────────────────────────────────────────────
  if (action === 'grant') {
    const { count } = await client
      .from('user_roles')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', targetUserId);
    const isFirstRoleEver = (count ?? 0) === 0;

    const { data: newId, error } = await client.rpc('insert_user_role_grant', {
      p_user_id: targetUserId,
      p_role: targetRole,
      p_scope_type: targetScopeType,
      p_scope_id: targetScopeType === 'org' ? null : scope_id,
      p_is_active: isFirstRoleEver,
    });
    if (error) return json(500, { reason: 'grant failed' });
    if (!newId) return json(200, { status: 'noop' });

    console.log(JSON.stringify({ event: 'role_granted', user_roles_id: newId, role: targetRole, scope_type: targetScopeType, actor_role: callerRole }));
    return json(200, { status: 'granted', user_roles_id: newId });
  }

  const { data: deleted, error: deleteError } = await client
    .from('user_roles')
    .delete()
    .eq('id', resolvedRowId!)
    .select('id');
  if (deleteError) return json(500, { reason: 'revoke failed' });
  if (!deleted || deleted.length === 0) return json(200, { status: 'noop' });

  console.log(JSON.stringify({ event: 'role_revoked', user_roles_id: resolvedRowId, role: targetRole, scope_type: targetScopeType, actor_role: callerRole }));
  return json(200, { status: 'revoked', user_roles_id: resolvedRowId });
};
